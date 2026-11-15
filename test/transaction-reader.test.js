'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDom, loadIntoWindow } = require('./helpers/load-extension-module.js');

function screen({ heading = 'new_transaction', id = '0', payee = '', amount = '', total = '0.00', dialog = true } = {}) {
  return `<!doctype html><div id="bfallr" class="open" role="dialog" aria-modal="${dialog}">
    <section id="transaction-view"><h4 data-lang="${heading}"></h4><form id="newtransactionform">
      <input id="TransactionID" value="${id}"><select id="TransactionType"><option value="-1" selected>Expense</option><option value="1">Income</option></select>
      <input id="Payee" value="${payee}"><select id="payee-select"></select>
      <input id="Reference" value=""><select id="reference-select"></select><input id="TransactionMemo" value="">
      <div id="splitdiv"><div class="splitrow"><select name="Category[]"><option value="21" selected>Category</option></select>
      <select name="Fund[]"><option value="1" selected>General Fund</option></select><input name="Amount[]" value="${amount}"><input name="Note[]" value=""></div></div>
      <div id="TransactionTotal">${total}</div>
    </form></section></div>`;
}

function readerFor(html) {
  const dom = createDom(html);
  loadIntoWindow(dom.window, 'modules/shared/money-utils.js', 'modules/transactions/memorized-transaction.js', 'modules/transactions/transaction-reader.js');
  return dom;
}

function readerForFixture(name) {
  return readerFor(fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf8'));
}

test('only recognizes a genuinely blank modal as the apply screen', () => {
  let dom = readerFor(screen());
  assert.equal(dom.window.TransactionReader.findCurrent().mode, 'apply');
  dom.window.close();

  dom = readerFor(screen({ payee: 'Vendor' }));
  assert.equal(dom.window.TransactionReader.findCurrent().mode, 'not-blank');
  dom.window.close();

  dom = readerFor(screen({ amount: '0.01', total: '0.01' }));
  assert.equal(dom.window.TransactionReader.findCurrent().mode, 'not-blank');
  dom.window.close();
});

test('does not treat a highlighted entered transaction as a blank apply form', () => {
  const dom = readerFor(screen({ heading: 'edit_transaction', id: '1584', payee: 'Vendor', amount: '10.00', total: '10.00' }));
  assert.equal(dom.window.TransactionReader.findCurrent().mode, 'memorize');
  dom.window.close();
});

test('reads an expense from the sanitized fixture', () => {
  const dom = readerForFixture('expense.html');
  const captured = dom.window.TransactionReader.readEnteredTransaction();
  assert.equal(captured.paymentTypeId, '-1');
  assert.equal(captured.payee, 'Office Supply INC');
  assert.equal(captured.reference, 'Invoice Test-01');
  assert.equal(captured.memo, 'stationery');
  assert.equal(captured.total, '42.50');
  assert.equal(captured.lines[0].categoryLabel, 'Office Supplies');
  assert.equal(captured.lines[0].fundLabel, 'General Fund');
  assert.equal(captured.lines[0].note, 'Printer paper and folders');
  assert.equal(captured.lines[0].amount, '42.50');
  dom.window.close();
});

test('reads a deposit from the sanitized fixture', () => {
  const dom = readerForFixture('deposit.html');
  const captured = dom.window.TransactionReader.readEnteredTransaction();
  assert.equal(captured.paymentTypeId, '1');
  assert.equal(captured.paymentType, 'Income');
  assert.equal(captured.payee, 'Jordan Lee');
  assert.equal(captured.memo, 'Summer outreach gift');
  assert.equal(captured.total, '75.00');
  assert.equal(captured.lines[0].categoryLabel, 'Donations');
  assert.equal(captured.lines[0].fundLabel, 'Community Fund');
  assert.equal(captured.lines[0].amount, '75.00');
  dom.window.close();
});

test('reads an account-to-account transfer from the sanitized fixture', () => {
  const dom = readerForFixture('account-transfer.html');
  const transfer = dom.window.TransactionReader.readEnteredTransaction();
  assert.equal(transfer.paymentTypeId, '0');
  assert.equal(transfer.payee, 'Reserve Contribution');
  assert.equal(transfer.sourceAccountId, '1001');
  assert.equal(transfer.sourceAccountLabel, 'Community Checking');
  assert.equal(transfer.transferDirection, '-1');
  assert.equal(transfer.transferDirectionLabel, 'To');
  assert.equal(transfer.targetAccountId, '2002');
  assert.equal(transfer.targetAccountLabel, 'Building Reserve Savings');
  assert.equal(transfer.total, '125.00');
  assert.deepEqual(JSON.parse(JSON.stringify(transfer.lines.map(line => ({ fundId: line.fundId, fundLabel: line.fundLabel, amount: line.amount })))), [
    { fundId: '1', fundLabel: 'General Fund', amount: '125.00' }
  ]);
  dom.window.close();
});

test('ignores numeric references and rejects incomplete or unbalanced entered transactions', () => {
  let dom = readerFor(screen({ heading: 'edit_transaction', id: '1584', payee: 'Vendor', amount: '10.00', total: '10.00' }));
  dom.window.document.querySelector('#Reference').value = '12345';
  assert.equal(dom.window.TransactionReader.readEnteredTransaction().reference, '');
  dom.window.close();

  dom = readerFor(screen({ heading: 'edit_transaction', id: '1584', payee: 'Vendor', amount: '10.00', total: '11.00' }));
  assert.throws(() => dom.window.TransactionReader.readEnteredTransaction(), /do not add up/);
  dom.window.close();
});
