const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function element() {
    return {value: '', listeners: {}, options: [],
        addEventListener(name, callback) { this.listeners[name] = callback; },
        replaceChildren(...options) { this.options = options; this.value = ''; },
        add(option) { this.options.push(option); }};
}

(async () => {
    const file = element();
    file.files = [];
    const worksheet = element(), status = element(), field = element(), submit = element();
    const form = element();
    form.action = 'https://example.test/proxy/8000/ics/rx/import/';
    form.elements = {file, worksheet, csrfmiddlewaretoken: {value: 'csrf-test'}};
    form.querySelector = () => submit;
    const elements = {'ic-import-form': form, 'import-status': status, 'worksheet-field': field};
    const pending = [];
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/ICmanage/ic-import.js'), 'utf8'), {
        document: {getElementById: id => elements[id]},
        Option: function (text, value) { this.text = text; this.value = value; },
        FormData: class { append() {} },
        fetch: (url, options) => {
            assert.equal(url, form.action);
            assert.equal(options.method, 'POST');
            return new Promise(resolve => pending.push(resolve));
        },
    });
    async function choose(name) {
        file.files = [{name}];
        return file.listeners.change();
    }
    const response = (body, ok = true) => ({ok,
        headers: {get: () => 'application/json'}, json: async () => body});

    await choose('Rx_TEST.csv');
    assert.equal(field.hidden, true);
    assert.equal(submit.disabled, false);
    assert.equal(pending.length, 0);
    const loading = choose('book.XLSX');
    assert.equal(field.hidden, false);
    assert.equal(submit.disabled, true);
    let prevented = false;
    form.listeners.submit({preventDefault: () => { prevented = true; }});
    assert.equal(prevented, true);
    pending.shift()(response({worksheets: ['摘要', '<Rx_TEST>']}));
    await loading;
    assert.equal(worksheet.options[2].text, '<Rx_TEST>');
    assert.equal(worksheet.required, true);
    assert.equal(submit.disabled, true);
    worksheet.value = '<Rx_TEST>';
    worksheet.listeners.change();
    assert.equal(submit.disabled, false);

    const stale = choose('old.xlsx');
    await choose('new.csv');
    pending.shift()(response({worksheets: ['Old']}));
    await stale;
    assert.equal(field.hidden, true);
    assert.equal(worksheet.disabled, true);
    assert.equal(worksheet.options.length, 1);
    assert.equal(submit.disabled, false);

    const failure = choose('bad.xlsx');
    pending.shift()(response({error: '檔案損壞'}, false));
    await failure;
    assert.equal(status.textContent, '檔案損壞');
    assert.equal(submit.disabled, true);
    await choose('retry.csv');
    assert.equal(submit.disabled, false);
    console.log('Import file selection checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
