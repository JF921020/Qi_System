// Run: node apps/ICmanage/testdata/ic_list.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname, '../static/ICmanage/ic-list.js'), 'utf8');

function setup(values, initial = '') {
    const element = extra => ({
        listeners: {},
        addEventListener(type, callback) { this.listeners[type] = callback; },
        fire(type) { this.listeners[type]({preventDefault() {}}); },
        ...extra,
    });
    const rows = values.map((columns, index) => ({
        dataset: {name: columns[0], updated: ['200', '100', ''][index]},
        cells: columns.map(sort => ({dataset: {sort}})),
    }));
    const empty = {cells: [{}]};
    const order = [...rows, empty];
    const heading = () => ({setAttribute(key, value) { this[key] = value; }});
    const elements = {
        'ic-table': {
            querySelectorAll: () => rows,
            tBodies: [{insertBefore(row, target) {
                order.splice(order.indexOf(row), 1);
                order.splice(order.indexOf(target), 0, row);
            }}],
        },
        'ic-search': element(),
        'ic-query': element({value: initial, focus() {}}),
        'ic-empty': empty,
        'ic-count': {},
        'ic-sort': element({value: 'name-asc'}),
        'ic-name-heading': heading(),
    };
    vm.runInNewContext(script, {document: {getElementById: id => elements[id]}, Intl});
    return {elements, rows, order, empty};
}

const {elements, rows, order, empty} = setup([
    ['IC10 RX', '固定 90%', '條件 B'],
    ['IC2 Charger', '曲線 10 點', '條件 A'],
    ['IC1 RX', '曲線 2 點', '<script>'],
], ' rx ');
const query = elements['ic-query'];
assert.deepEqual(rows.map(row => row.hidden), [false, true, false]);
query.value = '條件 a';
query.fire('input');
assert.deepEqual(rows.map(row => row.hidden), [true, false, true]);
query.value = '<script>';
query.fire('input');
assert.deepEqual(rows.map(row => row.hidden), [true, true, false]);
query.value = '不存在';
query.fire('input');
assert.equal(empty.hidden, false);
assert.equal(empty.cells[0].textContent, '沒有符合搜尋的設定。');
elements['ic-search'].fire('reset');
assert.equal(query.value, '');
assert.ok(rows.every(row => !row.hidden));
assert.equal(elements['ic-count'].textContent, '顯示 3 / 3 筆設定');
assert.deepEqual(order.slice(0, 3), [rows[2], rows[1], rows[0]]);
const sort = elements['ic-sort'];
assert.equal(elements['ic-name-heading']['aria-sort'], 'ascending');
sort.value = 'name-desc';
sort.fire('change');
assert.deepEqual(order.slice(0, 3), [rows[0], rows[1], rows[2]]);
assert.equal(elements['ic-name-heading']['aria-sort'], 'descending');
sort.value = 'updated-asc';
sort.fire('change');
assert.deepEqual(order.slice(0, 3), [rows[1], rows[0], rows[2]]);
assert.equal(elements['ic-name-heading']['aria-sort'], 'none');
sort.value = 'updated-desc';
sort.fire('change');
assert.deepEqual(order.slice(0, 3), [rows[0], rows[1], rows[2]], 'unknown dates stay last');
query.value = 'charger';
elements['ic-search'].fire('submit');
assert.deepEqual(rows.map(row => row.hidden), [true, false, true]);
sort.value = 'name-asc';
sort.fire('change');
assert.deepEqual(rows.map(row => row.hidden), [true, false, true], 'sorting preserves the search');
elements['ic-search'].fire('reset');
assert.equal(sort.value, 'name-asc');
assert.equal(order.at(-1), empty);
const blank = setup([]);
assert.equal(blank.empty.hidden, false);
assert.equal(blank.empty.cells[0].textContent, '尚無 IC 設定，請匯入效率資料。');
console.log('IC live search and sorting checks passed.');
