// ─── 5. 瀏覽器端效率模型（µH、mΩ、kHz、W） ───
function calculationNumber(value, field, minimum = 0, maximum = 1000000) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
        throw new Error(`${field} 必須是介於 ${minimum} 與 ${maximum} 的數字`);
    }
    return value;
}

function calculateEfficiency(s, kind, current, catalog) {
    const field = kind === 'rx' ? 'rxIc' : 'chargerIc';
    const selected = s[field + 'Select'];
    if (typeof selected !== 'string') throw new Error(`${field}Select 必須指定型號`);
    if (selected === 'custom') return [calculationNumber(s[field + 'Eff'], field + 'Eff', 0, 100), '自訂效率'];
    const fixed = catalog[kind + 'Fixed'];
    if (Object.hasOwn(fixed, selected)) {
        return [calculationNumber(fixed[selected], field + 'Eff', 0, 100),
            '資料庫自訂固定效率'];
    }
    const curve = Object.hasOwn(catalog[kind], selected) ? catalog[kind][selected] : null;
    if (!curve) throw new Error(`未知的 ${kind} 型號`);
    if (!['power', 'current'].includes(curve.axis)) throw new Error(`${kind} 曲線 axis 必須是 power 或 current`);
    if (!Array.isArray(curve.data) || curve.data.length < 3 || curve.data.length > 1000) {
        throw new Error(`${kind} 曲線需有 3 至 1000 個資料點`);
    }
    let previous = -1;
    for (const point of curve.data) {
        if (!Array.isArray(point) || point.length !== 2) throw new Error('曲線資料點必須為 [x, 效率]');
        const x = calculationNumber(point[0], 'curve.x');
        calculationNumber(point[1], 'curve.efficiency', 0, 100);
        if (x <= previous) throw new Error('曲線 X 值需遞增且不可重複');
        previous = x;
    }
    const powerAxis = curve.axis === 'power';
    const x = powerAxis ? s.sysPower : current;
    let tip = `依 ${x.toFixed(2)}${powerAxis ? 'W' : 'A'} 查表`;
    if (x < curve.data[0][0] || x > curve.data[curve.data.length - 1][0]) tip += '（超出取樣範圍，使用端點效率）';
    return [interpEff(curve.data, x), tip];
}

function currentLimits(s, catalog = curveCatalog) {
    let min = 0, max = Infinity;
    for (const [kind, field] of [['rx', 'rxIc'], ['charger', 'chargerIc']]) {
        const selected = s[field + 'Select'];
        if (selected === 'custom' || Object.hasOwn(catalog[kind + 'Fixed'], selected)) continue;
        const curve = Object.hasOwn(catalog[kind], selected) ? catalog[kind][selected] : null;
        if (curve?.axis !== 'current' || !curve.data?.length) continue;
        min = Math.max(min, curve.data[0][0]);
        max = Math.min(max, curve.data[curve.data.length - 1][0]);
    }
    return {min, max};
}

function currentLimitMessage({min, max}) {
    if (min > max) return '所選 IC 的電流範圍沒有交集，請更換 IC。';
    if (max === Infinity) return '所選 IC 未提供電流曲線範圍。';
    return `所選 IC 電流曲線共同範圍：${min}–${max} A（${min * 1000}–${max * 1000} mA）。`;
}

function updateCurrentLimits() {
    const limits = currentLimits(state);
    for (const [id, scale] of [['chargeCurrentA', 1], ['chargeCurrentmA', 1000]]) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.min = limits.min * scale;
        el.max = Number.isFinite(limits.max) ? limits.max * scale : '';
    }
    const hint = document.getElementById('chargeCurrentLimits');
    if (hint) hint.textContent = currentLimitMessage(limits);
}

