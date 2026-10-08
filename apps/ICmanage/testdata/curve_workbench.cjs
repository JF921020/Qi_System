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
    querySelector() { return this.children[0]?.children[1]?.children[0]; }
    focus() {}
    get cells() { return this.children; }
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
}
function setup(values, editable = true) {
    const fields = Object.fromEntries(Object.entries({points: JSON.stringify(values), mode: 'curve', axis: 'ma', model_number: 'TEST', voltage: '3.8'}).map(([key, value]) => [key, new Element(value)]));
    fields.axis.selectedOptions = [{textContent: '充電電流 (mA)'}];
    const controls = Object.fromEntries(['query', 'sort', 'size', 'title', 'chart-note', 'axis-heading', 'status', 'prev', 'next', 'add'].map(key => [`[data-${key}]`, new Element()]));
    controls['[data-sort]'].value = '0-asc'; controls['[data-size]'].value = '25';
    controls.tbody = new Element(); controls.svg = new Element(); controls.script = {textContent: JSON.stringify(values)};
    controls['thead tr'] = new Element();
    for (let i = 0; i < 4; i++) controls['thead tr'].insertCell();
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
        edit(row, column, value) { const input = controls.tbody.children[row].cells[column + 1].children[0]; input.value = value; input.fire('input'); },
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
page.controls.tbody.children[0].cells[3].children[0].fire('click'); assert.equal(page.save().length, 60);
page.change('sort', '1-desc'); assert.equal(page.controls.tbody.children[0].cells[2].children[0].value, 99);
page.fields.voltage.value = '5'; page.fields.voltage.fire('input'); assert.equal(page.controls['[data-title]'].textContent, 'TEST · 5 V');
page.fields.mode.value = 'fixed'; page.fields.mode.fire('change'); assert.equal(page.section.hidden, true); assert.deepEqual(page.save(), []);
const dense = setup(Array.from({length: 10000}, (_, i) => [i, 80 + i % 2]), false);
assert.equal(dense.path().split(' ').length, 10000, 'dense line retains every data point');
assert.equal(dense.controls.tbody.children.length, 25);
dense.change('query', 'missing', 'input'); assert.equal(dense.controls.svg.hidden, true);
const zeros = setup([[0, 0], [1, 0], [2, 0]], false); assert.equal(zeros.controls.svg.hidden, false);
const malformed = setup('not points'); assert.notEqual(malformed.original.hidden, true);
console.log('Curve workbench: edit/save precision, pagination, filtering, chart synchronization, dense curves, zero and invalid values passed.');
