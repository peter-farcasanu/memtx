'use strict';
(function (root) {
  function cleanReference(value) {
    const reference = String(value ?? '').trim();
    if (!reference || reference === '-1' || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(reference)) return '';
    return reference;
  }
  function normalizePayee(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
  function fingerprint(transaction) {
    return JSON.stringify({
      payee: normalizePayee(transaction.payee),
      paymentTypeId: String(transaction.paymentTypeId),
      sourceAccountId: String(transaction.sourceAccountId ?? ''),
      transferDirection: String(transaction.transferDirection ?? ''),
      targetAccountId: String(transaction.targetAccountId ?? ''),
      reference: cleanReference(transaction.reference),
      memo: String(transaction.memo ?? '').trim(),
      totalCents: root.MoneyUtils.toCents(transaction.total),
      lines: transaction.lines.map(line => ({
        categoryId: String(line.categoryId ?? ''), fundId: String(line.fundId),
        amountCents: root.MoneyUtils.toCents(line.amount), note: String(line.note ?? '').trim()
      }))
    });
  }
  function findDuplicate(transaction, existing) {
    const wanted = fingerprint(transaction);
    return existing.find(item => fingerprint(item) === wanted) || null;
  }
  function capture(transaction) {
    return {
      id: crypto.randomUUID(),
      payee: transaction.payee,
      paymentTypeId: transaction.paymentTypeId,
      paymentType: transaction.paymentType,
      ...(String(transaction.paymentTypeId) === '0' ? {
        sourceAccountId: String(transaction.sourceAccountId),
        sourceAccountLabel: transaction.sourceAccountLabel,
        transferDirection: String(transaction.transferDirection),
        transferDirectionLabel: transaction.transferDirectionLabel,
        targetAccountId: String(transaction.targetAccountId),
        targetAccountLabel: transaction.targetAccountLabel
      } : {}),
      reference: cleanReference(transaction.reference),
      total: transaction.total,
      memo: transaction.memo,
      lines: transaction.lines
    };
  }
  root.MemorizedTransaction = Object.freeze({ cleanReference, fingerprint, findDuplicate, capture });
})(globalThis);
