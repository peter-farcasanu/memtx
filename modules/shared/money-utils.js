'use strict';
(function (root) {
  function toCents(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Amount must be finite.');
      return Math.round((value + Number.EPSILON) * 100);
    }
    const text = String(value ?? '').trim().replace(/[$,\s]/g, '');
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`Invalid money amount: ${value}`);
    const negative = text.startsWith('-');
    const unsigned = negative ? text.slice(1) : text;
    const [whole, fraction = ''] = unsigned.split('.');
    const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
    return negative ? -cents : cents;
  }
  root.MoneyUtils = Object.freeze({ toCents, fromCents: cents => (cents / 100).toFixed(2) });
})(globalThis);
