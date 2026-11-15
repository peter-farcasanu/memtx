'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, loadIntoWindow } = require('./helpers/load-extension-module.js');

function rowHtml() {
  return `<div class="splitrow">
    <select name="Category[]"><option value="10" selected>Default</option><option value="21">Cell Phone</option><option value="22">Internet</option></select>
    <select name="Fund[]"><option value="1" selected>General Fund</option><option value="2">Building Fund</option></select>
    <input name="Amount[]" value=""><input name="Note[]" value="">
  </div>`;
}

function applyPage({ type = '-1', total = '0.00' } = {}) {
  const html = `<!doctype html><div id="bfallr" class="open" role="dialog" aria-modal="true">
    <section id="transaction-view"><h4 data-lang="new_transaction">New</h4><form id="newtransactionform">
      <input id="TransactionID" value="0"><select id="TransactionType"><option value="-1" ${type === '-1' ? 'selected' : ''}>Expense</option><option value="1" ${type === '1' ? 'selected' : ''}>Income</option></select>
      <input id="Payee" value=""><select id="payee-select"></select><input id="Reference" value=""><select id="reference-select"><option value=""></option></select>
      <div id="splitdiv">${rowHtml()}</div><div id="TransactionTotal">${total}</div>
    </form></section></div>`;
  const dom = createDom(html);
  loadIntoWindow(dom.window, 'modules/shared/money-utils.js', 'modules/splitting/page-adapter.js');
  const { document } = dom.window;
  const splitdiv = document.querySelector('#splitdiv');
  splitdiv.addEventListener('change', event => {
    if (event.target.matches('select[name="Category[]"]')) {
      // Simulate ChurchTrac rebuilding the dependent fund dropdown on category change.
      const replacement = document.createElement('select');
      replacement.name = 'Fund[]';
      replacement.innerHTML = '<option value="1">General Fund</option><option value="2">Building Fund</option>';
      event.target.closest('.splitrow').querySelector('select[name="Fund[]"]').replaceWith(replacement);
    }
    if (event.target.matches('input[name="Amount[]"]')) {
      // The real application may normalize entered currency text.
      if (event.target.value) event.target.value = String(Number(event.target.value));
    }
    if (event.target.matches('input[name="Amount[]"]')) {
      const sum = [...splitdiv.querySelectorAll('input[name="Amount[]"]')].reduce((totalCents, input) => {
        return totalCents + (input.value.trim() ? dom.window.MoneyUtils.toCents(input.value) : 0);
      }, 0);
      document.querySelector('#TransactionTotal').textContent = dom.window.MoneyUtils.fromCents(sum);
    }
  });
  return dom;
}

function applyTransferPage() {
  const rowHtml = () => `<div class="transfer-split-row">
    <select name="TransferFund[]"><option value="1" selected>General Fund</option><option value="2">Building Fund</option></select>
    <input name="TransferAmount[]" value="">
  </div>`;
  const html = `<!doctype html><div id="bfallr" class="open" role="dialog" aria-modal="true">
    <section id="transaction-view"><h4 data-lang="new_transaction">New</h4><form id="newtransactionform">
      <input id="TransactionID" value="0"><input name="AccountID" value="1"><select id="TransactionType"><option value="-1" selected>Expense</option><option value="1">Income</option><option value="0">Account-to-Account Transfer</option></select>
      <input id="Payee" value=""><input id="Reference" value=""><select id="reference-select"><option value=""></option></select>
      <div id="TransactionTotal">0.00</div>
      <select id="transfer-to-from"><option value="-1" selected>To</option><option value="1">From</option></select>
      <select id="TargetAccount"><option value="2">Savings</option><option value="3">Investment Account</option></select>
      <div id="transfer-splits-div">${rowHtml()}</div><div id="transfer-total">0.00</div>
    </form></section></div>`;
  const dom = createDom(html);
  loadIntoWindow(dom.window, 'modules/shared/money-utils.js', 'modules/splitting/page-adapter.js');
  const { document } = dom.window;
  document.querySelector('#transfer-splits-div').addEventListener('change', event => {
    if (event.target.matches('input[name="TransferAmount[]"]')) {
      const total = [...document.querySelectorAll('input[name="TransferAmount[]"]')]
        .reduce((sum, input) => sum + (input.value.trim() ? dom.window.MoneyUtils.toCents(input.value) : 0), 0);
      document.querySelector('#transfer-total').textContent = dom.window.MoneyUtils.fromCents(total);
    }
  });
  return { dom, rowHtml };
}

