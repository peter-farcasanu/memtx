'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExtensionModules } = require('./helpers/load-extension-module.js');

const { MemorizedTransaction } = loadExtensionModules(
  'modules/shared/money-utils.js',
  'modules/transactions/memorized-transaction.js'
);

const sample = {
  payee: '  Example   Vendor ',
  paymentTypeId: 'expense',
  reference: 'Invoice 22',
  memo: 'Monthly',
  total: '10.00',
  lines: [{ categoryId: '21', fundId: '1', amount: '10.00', note: '' }]
};

test('ignores numeric references because they represent check numbers', () => {
  assert.equal(MemorizedTransaction.cleanReference('  12345  '), '');
  assert.equal(MemorizedTransaction.cleanReference(' Invoice 22 '), 'Invoice 22');
});

test('detects duplicates after normalizing payee whitespace and case', () => {
  const existing = { ...sample, payee: 'example vendor' };
  assert.equal(MemorizedTransaction.findDuplicate(sample, [existing]), existing);
});

test('does not treat changed line details as a duplicate', () => {
  const existing = { ...sample, lines: [{ ...sample.lines[0], categoryId: '22' }] };
  assert.equal(MemorizedTransaction.findDuplicate(sample, [existing]), null);
});
