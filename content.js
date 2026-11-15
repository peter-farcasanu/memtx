
'use strict';

/**
 * Content Script Entry Point
 *
 * Responsible for initializing and coordinating
 * functionality implemented in the modules directory.
 *
 * Handles popup requests and coordinates memorizing or applying a transaction.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'MEMORIZED_TRANSACTIONS_ACTION') return;
  globalThis.MemorizedTransactionOrchestrator.run()
    .then(result => {
      const droppedReport = result.droppedTransactions?.length
        ? `Dropped ${result.droppedTransactions.length} invalid transaction(s) from config:\n${result.droppedTransactions.map(item => `• “${item.label}” — ${item.reason}`).join('\n')}`
        : '';
      if (result.status === 'memorized') {
        globalThis.MemorizedTransactionSelector.notifyMemorized(result.payee);
        if (droppedReport) setTimeout(() => globalThis.MemorizedTransactionSelector.toast(droppedReport, { error: true, duration: 6000 }), 2050);
      } else if (!['simulation', 'cancelled'].includes(result.status)) {
        globalThis.MemorizedTransactionSelector.toast(
          [result.message, droppedReport].filter(Boolean).join(' '),
          {
            error: result.status === 'error' || result.status === 'warning' || Boolean(droppedReport),
            duration: droppedReport ? 6000 : (result.status === 'ignored' || result.status === 'duplicate' ? 2000 : 3000)
          }
        );
      }
      sendResponse(result);
    })
    .catch(error => {
      const messageText = error?.message || 'The transaction action could not be completed.';
      globalThis.MemorizedTransactionSelector.toast(messageText, { error: true, duration: 3500 });
      sendResponse({ status: 'error', message: messageText });
    });
  return true;
});
