'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDom, loadIntoWindow } = require('./helpers/load-extension-module.js');

const root = path.resolve(__dirname, '..');

async function optionsPage(initialConfig = {
  version: 1,
  simulationMode: true,
  memorizedTransactions: [
    { id: 'z', payee: 'Zulu', paymentTypeId: '-1', total: '10.00', lines: [
      { categoryId: '21', categoryLabel: 'Cell Phone', fundId: '1', fundLabel: 'General Fund', amount: '5.00' },
      { categoryId: '22', categoryLabel: 'Internet', fundId: '2', fundLabel: 'Building Fund', amount: '5.00' }
    ] },
    { id: 'a', payee: 'Alpha', paymentTypeId: '1', total: '3.00', lines: [
      { categoryId: '21', categoryLabel: 'Cell Phone', fundId: '1', fundLabel: 'General Fund', amount: '3.00' }
    ] }
  ]
}) {
  const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
  const dom = createDom(html);
  let state = initialConfig;
  const writes = [];
  dom.window.chrome = { storage: { local: {
    async get(key) { return { [key]: state }; },
    async set(values) { writes.push(values); state = values.memorizedConfig; }
  } }, runtime: { getURL: pathName => pathName } };
  loadIntoWindow(dom.window,
    'modules/shared/money-utils.js',
    'modules/transactions/memorized-transaction.js',
    'modules/config/config-validator.js',
    'options.js'
  );
  for (let attempt = 0; attempt < 10 && !dom.window.document.querySelector('#status').textContent.includes('loaded'); attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  return { dom, writes, get state() { return state; } };
}

test('renders the options grid sorted with category and fund summaries', async () => {
  const { dom } = await optionsPage();
  const rows = [...dom.window.document.querySelectorAll('#memorized-grid tbody tr')];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].textContent, 'Alpha');
  assert.equal(rows[0].children[3].textContent, 'Income');
  assert.equal(rows[1].children[1].textContent, 'Cell Phone +1');
  assert.equal(rows[1].children[2].textContent, 'General Fund +1');
  dom.window.close();
});

test('shows account transfer details in the options grid', async () => {
  const { dom } = await optionsPage({ version: 1, simulationMode: true, memorizedTransactions: [{
    id: 'transfer', payee: 'Fidelity SPAXX Fund', paymentTypeId: '0', paymentType: 'Account-to-Account Transfer',
    transferDirection: '-1', sourceAccountId: '1', sourceAccountLabel: 'Checking Account', targetAccountId: '3', targetAccountLabel: 'Investment Account', total: '100.00',
    lines: [{ fundId: '1', fundLabel: 'General Fund', amount: '100.00' }]
  }] });
  const row = dom.window.document.querySelector('#memorized-grid tbody tr');
  assert.equal(row.children[1].textContent, 'Checking Account → Investment Account');
  assert.equal(row.children[2].textContent, 'General Fund');
  assert.equal(row.children[3].textContent, 'Transfer');
  assert.equal(row.children[4].textContent, '$100.00');
  dom.window.close();
});

test('saves the simulation toggle immediately and removes a confirmed row', async () => {
  const page = await optionsPage();
  const { dom, writes } = page;
  const simulation = dom.window.document.querySelector('#simulation');
  simulation.checked = false;
  simulation.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.state.simulationMode, false);
  assert.equal(writes.at(-1).memorizedConfig.simulationMode, false);

  const row = [...dom.window.document.querySelectorAll('#memorized-grid tbody tr')].find(item => item.children[0].textContent === 'Zulu');
  row.querySelector('button').click();
  const confirmation = dom.window.document.querySelector('#memtx-options-remove-confirmation [role="dialog"]');
  assert.ok(confirmation);
  assert.match(confirmation.style.width, /^min\(400px/);
  assert.equal(confirmation.style.overflow, 'auto');
  [...confirmation.querySelectorAll('button')].find(button => button.textContent === 'No').click();
  assert.equal(dom.window.document.querySelectorAll('#memorized-grid tbody tr').length, 2);
  row.querySelector('button').click();
  [...dom.window.document.querySelectorAll('#memtx-options-remove-confirmation button')].find(button => button.textContent === 'Yes, remove').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.state.memorizedTransactions.length, 1);
  assert.equal(page.state.memorizedTransactions[0].payee, 'Alpha');
  assert.match(dom.window.document.querySelector('#status').textContent, /Export the config/);
  dom.window.close();
});

test('load config button opens the hidden file picker', async () => {
  const { dom } = await optionsPage();
  const filePicker = dom.window.document.querySelector('#config-file');
  let opened = false;
  filePicker.click = () => { opened = true; };
  dom.window.document.querySelector('#load').click();
  assert.equal(opened, true);
  dom.window.close();
});

test('imports zero-amount entries, drops invalid ones, and displays each recovery as a bullet', async () => {
  const page = await optionsPage();
  const { dom } = page;
  const input = dom.window.document.querySelector('#config-file');
  const imported = {
    version: 1,
    simulationMode: false,
    memorizedTransactions: [
      { id: 'keep', payee: 'Kept Vendor', paymentTypeId: '-1', total: '2.00', lines: [{ categoryId: '21', fundId: '1', amount: '2.00' }] },
      { id: 'drop-a', payee: 'Broken A', paymentTypeId: '-1', total: '2.00', lines: [{ categoryId: null, fundId: '1', amount: '2.00' }] },
      { id: 'drop-b', payee: 'Broken B', paymentTypeId: '-1', total: '0.00', lines: [{ categoryId: '21', fundId: '1', amount: '0.00' }] }
    ]
  };
  Object.defineProperty(input, 'files', { configurable: true, value: { 0: { async text() { return JSON.stringify(imported); } }, length: 1 } });
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.state.memorizedTransactions.length, 2);
  assert.equal(page.state.memorizedTransactions[0].payee, 'Kept Vendor');
  assert.equal(page.state.memorizedTransactions[1].payee, 'Broken B');
  assert.equal(page.state.memorizedTransactions[1].lines[0].amount, '0.00');
  assert.equal(dom.window.document.querySelectorAll('#status li').length, 1);
  assert.match(dom.window.document.querySelector('#status').textContent, /Dropped 1 invalid transaction/);
  assert.equal(dom.window.document.querySelector('#simulation').checked, false);
  dom.window.close();
});

test('starts empty with simulation enabled when no config is stored and cleans legacy split rules', async () => {
  let page = await optionsPage(null);
  assert.equal(page.state, null);
  assert.equal(page.dom.window.document.querySelector('#simulation').checked, true);
  assert.match(page.dom.window.document.querySelector('#memorized-grid').textContent, /No MemTx entries/);
  page.dom.window.close();

  const oldConfig = { version: 1, simulationMode: false, memorizedTransactions: [], splits: [{ id: 'old-rule' }] };
  page = await optionsPage(oldConfig);
  assert.equal(Object.hasOwn(page.state, 'splits'), false);
  assert.equal(Object.hasOwn(page.writes[0].memorizedConfig, 'splits'), false);
  page.dom.window.close();
});
