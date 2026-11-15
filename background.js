
'use strict';

// MemTx service worker entry point.

chrome.action.onClicked.addListener(tab => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'MEMORIZED_TRANSACTIONS_ACTION' }).catch(() => {});
});