function calculate(s, catalog = curveCatalog) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('請提供 state 參數物件');
    for (const field of ['batCapacity', 'batVoltage', 'batMaxC', 'sysPower', 'rxL', 'rxR', 'freq', 'qTx', 'kVal']) {
        const minimum = ['batCapacity', 'batVoltage', 'rxL', 'rxR', 'freq', 'qTx'].includes(field) ? 0.000001 : 0;
        calculationNumber(s[field], field, minimum, field === 'kVal' ? 1 : 1000000);
    }
    if (!['pc_abs', 'aluminum', 'zinc'].includes(s.caseMaterial)) throw new Error('caseMaterial 不支援此材質');
    if (!['yes', 'no'].includes(s.ncWrap)) throw new Error('ncWrap 必須是 yes 或 no');
    const chargeCurrentA = s.batCapacity / 1000 * s.batMaxC;
    const [rxIcEff, rxTip] = calculateEfficiency(s, 'rx', chargeCurrentA, catalog);
    const [chargerIcEff, chargerTip] = calculateEfficiency(s, 'charger', chargeCurrentA, catalog);
    const limits = currentLimits(s, catalog);
    // Allow only floating-point roundoff at inclusive curve endpoints.
    const tolerance = Number.EPSILON * Math.max(1, chargeCurrentA, limits.min, Number.isFinite(limits.max) ? limits.max : 0) * 4;
    if (limits.min > limits.max || chargeCurrentA < limits.min - tolerance || chargeCurrentA > limits.max + tolerance) {
        throw new Error('充電電流超出允許範圍。' + currentLimitMessage(limits));
    }
    const isMetal = ['aluminum', 'zinc'].includes(s.caseMaterial);
    const rxACR = s.rxR * (isMetal ? 4.8 : s.ncWrap === 'yes' ? 1.8 : 2.22);
    const Qrx = 2 * Math.PI * s.freq * 1000 * s.rxL * 1e-6 / (rxACR * 1e-3);
    const k2QQ = s.kVal ** 2 * s.qTx * Qrx;
    const coilEff = k2QQ / (1 + Math.sqrt(1 + k2QQ)) ** 2 * 100;
    const sysEff = coilEff / 100 * rxIcEff / 100 * chargerIcEff / 100;
    const pOut = s.sysPower;
    const pInTotal = sysEff > 0 ? pOut / sysEff : (pOut === 0 ? 0 : null);
    const totalLoss = pInTotal === null ? null : pInTotal - pOut;
    const coilLoss = pInTotal !== null && rxIcEff * chargerIcEff > 0
        ? pInTotal - pOut / (rxIcEff / 100 * chargerIcEff / 100) : (pOut === 0 ? 0 : null);
    return {
        modelVersion: 'lqk-v1', chargeCurrentA, rxIcEff, chargerIcEff, rxTip, chargerTip,
        rxACR, Qrx, qVal: Number(Qrx.toFixed(2)), isMetal, coilEff, sysEffPct: sysEff * 100,
        pOut, pInTotal, totalLoss, coilLoss,
        icLoss: totalLoss !== null && coilLoss !== null ? totalLoss - coilLoss : null,
        warnings: pInTotal === null ? ['效率為零，無法達成指定輸出功率。'] : [],
    };
}

function clearCalculationResults() {
    window._advisorSnapshot = null;
    ['resTargetPower', 'resInPower', 'resTotalLoss',
     'resCoilLoss', 'resICLoss', 'hudLoss', 'hudInPower']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerText = '—'; });
    ['qVal', 'rxACR'].forEach(id => { document.getElementById(id).value = ''; });
    ['advEffResult', 'advPwrResult', 'advSpaceResult'].forEach(id => {
        document.getElementById(id).textContent = '參數已變更，請重新反推。';
    });
    renderDiagAdvice();
}

function triggerCalc() {
    clearCalculationResults();
    updateCurrentLimits();
    const input = {...state};
    try {
        const result = calculate(input);
        renderCalculation(result, input);
        document.getElementById('effUpdateStatus').textContent = '';
        document.getElementById('calcStatus').textContent = result.warnings.join(' ');
    } catch (error) {
        clearCalculationResults();
        document.getElementById('effUpdateStatus').textContent = '尚未更新，顯示上次效率';
        document.getElementById('calcStatus').textContent = '計算失敗：' + error.message;
        drawLayoutCanvases();
    }
}