function transaction(lines) {
  return {
    payee: 'Vendor', paymentTypeId: '-1', paymentType: 'Expense', reference: '', totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0), lines
  };
}

function line(categoryId, amount, fundId = '1', categoryLabel = `Category ${categoryId}`) {
  if (categoryLabel === `Category ${categoryId}`) {
    categoryLabel = ({ '10': 'Default', '21': 'Cell Phone', '22': 'Internet' })[String(categoryId)] || categoryLabel;
  }
  return { categoryId, categoryLabel, fundId, fundLabel: 'General Fund', amount, amountCents: Math.round(Number(amount) * 100), note: '' };
}

test('applies valid lines while leaving a line with a missing category for manual correction', async () => {
  const dom = applyPage();
  const inputLines = [
    line('9999', '943.00', '1', 'Deleted Category'),
    line('21', '71.00'),
    line('22', '49.00')
  ];
  const plan = dom.window.PageAdapter.preflight(transaction(inputLines));
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /Line 1: unavailable category/);
  assert.equal(dom.window.document.querySelector('#Payee').value, '');
  assert.equal(dom.window.document.querySelectorAll('.splitrow').length, 1);
  assert.equal(dom.window.document.querySelector('[name="Amount[]"]').value, '');

  let addedRows = 0;
  const result = await dom.window.PageAdapter.populate(transaction(inputLines), async () => {
    addedRows += 1;
    const row = dom.window.document.createElement('div');
    row.className = 'splitrow';
    row.innerHTML = rowHtml().replace(/^<div class="splitrow">|<\/div>$/g, '');
    dom.window.document.querySelector('#splitdiv').append(row);
  });

  const rows = [...dom.window.document.querySelectorAll('.splitrow')];
  assert.equal(addedRows, 2);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].querySelector('[name="Amount[]"]').value, '');
  assert.equal(rows[0].querySelector('[name="Note[]"]').value, 'Amount to enter: $943.00');
  assert.equal(rows[1].querySelector('[name="Category[]"]').value, '21');
  assert.equal(rows[1].querySelector('[name="Amount[]"]').value, '71');
  assert.equal(rows[2].querySelector('[name="Category[]"]').value, '22');
  assert.equal(rows[2].querySelector('[name="Amount[]"]').value, '49');
  assert.equal(dom.window.document.querySelector('#TransactionTotal').textContent, '120.00');
  assert.equal(result.valid, false);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Line 1: unavailable category/);
  dom.window.close();
});

test('applies a negative line when the overall total is non-negative', async () => {
  const dom = applyPage();
  const saved = transaction([line('21', '12.00'), line('22', '-5.00')]);
  let addedRows = 0;
  const result = await dom.window.PageAdapter.populate(saved, async () => {
    addedRows += 1;
    const row = dom.window.document.createElement('div');
    row.className = 'splitrow';
    row.innerHTML = rowHtml().replace(/^<div class="splitrow">|<\/div>$/g, '');
    dom.window.document.querySelector('#splitdiv').append(row);
  });
  const rows = [...dom.window.document.querySelectorAll('.splitrow')];
  assert.equal(addedRows, 1);
  assert.equal(rows[0].querySelector('[name="Amount[]"]').value, '12');
  assert.equal(rows[1].querySelector('[name="Amount[]"]').value, '-5');
  assert.equal(dom.window.document.querySelector('#TransactionTotal').textContent, '7.00');
  assert.equal(result.valid, true);
  dom.window.close();
});

