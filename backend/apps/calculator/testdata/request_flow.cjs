// Run from backend: node apps/calculator/testdata/request_flow.cjs
// Check real request scheduling without a browser or additional dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/calculator/qi-tool.js'), 'utf8');
const flow = source.slice(source.indexOf('let calcController;'), source.indexOf('function renderCalculation'));
const elements = new Map();
const pending = [];
const timers = new Map();
const rendered = [];
let timerId = 0;
const ctx = vm.createContext({
    state: {rxIcSelect: 'cps4019', chargerIcSelect: 'mp2733', sysPower: 2.5},
    RX_EFF_CURVES: {}, CHARGER_EFF_CURVES: {}, window: {}, AbortController,
    document: {
        body: {dataset: {calculateUrl: '/api/calculate/'}},
        querySelector: () => ({value: 'test-csrf'}),
        getElementById: id => {
            if (!elements.has(id)) elements.set(id, {});
            return elements.get(id);
        }
    },
    renderDiagAdvice() {}, drawLayoutCanvases() {},
    renderCalculation: result => rendered.push(result),
    fetch: (url, options) => new Promise((resolve, reject) => pending.push({url, options, resolve, reject})),
    setTimeout: (fn, delay) => {timers.set(++timerId, {fn, delay}); return timerId;},
    clearTimeout: id => timers.delete(id),
});
vm.runInContext(flow, ctx);
const settle = () => new Promise(resolve => setImmediate(resolve));
const response = body => ({ok: true, headers: {get: () => 'application/json'}, json: async () => body});
(async () => {
    const efficiencyIds = ['effBadgeLarge', 'rxIcBadgeLarge', 'chargerIcBadgeLarge', 'sysBadgeLarge', 'effBannerSummaryVal'];
    efficiencyIds.forEach(id => elements.set(id, {innerText: '64.4%'}));
    vm.runInContext('state.sysPower = 3; triggerCalc();', ctx);
    efficiencyIds.forEach(id => assert.equal(elements.get(id).innerText, '64.4%', 'keep efficiency visible during recalculation'));
    assert.equal(pending.length, 1, 'input starts a request immediately without waiting for timers');
    assert.equal(JSON.parse(pending[0].options.body).state.sysPower, 3);
    assert.equal(pending[0].options.headers['X-CSRFToken'], 'test-csrf');
    vm.runInContext('state.sysPower = 4; triggerCalc();', ctx);
    assert.equal(pending[0].options.signal.aborted, true);
    pending[1].resolve(response({id: 'new', warnings: []}));
    await settle();
    pending[0].resolve(response({id: 'old', warnings: []}));
    await settle();
    assert.deepEqual(rendered.map(r => r.id), ['new'], 'stale response never renders');
    vm.runInContext('triggerCalc();', ctx);
    pending[2].reject(new Error('offline'));
    await settle();
    assert.match(elements.get('calcStatus').textContent, /offline/);
    efficiencyIds.forEach(id => assert.equal(elements.get(id).innerText, '64.4%', 'failure also preserves the last efficiency'));
    assert.match(elements.get('effUpdateStatus').textContent, /尚未更新/);
    vm.runInContext('triggerCalc();', ctx);
    pending[3].resolve({ok: false, headers: {get: () => 'application/json'}, json: async () => ({error: 'rxR 必須大於零'})});
    await settle();
    efficiencyIds.forEach(id => assert.equal(elements.get(id).innerText, '64.4%', 'validation errors preserve the last efficiency'));
    assert.equal(ctx.window._advisorSnapshot, null);
    console.log('PASS: immediate requests, CSRF, stale responses and error handling');
})().catch(error => {console.error(error); process.exitCode = 1;});
