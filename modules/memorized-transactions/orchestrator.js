'use strict';
(function (root) {
  async function run() {
    const screen = root.TransactionReader.findCurrent();
    if (!screen) return { status: 'ignored', message: 'Open an entered transaction or a blank new transaction in ChurchTrac.' };

    if (screen.mode === 'not-blank') {
      throw new Error('To apply a memorized transaction, start with a blank new transaction: Transaction ID 0, no payee, and no amount.');
    }

    if (screen.mode === 'memorize') {
      const captured = root.TransactionReader.readEnteredTransaction();
      const config = await root.ConfigLoader.load();
      const droppedTransactions = config.droppedTransactions;
      const duplicate = root.MemorizedTransaction.findDuplicate(captured, config.memorizedTransactions);
      if (duplicate) return { status: 'duplicate', payee: duplicate.payee, droppedTransactions, message: `“${duplicate.payee}” is already memorized. No duplicate was added.` };
      const entry = root.MemorizedTransaction.capture(captured);
      await root.ConfigLoader.save({
        ...config,
        memorizedTransactions: [...config.memorizedTransactions, entry]
      });
      return {
        status: 'memorized',
        payee: entry.payee,
        droppedTransactions,
        message: `Memorized “${entry.payee}”.`
      };
    }

    if (screen.mode !== 'apply') return { status: 'ignored', message: 'This ChurchTrac screen is not supported.' };
    if (document.querySelector('#transaction-view [data-lang="reconciled"]')) {
      throw new Error('This transaction is reconciled. MemTx will not change reconciled transactions.');
    }

    const config = await root.ConfigLoader.load();
    const droppedTransactions = config.droppedTransactions;
    if (!config.memorizedTransactions.length) return { status: 'none', droppedTransactions, message: 'No memorized transactions are in the config. Memorize an entered transaction first.' };
    const selected = await root.MemorizedTransactionSelector.choose(
      config.memorizedTransactions,
      async transaction => {
        const latest = await root.ConfigLoader.load();
        const remaining = latest.memorizedTransactions.filter(item => item.id !== transaction.id);
        if (remaining.length === latest.memorizedTransactions.length) throw new Error('This memorized transaction no longer exists.');
        await root.ConfigLoader.save({ ...latest, memorizedTransactions: remaining });
      }
    );
    if (!selected) return { status: 'cancelled', droppedTransactions, message: 'No memorized transaction selected. Nothing was changed.' };

    const plan = root.PageAdapter.preflight(selected);
    if (config.simulationMode) {
      await root.MemorizedTransactionSelector.reviewApply(plan, { simulation: true });
      return { status: 'simulation', message: `Simulation previewed “${selected.payee}”. Nothing was changed.`, plan, droppedTransactions };
    }

    if (plan.warnings.length) {
      const proceed = await root.MemorizedTransactionSelector.reviewApply(plan);
      if (!proceed) return { status: 'cancelled', message: 'Apply cancelled. Nothing was changed.', droppedTransactions };
    }

    const result = await root.PageAdapter.populate(
      selected,
      () => String(selected.paymentTypeId) === '0'
        ? root.PageBridgeClient.createTransferSplitRow()
        : root.PageBridgeClient.createSplitEntry('0')
    );
    if (result.warnings.length) {
      const message = String(selected.paymentTypeId) === '0'
        ? `Applied “${selected.payee}”. Review the transfer account and any lines that need manual entry, then save when ready.`
        : `Applied “${selected.payee}”. Review the Notes for the lines that need manual entry, then save when ready.`;
      return { status: 'applied-with-notes', message, warnings: result.warnings, droppedTransactions };
    }
    const message = `Applied “${selected.payee}”. Review the transaction and save it in ChurchTrac when ready.`;
    return { status: 'applied', message, result, droppedTransactions };
  }
  root.MemorizedTransactionOrchestrator = Object.freeze({ run });
})(globalThis);
