// Run: node apps/ICmanage/testdata/account_menu.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const documentEvents = {}, menuEvents = {};
let focused = false, prevented = false;
const inside = {};
const menu = {open: true, contains: target => target === inside,
    addEventListener: (name, callback) => { menuEvents[name] = callback; },
    querySelector: () => ({focus: () => { focused = true; }}),
};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../../main/static/main/account-menu.js'), 'utf8'), {
    document: {querySelector: () => menu, addEventListener: (name, callback) => { documentEvents[name] = callback; }},
});
documentEvents.click({target: inside}); assert.equal(menu.open, true);
documentEvents.click({target: {}}); assert.equal(menu.open, false);
menu.open = true;
menuEvents.keydown({key: 'Tab'}); assert.equal(menu.open, true);
menuEvents.keydown({key: 'Escape', preventDefault() { prevented = true; }});
assert.equal(menu.open, false); assert.ok(focused && prevented);
console.log('Account menu outside click and Escape focus restoration passed.');
