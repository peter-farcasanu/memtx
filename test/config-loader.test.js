'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExtensionModulesWithGlobals } = require('./helpers/load-extension-module.js');

function setup({ stored, bundled, responseOk = true } = {}) {
  const state = { memorizedConfig: stored };
  const writes = [];
  const fetchCalls = [];
  const chrome = {
    storage: { local: {
      async get(key) { return { [key]: state[key] }; },
      async set(value) { writes.push(value); Object.assign(state, value); }
    } },
    runtime: { getURL: path => `extension://${path}` }
  };
  const fetch = async url => {
    fetchCalls.push(url);
    return { ok: responseOk, status: 503, async json() { return bundled; } };
  };
  const modules = loadExtensionModulesWithGlobals({ chrome, fetch },
    'modules/shared/money-utils.js',
    'modules/transactions/memorized-transaction.js',
    'modules/config/config-validator.js',
    'modules/config/config-loader.js'
  );
  return { ...modules, state, writes, fetchCalls };
}

const valid = { id: 'good', payee: 'Vendor', paymentTypeId: '-1', total: '5.00', lines: [{ categoryId: '21', fundId: '1', amount: '5.00' }] };

test('loads and repairs stored configs by dropping invalid transactions and saving recovered data', async () => {
  const { ConfigLoader, writes } = setup({ stored: { version: 1, simulationMode: true, memorizedTransactions: [valid, { id: 'bad', payee: '', lines: [] }] } });
  const config = await ConfigLoader.load();
  assert.equal(config.memorizedTransactions.length, 1);
  assert.equal(config.droppedTransactions.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].memorizedConfig.memorizedTransactions.length, 1);
});

test('starts with an empty memorized config and simulation enabled when storage is empty', async () => {
  const { ConfigLoader, fetchCalls } = setup();
  const config = await ConfigLoader.load();
  assert.equal(config.memorizedTransactions.length, 0);
  assert.equal(config.simulationMode, true);
  assert.equal(fetchCalls.length, 0);
});

test('removes legacy configured splits from stored configs during migration', async () => {
  const { ConfigLoader, writes } = setup({ stored: {
    version: 1,
    simulationMode: false,
    memorizedTransactions: [valid],
    splits: [{ id: 'legacy', total: 50 }]
  } });
  const config = await ConfigLoader.load();
  assert.equal(config.memorizedTransactions.length, 1);
  assert.equal(Object.hasOwn(config, 'splits'), false);
  assert.equal(writes.length, 1);
  assert.equal(Object.hasOwn(writes[0].memorizedConfig, 'splits'), false);
});

test('validates and persists saved data in portable form', async () => {
  const { ConfigLoader, writes } = setup({ stored: null });
  const saved = await ConfigLoader.save({ version: 1, simulationMode: false, memorizedTransactions: [valid] });
  assert.equal(saved.memorizedTransactions.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].memorizedConfig.memorizedTransactions[0].lines[0].amount, '5.00');
});