test('preflights and applies an account transfer to its saved account, direction, funds, and amounts', async () => {
  const { dom, rowHtml } = applyTransferPage();
  const saved = {
    payee: 'Fidelity SPAXX Fund',
    paymentTypeId: '0',
    paymentType: 'Account-to-Account Transfer',
    sourceAccountId: '1',
    sourceAccountLabel: 'Checking Account',
    transferDirection: '1',
    transferDirectionLabel: 'From',
    targetAccountId: '3',
    targetAccountLabel: 'Investment Account',
    reference: '',
    totalCents: 10000,
    lines: [
      { fundId: '1', fundLabel: 'General Fund', amount: '60.00', amountCents: 6000 },
      { fundId: '2', fundLabel: 'Building Fund', amount: '40.00', amountCents: 4000 }
    ]
  };
  const plan = dom.window.PageAdapter.preflight(saved);
  assert.equal(plan.isAccountTransfer, true);
  assert.match(plan.warnings[0], /transaction type will change/);
  assert.equal(dom.window.document.querySelector('#Payee').value, '');

  let addedRows = 0;
  const result = await dom.window.PageAdapter.populate(saved, async () => {
    addedRows += 1;
    const template = dom.window.document.createElement('template');
    template.innerHTML = rowHtml();
    dom.window.document.querySelector('#transfer-splits-div').append(template.content.firstElementChild);
  });
  const rows = [...dom.window.document.querySelectorAll('.transfer-split-row')];
  assert.equal(addedRows, 1);
  assert.equal(dom.window.document.querySelector('#TransactionType').value, '0');
  assert.equal(dom.window.document.querySelector('#Payee').value, 'Fidelity SPAXX Fund');
  assert.equal(dom.window.document.querySelector('#transfer-to-from').value, '1');
  assert.equal(dom.window.document.querySelector('#TargetAccount').value, '3');
  assert.deepEqual(rows.map(row => row.querySelector('select[name="TransferFund[]"]').value), ['1', '2']);
  assert.deepEqual(rows.map(row => row.querySelector('input[name="TransferAmount[]"]').value), ['60.00', '40.00']);
  assert.equal(dom.window.document.querySelector('#transfer-total').textContent, '100.00');
  assert.equal(result.valid, true);
  dom.window.close();
});

test('refuses to preflight or populate a transfer from a different source account', async () => {
  const { dom } = applyTransferPage();
  dom.window.document.querySelector('[name="AccountID"]').value = '2';
  const saved = {
    payee: 'Fidelity SPAXX Fund', paymentTypeId: '0', sourceAccountId: '1', sourceAccountLabel: 'Checking Account',
    transferDirection: '-1', targetAccountId: '3', targetAccountLabel: 'Investment Account',
    totalCents: 10000, lines: [{ fundId: '1', fundLabel: 'General Fund', amount: '100.00', amountCents: 10000 }]
  };
  assert.throws(() => dom.window.PageAdapter.preflight(saved), /belongs to source account “Checking Account”/);
  await assert.rejects(dom.window.PageAdapter.populate(saved, async () => {}), /belongs to source account “Checking Account”/);
  assert.equal(dom.window.document.querySelector('#Payee').value, '');
  assert.equal(dom.window.document.querySelector('#TransactionType').value, '-1');
  dom.window.close();
});

test('rejects applying to a transaction that is no longer blank', async () => {
  const dom = applyPage();
  dom.window.document.querySelector('#Payee').value = 'Already entered';
  await assert.rejects(dom.window.PageAdapter.populate(transaction([line('21', '10.00')]), async () => {}), /no longer blank/);
  dom.window.close();
});

