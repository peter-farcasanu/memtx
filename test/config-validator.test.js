'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExtensionModules } = require('./helpers/load-extension-module.js');

const { ConfigValidator } = loadExtensionModules(
  'modules/shared/money-utils.js',
  'modules/transactions/memorized-transaction.js',
  'modules/config/config-validator.js'
);

function transaction(overrides = {}) {
  return {
    id: 'valid-id',
    payee: 'Vendor',
    paymentTypeId: 'expense',
    paymentType: 'Expense',
    total: '10.00',
    lines: [{ categoryId: '21', fundId: '1', amount: '10.00' }],
    ...overrides
  };
}

test('normalizes valid transactions and serializes portable fields', () => {
  const config = ConfigValidator.validate({ version: 1, simulationMode: true, memorizedTransactions: [transaction()] });
  assert.equal(config.memorizedTransactions.length, 1);
  assert.equal(config.memorizedTransactions[0].totalCents, 1000);
  assert.equal(config.memorizedTransactions[0].lines[0].categoryId, '21');

  const portable = ConfigValidator.serialize(config);
  assert.equal(portable.simulationMode, true);
  assert.equal(portable.memorizedTransactions[0].lines[0].amount, '10.00');
});

test('round-trips account transfer details without category fields', () => {
  const transfer = transaction({
    id: 'transfer-id',
    payee: 'Fidelity SPAXX Fund',
    paymentTypeId: '0',
    paymentType: 'Account-to-Account Transfer',
    sourceAccountId: '1',
    sourceAccountLabel: 'VyStar Checking',
    transferDirection: '-1',
    transferDirectionLabel: 'To',
    targetAccountId: '3',
    targetAccountLabel: 'Fidelity Investments Core Acct SPAXX Fund',
    total: '10000.00',
    lines: [{ fundId: '1', fundLabel: 'General Fund', amount: '10000.00' }]
  });
  const config = ConfigValidator.validate({ version: 1, simulationMode: false, memorizedTransactions: [transfer] });
  const normalized = config.memorizedTransactions[0];
  assert.equal(normalized.paymentTypeId, '0');
  assert.equal(normalized.transferDirection, '-1');
  assert.equal(normalized.sourceAccountId, '1');
  assert.equal(normalized.targetAccountId, '3');
  assert.equal(normalized.lines[0].fundId, '1');
  assert.equal(Object.hasOwn(normalized.lines[0], 'categoryId'), false);

  const portable = ConfigValidator.serialize(config).memorizedTransactions[0];
  assert.equal(portable.targetAccountLabel, 'Fidelity Investments Core Acct SPAXX Fund');
  assert.equal(portable.sourceAccountId, '1');
  assert.equal(portable.lines[0].amount, '10000.00');
  assert.equal(Object.hasOwn(portable.lines[0], 'categoryId'), false);
});

test('drops account transfers with missing account details, funds, or positive amounts', () => {
  const baseTransfer = {
    id: 'transfer-id', payee: 'Transfer', paymentTypeId: '0', sourceAccountId: '1', transferDirection: '-1',
    targetAccountId: '3', total: '10.00', lines: [{ fundId: '1', amount: '10.00' }]
  };
  const invalid = [
    { ...baseTransfer, id: 'no-direction', transferDirection: '' },
    { ...baseTransfer, id: 'no-source', sourceAccountId: '' },
    { ...baseTransfer, id: 'no-target', targetAccountId: '' },
    { ...baseTransfer, id: 'no-fund', lines: [{ amount: '10.00' }] },
    { ...baseTransfer, id: 'zero-line', total: '0.00', lines: [{ fundId: '1', amount: '0.00' }] }
  ];
  const config = ConfigValidator.validate({ version: 1, simulationMode: true, memorizedTransactions: invalid });
  assert.equal(config.memorizedTransactions.length, 0);
  assert.equal(config.droppedTransactions.length, invalid.length);
});

test('drops an invalid transaction and continues loading later entries', () => {
  const bad = transaction({ id: 'bad-id', lines: [{ categoryId: 'missing-fund', amount: '10.00' }] });
  const config = ConfigValidator.validate({ version: 1, simulationMode: false, memorizedTransactions: [bad, transaction({ id: 'good-id' })] });

  assert.equal(config.memorizedTransactions.length, 1);
  assert.equal(config.memorizedTransactions[0].id, 'good-id');
  assert.equal(config.droppedTransactions.length, 1);
  assert.equal(config.droppedTransactions[0].label, 'Vendor');
  assert.match(config.droppedTransactions[0].reason, /missing category or fund/);
});

test('rejects invalid top-level configuration', () => {
  assert.throws(() => ConfigValidator.validate({ version: 1, simulationMode: 'yes' }), /boolean simulationMode/);
});

test('discards legacy configured split collections when serializing', () => {
  const config = ConfigValidator.validate({
    version: 1,
    simulationMode: true,
    memorizedTransactions: [transaction()],
    splits: [{ id: 'old-split-rule' }]
  });
  const portable = ConfigValidator.serialize(config);
  assert.equal(Object.hasOwn(config, 'splits'), false);
  assert.equal(Object.hasOwn(portable, 'splits'), false);
});
