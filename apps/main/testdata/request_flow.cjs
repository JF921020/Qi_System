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
console.log('PASS: immediate local calculation, rendering, validation and recovery without fetch');
