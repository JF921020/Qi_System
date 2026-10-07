// Run from project root: node apps/main/testdata/request_flow.cjs
// Check synchronous browser calculations without additional dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const staticDir = path.join(__dirname, '../static/main');
const modules = [
    'core', 'layout', 'calculation', 'events', 'history-data',
    'history', 'advisor', 'digitizer', 'app',
];
const readyCallbacks = [];
const loadContext = vm.createContext({
    document: {
        getElementById: id => id === 'qi-curves'
            ? {textContent: '{"rx":{},"charger":{},"rxFixed":{},"chargerFixed":{}}'}
            : {},
        addEventListener: (event, callback) => readyCallbacks.push({event, callback}),
    },
    window: {},
});
modules.forEach(name => vm.runInContext(
    fs.readFileSync(path.join(staticDir, `qi-tool-${name}.js`), 'utf8'),
    loadContext,
    {filename: `qi-tool-${name}.js`},
));
assert.equal(vm.runInContext('typeof triggerCalc', loadContext), 'function');
assert.equal(vm.runInContext('typeof renderDiagAdvice', loadContext), 'function');
assert.equal(vm.runInContext('typeof saveDigitizedCurve', loadContext), 'function');
assert.equal(readyCallbacks.length, 2, 'digitizer and app initializers are registered');

let nonNegativeListener;
const negativeInput = {
    value: '-2', valueAsNumber: -2,
    addEventListener: (event, listener) => { nonNegativeListener = listener; },
};
vm.runInNewContext(fs.readFileSync(path.join(staticDir, 'qi-tool-app.js'), 'utf8'), {
    document: {
        addEventListener: (event, callback) => callback(),
        querySelectorAll: () => [negativeInput],
    },
    initEventListeners() {}, syncUIInputs() {}, triggerCalc() {}, switchDisplayTab() {},
});
nonNegativeListener();
assert.equal(negativeInput.value, '0', 'negative numeric input is clamped to zero');

const elements = new Map();
loadContext.document.getElementById = id => {
    if (!elements.has(id)) elements.set(id, {style: {}, classList: {contains: () => false}});
    return elements.get(id);
};
loadContext.fetch = () => { throw new Error('Calculation must not use the network'); };
loadContext.drawLayoutCanvases = () => {};
loadContext.renderDiagAdvice = () => {};
vm.runInContext(`
Object.assign(curveCatalog, ${fs.readFileSync(path.join(__dirname, '../curves.json'), 'utf8')});
state.sysPower = 3;
triggerCalc();
`, loadContext);
assert.equal(elements.get('resTargetPower').innerText, '3.00 W');
assert.equal(loadContext.window._advisorSnapshot.pOut, 3);
vm.runInContext('state.sysPower = 4; triggerCalc();', loadContext);
assert.equal(elements.get('resTargetPower').innerText, '4.00 W');
assert.equal(loadContext.window._advisorSnapshot.pOut, 4);
vm.runInContext('state.rxR = 0; triggerCalc();', loadContext);
assert.match(elements.get('calcStatus').textContent, /rxR/);
assert.equal(loadContext.window._advisorSnapshot, null);
assert.equal(elements.get('resInPower').innerText, '—');
vm.runInContext('state.rxR = 270; state.kVal = 0; triggerCalc();', loadContext);
assert.equal(elements.get('resInPower').innerText, '無法計算');
assert.equal(loadContext.window._advisorSnapshot, null);
vm.runInContext('state.kVal = 0.68; triggerCalc();', loadContext);
assert.equal(elements.get('calcStatus').textContent, '');
assert.equal(loadContext.window._advisorSnapshot.pOut, 4);
for (const [input, expected] of [[92, '92.0'], [92.34, '92.3'], [92.35, '92.4'], [92.36, '92.4'], [0.05, '0.1'], [99.95, '100.0']]) {
    assert.equal(loadContext.formatEfficiency(input), expected);
}
vm.runInContext(`
state.rxIcSelect = 'custom'; state.rxIcEff = 92.35;
state.chargerIcSelect = 'custom'; state.chargerIcEff = 89.24;
triggerCalc();
`, loadContext);
assert.equal(elements.get('rxIcEff').value, '92.4');
assert.equal(elements.get('chargerIcEff').value, '89.2');
assert.equal(elements.get('rxIcBadgeLarge').innerText, '92.4%');
assert.equal(elements.get('chargerIcBadgeLarge').innerText, '89.2%');
assert.equal(vm.runInContext('state.rxIcEff', loadContext), 92.35, 'display rounding preserves calculation precision');
// Current limits use the intersection of selected current curves, in amperes.
vm.runInContext(`
curveCatalog.rx.limit_test = {axis: 'current', data: [[0.123, 80], [0.5, 90], [1.2, 95]]};
curveCatalog.charger.limit_test = {axis: 'current', data: [[0.1, 80], [0.5, 90], [0.987, 95]]};
state.rxIcSelect = 'limit_test'; state.chargerIcSelect = 'limit_test';
state.batCapacity = 510;
`, loadContext);
for (const current of [0.123, 0.987, 0.5]) {
    vm.runInContext(`state.batMaxC = ${current} * 1000 / state.batCapacity; triggerCalc();`, loadContext);
    assert.equal(elements.get('calcStatus').textContent, '');
    assert.ok(Math.abs(loadContext.window._advisorSnapshot.chargeCurrentA - current) < 1e-12);
}
assert.equal(elements.get('chargeCurrentA').min, 0.123);
assert.equal(elements.get('chargeCurrentA').max, 0.987);
assert.equal(elements.get('chargeCurrentmA').min, 123);
assert.equal(elements.get('chargeCurrentmA').max, 987);
for (const current of [0.1229, 0.9871]) {
    vm.runInContext(`state.batMaxC = ${current} * 1000 / state.batCapacity; triggerCalc();`, loadContext);
    assert.match(elements.get('calcStatus').textContent, /充電電流超出允許範圍/);
    assert.equal(loadContext.window._advisorSnapshot, null);
}

