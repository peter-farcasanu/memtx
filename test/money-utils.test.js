'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExtensionModules } = require('./helpers/load-extension-module.js');

const { MoneyUtils } = loadExtensionModules('modules/shared/money-utils.js');

test('parses common money formats into cents', () => {
  assert.equal(MoneyUtils.toCents('$1,234.56'), 123456);
  assert.equal(MoneyUtils.toCents(' 12.3 '), 1230);
  assert.equal(MoneyUtils.toCents(-0.01), -1);
});

test('formats cents with two decimal places', () => {
  assert.equal(MoneyUtils.fromCents(94300), '943.00');
  assert.equal(MoneyUtils.fromCents(-105), '-1.05');
});

test('rejects invalid money values', () => {
  assert.throws(() => MoneyUtils.toCents('12.345'), /Invalid money amount/);
  assert.throws(() => MoneyUtils.toCents(Number.NaN), /finite/);
});
