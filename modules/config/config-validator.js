'use strict';
(function (root) {
  function validate(config) {
    if (!config || config.version !== 1 || typeof config.simulationMode !== 'boolean') throw new Error('Configuration must have version 1 and a boolean simulationMode.');
    const input = config.memorizedTransactions ?? [];
    if (!Array.isArray(input)) throw new Error('memorizedTransactions must be an array.');
    const ids = new Set();
    const memorizedTransactions = [];
    const droppedTransactions = [];
    input.forEach((transaction, index) => {
      const recoveredId = typeof transaction?.id === 'string' && transaction.id.trim() ? transaction.id.trim() : '';
      const recoveredPayee = typeof transaction?.payee === 'string' && transaction.payee.trim() ? transaction.payee.trim() : '';
      const label = recoveredPayee || recoveredId || `Transaction ${index + 1}`;
      try {
        if (!transaction || typeof transaction.id !== 'string' || !transaction.id.trim()) throw new Error('missing transaction id');
        if (ids.has(transaction.id)) throw new Error('duplicate transaction id');
        if (!String(transaction.payee ?? '').trim()) throw new Error('missing payee');
        if (transaction.paymentTypeId == null || !Array.isArray(transaction.lines) || transaction.lines.length === 0) throw new Error('missing payment type or split lines');
        const paymentTypeId = String(transaction.paymentTypeId);
        const isAccountTransfer = paymentTypeId === '0';
        if (isAccountTransfer && (!String(transaction.sourceAccountId ?? '').trim() || !['-1', '1'].includes(String(transaction.transferDirection)) || transaction.targetAccountId == null || !String(transaction.targetAccountId).trim())) {
          throw new Error('account transfer is missing source account, direction, or target account');
        }
        const totalCents = root.MoneyUtils.toCents(transaction.total);
        if (totalCents < 0) throw new Error('transaction total must be non-negative');
        const lines = transaction.lines.map((line, lineIndex) => {
          if (!line || (!isAccountTransfer && line.categoryId == null) || line.fundId == null) throw new Error(`line ${lineIndex + 1} is missing category or fund`);
          const amountCents = root.MoneyUtils.toCents(line.amount);
          if (isAccountTransfer && amountCents <= 0) throw new Error(`transfer line ${lineIndex + 1} must have a positive amount`);
          return Object.freeze({
            ...(line.categoryId == null ? {} : { categoryId: String(line.categoryId), categoryLabel: String(line.categoryLabel ?? '') }),
            fundId: String(line.fundId), fundLabel: String(line.fundLabel ?? ''),
            amount: root.MoneyUtils.fromCents(amountCents), amountCents, note: String(line.note ?? '')
          });
        });
        if (lines.reduce((sum, line) => sum + line.amountCents, 0) !== totalCents) throw new Error('split lines do not add up to the total');
        memorizedTransactions.push(Object.freeze({
          id: transaction.id.trim(), payee: String(transaction.payee).trim(),
          paymentTypeId, paymentType: String(transaction.paymentType ?? ''),
          ...(isAccountTransfer ? {
            sourceAccountId: String(transaction.sourceAccountId),
            sourceAccountLabel: String(transaction.sourceAccountLabel ?? ''),
            transferDirection: String(transaction.transferDirection),
            transferDirectionLabel: String(transaction.transferDirectionLabel ?? ''),
            targetAccountId: String(transaction.targetAccountId),
            targetAccountLabel: String(transaction.targetAccountLabel ?? '')
          } : {}),
          reference: root.MemorizedTransaction.cleanReference(transaction.reference),
          total: root.MoneyUtils.fromCents(totalCents), totalCents,
          memo: String(transaction.memo ?? ''), lines: Object.freeze(lines)
        }));
        ids.add(transaction.id);
      } catch (error) {
        droppedTransactions.push(Object.freeze({ label, reason: error?.message || 'invalid transaction data' }));
      }
    });
    return Object.freeze({
      version: 1,
      simulationMode: config.simulationMode,
      memorizedTransactions: Object.freeze(memorizedTransactions),
      droppedTransactions: Object.freeze(droppedTransactions)
    });
  }
  function serialize(config) {
    return {
      version: 1,
      simulationMode: config.simulationMode,
      memorizedTransactions: config.memorizedTransactions.map(transaction => ({
        id: transaction.id, payee: transaction.payee,
        paymentTypeId: transaction.paymentTypeId, paymentType: transaction.paymentType,
        ...(transaction.paymentTypeId === '0' ? {
          sourceAccountId: transaction.sourceAccountId,
          sourceAccountLabel: transaction.sourceAccountLabel,
          transferDirection: transaction.transferDirection,
          transferDirectionLabel: transaction.transferDirectionLabel,
          targetAccountId: transaction.targetAccountId,
          targetAccountLabel: transaction.targetAccountLabel
        } : {}),
        reference: transaction.reference,
        total: transaction.total, memo: transaction.memo,
        lines: transaction.lines.map(line => ({
          ...(line.categoryId == null ? {} : { categoryId: line.categoryId, categoryLabel: line.categoryLabel }),
          fundId: line.fundId, fundLabel: line.fundLabel,
          amount: line.amount, note: line.note
        }))
      }))
    };
  }
  root.ConfigValidator = Object.freeze({ validate, serialize });
})(globalThis);
