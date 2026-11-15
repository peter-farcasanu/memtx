'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, loadIntoWindow } = require('./helpers/load-extension-module.js');

function setup({ screen = { mode: 'apply' }, config = { simulationMode: true, memorizedTransactions: [], droppedTransactions: [] }, selected = null } = {}) {
  const dom = createDom();
  const calls = { load: 0, save: [], populate: 0, choose: 0, review: [] };
  const transaction = selected || { id: 'one', payee: 'Vendor', paymentTypeId: '-1', totalCents: 1000, lines: [] };
  Object.assign(dom.window, {
    TransactionReader: {
      findCurrent: () => screen,
      readEnteredTransaction: () => ({ payee: 'Vendor', paymentTypeId: '-1' })
    },
    ConfigLoader: {
      async load() { calls.load += 1; return config; },
      async save(value) { calls.save.push(value); }
    },
    MemorizedTransaction: {
      findDuplicate: (_captured, existing) => existing.find(item => item.payee === 'Vendor') || null,
      capture: () => ({ id: 'new-id', payee: 'Vendor' })
    },
    MemorizedTransactionSelector: {
      async choose() { calls.choose += 1; return selected; },
      async reviewApply(_plan, options) { calls.review.push(options || {}); return true; }
    },
    PageAdapter: {
      preflight: () => ({ payee: transaction.payee, paymentType: 'Expense', total: '$10.00', lines: [], warnings: [] }),
      async populate() { calls.populate += 1; return { warnings: [], lineCount: 1 }; }
    },
    PageBridgeClient: { async createSplitEntry() {} }
  });
  loadIntoWindow(dom.window, 'modules/memorized-transactions/orchestrator.js');
  return { dom, calls, run: () => dom.window.MemorizedTransactionOrchestrator.run(), transaction };
}

test('ignores unsupported pages and rejects a nonblank new transaction', async () => {
  let instance = setup({ screen: null });
  assert.equal((await instance.run()).status, 'ignored');
  instance.dom.window.close();

  instance = setup({ screen: { mode: 'not-blank' } });
  await assert.rejects(instance.run(), /start with a blank new transaction/);
  instance.dom.window.close();
});

test('does not mutate a reconciled transaction', async () => {
  const instance = setup({ config: { memorizedTransactions: [{ id: 'a' }], simulationMode: false } });
  instance.dom.window.document.body.innerHTML = '<div id="transaction-view"><span data-lang="reconciled"></span></div>';
  await assert.rejects(instance.run(), /transaction is reconciled/);
  assert.equal(instance.calls.load, 0);
  instance.dom.window.close();
});

test('memorizes a new transaction but skips duplicates', async () => {
  let instance = setup({ screen: { mode: 'memorize' }, config: { simulationMode: true, memorizedTransactions: [], droppedTransactions: [] } });
  assert.equal((await instance.run()).status, 'memorized');
  assert.equal(instance.calls.save.length, 1);
  instance.dom.window.close();

  instance = setup({ screen: { mode: 'memorize' }, config: { simulationMode: false, memorizedTransactions: [{ payee: 'Vendor' }], droppedTransactions: [] } });
  assert.equal((await instance.run()).status, 'duplicate');
  assert.equal(instance.calls.save.length, 0);
  instance.dom.window.close();
});

test('simulation mode selects a memorized transaction without calling the page adapter', async () => {
  const instance = setup({
    selected: { id: 'a', payee: 'Vendor' },
    config: { simulationMode: true, memorizedTransactions: [{ id: 'a' }], droppedTransactions: [] }
  });
  const result = await instance.run();
  assert.equal(result.status, 'simulation');
  assert.equal(instance.calls.populate, 0);
  assert.match(result.message, /Nothing was changed/);
  assert.equal(instance.calls.review.length, 1);
  assert.equal(instance.calls.review[0].simulation, true);
  instance.dom.window.close();
});

test('shows preflight issues before applying and leaves the page untouched if the user cancels', async () => {
  const instance = setup({
    selected: { id: 'a', payee: 'Vendor' },
    config: { simulationMode: false, memorizedTransactions: [{ id: 'a' }], droppedTransactions: [] }
  });
  instance.dom.window.PageAdapter.preflight = () => ({ payee: 'Vendor', lines: [], warnings: ['Line 1: category unavailable.'] });
  instance.dom.window.MemorizedTransactionSelector.reviewApply = async plan => {
    assert.match(plan.warnings[0], /category unavailable/);
    return false;
  };
  const result = await instance.run();
  assert.equal(result.status, 'cancelled');
  assert.equal(instance.calls.populate, 0);
  instance.dom.window.close();
});

test('returns a non-error completion message when some lines need manual entry', async () => {
  const instance = setup({
    selected: { id: 'a', payee: 'Vendor' },
    config: { simulationMode: false, memorizedTransactions: [{ id: 'a' }], droppedTransactions: [] }
  });
  instance.dom.window.PageAdapter.populate = async () => ({ warnings: ['Line 1 needs correction.'], lineCount: 2 });
  const result = await instance.run();
  assert.equal(result.status, 'applied-with-notes');
  assert.match(result.message, /Review the Notes/);
  assert.equal(instance.calls.populate, 0);
  instance.dom.window.close();
});

test('provides only the empty-row creation operation to the page adapter', async () => {
  const instance = setup({
    selected: { id: 'a', payee: 'Vendor' },
    config: { simulationMode: false, memorizedTransactions: [{ id: 'a' }], droppedTransactions: [] }
  });
  const bridgeCalls = [];
  instance.dom.window.PageAdapter.populate = async (_transaction, createEmptyLine) => {
    await createEmptyLine();
    return { warnings: [], lineCount: 1 };
  };
  instance.dom.window.PageBridgeClient.createSplitEntry = async transactionId => bridgeCalls.push(transactionId);

  const result = await instance.run();
  assert.equal(result.status, 'applied');
  assert.deepEqual(bridgeCalls, ['0']);
  instance.dom.window.close();
});
