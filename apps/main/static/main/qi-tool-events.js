// ─── 6. 事件監聽 ───
function syncChargingPower() {
    state.sysPower = state.batVoltage * state.batCapacity / 1000 * state.batMaxC;
    const powerInput = document.getElementById('sysPower');
    if (powerInput) powerInput.value = state.sysPower;
}

function initEventListeners() {
    ['rxIc', 'chargerIc'].forEach(field => {
        state[field + 'Select'] = document.getElementById(field + 'Select').value;
        document.getElementById(field + 'Eff').disabled = state[field + 'Select'] !== 'custom';
    });
    const numInputs = ['batCapacity', 'batVoltage', 'batMaxC', 'sysPower', 'coilX', 'coilY', 'coilT', 'ncT', 'rxL', 'rxR', 'kVal', 'rxCoilDist', 'magCount', 'magW', 'magT', 'chargeCurrentmA', 'chargeCurrentA', 'targetChargeTimeHr', 'rxIcEff', 'chargerIcEff'];
    numInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', e => {
            const val = parseFloat(e.target.value) || 0;
            
            if (id === 'chargeCurrentmA') {
                const curA = val / 1000;
                const elA = document.getElementById('chargeCurrentA');
                if (elA) elA.value = curA;
                if (state.batCapacity > 0) {
                    state.batMaxC = val / state.batCapacity;
                    const elC = document.getElementById('batMaxC');
                    if (elC) elC.value = state.batMaxC;
                }
            } else if (id === 'chargeCurrentA') {
                const curmA = val * 1000;
                const elmA = document.getElementById('chargeCurrentmA');
                if (elmA) elmA.value = curmA;
                if (state.batCapacity > 0) {
                    state.batMaxC = curmA / state.batCapacity;
                    const elC = document.getElementById('batMaxC');
                    if (elC) elC.value = state.batMaxC;
                }
            } else if (id === 'batMaxC') {
                state.batMaxC = val;
                const curmA = state.batCapacity * val;
                const elmA = document.getElementById('chargeCurrentmA');
                if (elmA) elmA.value = curmA;
                const elA = document.getElementById('chargeCurrentA');
                if (elA) elA.value = curmA / 1000;
            } else if (id === 'batCapacity') {
                state.batCapacity = val;
                const curmA = val * state.batMaxC;
                const elmA = document.getElementById('chargeCurrentmA');
                if (elmA) elmA.value = curmA;
                const elA = document.getElementById('chargeCurrentA');
                if (elA) elA.value = curmA / 1000;
                const elWh = document.getElementById('batEnergyWh');
                if (elWh) elWh.value = ((state.batVoltage * val) / 1000).toFixed(3) + ' Wh';
            } else if (id === 'batVoltage') {
                state.batVoltage = val;
                const elWh = document.getElementById('batEnergyWh');
                if (elWh) elWh.value = ((val * state.batCapacity) / 1000).toFixed(3) + ' Wh';
            } else {
                state[id] = val;
            }
            if (['chargeCurrentA', 'chargeCurrentmA', 'batVoltage', 'batCapacity', 'batMaxC'].includes(id)) {
                syncChargingPower();
            }
            triggerCalc();
        });
    });

    // Commit on change so intermediate typing (e.g. "0." before "0.5") remains possible.
    ['chargeCurrentA', 'chargeCurrentmA', 'batCapacity', 'batMaxC'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            const {min, max} = currentLimits(state);
            const current = state.batCapacity * state.batMaxC / 1000;
            if (min > max || !Number.isFinite(current) || state.batCapacity <= 0) return;
            const limited = Math.max(min, Math.min(max, current));
            if (limited === current) return;
            state.batMaxC = limited * 1000 / state.batCapacity;
            for (const [field, value] of [
                ['chargeCurrentA', limited], ['chargeCurrentmA', limited * 1000],
                ['batMaxC', state.batMaxC],
            ]) {
                const input = document.getElementById(field);
                if (input) input.value = value;
            }
            syncChargingPower();
            triggerCalc();
            const hint = document.getElementById('chargeCurrentLimits');
            if (hint) hint.textContent += ` 已將超限電流修正為 ${limited} A。`;
        });
    });

    const NC_LAYER_THICKNESS = { '1L': 0.05, '2L': 0.08, '3L': 0.10, '5L': 0.15 };
    const selects = ['batScenarioSelect', 'caseMaterial', 'rxIcSelect', 'chargerIcSelect', 'ncWrap', 'ncTPreset', 'magCoating', 'magGrade', 'susT', 'coilType'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', e => {
            state[id] = ['magCoating', 'magGrade', 'susT'].includes(id) ? Number(e.target.value) : e.target.value;
            if (id === 'rxIcSelect' || id === 'chargerIcSelect') {
                document.getElementById(id.replace('Select', 'Eff')).disabled = e.target.value !== 'custom';
                const {min, max} = currentLimits(state);
                if (Number.isFinite(max) && min <= max && state.batCapacity > 0) {
                    state.batMaxC = min * 1000 / state.batCapacity;
                    syncChargingPower();
                    syncUIInputs();
                }
            }
            if(id === 'caseMaterial' && e.target.value === 'aluminum') {
                state.ncWrap = 'yes';
                const wrapEl = document.getElementById('ncWrap');
                if(wrapEl) wrapEl.value = 'yes';
            }
            if(id === 'ncTPreset') {
                const ncTEl = document.getElementById('ncT');
                if(e.target.value === 'custom') {
                    if(ncTEl) { ncTEl.disabled = false; ncTEl.style.background = '#fff'; }
                } else {
                    state.ncT = NC_LAYER_THICKNESS[e.target.value];
                    if(ncTEl) { ncTEl.value = state.ncT; ncTEl.disabled = true; ncTEl.style.background = '#f1f5f9'; }
                }
            }
            if(id === 'batScenarioSelect') {
                const v = e.target.value;
                if(v === 'ultraslim') { state.batCapacity = 250; state.batVoltage = 3.70; state.batMaxC = 0.5; state.sysPower = 1.5; }
                else if(v === 'flagship') { state.batCapacity = 510; state.batVoltage = 3.85; state.batMaxC = 2.0; state.sysPower = 3.9; }
                else if(v === 'standard') { state.batCapacity = 400; state.batVoltage = 3.70; state.batMaxC = 1.0; state.sysPower = 2.5; }
                else if(v === 'smartbox') { state.batCapacity = 750; state.batVoltage = 3.85; state.batMaxC = 1.5; state.sysPower = 5.0; }
                syncUIInputs();
            }
            triggerCalc();
        });
    });

    const a1Slider = document.getElementById('a1_slider');
    if(a1Slider) a1Slider.addEventListener('input', e => {
        state.a1 = parseFloat(e.target.value) || 0;
        const vEl = document.getElementById('v_a1');
        if(vEl) vEl.innerText = state.a1;
        triggerCalc();
    });

    const sysBadgeLarge = document.getElementById('sysBadgeLarge');
    if(sysBadgeLarge) sysBadgeLarge.addEventListener('click', e => {
        e.stopPropagation();
        switchDisplayTab('advisor');
        switchAdvisorTab('diag');
    });

    const coilLightboxOverlay = document.getElementById('coilLightboxOverlay');
    if(coilLightboxOverlay) coilLightboxOverlay.addEventListener('click', e => {
        if(e.target === coilLightboxOverlay) closeCoilLightbox();
    });

    window.addEventListener('resize', () => {
        resizeCanvases();
        drawLayoutCanvases();
    });
}