test('rejects payment types that are not available', async () => {
  const dom = applyPage();
  const unsupported = transaction([line('21', '10.00')]);
  unsupported.paymentTypeId = 'unsupported';
  await assert.rejects(dom.window.PageAdapter.populate(unsupported, async () => {}), /Payment type/);
  dom.window.close();
});

test('defers category availability checks when the payment type will change', () => {
  const dom = applyPage();
  const saved = transaction([line('not-in-current-type', '10.00', '1', 'Transfer Category')]);
  saved.paymentTypeId = '1';
  saved.paymentType = 'Income';
  const plan = dom.window.PageAdapter.preflight(saved);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /Category options will be checked again/);
  assert.equal(plan.lines[0].categoryAvailable, null);
  assert.equal(dom.window.document.querySelector('#TransactionType').value, '-1');
  assert.equal(dom.window.document.querySelector('#Payee').value, '');
  dom.window.close();
});

test('moves the amount into Note when a saved fund no longer exists', async () => {
  const dom = applyPage();
  const inputLines = [line('21', '10.00', 'missing-fund', 'Cell Phone')];
  inputLines[0].fundLabel = 'Old Fund';
  inputLines.push(line('22', '5.00', '1', 'Internet'));
  const result = await dom.window.PageAdapter.populate(transaction(inputLines), async () => {
    const row = dom.window.document.createElement('div');
    row.className = 'splitrow';
    row.innerHTML = rowHtml().replace(/^<div class="splitrow">|<\/div>$/g, '');
    dom.window.document.querySelector('#splitdiv').append(row);
  });
  const rows = [...dom.window.document.querySelectorAll('.splitrow')];
  assert.equal(rows[0].querySelector('[name="Amount[]"]').value, '');
  assert.equal(rows[0].querySelector('[name="Note[]"]').value, 'Amount to enter: $10.00');
  assert.equal(rows[1].querySelector('[name="Amount[]"]').value, '5');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /unavailable fund/);
  dom.window.close();
});

test('recovers an incorrect fund id from a unique matching fund name', async () => {
  const dom = applyPage();
  dom.window.document.querySelector('[name="Fund[]"]').value = '2';
  const saved = transaction([line('21', '10.00', 'wrong-fund-id', 'Cell Phone')]);
  const plan = dom.window.PageAdapter.preflight(saved);
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.lines[0].fundResolvedValue, '1');

  const result = await dom.window.PageAdapter.populate(saved, async () => {});
  const row = dom.window.document.querySelector('.splitrow');
  assert.equal(row.querySelector('[name="Fund[]"]').value, '1');
  assert.equal(row.querySelector('[name="Amount[]"]').value, '10');
  assert.equal(result.valid, true);
  dom.window.close();
});

test('trusts matching category and fund ids when their saved names have changed', async () => {
  const dom = applyPage();
  const saved = transaction([line('21', '10.00', '1', 'Former Category Name')]);
  saved.lines[0].fundLabel = 'Former Fund Name';
  const plan = dom.window.PageAdapter.preflight(saved);
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.lines[0].categoryResolvedValue, '21');
  assert.equal(plan.lines[0].fundResolvedValue, '1');

  const result = await dom.window.PageAdapter.populate(saved, async () => {});
  const row = dom.window.document.querySelector('.splitrow');
  assert.equal(row.querySelector('[name="Category[]"]').value, '21');
  assert.equal(row.querySelector('[name="Fund[]"]').value, '1');
  assert.equal(result.valid, true);
  dom.window.close();
});

test('applies a nonnumeric reference to the new transaction', async () => {
  const dom = applyPage();
  const saved = transaction([line('21', '10.00')]);
  saved.reference = 'Invoice 42';
  const result = await dom.window.PageAdapter.populate(saved, async () => {});
  assert.equal(result.valid, true);
  assert.equal(dom.window.document.querySelector('#Reference').value, 'Invoice 42');
  assert.equal(dom.window.document.querySelector('#reference-select').value, 'Invoice 42');
  dom.window.close();
});
