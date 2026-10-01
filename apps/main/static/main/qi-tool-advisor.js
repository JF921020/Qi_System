// ─── 7. 智慧反推建議 (Smart Advisor) ───
function switchAdvisorTab(tab) {
    document.querySelectorAll('.advisor-tabbtn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.advisor-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('advisorBtn_' + tab).classList.add('active');
    document.getElementById('advisorPanel_' + tab).classList.add('active');
    if (tab === 'diag') renderDiagAdvice();
}

// LQK(k²×qTx×Qrx) → 線圈效率(分數,0~1)，與triggerCalc()中coilEff公式一致
function effFracFromK2QQ(x) {
    const u = Math.sqrt(1 + x);
    return x / ((1 + u) * (1 + u));
}
// 反推：給定目標效率(分數)，二分逼近所需的k2QQ
function solveK2QQforEffFrac(effFrac) {
    if (effFrac <= 0) return 0;
    if (effFrac >= 0.995) effFrac = 0.995;
    let lo = 0, hi = 1000;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (effFracFromK2QQ(mid) < effFrac) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

// ── Tab 1：目前診斷 ──
function renderDiagAdvice() {
    const s = window._advisorSnapshot;
    const box = document.getElementById('advisorDiagList');
    const priBox = document.getElementById('advisorPriorityBox');
    if (!box) return;
    if (!s) {
        box.innerHTML = '<div class="advisor-item warning"><div class="advisor-item-text">尚未執行過計算，請先按「▶ 立即計算」。</div></div>';
        if (priBox) priBox.innerHTML = '';
        return;
    }

    const LEVEL_SCORE = { danger: 3, warning: 2, info: 1 };
    const CATS = [
        { key: 'eff',    label: '📊 效率 (Efficiency)' },
        { key: 'loss',   label: '🔥 損耗 (Loss)' },
        { key: 'charge', label: '🔋 充電條件 (Charging Conditions)' },
        { key: 'couple', label: '🧲 線圈耦合 (Coil Coupling)' },
        { key: 'space',  label: '📐 機構空間 (Mechanical Space)' },
    ];
    let items = [];

    // ── 1. 效率 ──
    if (s.coilEff < 75) items.push({ cat: 'eff', level: 'danger', title: '線圈效率偏低 (' + formatEfficiency(s.coilEff) + '%)', text: '低於75%建議門檻。可嘗試：提高k耦合係數(縮小Rx線圈距離)、提高Ls感值、或降低DCR基準值rxR。' });
    else if (s.coilEff < 85) items.push({ cat: 'eff', level: 'warning', title: '線圈效率中等 (' + formatEfficiency(s.coilEff) + '%)', text: '75~85%區間，尚可接受，若有裕度可再優化k值或DCR以提升效率。' });

    if (s.sysEffPct < 70) items.push({ cat: 'eff', level: 'danger', title: '系統總效率偏低 (' + formatEfficiency(s.sysEffPct) + '%)', text: '低於70%警戒線，除了線圈效率外，也請檢查Rx IC / Charger IC效率是否選用了偏低或待補曲線的型號。' });


    // ── 2. 損耗 ──
    const lossRatio = s.pInTotal > 0 ? (s.totalLoss / s.pInTotal * 100) : 0;
    if (lossRatio > 35) items.push({ cat: 'loss', level: 'danger', title: '總損耗占輸入功率比例過高 (' + lossRatio.toFixed(1) + '%)', text: '超過35%，代表逾三分之一輸入電力轉為熱量，需優先處理，非僅影響效率數字。' });
    else if (lossRatio > 25) items.push({ cat: 'loss', level: 'warning', title: '總損耗占輸入功率比例偏高 (' + lossRatio.toFixed(1) + '%)', text: '25~35%區間，建議留意殼體散熱設計是否足夠。' });

    const coilLossW = s.coilLoss;
    const icLossW = s.icLoss;
    if (s.totalLoss > 0) {
        if (coilLossW > icLossW * 1.5) items.push({ cat: 'loss', level: 'info', title: '主要損耗來源：線圈 (Coil Loss佔比較高)', text: '優化方向應優先聚焦線圈端(k值/DCR/屏蔽)，而非IC選型。' });
        else if (icLossW > coilLossW * 1.5) items.push({ cat: 'loss', level: 'info', title: '主要損耗來源：IC轉換 (IC Loss佔比較高)', text: '優化方向應優先聚焦Rx/Charger IC選型效率，線圈端已相對健康。' });
    }

    // ── 3. 充電條件 ──
    if (s.batMaxC > 1.5) items.push({ cat: 'charge', level: 'warning', title: 'C-rate偏高 (' + s.batMaxC.toFixed(2) + 'C)', text: '超過1.5C需特別留意電芯是否支援此充電倍率，並確認保護IC/PCM規格是否匹配。' });

    const rxCurve = RX_EFF_CURVES[s.rxIcSelect];
    if (rxCurve) {
        const qX = rxCurve.axis === 'power' ? s.pOut : s.chargeCurrentA;
        const xs = rxCurve.data.map(p => p[0]);
        if (qX < Math.min(...xs) || qX > Math.max(...xs)) {
            items.push({ cat: 'charge', level: 'warning', title: 'Rx IC效率查表超出曲線取樣範圍', text: `目前查表值(${qX.toFixed(2)}${rxCurve.axis === 'power' ? 'W' : 'A'})超出原廠曲線取樣範圍(${Math.min(...xs)}~${Math.max(...xs)})，屬外插估算，準確度較低。` });
        }
    }
    const chCurve = CHARGER_EFF_CURVES[s.chargerIcSelect];
    if (chCurve) {
        const qX = chCurve.axis === 'power' ? s.pOut : s.chargeCurrentA;
        const unit = chCurve.axis === 'power' ? 'W' : 'A';
        const xs = chCurve.data.map(p => p[0]);
        if (qX < Math.min(...xs) || qX > Math.max(...xs)) {
            items.push({ cat: 'charge', level: 'warning', title: 'Charger IC效率查表超出曲線取樣範圍', text: `目前查表值(${qX.toFixed(2)}${unit})超出曲線取樣範圍(${Math.min(...xs)}~${Math.max(...xs)}${unit})，使用端點效率估算。` });
        }
    }

    // ── 4. 線圈耦合 ──
    if (s.kVal > 1) items.push({ cat: 'couple', level: 'danger', title: 'k耦合係數超出物理上限 (' + s.kVal.toFixed(3) + ')', text: 'k值理論上限為1，目前輸入值不合理，請確認是否誤植或量測/模擬數據有誤。' });
    else if (s.kVal < 0.3) items.push({ cat: 'couple', level: 'warning', title: 'k耦合係數偏低 (' + s.kVal.toFixed(3) + ')', text: '線圈耦合鬆散，多半是Rx線圈距離過大或線圈尺寸不匹配所致，會直接拖累線圈效率。' });

    if (s.rxCoilDist < 1.75 || s.rxCoilDist > 2.25) items.push({ cat: 'couple', level: 'warning', title: 'Rx線圈距離超出建議範圍 (' + s.rxCoilDist.toFixed(2) + 'mm)', text: '建議範圍1.75~2.25mm，超出此範圍k值評估的可信度會降低。' });

    if (s.isMetal && s.ncWrap !== 'yes') items.push({ cat: 'couple', level: 'danger', title: '金屬外殼但奈米晶未包邊', text: '金屬外殼渦流損耗最大(ACR倍數4.8×)，建議將奈米晶邊緣包覆(U型)設為「包邊」以降低損耗，或改用非金屬外殼。' });

    if (s.rxR > 350) items.push({ cat: 'couple', level: 'warning', title: 'DCR基準值偏高 (' + s.rxR.toFixed(0) + 'mΩ)', text: '線圈直流電阻偏高會拉低Qrx進而拉低線圈效率，建議跟線圈供應商確認繞線規格是否可降低DCR。' });

    // ── 5. 機構空間 ──
    if (s.totalZ > 8) items.push({ cat: 'space', level: 'danger', title: 'Z軸預估總高超出8mm安全線 (' + s.totalZ.toFixed(2) + 'mm)', text: '超出Z-Stack圖上標示的8mm安全線，需與ME確認殼體內部是否有足夠淨空間容納此堆疊。' });
    else if (s.totalZ > 6) items.push({ cat: 'space', level: 'warning', title: 'Z軸預估總高偏高 (' + s.totalZ.toFixed(2) + 'mm)', text: '6~8mm區間，離8mm安全線已有一定裕度壓縮，建議提前與ME對齊殼體空間規劃。' });

    // ── 排序與分類渲染 ──
    if (items.length === 0) {
        if (priBox) priBox.innerHTML = '';
        box.innerHTML = '<div class="advisor-item ok">✅ 目前參數皆在建議範圍內，無需特別調整。</div>';
        return;
    }

    // 優先處理項目：依danger>warning>info排序，取前3項（info不足以構成優先項目時才遞補）
    const actionable = items.filter(it => it.level !== 'info');
    const priorityPool = actionable.length > 0 ? actionable : items;
    const priorityItems = [...priorityPool].sort((a, b) => LEVEL_SCORE[b.level] - LEVEL_SCORE[a.level]).slice(0, 3);
    const catLabelMap = Object.fromEntries(CATS.map(c => [c.key, c.label]));

    if (priBox) {
        priBox.innerHTML = `
            <div class="advisor-priority-box">
                <div class="advisor-priority-title">🎯 優先處理項目 (Top ${priorityItems.length})</div>
                ${priorityItems.map((it, i) => `
                    <div class="advisor-priority-item">
                        <div class="advisor-priority-rank ${it.level === 'warning' ? 'warning' : ''}">${i + 1}</div>
                        <div><b>[${catLabelMap[it.cat].replace(/^[^ ]+ /, '')}]</b> ${it.title}</div>
                    </div>`).join('')}
            </div>`;
    }

    // 分類明細：依五大類別分組顯示，該類別無問題時顯示綠色通過訊息
    box.innerHTML = CATS.map(cat => {
        const catItems = items.filter(it => it.cat === cat.key);
        const body = catItems.length === 0
            ? '<div class="advisor-item ok" style="padding:8px;">✅ 此項目正常</div>'
            : catItems.map(it => `<div class="advisor-item ${it.level}"><div class="advisor-item-title">${it.title}</div><div class="advisor-item-text">${it.text}</div></div>`).join('');
        return `<div class="advisor-cat-section"><div class="advisor-cat-title">${cat.label}</div>${body}</div>`;
    }).join('');
}

// ── Tab 2：目標效率反推 ──
function solveTargetEff() {
    const s = window._advisorSnapshot;
    const box = document.getElementById('advEffResult');
    if (!s) { box.innerHTML = '<div class="advisor-item warning"><div class="advisor-item-text">請先執行過一次計算。</div></div>'; return; }

    const targetPct = parseFloat(document.getElementById('advEffTarget').value) || 0;
    const targetFrac = targetPct / 100;
    const k2QQ_needed = solveK2QQforEffFrac(targetFrac);

    const kNeeded = (s.qTx > 0 && s.Qrx > 0) ? Math.sqrt(k2QQ_needed / (s.qTx * s.Qrx)) : NaN;
    const QrxNeeded = (s.qTx > 0 && s.kVal > 0) ? k2QQ_needed / (s.qTx * Math.pow(s.kVal, 2)) : NaN;

    box.innerHTML = `
    <table class="advisor-result-table">
        <tr><th>目前線圈效率</th><td>${formatEfficiency(s.coilEff)}%</td></tr>
        <tr><th>目標線圈效率</th><td>${formatEfficiency(targetPct)}%</td></tr>
        <tr><th>目前 k 值</th><td>${s.kVal.toFixed(3)}</td></tr>
        <tr><th>方案A：固定Qrx，所需k值</th><td>${isFinite(kNeeded) ? kNeeded.toFixed(3) : 'N/A'} ${isFinite(kNeeded) && kNeeded > 1 ? '⚠超出物理上限(k≤1)，此目標僅靠調k值無法達成' : ''}</td></tr>
        <tr><th>方案B：固定k值，所需Qrx</th><td>${isFinite(QrxNeeded) ? QrxNeeded.toFixed(1) : 'N/A'} (目前Qrx=${s.Qrx.toFixed(1)})</td></tr>
    </table>
    <div class="advisor-item info" style="margin-top:10px;"><div class="advisor-item-text">方案A靠縮小Rx線圈距離/優化線圈繞法提升k值；方案B靠降低DCR基準值(rxR)或提升Ls感值來提升Qrx。兩者可交叉搭配，不必單靠一項達成。</div></div>`;
}

// ── Tab 3：目標功率反推 ──
function solveTargetPower() {
    const s = window._advisorSnapshot;
    const box = document.getElementById('advPwrResult');
    if (!s) { box.innerHTML = '<div class="advisor-item warning"><div class="advisor-item-text">請先執行過一次計算。</div></div>'; return; }

    const targetHr = parseFloat(document.getElementById('advTimeTarget').value) || 0;
    if (targetHr <= 0) { box.innerHTML = '<div class="advisor-item warning"><div class="advisor-item-text">請輸入大於0的充電時數。</div></div>'; return; }

    const capacityAh = s.batCapacity / 1000;
    const neededCurrentA = capacityAh / targetHr;
    const neededCrate = neededCurrentA / capacityAh;
    const neededPoutW = neededCurrentA * s.batVoltage;
    const sysEffFrac = s.sysEffPct / 100;
    const neededPinW = sysEffFrac > 0 ? neededPoutW / sysEffFrac : NaN;

    // 與目前所選Rx IC / Charger IC效率曲線的適用範圍交叉檢查
    let rangeWarnings = [];
    const rxCurve = RX_EFF_CURVES[s.rxIcSelect];
    if (rxCurve) {
        const rxMax = rxCurve.data[rxCurve.data.length - 1][0];
        const rxCheckVal = rxCurve.axis === 'power' ? neededPoutW : neededCurrentA;
        if (rxCheckVal > rxMax) rangeWarnings.push(`⚠ 反推結果(${rxCheckVal.toFixed(2)}${rxCurve.axis === 'power' ? 'W' : 'A'})已超出目前Rx IC效率曲線圖的取樣上限(${rxMax}${rxCurve.axis === 'power' ? 'W' : 'A'})，效率查表已是外插估計，建議重新選型或降低目標。`);
    }
    const chCurve = CHARGER_EFF_CURVES[s.chargerIcSelect];
    if (chCurve) {
        const chMax = chCurve.data[chCurve.data.length - 1][0];
        const chValue = chCurve.axis === 'power' ? neededPoutW : neededCurrentA;
        const chUnit = chCurve.axis === 'power' ? 'W' : 'A';
        if (chValue > chMax) rangeWarnings.push(`⚠ 反推所需查表值(${chValue.toFixed(2)}${chUnit})超出目前 Charger IC 曲線取樣上限(${chMax}${chUnit})，使用端點效率估算，建議重新選型或降低目標。`);
    }

    box.innerHTML = `
    <table class="advisor-result-table">
        <tr><th>電池容量</th><td>${s.batCapacity} mAh</td></tr>
        <tr><th>目標充電時數</th><td>${targetHr.toFixed(2)} hr</td></tr>
        <tr><th>所需平均充電電流</th><td>${neededCurrentA.toFixed(3)} A (${(neededCurrentA*1000).toFixed(0)} mA)</td></tr>
        <tr><th>所需C-rate</th><td>${neededCrate.toFixed(2)} C</td></tr>
        <tr><th>所需輸出瓦特數(Pout)</th><td>${neededPoutW.toFixed(2)} W</td></tr>
        <tr><th>對應所需輸入功率(Pin，依目前系統效率反推)</th><td>${isFinite(neededPinW) ? neededPinW.toFixed(2) + ' W' : 'N/A'}</td></tr>
    </table>
    ${rangeWarnings.map(w => `<div class="advisor-item warning" style="margin-top:8px;"><div class="advisor-item-text">${w}</div></div>`).join('')}
    <div class="advisor-item info" style="margin-top:10px;"><div class="advisor-item-text">此為CC定電流簡化估算，未考慮CV尾端降流時間，實際充電時數通常會比此估算略長。若所需C-rate已超出您Rx IC/Charger IC的規格上限，需重新選型或調整目標時數。</div></div>`;
}

// ── Tab 4：空間反推 ──
function solveTargetSpace() {
    const s = window._advisorSnapshot;
    const box = document.getElementById('advSpaceResult');
    if (!s) { box.innerHTML = '<div class="advisor-item warning"><div class="advisor-item-text">請先執行過一次計算。</div></div>'; return; }

    const zTarget = parseFloat(document.getElementById('advZTarget').value) || 0;
    const magTot = state.enableMagnet ? (state.magT + state.magCoating) : 0;
    const susTot = state.enableMagnet ? state.susT : 0;

    if (state.enableMagnet) {
        // 磁鐵開啟時，totalZ = gapInput+磁鐵+導磁片+0.3+ncT，rxCoilDist並非totalZ的自由疊加項
        // （線圈位置由 coilPhysicalPos = nBase-coilT 另外決定），故此模式下無法用Z總高度反推rxCoilDist上限
        const fixedTotalZ = state.gapInput + magTot + susTot + 0.3 + state.ncT;
        box.innerHTML = `
        <table class="advisor-result-table">
            <tr><th>目前模式</th><td>磁鐵已開啟</td></tr>
            <tr><th>目前結構固定產生的Z總高度</th><td>${fixedTotalZ.toFixed(2)} mm</td></tr>
            <tr><th>您輸入的Z總高度上限</th><td>${zTarget.toFixed(2)} mm</td></tr>
        </table>
        <div class="advisor-item ${fixedTotalZ <= zTarget ? 'ok' : 'danger'}" style="margin-top:10px;"><div class="advisor-item-text">
        ${fixedTotalZ <= zTarget
            ? `✅ 磁鐵開啟模式下，Z總高度由外殼肉厚+磁鐵+導磁片+0.3+奈米晶固定決定(與Rx線圈距離無關)，目前結構(${fixedTotalZ.toFixed(2)}mm)在您的上限內。`
            : `⚠ 磁鐵開啟模式下，目前結構固定高度(${fixedTotalZ.toFixed(2)}mm)已超出您輸入的上限，需縮減磁鐵厚度、導磁片厚度或奈米晶層數；此模式下調整Rx線圈距離對Z總高度沒有影響。`}
        </div></div>`;
        return;
    }

    const fixedStack = state.ncT + state.coilT;
    const maxRxCoilDist = zTarget - fixedStack;

    let verdict;
    if (maxRxCoilDist <= 0) verdict = { level: 'danger', text: `此Z總高度上限已小於固定堆疊項總和(${fixedStack.toFixed(2)}mm，奈米晶+線圈厚度)，物理上無法達成，需縮減奈米晶層數或線圈厚度。` };
    else if (maxRxCoilDist < 1.75) verdict = { level: 'warning', text: `可行的Rx線圈距離上限(${maxRxCoilDist.toFixed(2)}mm)已低於建議下限1.75mm，k值評估可信度會降低，建議放寬Z總高度或縮減固定堆疊項。` };
    else verdict = { level: 'ok', text: `可行的Rx線圈距離範圍為 0 ~ ${maxRxCoilDist.toFixed(2)}mm，落在建議範圍內，設計可行。` };

    box.innerHTML = `
    <table class="advisor-result-table">
        <tr><th>Z總高度上限</th><td>${zTarget.toFixed(2)} mm</td></tr>
        <tr><th>固定堆疊項(奈米晶+線圈厚度${state.enableMagnet ? '+磁鐵+導磁片+0.3' : ''})</th><td>${fixedStack.toFixed(2)} mm</td></tr>
        <tr><th>反推 Rx線圈距離 上限</th><td>${maxRxCoilDist > 0 ? maxRxCoilDist.toFixed(2) + ' mm' : 'N/A (超出可行範圍)'}</td></tr>
    </table>
    <div class="advisor-item ${verdict.level === 'ok' ? 'ok' : verdict.level}" style="margin-top:10px;"><div class="advisor-item-text">${verdict.text}</div></div>`;
}

