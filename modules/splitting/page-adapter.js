'use strict';
(function (root) {
  const SELECTORS = Object.freeze({
    total: '#TransactionTotal',
    row: '#splitdiv .splitrow',
    category: 'select[name="Category[]"]',
    fund: 'select[name="Fund[]"]',
    amount: 'input[name="Amount[]"]',
    note: 'input[name="Note[]"]'
  });

  function getBlankTransaction() {
    const dialog = document.querySelector('#bfallr.open[role="dialog"][aria-modal="true"]');
    const view = dialog?.querySelector('#transaction-view');
    if (!view || view.querySelector('h4[data-lang="new_transaction"]') === null ||
        view.querySelector('#TransactionID')?.value !== '0' ||
        !view.querySelector('#newtransactionform')) return null;
    return view;
  }

  function getRows(view = getBlankTransaction()) {
    return view ? Array.from(view.querySelectorAll(SELECTORS.row)) : [];
  }

  function optionExists(select, value) {
    return Array.from(select.options).some(option => option.value === String(value) && !option.disabled);
  }

  function normalizeOptionLabel(value) {
    return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  function resolveOption(select, value, label) {
    const requested = String(value);
    const idMatch = Array.from(select.options).find(option => option.value === requested && !option.disabled);
    // IDs are the stable reference. Labels can change, so trust a live ID
    // immediately and use the saved name only when that ID is gone.
    if (idMatch) return { value: idMatch.value, matchedBy: 'id' };
    const wantedLabel = normalizeOptionLabel(label);
    if (wantedLabel) {
      const nameMatches = Array.from(select.options).filter(option =>
        !option.disabled && normalizeOptionLabel(option.textContent) === wantedLabel
      );
      if (nameMatches.length === 1) return { value: nameMatches[0].value, matchedBy: 'name' };
    }
    return null;
  }

  async function waitForResolvedOption(select, value, label, timeout = 1200) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const resolved = resolveOption(select, value, label);
      if (resolved) return resolved;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return resolveOption(select, value, label);
  }

  function setSelectValue(select, value) {
    const requested = String(value);
    if (!optionExists(select, requested)) throw new Error(`Option ${requested} is not available in ${select.name || select.id}.`);
    select.value = requested;
    if (select.value !== requested) throw new Error(`Unable to set ${select.name || select.id}.`);
    if (window.jQuery) window.jQuery(select).trigger('change');
    else select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setInputValue(input, value) {
    input.value = String(value ?? '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (input.value !== String(value ?? '')) throw new Error(`Unable to set ${input.name || input.id}.`);
  }

  function setAmountValue(input, value) {
    const expectedCents = value === '' ? 0 : root.MoneyUtils.toCents(value);
    input.value = String(value ?? '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    let actualCents;
    try {
      actualCents = input.value.trim() ? root.MoneyUtils.toCents(input.value) : 0;
    } catch {
      actualCents = NaN;
    }
    if (actualCents !== expectedCents) throw new Error(`Unable to set ${input.name || input.id}.`);
  }

  async function createRow(createSplitEntry, view) {
    const before = getRows(view);
    const previous = new Set(before);
    await createSplitEntry();
    let after = getRows(view);
    const deadline = Date.now() + 2000;
    while (after.length === before.length && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
      after = getRows(view);
    }
    const created = after.filter(row => !previous.has(row));
    if (created.length !== 1) throw new Error(`Expected one new split row, found ${created.length}.`);
    return created[0];
  }

  function getTransferRows(view) {
    return Array.from(view.querySelectorAll('#transfer-splits-div .transfer-split-row'));
  }

  async function createTransferRow(createTransferSplitEntry, view) {
    const before = getTransferRows(view);
    const previous = new Set(before);
    await createTransferSplitEntry();
    let after = getTransferRows(view);
    const deadline = Date.now() + 2000;
    while (after.length === before.length && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
      after = getTransferRows(view);
    }
    const created = after.filter(row => !previous.has(row));
    if (created.length !== 1) throw new Error(`Expected one new transfer line, found ${created.length}.`);
    return created[0];
  }

  function assertStillBlank(view, isAccountTransfer = false) {
    const payee = view.querySelector('#Payee')?.value?.trim() || '';
    const payeeSelect = view.querySelector('#payee-select');
    const hasSelectedPayee = Boolean(payeeSelect?.value);
    const amounts = Array.from(view.querySelectorAll(isAccountTransfer
      ? '#transfer-splits-div input[name="TransferAmount[]"]'
      : '#splitdiv input[name="Amount[]"]'));
    const hasAmount = amounts.some(input => {
      const value = input.value.trim();
      if (!value) return false;
      const number = Number(value.replace(/,/g, ''));
      return !Number.isFinite(number) || number !== 0;
    });
    const totalSelector = isAccountTransfer ? '#transfer-total' : SELECTORS.total;
    const total = root.MoneyUtils.toCents(view.querySelector(totalSelector)?.textContent?.trim().replace(/,/g, '') || '0');
    if (payee || hasSelectedPayee || hasAmount || total !== 0) {
      throw new Error('The new transaction is no longer blank. Start a new transaction with no payee and no amount.');
    }
  }

  function assertSourceAccount(view, transaction) {
    const activeAccountId = view.querySelector('input[name="AccountID"]')?.value?.trim() || '';
    if (!activeAccountId) throw new Error('The current source account is unavailable. Open a new transaction in the source account and try again.');
    if (activeAccountId !== String(transaction.sourceAccountId)) {
      throw new Error(`This transfer belongs to source account “${transaction.sourceAccountLabel || transaction.sourceAccountId}”. Open a blank transaction in that account to apply it.`);
    }
  }

  function preflightAccountTransfer(transaction) {
    const view = getBlankTransaction();
    if (!view) throw new Error('The blank new transaction dialog is no longer open.');
    assertStillBlank(view, true);
    assertSourceAccount(view, transaction);
    if (view.querySelector('[data-lang="reconciled"]')) throw new Error('This transaction is reconciled. MemTx will not change reconciled transactions.');
    const type = view.querySelector('#TransactionType');
    const payeeInput = view.querySelector('#Payee');
    const direction = view.querySelector('#transfer-to-from');
    const target = view.querySelector('#TargetAccount');
    if (!type || !payeeInput || !direction || !target) throw new Error('Account transfer fields are unavailable.');
    if (!optionExists(type, '0')) throw new Error('Account-to-Account Transfer is not available on this screen.');
    const typeWillChange = type.value !== '0';
    const targetMatch = typeWillChange ? null : resolveOption(target, transaction.targetAccountId, transaction.targetAccountLabel);
    const warnings = [];
    const actions = [];
    if (!targetMatch && !typeWillChange) {
      warnings.push(`Target account “${transaction.targetAccountLabel || transaction.targetAccountId}” is unavailable.`);
      actions.push('the target account');
    }
    if (typeWillChange) warnings.push('The transaction type will change to Account-to-Account Transfer. Transfer fields will be checked again after ChurchTrac updates them.');
    const rows = getTransferRows(view);
    if (!typeWillChange && rows.length > transaction.lines.length) throw new Error('The blank transfer has extra fund lines. Remove them manually before applying.');
    const fundSelect = rows[0]?.querySelector('select[name="TransferFund[]"]');
    const lines = transaction.lines.map((line, index) => {
      const fundMatch = typeWillChange ? null : fundSelect && resolveOption(fundSelect, line.fundId, line.fundLabel);
      if (!fundMatch && !typeWillChange) {
        warnings.push(`Transfer line ${index + 1}: unavailable fund “${line.fundLabel || line.fundId}”.`);
        actions.push(`the correct fund for transfer line ${index + 1}`);
        actions.push(`the amount for transfer line ${index + 1}`);
      }
      return {
        category: `${transaction.transferDirectionLabel || (transaction.transferDirection === '1' ? 'From' : 'To')} ${transaction.targetAccountLabel}`.trim(),
        fund: line.fundLabel || `Fund ${line.fundId}`,
        amount: `$${root.MoneyUtils.fromCents(line.amountCents)}`,
        note: '',
        fundAvailable: typeWillChange ? null : Boolean(fundMatch),
        fundResolvedValue: fundMatch?.value ?? null
      };
    });
    return {
      payee: transaction.payee,
      paymentType: transaction.paymentType || 'Account-to-Account Transfer',
      reference: transaction.reference || '',
      total: `$${root.MoneyUtils.fromCents(transaction.totalCents)}`,
      lines, actions, warnings, isAccountTransfer: true,
      transferDirection: transaction.transferDirectionLabel || (transaction.transferDirection === '1' ? 'From' : 'To'),
      sourceAccount: transaction.sourceAccountLabel,
      targetAccount: transaction.targetAccountLabel
    };
  }

  async function populateAccountTransfer(transaction, createTransferSplitEntry) {
    const view = getBlankTransaction();
    if (!view) throw new Error('The blank new transaction dialog is no longer open.');
    assertStillBlank(view, true);
    assertSourceAccount(view, transaction);
    const type = view.querySelector('#TransactionType');
    if (!type || !optionExists(type, '0')) throw new Error('Account-to-Account Transfer is not available on this screen.');
    setSelectValue(type, '0');
    await new Promise(resolve => setTimeout(resolve, 150));

    const payeeInput = view.querySelector('#Payee');
    const direction = view.querySelector('#transfer-to-from');
    const target = view.querySelector('#TargetAccount');
    if (!payeeInput || !direction || !target) throw new Error('Account transfer fields are unavailable.');
    setInputValue(payeeInput, transaction.payee);

    const warnings = [];
    const directionMatch = resolveOption(direction, transaction.transferDirection, transaction.transferDirectionLabel);
    if (directionMatch) setSelectValue(direction, directionMatch.value);
    else warnings.push('Transfer direction is unavailable. Select the correct direction before saving.');
    const targetMatch = await waitForResolvedOption(target, transaction.targetAccountId, transaction.targetAccountLabel);
    if (targetMatch) setSelectValue(target, targetMatch.value);
    else warnings.push(`Target account “${transaction.targetAccountLabel || transaction.targetAccountId}” is unavailable. Select the correct target account before saving.`);

    let rows = getTransferRows(view);
    if (rows.length > transaction.lines.length) throw new Error('The blank transfer has extra fund lines. Remove them manually before applying.');
    while (rows.length < transaction.lines.length) {
      await createTransferRow(createTransferSplitEntry, view);
      rows = getTransferRows(view);
    }
    const unresolvedLines = new Set();
    const selections = [];
    for (let index = 0; index < transaction.lines.length; index += 1) {
      const row = getTransferRows(view)[index];
      const fund = row?.querySelector('select[name="TransferFund[]"]');
      const amount = row?.querySelector('input[name="TransferAmount[]"]');
      if (!fund || !amount) throw new Error(`Transfer line ${index + 1} is incomplete.`);
      const fundMatch = await waitForResolvedOption(fund, transaction.lines[index].fundId, transaction.lines[index].fundLabel);
      if (fundMatch) setSelectValue(fund, fundMatch.value);
      else {
        unresolvedLines.add(index);
        warnings.push(`Transfer line ${index + 1}: fund “${transaction.lines[index].fundLabel || transaction.lines[index].fundId}” is unavailable. Select the correct fund and enter the amount manually.`);
      }
      selections[index] = fundMatch?.value ?? null;
    }

    for (let index = 0; index < transaction.lines.length; index += 1) {
      const line = transaction.lines[index];
      const amount = getTransferRows(view)[index].querySelector('input[name="TransferAmount[]"]');
      setAmountValue(amount, unresolvedLines.has(index) ? '' : line.amount);
    }

    let totalCents = 0;
    for (let index = 0; index < transaction.lines.length; index += 1) {
      const row = getTransferRows(view)[index];
      const amount = row.querySelector('input[name="TransferAmount[]"]');
      if (unresolvedLines.has(index)) continue;
      if (row.querySelector('select[name="TransferFund[]"]').value !== selections[index]) throw new Error(`Fund verification failed for transfer line ${index + 1}.`);
      const actualCents = root.MoneyUtils.toCents(amount.value);
      if (actualCents !== transaction.lines[index].amountCents) throw new Error(`Verification failed for transfer line ${index + 1}.`);
      totalCents += actualCents;
    }
    const displayedTotal = root.MoneyUtils.toCents(view.querySelector('#transfer-total')?.textContent?.trim().replace(/,/g, '') || '0');
    if (totalCents !== displayedTotal) throw new Error('Displayed transfer total does not match the amounts entered. Review the open transaction.');
    if (!unresolvedLines.size && totalCents !== transaction.totalCents) throw new Error('Applied transfer total does not match the memorized total. Review the open transaction.');
    return { valid: warnings.length === 0, totalCents, lineCount: transaction.lines.length, warnings };
  }

  function preflight(transaction) {
    if (String(transaction.paymentTypeId) === '0') return preflightAccountTransfer(transaction);
    const view = getBlankTransaction();
    if (!view) throw new Error('The blank new transaction dialog is no longer open.');
    assertStillBlank(view);
    if (view.querySelector('[data-lang="reconciled"]')) {
      throw new Error('This transaction is reconciled. MemTx will not change reconciled transactions.');
    }

    const type = view.querySelector('#TransactionType');
    const payeeInput = view.querySelector('#Payee');
    const payeeSelect = view.querySelector('#payee-select');
    if (!type || !payeeInput || !payeeSelect) throw new Error('New transaction fields are unavailable.');
    if (!optionExists(type, transaction.paymentTypeId)) {
      throw new Error(`Payment type “${transaction.paymentType || transaction.paymentTypeId}” is no longer available.`);
    }
    const typeWillChange = type.value !== String(transaction.paymentTypeId);

    const rows = getRows(view);
    if (rows.length > transaction.lines.length) {
      throw new Error('The blank transaction has extra split rows. Remove them manually before applying.');
    }
    const controls = rows.map((row, index) => {
      const fields = {
        category: row.querySelector(SELECTORS.category),
        fund: row.querySelector(SELECTORS.fund),
        amount: row.querySelector(SELECTORS.amount),
        note: row.querySelector(SELECTORS.note)
      };
      if (Object.values(fields).some(field => !field)) throw new Error(`New transaction line ${index + 1} is incomplete.`);
      return fields;
    });
    if (!controls.length) throw new Error('New transaction line fields are unavailable.');
    if (transaction.reference && (!view.querySelector('#Reference') || !view.querySelector('#reference-select'))) {
      throw new Error('The saved reference cannot be applied on this transaction screen.');
    }

    const warnings = [];
    if (typeWillChange) {
      warnings.push(`The transaction type will change to “${transaction.paymentType || transaction.paymentTypeId}”. Category options will be checked again after ChurchTrac updates them.`);
    }
    const actions = [];
    const lines = transaction.lines.map((line, index) => {
      // Category options may be replaced when ChurchTrac changes transaction type.
      // Do not report a stale current-type list as a missing category.
      const categoryMatch = typeWillChange ? null : resolveOption(controls[0].category, line.categoryId, line.categoryLabel);
      const fundMatch = resolveOption(controls[0].fund, line.fundId, line.fundLabel);
      const categoryAvailable = categoryMatch !== null && categoryMatch !== undefined;
      const fundAvailable = Boolean(fundMatch);
      const categoryUnverified = categoryMatch === null && typeWillChange;
      if ((!categoryAvailable && !categoryUnverified) || !fundAvailable) {
        const missing = [];
        if (!categoryAvailable && !categoryUnverified) {
          missing.push(`category “${line.categoryLabel || line.categoryId}”`);
          actions.push(`the correct category for line ${index + 1}`);
        }
        if (!fundAvailable) {
          missing.push(`fund “${line.fundLabel || line.fundId}”`);
          actions.push(`the correct fund for line ${index + 1}`);
        }
        actions.push(`the amount applicable on line ${index + 1}`);
        warnings.push(`Line ${index + 1}: unavailable ${missing.join(' and ')}.`);
      }
      return {
        category: line.categoryLabel || `Category ${line.categoryId}`,
        fund: line.fundLabel || `Fund ${line.fundId}`,
        amount: `$${root.MoneyUtils.fromCents(line.amountCents)}`,
        note: line.note || '',
        categoryAvailable: categoryUnverified ? null : categoryAvailable,
        fundAvailable,
        categoryResolvedValue: categoryMatch?.value ?? null,
        fundResolvedValue: fundMatch?.value ?? null
      };
    });

    return {
      payee: transaction.payee,
      paymentType: transaction.paymentType || type.selectedOptions?.[0]?.textContent?.trim() || transaction.paymentTypeId,
      reference: transaction.reference || '',
      total: `$${root.MoneyUtils.fromCents(transaction.totalCents)}`,
      lines,
      actions,
      warnings
    };
  }

  async function populate(transaction, createSplitEntry) {
    if (String(transaction.paymentTypeId) === '0') return populateAccountTransfer(transaction, createSplitEntry);
    const view = getBlankTransaction();
    if (!view) throw new Error('The blank new transaction dialog is no longer open.');
    assertStillBlank(view);

    const type = view.querySelector('#TransactionType');
    if (!type) throw new Error('New transaction fields are unavailable.');
    if (!optionExists(type, transaction.paymentTypeId)) throw new Error(`Payment type “${transaction.paymentType || transaction.paymentTypeId}” is no longer available.`);

    setSelectValue(type, transaction.paymentTypeId);
    await new Promise(resolve => setTimeout(resolve, 150));

    const payeeInput = view.querySelector('#Payee');
    const payeeSelect = view.querySelector('#payee-select');
    if (!payeeInput || !payeeSelect) throw new Error('New transaction fields are unavailable.');

    let rows = getRows(view);
    if (rows.length > transaction.lines.length) throw new Error('The blank transaction has extra split rows. Remove them manually before applying.');
    while (rows.length < transaction.lines.length) {
      await createRow(createSplitEntry, view);
      rows = getRows(view);
    }

    const controls = rows.map((row, index) => {
      const fields = {
        category: row.querySelector(SELECTORS.category),
        fund: row.querySelector(SELECTORS.fund),
        amount: row.querySelector(SELECTORS.amount),
        note: row.querySelector(SELECTORS.note)
      };
      if (Object.values(fields).some(field => !field)) throw new Error(`New transaction line ${index + 1} is incomplete.`);
      return fields;
    });

    const warnings = [];
    const lineSelections = [];
    const unresolvedLines = new Set();
    const getLineFields = index => {
      const row = getRows(view)[index];
      if (!row) throw new Error(`New transaction line ${index + 1} is unavailable.`);
      const fields = {
        category: row.querySelector(SELECTORS.category),
        fund: row.querySelector(SELECTORS.fund),
        amount: row.querySelector(SELECTORS.amount),
        note: row.querySelector(SELECTORS.note)
      };
      if (Object.values(fields).some(field => !field)) throw new Error(`New transaction line ${index + 1} is incomplete.`);
      return fields;
    };

    let payeeOption = Array.from(payeeSelect.options).find(option => option.value === transaction.payee && option.textContent.trim() === transaction.payee);
    if (!payeeOption) {
      payeeOption = new Option(transaction.payee, transaction.payee, true, true);
      payeeSelect.add(payeeOption);
    }
    payeeSelect.value = transaction.payee;
    if (window.jQuery) {
      window.jQuery(payeeSelect).trigger('change');
      window.jQuery(payeeSelect).trigger({ type: 'select2:select', params: { data: { id: transaction.payee, text: transaction.payee } } });
    }
    setInputValue(payeeInput, transaction.payee);
    if (type.value !== transaction.paymentTypeId || payeeInput.value.trim() !== transaction.payee) throw new Error('Payee or payment type could not be applied correctly.');
    for (let index = 0; index < transaction.lines.length; index += 1) {
      const line = transaction.lines[index];
      let fields = getLineFields(index);
      const categoryMatch = await waitForResolvedOption(fields.category, line.categoryId, line.categoryLabel);
      const categoryAvailable = Boolean(categoryMatch);
      if (categoryMatch) {
        setSelectValue(fields.category, categoryMatch.value);
        // Selecting a category can rebuild the fund dropdown (and sometimes
        // the whole split row). Always inspect the live controls after change.
        await new Promise(resolve => setTimeout(resolve, 100));
        fields = getLineFields(index);
      }
      const fundMatch = await waitForResolvedOption(fields.fund, line.fundId, line.fundLabel);
      const fundAvailable = Boolean(fundMatch);
      if (fundMatch) {
        setSelectValue(fields.fund, fundMatch.value);
        await new Promise(resolve => setTimeout(resolve, 100));
        fields = getLineFields(index);
      }
      if (!categoryAvailable || !fundAvailable) {
        unresolvedLines.add(index);
        const missing = [];
        if (!categoryAvailable) missing.push(`category “${line.categoryLabel || line.categoryId}”`);
        if (!fundAvailable) missing.push(`fund “${line.fundLabel || line.fundId}”`);
        const amountLabel = root.MoneyUtils.fromCents(line.amountCents);
        warnings.push(`Line ${index + 1}: unavailable ${missing.join(' and ')}.`);
      }
      lineSelections[index] = { categoryValue: categoryMatch?.value ?? null, fundValue: fundMatch?.value ?? null };
    }

    // Selecting a category or fund can cause ChurchTrac to rebuild split rows.
    // Finish all dropdown selections first, then write amounts and notes so a
    // later dropdown change cannot reset values already entered on earlier rows.
    for (let index = 0; index < transaction.lines.length; index += 1) {
      const line = transaction.lines[index];
      const fields = getLineFields(index);
      controls[index] = fields;
      if (unresolvedLines.has(index)) {
        setAmountValue(fields.amount, '');
        const amountLabel = root.MoneyUtils.fromCents(line.amountCents);
        const noteText = [`Amount to enter: $${amountLabel}`, line.note].filter(Boolean).join(' — ');
        setInputValue(fields.note, noteText);
      } else {
        setAmountValue(fields.amount, line.amount);
        setInputValue(fields.note, line.note);
      }
    }

    if (transaction.reference) {
      const referenceInput = view.querySelector('#Reference');
      const referenceSelect = view.querySelector('#reference-select');
      if (!referenceInput || !referenceSelect) throw new Error('The saved reference cannot be applied on this transaction screen.');
      let referenceOption = Array.from(referenceSelect.options).find(option => option.value === transaction.reference && option.textContent.trim() === transaction.reference);
      if (!referenceOption) {
        referenceOption = new Option(transaction.reference, transaction.reference, true, true);
        referenceSelect.add(referenceOption);
      }
      referenceSelect.value = transaction.reference;
      if (window.jQuery) {
        window.jQuery(referenceSelect).trigger('change');
        const selectedEvent = window.jQuery.Event('select2:select');
        selectedEvent.params = { data: { id: transaction.reference, text: transaction.reference } };
        window.jQuery(referenceSelect).trigger(selectedEvent);
      } else {
        referenceSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setInputValue(referenceInput, transaction.reference);
      await new Promise(resolve => setTimeout(resolve, 50));
      if (referenceSelect.value !== transaction.reference || referenceInput.value.trim() !== transaction.reference) {
        throw new Error('Reference verification failed.');
      }
    }

    let totalCents = 0;
    controls.forEach((fields, index) => {
      const expected = transaction.lines[index];
      if (unresolvedLines.has(index)) {
        const currentAmount = fields.amount.value.trim() ? root.MoneyUtils.toCents(fields.amount.value) : 0;
        if (currentAmount !== 0) throw new Error(`MemTx could not clear the amount on line ${index + 1}. Review it before saving.`);
        const expectedNote = [`Amount to enter: $${root.MoneyUtils.fromCents(expected.amountCents)}`, expected.note].filter(Boolean).join(' — ');
        if (fields.note.value !== expectedNote) throw new Error(`MemTx could not add the amount reminder to Note on line ${index + 1}. Review it before saving.`);
        return;
      }
      const actualCents = root.MoneyUtils.toCents(fields.amount.value);
      if (actualCents !== expected.amountCents || fields.note.value !== expected.note) throw new Error(`Verification failed for transaction line ${index + 1}.`);
      if (fields.category.value !== lineSelections[index].categoryValue) throw new Error(`Category verification failed for line ${index + 1}.`);
      if (fields.fund.value !== lineSelections[index].fundValue) throw new Error(`Fund verification failed for line ${index + 1}.`);
      totalCents += actualCents;
    });
    const displayedTotal = root.MoneyUtils.toCents(view.querySelector(SELECTORS.total).textContent.trim().replace(/,/g, ''));
    if (totalCents !== displayedTotal) throw new Error('Displayed total does not match the amounts entered. Review the open transaction.');
    if (!unresolvedLines.size && totalCents !== transaction.totalCents) throw new Error('Applied line total does not match the memorized transaction total. Review the open transaction.');
    return { valid: warnings.length === 0, totalCents, lineCount: controls.length, warnings };
  }

  root.PageAdapter = Object.freeze({ preflight, populate });
})(globalThis);
