'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, loadIntoWindow } = require('./helpers/load-extension-module.js');

function selectorDom() {
  const dom = createDom();
  dom.window.HTMLElement.prototype.animate = () => ({ onfinish: null });
  loadIntoWindow(dom.window, 'modules/shared/money-utils.js', 'modules/ui/memorized-transaction-selector.js');
  return dom;
}

function item(id, payee) {
  return { id, payee, paymentTypeId: '-1', totalCents: 1234, lines: [
    { categoryId: '21', categoryLabel: 'Cell Phone', fundId: '1', fundLabel: 'General Fund' },
    { categoryId: '22', categoryLabel: 'Internet', fundId: '2', fundLabel: 'Building Fund' }
  ] };
}

test('sorts the picker by payee and reports category/fund counts', async () => {
  const dom = selectorDom();
  const pending = dom.window.MemorizedTransactionSelector.choose([item('b', 'Zulu'), item('a', 'alpha')], async () => {});
  const { document } = dom.window;
  const rows = [...document.querySelectorAll('tbody tr')];
  assert.equal(rows[0].querySelector('button').textContent, 'alpha');
  assert.equal(rows[0].children[1].textContent, 'Cell Phone +1');
  assert.equal(rows[0].children[2].textContent, 'General Fund +1');
  assert.equal(rows[0].children[3].textContent, 'Expense');
  assert.equal(rows[0].children[4].textContent, '$12.34');
  rows[0].querySelector('button').click();
  assert.equal((await pending).id, 'a');
  dom.window.close();
});

test('shows an account transfer destination, direction, fund, and total in the picker', async () => {
  const dom = selectorDom();
  const transfer = {
    id: 'transfer', payee: 'Fidelity SPAXX Fund', paymentTypeId: '0', totalCents: 10000,
    transferDirection: '-1', sourceAccountLabel: 'Checking Account', targetAccountLabel: 'Investment Account',
    lines: [{ fundId: '1', fundLabel: 'General Fund', amountCents: 10000 }]
  };
  const pending = dom.window.MemorizedTransactionSelector.choose([transfer], async () => {});
  const row = dom.window.document.querySelector('tbody tr');
  assert.equal(row.children[1].textContent, 'Checking Account → Investment Account');
  assert.equal(row.children[2].textContent, 'General Fund');
  assert.equal(row.children[3].textContent, 'Transfer');
  assert.equal(row.children[4].textContent, '$100.00');
  row.querySelector('button').click();
  assert.equal((await pending).id, 'transfer');
  dom.window.close();
});

test('allows cancellation with Escape and shows the empty state', async () => {
  const dom = selectorDom();
  const pending = dom.window.MemorizedTransactionSelector.choose([], async () => {});
  assert.equal(dom.window.document.querySelector('tbody').children.length, 0);
  assert.equal(dom.window.document.querySelector('p').textContent, 'No MemTx entries. Memorize an entered transaction first.');
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(await pending, null);
  dom.window.close();
});

test('requires confirmation before removing and reports removal errors accessibly', async () => {
  const dom = selectorDom();
  let removed = false;
  const pending = dom.window.MemorizedTransactionSelector.choose([item('a', 'Vendor')], async () => { removed = true; throw new Error('Storage unavailable'); });
  const { document } = dom.window;
  [...document.querySelectorAll('tbody button')].find(button => button.textContent === 'Remove').click();
  assert.equal(removed, false);
  const confirmation = document.querySelector('#memtx-remove-confirmation [role="dialog"]');
  assert.ok(confirmation);
  assert.equal(document.querySelector('#memtx-remove-confirmation').style.position, 'fixed');
  assert.match(confirmation.style.width, /^min\(400px/);
  assert.equal(confirmation.style.overflow, 'auto');
  [...confirmation.querySelectorAll('button')].find(button => button.textContent === 'Yes, remove').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(removed, true);
  assert.equal(document.querySelector('[role="status"]').textContent, 'Storage unavailable');
  [...document.querySelectorAll('button')].find(button => button.textContent === 'Done').click();
  assert.equal(await pending, null);
  dom.window.close();
});

test('keeps error toasts open until Escape or an outside click', () => {
  const dom = selectorDom();
  const toast = dom.window.MemorizedTransactionSelector.toast('Problem', { error: true });
  toast.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(dom.window.document.getElementById(toast.id), toast);
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(dom.window.document.getElementById(toast.id), null);
  dom.window.close();
});

test('shows line details and requires explicit confirmation to continue with preflight issues', async () => {
  const dom = selectorDom();
  const plan = {
    payee: 'Vendor', paymentType: 'Expense', total: '$10.00', reference: 'Invoice 42',
    lines: [{ category: 'Cell Phone', fund: 'General Fund', amount: '$10.00', note: '', categoryAvailable: true, fundAvailable: true }],
    actions: ['the correct category for line 1', 'the amount applicable on line 1'],
    warnings: ['Line 1: unavailable category “Old Category”.']
  };
  const pending = dom.window.MemorizedTransactionSelector.reviewApply(plan);
  const dialog = dom.window.document.querySelector('[role="dialog"]');
  assert.equal(dialog.querySelector('h2').textContent, 'Ready to apply “Vendor” as Expense, total $10.00.');
  assert.equal(dialog.querySelector('h3').textContent, 'Please enter');
  assert.deepEqual([...dialog.querySelectorAll('[role="alert"] li')].map(item => item.textContent), plan.actions);
  assert.match(dialog.textContent, /MemTx has not filled out amounts/);
  [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Apply available lines').click();
  assert.equal(await pending, true);
  dom.window.close();
});

test('simulation preview reports proposed lines and closes without offering an apply action', async () => {
  const dom = selectorDom();
  const plan = {
    payee: 'Vendor', paymentType: 'Expense', total: '$10.00', reference: '',
    lines: [{ category: 'Meals', fund: 'General Fund', amount: '$10.00', note: 'Lunch' }], actions: [],
    warnings: []
  };
  const pending = dom.window.MemorizedTransactionSelector.reviewApply(plan, { simulation: true });
  assert.match(dom.window.document.querySelector('[role="dialog"] h2').textContent, /^Would apply/);
  assert.match(dom.window.document.querySelector('[role="dialog"]').textContent, /No changes will be made/);
  assert.match(dom.window.document.querySelector('[role="dialog"]').textContent, /Lunch/);
  assert.equal([...dom.window.document.querySelectorAll('[role="dialog"] button')].some(button => button.textContent.includes('Apply')), false);
  dom.window.document.querySelector('[role="dialog"] button').click();
  assert.equal(await pending, false);
  dom.window.close();
});
