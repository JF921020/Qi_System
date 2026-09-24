// ─── 5. 總體運算邏輯 ───
let calcController;
let calcRevision = 0;

function clearCalculationResults() {
    window._advisorSnapshot = null;
    ['resTargetPower', 'resInPower', 'resTotalLoss',
     'resCoilLoss', 'resICLoss', 'hudLoss', 'hudInPower']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerText = '—'; });
    ['qVal', 'rxACR'].forEach(id => { document.getElementById(id).value = ''; });
    ['advEffResult', 'advPwrResult', 'advSpaceResult'].forEach(id => {
        document.getElementById(id).textContent = '參數已變更，請等候計算完成後重新反推。';
    });
    renderDiagAdvice();
}

function triggerCalc() {
    const revision = ++calcRevision;
    if (calcController) calcController.abort();
    clearCalculationResults();
    drawLayoutCanvases();
    const input = {...state};
    const customCurves = {};
    if (input.rxIcSelect.startsWith('custom_')) customCurves.rx = RX_EFF_CURVES[input.rxIcSelect];
    if (input.chargerIcSelect.startsWith('custom_')) customCurves.charger = CHARGER_EFF_CURVES[input.chargerIcSelect];
    requestCalculation(input, customCurves, revision);
}

async function requestCalculation(input, customCurves, revision) {
    const controller = new AbortController();
    calcController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(document.body.dataset.calculateUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'Content-Type': 'application/json',
                'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value},
            body: JSON.stringify({state: input, customCurves}),
            signal: controller.signal
        });
        if (revision !== calcRevision) return;
        const data = response.headers.get('content-type')?.includes('application/json')
            ? await response.json() : {error: '服務暫時無法使用，請重新整理後再試。'};
        if (revision !== calcRevision) return;
        if (!response.ok) throw new Error(data.error || '計算失敗');
        renderCalculation(data, input);
        document.getElementById('effUpdateStatus').textContent = '';
        document.getElementById('calcStatus').textContent = data.warnings.length
            ? data.warnings.join(' ') : '';
    } catch (error) {
        if (revision !== calcRevision) return;
        clearCalculationResults();
        document.getElementById('effUpdateStatus').textContent = '尚未更新，顯示上次效率';
        document.getElementById('calcStatus').textContent = error.name === 'AbortError'
            ? '計算逾時，請重試。' : '計算失敗：' + error.message;
    } finally {
        clearTimeout(timeout);
        if (calcController === controller) calcController = null;
    }
}

function renderCalculation(result, input) {
    const {coilEff, sysEffPct, pOut, pInTotal, totalLoss, coilLoss,
        rxACR: acr} = result;
    Object.assign(state, {rxIcEff: result.rxIcEff, chargerIcEff: result.chargerIcEff,
        qVal: result.qVal, rxACR: acr});
    document.getElementById('qVal').value = result.qVal;
    document.getElementById('rxACR').value = acr.toFixed(2);
    document.getElementById('rxIcEff').value = result.rxIcEff.toFixed(1);
    document.getElementById('chargerIcEff').value = result.chargerIcEff.toFixed(1);
    document.getElementById('rxTip').textContent = result.rxTip;
    document.getElementById('chargerTip').textContent = result.chargerTip;
    const watts = value => value === null ? '無法計算' : value.toFixed(2) + ' W';

    // 更新效能分頁
    const effB = document.getElementById('effBadgeLarge');
    if(effB) {
        effB.innerText = coilEff.toFixed(1) + '%';
        // 線圈效率固定使用橘黃色作為識別色（與其他效率指標區分），不再依數值跳燈號
    }
    const rxB = document.getElementById('rxIcBadgeLarge');
    if(rxB) rxB.innerText = state.rxIcEff.toFixed(0) + '%';
    const chB = document.getElementById('chargerIcBadgeLarge');
    if(chB) chB.innerText = state.chargerIcEff.toFixed(0) + '%';
    const sysB = document.getElementById('sysBadgeLarge');
    if(sysB) {
        sysB.innerText = sysEffPct.toFixed(1) + '%';
        sysB.style.background = sysEffPct >= 80 ? "var(--eff-green)" : (sysEffPct >= 70 ? "var(--eff-orange)" : "var(--eff-red)");
    }
    // 收合狀態的橫幅摘要值同步更新
    const effBannerVal = document.getElementById('effBannerSummaryVal');
    if (effBannerVal) {
        effBannerVal.innerText = sysEffPct.toFixed(1) + '%';
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
        hudC.innerText = coilEff.toFixed(1) + '%';
        hudC.style.background = coilEff >= 85 ? "var(--eff-green)" : (coilEff >= 75 ? "var(--eff-orange)" : "var(--eff-red)");
    }
    const hudS = document.getElementById('hudSysEff');
    if(hudS) hudS.innerText = sysEffPct.toFixed(1) + '%';
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

