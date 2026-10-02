
// ─── 物理與幾何常數定義 ───
const efficiencyFormat = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false,
});
function formatEfficiency(value) {
    return value == null ? '—' : efficiencyFormat.format(value);
}

const RX_MAG_RING_OD = 52.92, RX_MAG_RING_ID = 47.10;
const RX_MAG_L = (RX_MAG_RING_OD - RX_MAG_RING_ID) / 2;
const TX_MAG_RING_OD = 54.0, TX_MAG_RING_ID = 46.0;
const TX_MAG_MEAN_R = (TX_MAG_RING_OD + TX_MAG_RING_ID) / 4;
const RX_LEAD_GAP_ARC_MM = 9.55;
const RX_LEAD_GAP_HALF_ANGLE_DEG = 11.00;
const RX_LEAD_GAP_HALF_ANGLE_RAD = RX_LEAD_GAP_HALF_ANGLE_DEG * Math.PI / 180;

// IC curves come from Django; calculation, labels and advisor share this catalog.
const curveCatalog = JSON.parse(document.getElementById('qi-curves').textContent);
const RX_EFF_CURVES = curveCatalog.rx;
const CHARGER_EFF_CURVES = curveCatalog.charger;
const RX_EFF_FIXED = curveCatalog.rxFixed;
const CHARGER_EFF_FIXED = curveCatalog.chargerFixed;

let state = {
    batScenarioSelect: 'standard', batCapacity: 400, batVoltage: 3.70, batMaxC: 1.0, sysPower: 2.5,
    caseMaterial: 'pc_abs', rxIcSelect: 'cps4019', rxIcEff: 85, chargerIcSelect: 'mp2733', chargerIcEff: 92,
    coilX: 32.0, coilY: 25.0, coilW: 5.0, coilR: 10.0, coilT: 0.75, coilExitT: 1.15, coilType: 'dual copper wire',
    ncT: 0.10, ncTPreset: '3L', ncWrap: 'no', rxL: 14.70, rxR: 270, qVal: 30, rxACR: 320.0, freq: 100, qTx: 21.35, // qTx(Tx端Q值)已移除UI輸入,固定採用21.35內部假設值
    kVal: 0.68, rxCoilDist: 2.0, gapInput: 0.7, // gapInput(外殼肉厚)已移除UI設定，固定採用0.7mm內部預設值，僅供Z-Stack繪圖與磁力估算使用
    enableMagnet: true, magCount: 6, magW: 6, magT: 0.8, magCoating: 0.1, magGrade: 1.1, susT: 0.20, a1: 33
};

