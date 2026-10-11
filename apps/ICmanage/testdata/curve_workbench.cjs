// Run: node apps/ICmanage/testdata/curve_workbench.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
    constructor(value = '') { this.value = value; this.children = []; this.listeners = {}; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    fire(name) { this.listeners[name]?.(); }
    setAttribute(key, value) { this[key] = value; }
    toggleAttribute(key, force) { this[key] = force; }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren() { this.children = []; }
    insertRow() { return this.appendChild(new Element()); }
    insertCell() { return this.appendChild(new Element()); }
    querySelector() { return this.children[0]?.children[0]?.children[0]; }
    focus() {}
    get cells() { return this.children; }
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
}
function setup(values, editable = true) {
    const fields = Object.fromEntries(Object.entries({points: JSON.stringify(values), mode: 'curve', axis: 'ma', model_number: 'TEST', voltage: '3.8'}).map(([key, value]) => [key, new Element(value)]));
    fields.axis.selectedOptions = [{textContent: '充電電流 (mA)'}];
    const controls = Object.fromEntries(['query', 'size', 'title', 'chart-note', 'axis-heading', 'status', 'prev', 'next', 'add'].map(key => [`[data-${key}]`, new Element()]));
    controls['[data-size]'].value = '25';
    controls.tbody = new Element(); controls.svg = new Element(); controls.script = {textContent: JSON.stringify(values)};
    controls['thead tr'] = new Element();
    for (let i = 0; i < (editable ? 3 : 2); i++) controls['thead tr'].insertCell();
    const original = new Element();
    const form = new Element();
    form.elements = {namedItem: name => fields[name]}; form.querySelector = () => original;
    const section = new Element();
    section.dataset = {editable: String(editable), axis: '充電電流 (mA)', model: 'TEST', voltage: '3.8'};
    section.closest = tag => tag === 'form' ? form : null;
    section.querySelector = key => controls[key]; section.querySelectorAll = () => [];
    vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../static/ICmanage/curve-workbench.js'), 'utf8'), {
        document: {querySelectorAll: () => [section], createElement: () => new Element(), createElementNS: (_, tag) => Object.assign(new Element(), {tag})},
    });
    return {controls, fields, section, original,
        change(key, value, event = 'change') { controls[`[data-${key}]`].value = value; controls[`[data-${key}]`].fire(event); },
        click(key) { controls[`[data-${key}]`].fire('click'); },
        edit(row, column, value) { const input = controls.tbody.children[row].cells[column].children[0]; input.value = value; input.fire('input'); },
        save() { form.fire('submit'); return JSON.parse(fields.points.value); },
        path() { return controls.svg.children.find(node => node.tag === 'polyline')?.points; },
    };
}
const page = setup(Array.from({length: 60}, (_, i) => [i, 80]));
assert.equal(page.original.hidden, true);
assert.equal(page.controls.tbody.children.length, 25);
const firstPath = page.path();
page.edit(0, 1, '87.123456'); assert.notEqual(page.path(), firstPath, 'graph updates immediately');
page.click('next'); page.edit(0, 1, '91');
page.change('query', '59', 'input'); page.edit(0, 1, '99');
assert.equal(page.path().split(' ').length, 1, 'filter applies to graph and table');
assert.equal(page.save().length, 60, 'filter and pagination never discard hidden points');
assert.equal(page.save()[0][1], 87.123456); assert.equal(page.save()[25][1], 91); assert.equal(page.save()[59][1], 99);
page.click('add'); assert.equal(page.controls.svg.hidden, true, 'blank numbers are not plotted as zero');
page.edit(0, 0, '65'); page.edit(0, 1, '95'); assert.deepEqual(page.save().at(-1), [65, 95]);
page.controls.tbody.children[0].cells[2].children[0].fire('click'); assert.equal(page.save().length, 60);
assert.equal(page.controls['thead tr'].cells[0]['aria-sort'], 'ascending');
assert.equal(page.controls['thead tr'].cells[1]['aria-sort'], 'none');
page.fields.voltage.value = '5'; page.fields.voltage.fire('input'); assert.equal(page.controls['[data-title]'].textContent, 'TEST · 5 V');
page.fields.mode.value = 'fixed'; page.fields.mode.fire('change'); assert.equal(page.section.hidden, true); assert.deepEqual(page.save(), []);
const dense = setup(Array.from({length: 10000}, (_, i) => [i, 80 + i % 2]), false);
assert.equal(dense.path().split(' ').length, 10000, 'dense line retains every data point');
assert.equal(dense.controls.tbody.children.length, 25);
dense.change('query', 'missing', 'input'); assert.equal(dense.controls.svg.hidden, true);
const zeros = setup([[0, 0], [1, 0], [2, 0]], false); assert.equal(zeros.controls.svg.hidden, false);
const currentAxis = setup([[1000, 90], [100, 60], [200, 80]], false);
assert.equal(currentAxis.path(), '114,110 168,70 600,50', 'X positions use a zero origin with proportional spacing');
assert.equal(currentAxis.controls.svg.children.find(node => node.tag === 'text' && node.x === 600 && node.y === 249).textContent, '1000', 'X axis maximum equals the largest current value');
const xTicks = chart => chart.controls.svg.children.filter(node => node.tag === 'text' && node.y === 249).map(node => Number(node.textContent)).sort((a, b) => a - b);
assert.deepEqual(xTicks(currentAxis), [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], 'X axis divides the maximum into ten intervals');
const partialRange = setup([[125, 60], [200, 80], [375, 90]], false);
assert.deepEqual(xTicks(partialRange), [0, 37.5, 75, 112.5, 150, 187.5, 225, 262.5, 300, 337.5, 375], 'fractional steps preserve the actual maximum');
assert.equal(partialRange.controls.svg.children.filter(node => node.tag === 'line' && node.x1 === node.x2).length, 11, 'each X tick has a vertical grid line');
assert.deepEqual(xTicks(setup([[0.1, 60], [0.2, 70]], false)), [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.2], 'decimal ticks avoid floating point display artifacts');
assert.deepEqual(xTicks(setup([[125, 60]], false)), [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100, 112.5, 125], 'a single positive value still has ten intervals');
const zeroRange = setup([[0, 60]], false);
assert.deepEqual(xTicks(zeroRange), [0], 'a zero maximum has one zero tick');
assert.equal(zeroRange.path(), '60,110', 'a zero maximum stays at the origin without division by zero');
assert.deepEqual(currentAxis.controls.tbody.children.map(row => row.cells[0].textContent), [100, 200, 1000], 'table defaults to numeric current order');
currentAxis.change('size', '1');
currentAxis.click('next');
assert.equal(currentAxis.controls.tbody.children[0].cells[0].textContent, 200, 'pagination preserves current order');
assert.equal(currentAxis.path(), '114,110 168,70 600,50', 'pagination does not change the current axis');
const search = setup([[321, 87], [654, 92], [987, 76]], false);
assert.equal(search.controls.tbody.children[0].cells.length, 2, 'display only current and efficiency');
assert.equal(search.controls['thead tr'].cells[0]['aria-sort'], 'ascending');
search.change('query', '2', 'input');
assert.deepEqual(search.controls.tbody.children.map(row => row.cells[0].textContent), [321], 'search matches current values instead of sequence or efficiency');
search.change('query', ' 654 ', 'input');
assert.deepEqual(search.controls.tbody.children.map(row => row.cells[0].textContent), [654], 'search trims whitespace');
search.change('query', '76', 'input');
assert.equal(search.controls.tbody.children.length, 0, 'efficiency values are not searched');
search.change('query', '', 'input');
assert.equal(search.controls.tbody.children.length, 3, 'clearing search restores all points');
const malformed = setup('not points'); assert.notEqual(malformed.original.hidden, true);
console.log('Curve workbench: edit/save precision, pagination, filtering, chart synchronization, dense curves, zero and invalid values passed.');