function renderCalculation(result, input) {
    const {coilEff, sysEffPct, pOut, pInTotal, totalLoss, coilLoss,
        rxACR: acr} = result;
    Object.assign(state, {rxIcEff: result.rxIcEff, chargerIcEff: result.chargerIcEff,
        qVal: result.qVal, rxACR: acr});
    document.getElementById('qVal').value = result.qVal;
    document.getElementById('rxACR').value = acr.toFixed(2);
    document.getElementById('rxIcEff').value = formatEfficiency(result.rxIcEff);
    document.getElementById('chargerIcEff').value = formatEfficiency(result.chargerIcEff);
    document.getElementById('rxTip').textContent = result.rxTip;
    document.getElementById('chargerTip').textContent = result.chargerTip;
    const watts = value => value === null ? '無法計算' : value.toFixed(2) + ' W';

    // 更新效能分頁
    const effB = document.getElementById('effBadgeLarge');
    if(effB) {
        effB.innerText = formatEfficiency(coilEff) + '%';
        // 線圈效率固定使用橘黃色作為識別色（與其他效率指標區分），不再依數值跳燈號
    }
    const rxB = document.getElementById('rxIcBadgeLarge');
    if(rxB) rxB.innerText = formatEfficiency(state.rxIcEff) + '%';
    const chB = document.getElementById('chargerIcBadgeLarge');
    if(chB) chB.innerText = formatEfficiency(state.chargerIcEff) + '%';
    const sysB = document.getElementById('sysBadgeLarge');
    if(sysB) {
        sysB.innerText = formatEfficiency(sysEffPct) + '%';
        sysB.style.background = sysEffPct >= 80 ? "var(--eff-green)" : (sysEffPct >= 70 ? "var(--eff-orange)" : "var(--eff-red)");
    }
    // 收合狀態的橫幅摘要值同步更新
    const effBannerVal = document.getElementById('effBannerSummaryVal');
    if (effBannerVal) {
        effBannerVal.innerText = formatEfficiency(sysEffPct) + '%';
        effBannerVal.style.color = sysEffPct >= 80 ? "var(--eff-green)" : (sysEffPct >= 70 ? "var(--eff-orange)" : "var(--eff-red)");
    }

    const resTP = document.getElementById('resTargetPower');
    if(resTP) resTP.innerText = pOut.toFixed(2) + ' W';
    const resIP = document.getElementById('resInPower');
    if(resIP) resIP.innerText = watts(pInTotal);
    const resTL = document.getElementById('resTotalLoss');
    if(resTL) resTL.innerText = watts(totalLoss);
    const resCL = document.getElementById('resCoilLoss');
    if(resCL) resCL.innerText = watts(coilLoss);
    const resICL = document.getElementById('resICLoss');
    if(resICL) resICL.innerText = watts(result.icLoss);

    // 更新空間架構分頁 HUD
    const hudC = document.getElementById('hudCoilEff');
    if(hudC) {
        hudC.innerText = formatEfficiency(coilEff) + '%';
        hudC.style.background = coilEff >= 85 ? "var(--eff-green)" : (coilEff >= 75 ? "var(--eff-orange)" : "var(--eff-red)");
    }
    const hudS = document.getElementById('hudSysEff');
    if(hudS) hudS.innerText = formatEfficiency(sysEffPct) + '%';
    const hudL = document.getElementById('hudLoss');
    if(hudL) hudL.innerText = watts(totalLoss);
    const hudIP = document.getElementById('hudInPower');
    if(hudIP) hudIP.innerText = watts(pInTotal);

    // 告警檢查（詳細分類診斷改由「智慧反推→目前診斷」的 renderDiagAdvice() 呈現）

    // 供「智慧反推建議」模組讀取的最新運算快照
    window._advisorSnapshot = pInTotal === null ? null : {
        ...input, ...result,
        totalZ: (input.enableMagnet ? (input.gapInput + input.magT + input.magCoating + input.susT + 0.3) : (input.rxCoilDist + input.coilT)) + input.ncT
    };
    const advisorTabEl = document.getElementById('tab-advisor');
    if (advisorTabEl && advisorTabEl.classList.contains('active')) {
        const activeSubTab = document.querySelector('.advisor-tabbtn.active');
        if (activeSubTab && activeSubTab.id === 'advisorBtn_diag') renderDiagAdvice();
    }

    drawLayoutCanvases();
}