function interpEff(curve, x) {
    if (!curve || curve.length === 0) return null;
    if (x <= curve[0][0]) return curve[0][1];
    if (x >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
    for (let i = 0; i < curve.length - 1; i++) {
        const [x0, y0] = curve[i], [x1, y1] = curve[i + 1];
        if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return curve[curve.length - 1][1];
}

// ─── 1. 左側選單切換與右側分頁自動聯動 ───
// ─── 2. 分頁切換 ───
// 各分頁對應要顯示的參數欄位（a~e），其餘欄位隱藏以節省版面
const PANE_VISIBILITY_BY_TAB = {
    calc: ['elec', 'rx', 'charger', 'coil'],
    layout: ['coil'],
    qi2: ['magnet'],
    history: [],
    advisor: []
};
// 「相容Qi2定位」分頁沿用「空間架構」的視覺化內容(TOP View / Z-Stack)，僅參數欄改顯示e(磁鐵)而非d(線圈)
const VIEW_CONTENT_BY_TAB = { qi2: 'layout' };

function switchDisplayTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    
    const btnEl = document.getElementById('tab-' + tabId);
    if(btnEl) btnEl.classList.add('active');
    
    const viewTabId = VIEW_CONTENT_BY_TAB[tabId] || tabId;
    const viewEl = document.getElementById('view-' + viewTabId);
    if(viewEl) viewEl.classList.add('active');

    // 依目前分頁，決定欄2要並排顯示哪些參數欄位（a~e）
    const visibleSet = PANE_VISIBILITY_BY_TAB[tabId] || [];
    ['elec', 'rx', 'charger', 'coil', 'magnet'].forEach(secId => {
        const paneEl = document.getElementById('pane-' + secId);
        if (paneEl) paneEl.classList.toggle('pane-visible', visibleSet.includes(secId));
    });

    // 開啟歷史數據／智慧反推分頁時，收合欄2(參數設定窗格)讓觀看範圍變大；切回其他分頁時自動展開
    const splitEl = document.querySelector('.main-content-split');
    if (splitEl) {
        if (tabId === 'history' || tabId === 'advisor') splitEl.classList.add('collapsed');
        else splitEl.classList.remove('collapsed');
    }

    // 效能計算分頁的結果內容已改為浮層顯示，欄3(display-panel)在此分頁不再需要，隱藏以避免出現空白大卡片
    const displayPanelEl = document.querySelector('.display-panel');
    if (displayPanelEl) displayPanelEl.style.display = (tabId === 'calc') ? 'none' : 'flex';

    if (tabId === 'layout' || tabId === 'qi2') {
        setTimeout(() => {
            resizeCanvases();
            drawLayoutCanvases();
        }, 50);
    }

    // 切到智慧反推分頁時，重新渲染目前作用中的子分頁內容（例如目前診斷清單）
    if (tabId === 'advisor') {
        const activeSubBtn = document.querySelector('.advisor-tabbtn.active');
        const subTab = activeSubBtn ? activeSubBtn.id.replace('advisorBtn_', '') : 'diag';
        switchAdvisorTab(subTab);
    }
}

// ─── 效率橫幅：收合/展開切換 ───
function toggleEffBanner() {
    const collapsed = document.getElementById('effBannerCollapsed');
    const expanded = document.getElementById('effBannerExpanded');
    const caret = document.getElementById('effBannerCaret');
    const isOpen = expanded.classList.contains('show');
    expanded.classList.toggle('show', !isOpen);
    if (collapsed) collapsed.style.display = isOpen ? '' : 'none';
    if (caret) caret.innerText = isOpen ? '▸' : '▾';
}

// ─── 3. 計算與包絡線 ───
function calculateEnvelopes() {
    if (!state.enableMagnet) {
        return { nW: state.coilX + 3.0, nH: state.coilY + 3.0, angles: [] };
    }
    const rad = state.a1 * Math.PI / 180;
    let angles = []; 
    if ((state.magCount/2)%2 !== 0) angles.push(0, Math.PI);
    const rem = (angles.length === 0) ? state.magCount/4 : (state.magCount-2)/4;
    for(let i=1; i<=rem; i++) angles.push(i*rad, -i*rad, Math.PI-i*rad, Math.PI+i*rad);
    let mx=0, my=0;
    const effW = parseFloat(state.magW) + parseFloat(state.magCoating); 
    angles.forEach(a => {
        let x = Math.cos(a)*TX_MAG_MEAN_R, y = Math.sin(a)*TX_MAG_MEAN_R;
        let bx = Math.abs(x) + (effW/2*Math.abs(Math.cos(a+Math.PI/2)) + 2.0*Math.abs(Math.sin(a+Math.PI/2)));
        let by = Math.abs(y) + (effW/2*Math.abs(Math.sin(a+Math.PI/2)) + 2.0*Math.cos(a+Math.PI/2));
        if(bx > mx) mx = bx; if(by > my) my = by;
    });
    return { nW: Math.max((mx+1)*2, state.coilX+3), nH: Math.max((my+1)*2, state.coilY+3), angles };
}

// k值改為手動輸入 (2026/08 變更)：原本的 recalcKval() 依 Tx-Rx 間距自動查表已移除，
// 因 TX_COIL_TO_SURFACE_MM 僅為工程假設值、K_LOOKUP_CURVE 來源亦未經驗證，
// 故kVal欄位直接採用使用者輸入值，不再由程式自動覆寫。

function loadCoilPreset(type) {
    if(type === 'sim') { state.coilX = 32; state.coilY = 25; state.coilR = 10.0; state.coilW = 5.0; }
    if(type === 'rect') { state.coilX = 32; state.coilY = 20; state.coilR = 4.0; state.coilW = 3.8; }
    if(type === 'circle') { state.coilX = 24; state.coilY = 24; state.coilR = 12.0; state.coilW = 3.8; }
    syncUIInputs();
    triggerCalc();
}

function syncUIInputs() {
    ['coilX', 'coilY', 'coilT', 'rxL', 'rxCoilDist', 'ncT', 'batCapacity', 'batVoltage', 'batMaxC', 'sysPower', 'magCount', 'magW', 'magT'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = state[id];
    });
    
    // 電流與能量更新
    const chargeCurrentmA = state.batCapacity * state.batMaxC;
    const chargeCurrentA = chargeCurrentmA / 1000;
    const batEnergyWh = (state.batVoltage * state.batCapacity) / 1000;
    const timeHr = chargeCurrentmA > 0 ? (state.batCapacity / chargeCurrentmA * 1.2) : 1.5;
    
    const elCurrmA = document.getElementById('chargeCurrentmA');
    if(elCurrmA) elCurrmA.value = chargeCurrentmA;
    const elCurrA = document.getElementById('chargeCurrentA');
    if(elCurrA) elCurrA.value = chargeCurrentA;
    const elWh = document.getElementById('batEnergyWh');
    if(elWh) elWh.value = batEnergyWh.toFixed(3) + ' Wh';
    const elTime = document.getElementById('targetChargeTimeHr');
    if(elTime) elTime.value = timeHr.toFixed(1);
}

