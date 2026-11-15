'use strict';
(function (root) {
  function textOf(select) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || '';
  }
  function readPayee(container) {
    const payee = container.querySelector('#Payee')?.value?.trim() || '';
    if (payee) return payee;
    const select = container.querySelector('#payee-select');
    if (!select || !select.value) return '';
    const option = select.selectedOptions?.[0];
    return option?.textContent?.trim() || '';
  }
  function readSourceAccount(container) {
    return {
      id: container.querySelector('input[name="AccountID"]')?.value?.trim() || '',
      label: container.querySelector('.small.text-muted.mr-3')?.textContent?.trim() || ''
    };
  }
  function findCurrent() {
    const manualView = document.querySelector('#transaction-view');
    if (!manualView) return null;
    const form = manualView.querySelector('#newtransactionform');
    const heading = manualView.querySelector('h4[data-lang]')?.dataset.lang;
    const id = manualView.querySelector('#TransactionID')?.value?.trim();
    const transactionType = manualView.querySelector('#TransactionType')?.value;
    const isAccountTransfer = transactionType === '0';
    const totalElement = manualView.querySelector(isAccountTransfer ? '#transfer-total' : '#TransactionTotal');
    if (!form || !heading || !id || !totalElement) return null;

    if (heading === 'edit_transaction' && id !== '0') {
      return { mode: 'memorize', container: manualView, transactionId: id };
    }

    const dialog = manualView.closest('#bfallr.open[role="dialog"]');
    if (heading === 'new_transaction' && id === '0' && dialog?.getAttribute('aria-modal') === 'true') {
      const amountInputs = Array.from(manualView.querySelectorAll(isAccountTransfer
        ? '#transfer-splits-div input[name="TransferAmount[]"]'
        : '#splitdiv input[name="Amount[]"]'));
      const hasAmount = amountInputs.some(input => {
        const value = input.value.trim();
        if (!value) return false;
        const numeric = Number(value.replace(/,/g, ''));
        return !Number.isFinite(numeric) || numeric !== 0;
      });
      const payee = readPayee(manualView);
      const totalCents = root.MoneyUtils.toCents(totalElement.textContent.trim().replace(/,/g, '') || '0');
      if (!hasAmount && !payee && totalCents === 0) return { mode: 'apply', container: manualView, transactionId: '0' };
      return { mode: 'not-blank', container: manualView, transactionId: '0' };
    }
    return null;
  }
  function readEnteredTransaction() {
    const screen = findCurrent();
    if (!screen || screen.mode !== 'memorize') return null;
    const container = screen.container;
    const isReconciled = container.querySelector('[data-lang="reconciled"]') !== null;
    const payee = readPayee(container);
    if (!payee) throw new Error('Cannot memorize a transaction without a payee.');
    const type = container.querySelector('#TransactionType');
    if (!type?.value) throw new Error('Transaction payment type is not available.');
    const isAccountTransfer = type.value === '0';
    if (!isAccountTransfer && !['-1', '1'].includes(type.value)) throw new Error('Fund transfers are not supported for memorizing yet.');
    const transferDirection = isAccountTransfer ? container.querySelector('#transfer-to-from') : null;
    const targetAccount = isAccountTransfer ? container.querySelector('#TargetAccount') : null;
    if (isAccountTransfer && (!transferDirection?.value || !targetAccount?.value)) throw new Error('Transfer direction or target account is not available.');
    const sourceAccount = isAccountTransfer ? readSourceAccount(container) : null;
    if (isAccountTransfer && !sourceAccount.id) throw new Error('Transfer source account is not available.');
    const totalElement = container.querySelector(isAccountTransfer ? '#transfer-total' : '#TransactionTotal');
    const totalCents = root.MoneyUtils.toCents(totalElement.textContent.trim().replace(/,/g, '') || '0');
    if (totalCents < 0) throw new Error('Transaction total must be non-negative.');
    const lines = Array.from(container.querySelectorAll(isAccountTransfer
      ? '#transfer-splits-div .transfer-split-row'
      : '#splitdiv .splitrow')).map((row, index) => {
      if (isAccountTransfer) {
        const fund = row.querySelector('select[name="TransferFund[]"]');
        const amount = row.querySelector('input[name="TransferAmount[]"]');
        if (!fund || !amount) throw new Error(`Transfer line ${index + 1} is incomplete.`);
        if (!fund.value) throw new Error(`Transfer line ${index + 1} has no fund selected.`);
        if (!amount.value.trim()) throw new Error(`Transfer line ${index + 1} has no amount.`);
        const amountCents = root.MoneyUtils.toCents(amount.value);
        if (amountCents <= 0) throw new Error(`Transfer line ${index + 1} must have a positive amount.`);
        return {
          fundId: fund.value,
          fundLabel: fund.selectedOptions?.[0]?.textContent?.trim() || '',
          amount: root.MoneyUtils.fromCents(amountCents),
          note: ''
        };
      }
      const category = row.querySelector('select[name="Category[]"]');
      const fund = row.querySelector('select[name="Fund[]"]');
      const amount = row.querySelector('input[name="Amount[]"]');
      const note = row.querySelector('input[name="Note[]"]');
      if (!category || !fund || !amount || !note) throw new Error(`Transaction line ${index + 1} is incomplete.`);
      if (!category.value || !fund.value) throw new Error(`Transaction line ${index + 1} has no category or fund selected.`);
      if (!amount.value.trim()) throw new Error(`Transaction line ${index + 1} has no amount.`);
      const amountCents = root.MoneyUtils.toCents(amount.value);
      return {
        categoryId: category.value,
        categoryLabel: category.selectedOptions?.[0]?.textContent?.trim() || '',
        fundId: fund.value,
        fundLabel: fund.selectedOptions?.[0]?.textContent?.trim() || '',
        amount: root.MoneyUtils.fromCents(amountCents),
        note: note.value ?? ''
      };
    });
    if (!lines.length || lines.reduce((sum, line) => sum + root.MoneyUtils.toCents(line.amount), 0) !== totalCents) {
      throw new Error('Transaction lines do not add up to the displayed total.');
    }
    const memo = container.querySelector('#TransactionMemo')?.value ?? '';
    const referenceInput = container.querySelector('#Reference')?.value?.trim() || '';
    const referenceSelect = container.querySelector('#reference-select');
    const reference = root.MemorizedTransaction.cleanReference(referenceInput || referenceSelect?.value || '');
    return {
      mode: screen.mode,
      transactionId: screen.transactionId,
      isReconciled,
      payee,
      paymentTypeId: type.value,
      paymentType: textOf(type),
      ...(isAccountTransfer ? {
        sourceAccountId: sourceAccount.id,
        sourceAccountLabel: sourceAccount.label,
        transferDirection: transferDirection.value,
        transferDirectionLabel: textOf(transferDirection),
        targetAccountId: targetAccount.value,
        targetAccountLabel: textOf(targetAccount)
      } : {}),
      reference,
      total: root.MoneyUtils.fromCents(totalCents),
      memo,
      lines
    };
  }
  root.TransactionReader = Object.freeze({ findCurrent, readEnteredTransaction, readPayee, textOf });
})(globalThis);