// Exercise actual A/mA, capacity, C-rate and IC selection event handlers.
for (const el of elements.values()) {
    el.listeners = {};
    el.addEventListener = (event, handler) => { el.listeners[event] = handler; };
}
const previousGet = loadContext.document.getElementById;
loadContext.document.getElementById = id => elements.has(id) ? previousGet(id) : null;
elements.set('batCapacity', {listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; }});
elements.set('batMaxC', {listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; }});
elements.set('batVoltage', {listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; }});
elements.set('sysPower', {listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; }});
for (const id of ['rxIcSelect', 'chargerIcSelect']) {
    elements.set(id, {value: 'limit_test', listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; }});
}
loadContext.window.addEventListener = () => {};
loadContext.initEventListeners();
const dispatch = (id, event, value) => elements.get(id).listeners[event]({target: {value}});
dispatch('chargeCurrentmA', 'input', '123');
assert.equal(elements.get('chargeCurrentA').value, 0.123);
assert.equal(elements.get('calcStatus').textContent, '');
dispatch('chargeCurrentA', 'input', '0.987');
assert.equal(elements.get('chargeCurrentmA').value, 987);
assert.equal(elements.get('calcStatus').textContent, '');
dispatch('batCapacity', 'input', '1000');
assert.match(elements.get('calcStatus').textContent, /充電電流超出允許範圍/);
dispatch('batMaxC', 'input', '0.5');
assert.equal(elements.get('calcStatus').textContent, '');
for (const [id, value, expected] of [
    ['chargeCurrentA', '2', 0.987], ['chargeCurrentmA', '1', 0.123],
    ['batMaxC', '2', 0.987], ['batCapacity', '2000', 0.987],
    ['chargeCurrentA', '0', 0.123],
]) {
    dispatch(id, 'input', value);
    assert.equal(loadContext.window._advisorSnapshot, null, 'out-of-range draft cannot calculate');
    dispatch(id, 'change', value);
    assert.equal(elements.get('chargeCurrentA').value, expected);
    assert.equal(elements.get('chargeCurrentmA').value, expected * 1000);
    assert.ok(Math.abs(loadContext.window._advisorSnapshot.chargeCurrentA - expected) < 1e-12);
    assert.equal(elements.get('calcStatus').textContent, '');
    assert.match(elements.get('chargeCurrentLimits').textContent, /已將超限電流修正/);
}
vm.runInContext("curveCatalog.rx.disjoint = {axis: 'current', data: [[2,80],[3,90],[4,95]]};", loadContext);
dispatch('rxIcSelect', 'change', 'disjoint');
assert.match(elements.get('chargeCurrentLimits').textContent, /沒有交集/);
assert.equal(loadContext.window._advisorSnapshot, null);
dispatch('chargeCurrentA', 'input', '0.5');
dispatch('chargeCurrentA', 'change', '0.5');
assert.equal(loadContext.window._advisorSnapshot, null, 'no clamping to an invalid intersection');
dispatch('rxIcSelect', 'change', 'custom');
assert.equal(elements.get('chargeCurrentA').min, 0.1);
assert.equal(elements.get('chargeCurrentA').value, 0.1);
assert.equal(elements.get('chargeCurrentmA').value, 100);
assert.equal(loadContext.window._advisorSnapshot.chargeCurrentA, 0.1);
assert.equal(elements.get('calcStatus').textContent, '');
dispatch('rxIcSelect', 'change', 'limit_test');
assert.equal(elements.get('chargeCurrentA').value, 0.123);
dispatch('chargeCurrentA', 'input', '0.8');
vm.runInContext("curveCatalog.charger.higher_min = {axis: 'current', data: [[0.3,80],[0.5,90],[1,95]]};", loadContext);
dispatch('chargerIcSelect', 'change', 'higher_min');
assert.equal(elements.get('chargeCurrentA').value, 0.3);
assert.equal(elements.get('chargeCurrentmA').value, 300);
assert.equal(elements.get('batMaxC').value, 0.15);
assert.equal(loadContext.window._advisorSnapshot.chargeCurrentA, 0.3);
dispatch('rxIcSelect', 'change', 'custom');
vm.runInContext("curveCatalog.chargerFixed.fixed_test = 90;", loadContext);
dispatch('chargerIcSelect', 'change', 'fixed_test');
assert.equal(elements.get('chargeCurrentA').value, 0.3, 'no known current range preserves current');
assert.equal(elements.get('chargeCurrentA').max, '');
assert.equal(elements.get('chargeCurrentmA').max, '');
assert.match(elements.get('chargeCurrentLimits').textContent, /未提供/);
vm.runInContext("curveCatalog.rx.power_test = {axis: 'power', data: [[0,80],[1,90],[2,95]]};", loadContext);
dispatch('rxIcSelect', 'change', 'power_test');
assert.equal(elements.get('chargeCurrentA').max, '');
assert.equal(elements.get('calcStatus').textContent, '');
// Voltage and current edits update power and power-based efficiency immediately.
dispatch('chargeCurrentA', 'input', '0.3');
dispatch('batVoltage', 'input', '3');
const lowVoltageEfficiency = loadContext.window._advisorSnapshot.rxIcEff;
assert.ok(Math.abs(loadContext.window._advisorSnapshot.pOut - 0.9) < 1e-12);
dispatch('batVoltage', 'input', '4');
assert.ok(Math.abs(elements.get('sysPower').value - 1.2) < 1e-12);
assert.ok(loadContext.window._advisorSnapshot.rxIcEff > lowVoltageEfficiency);
dispatch('chargeCurrentmA', 'input', '400');
assert.ok(Math.abs(loadContext.window._advisorSnapshot.pOut - 1.6) < 1e-12);
// IC voltage follows the most recently selected named voltage condition.
elements.set('batEnergyWh', {});
for (const [id, name, value, voltage] of [
    ['rxIcSelect', 'RX_5V', 'power_test', 5],
    ['chargerIcSelect', 'CHARGER_12V', 'fixed_test', 12],
    ['rxIcSelect', 'RX_5V', 'power_test', 5],
    ['chargerIcSelect', 'Legacy IC', 'fixed_test', 5],
    ['rxIcSelect', undefined, 'custom', 5],
]) {
    elements.get(id).selectedOptions = [{dataset: {icName: name}}];
    dispatch(id, 'change', value);
    assert.equal(vm.runInContext('state.batVoltage', loadContext), voltage);
    assert.equal(elements.get('batVoltage').value, voltage);
    assert.ok(Math.abs(loadContext.window._advisorSnapshot.pOut - voltage * 0.4) < 1e-12);
    assert.equal(elements.get('batEnergyWh').value, (voltage * 2).toFixed(3) + ' Wh');
}
dispatch('batVoltage', 'input', '3.8');
assert.equal(vm.runInContext('state.batVoltage', loadContext), 3.8, 'manual voltage remains editable');
elements.get('rxIcSelect').selectedOptions = [{dataset: {icName: 'RX_5V'}}];
elements.get('chargerIcSelect').selectedOptions = [{dataset: {icName: 'CHARGER_12V'}}];
loadContext.initEventListeners();
assert.equal(elements.get('batVoltage').value, 12, 'initial selection uses Charger voltage when both have conditions');
dispatch('rxIcSelect', 'change', 'custom');
dispatch('chargerIcSelect', 'change', 'custom');
dispatch('batVoltage', 'input', '3.87654');
dispatch('chargeCurrentA', 'input', '0.45678');
assert.equal(elements.get('sysPower').value, 1.7707);
assert.equal(loadContext.window._advisorSnapshot.pOut, 1.7707);
dispatch('sysPower', 'input', '2.123456');
const powerTarget = {value: '2.123456'};
elements.get('sysPower').listeners.change({target: powerTarget});
assert.equal(powerTarget.value, 2.1235);
assert.equal(loadContext.window._advisorSnapshot.pOut, 2.1235);
dispatch('sysPower', 'input', '0.00001');
assert.equal(loadContext.window._advisorSnapshot.pOut, 0);
// Returning from IC management starts with the actual remaining dropdown option.
// Exercise the real page initializer with only one charger and no seeded MP2733.
function initializePage(catalog, sessionStorage) {
    const pageElements = new Map();
    let initialize;
    const page = vm.createContext({
        sessionStorage,
        document: {
            getElementById(id) {
                if (!pageElements.has(id)) pageElements.set(id, {
                    value: id === 'rxIcSelect' ? Object.keys(catalog.rxFixed)[0] || 'custom'
                        : id === 'chargerIcSelect' ? Object.keys(catalog.charger)[0] || 'custom' : '',
                    options: (id === 'rxIcSelect' ? [...Object.keys(catalog.rxFixed), 'custom']
                        : id === 'chargerIcSelect' ? [...Object.keys(catalog.charger), 'custom'] : []).map(value => ({value})),
                    textContent: id === 'qi-curves' ? JSON.stringify(catalog) : '',
                    style: {}, classList: {contains: () => false}, listeners: {},
                    addEventListener(event, handler) { this.listeners[event] = handler; },
                });
                return pageElements.get(id);
            },
            addEventListener(event, callback) { initialize = callback; },
            querySelectorAll: () => [],
        },
        window: {addEventListener() {}},
        drawLayoutCanvases() {}, renderDiagAdvice() {},
    });
    for (const name of ['core', 'calculation', 'events', 'app']) {
        vm.runInContext(fs.readFileSync(path.join(staticDir, `qi-tool-${name}.js`), 'utf8'), page);
    }
    page.switchDisplayTab = () => {};
    initialize();
    return {page, pageElements};
}
for (const [minimum, maximum] of [[0.5, 1], [0.1, 0.3]]) {
    const catalog = {rx: {}, rxFixed: {}, chargerFixed: {}, charger: {
        remaining: {axis: 'current', data: [[minimum, 80], [(minimum + maximum) / 2, 90], [maximum, 95]]},
    }};
    const {page, pageElements} = initializePage(catalog);
    assert.equal(pageElements.get('calcStatus').textContent, '');
    assert.equal(pageElements.get('chargeCurrentA').value, minimum);
    assert.equal(pageElements.get('chargeCurrentmA').value, minimum * 1000);
    assert.ok(Math.abs(page.window._advisorSnapshot.chargeCurrentA - minimum) < 1e-12);
    assert.ok(Math.abs(page.window._advisorSnapshot.pOut - 3.7 * minimum) < 1e-12);
    assert.ok(page.window._advisorSnapshot.coilEff > 0);
    assert.match(pageElements.get('effBadgeLarge').innerText, /^\d+\.\d%$/);
    assert.match(pageElements.get('hudCoilEff').innerText, /^\d+\.\d%$/);
}
// A new document after visiting management must restore both selected ICs.
const savedSelections = new Map();
const selectionStorage = {
    getItem: key => savedSelections.get(key) ?? null,
    setItem: (key, value) => savedSelections.set(key, value),
};
const selectionCatalog = {rx: {}, rxFixed: {rx_first: 85, rx_second: 95}, chargerFixed: {}, charger: {
    first: {axis: 'current', data: [[0.1, 80], [0.5, 85], [1, 90]]},
    second: {axis: 'current', data: [[0.5, 90], [0.8, 92], [1, 95]]},
}};
const initialPage = initializePage(selectionCatalog, selectionStorage);
for (const [id, value] of [['rxIcSelect', 'rx_second'], ['chargerIcSelect', 'second']]) {
    const select = initialPage.pageElements.get(id);
    select.value = value;
    select.listeners.change({target: select});
}
const returnedPage = initializePage(selectionCatalog, selectionStorage);
assert.equal(returnedPage.pageElements.get('rxIcSelect').value, 'rx_second');
assert.equal(returnedPage.pageElements.get('chargerIcSelect').value, 'second');
assert.equal(returnedPage.page.window._advisorSnapshot.rxIcEff, 95);
assert.equal(returnedPage.page.window._advisorSnapshot.chargerIcEff, 90);
assert.equal(returnedPage.page.window._advisorSnapshot.chargeCurrentA, 0.5);
delete selectionCatalog.charger.second;
const afterDeletion = initializePage(selectionCatalog, selectionStorage);
assert.equal(afterDeletion.pageElements.get('chargerIcSelect').value, 'first');
assert.equal(afterDeletion.pageElements.get('rxIcSelect').value, 'rx_second');
assert.equal(afterDeletion.pageElements.get('calcStatus').textContent, '');
assert.equal(selectionStorage.getItem('qi-tool:chargerIcSelect'), 'first');
const storageBlocked = initializePage(selectionCatalog, {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); },
});
assert.equal(storageBlocked.pageElements.get('calcStatus').textContent, '');
console.log('PASS: calculation, input events, single-charger initialization, IC selection restoration, deletion fallback and unavailable storage');
