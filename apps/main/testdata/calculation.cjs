const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../curves.json'), 'utf8'));
const ctx = vm.createContext({document: {getElementById: () => ({textContent: JSON.stringify(catalog)})}});
for (const name of ['core', 'calculation']) vm.runInContext(fs.readFileSync(path.join(__dirname, `../static/main/qi-tool-${name}.js`), 'utf8'), ctx);
if (process.argv.includes('--calculate')) {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    console.log(JSON.stringify(ctx.calculate(input.state, input.catalog)));
} else {
    const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy_results.json'), 'utf8'));
    const near = (a, b) => b === null ? assert.equal(a, null) : assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
    for (const {input, expected} of cases) {
        const before = JSON.stringify(input);
        const actual = ctx.calculate(input, catalog);
        for (const field of ['coilEff','sysEffPct','rxIcEff','chargerIcEff','Qrx','rxACR','pInTotal','totalLoss','pOut','chargeCurrentA']) near(actual[field], expected[field]);
        if (actual.pInTotal !== null) near(actual.pInTotal, actual.pOut + actual.coilLoss + actual.icLoss);
        assert.equal(JSON.stringify(input), before);
    }
    const s = cases[0].input;
    for (const [field, value] of [['rxR',0],['kVal',1.1],['rxL',-1],['sysPower',true],['rxIcSelect','unknown'],['rxIcSelect','toString'],['freq',NaN],['batMaxC',Infinity],['batVoltage','3.7'],['caseMaterial','unknown'],['ncWrap','unknown']]) {
        assert.throws(() => ctx.calculate({...s, [field]: value}, catalog));
    }
    for (const overrides of [{kVal:0},{rxIcSelect:'custom',rxIcEff:0}]) {
        const r = ctx.calculate({...s,...overrides},catalog);
        assert.equal(r.pInTotal,null);
        assert.equal(r.warnings.length,1);
    }
    assert.equal(ctx.calculate({...s,sysPower:0,kVal:0},catalog).pInTotal,0);
    for (const kind of ['rx','charger']) {
        const field = kind === 'rx' ? 'rxIc' : 'chargerIc';
        const custom = structuredClone(catalog);
        custom[kind].custom_test = {axis:'power',data:[[0,70],[2,80],[4,90]]};
        const input = {...s,[field+'Select']:'custom_test',sysPower:3};
        assert.equal(ctx.calculate(input,custom)[field+'Eff'],85);
        assert.equal(ctx.calculate({...input,sysPower:5},custom)[field+'Eff'],90);
        custom[kind].custom_test.axis = 'current';
        assert.equal(ctx.calculate({...input,batCapacity:1000,batMaxC:3},custom)[field+'Eff'],85);
        for (const data of [[[0,70],[0,80],[4,90]],[[0,70],[2,101],[4,90]],[[0,70]],[[0,70],[2,80],[Infinity,90]]]) {
            custom[kind].custom_test.data=data;
            assert.throws(()=>ctx.calculate(input,custom));
        }
        custom[kind+'Fixed'].custom_test=0;
        assert.equal(ctx.calculate(input,custom)[field+'Eff'],0);
    }
    console.log(`PASS: ${cases.length} original JS cases, energy balance, validation, zero efficiency and both curve axes`);
}
