'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, loadIntoWindow } = require('./helpers/load-extension-module.js');

function requestResult(window, request) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('bridge response timed out')), 250);
    const listener = event => {
      if (event.data?.type !== `${request.type}_RESULT` || event.data?.requestId !== request.requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', listener);
      resolve(event.data);
    };
    window.addEventListener('message', listener);
    window.postMessage(request, window.location.origin);
  });
}

test('page bridge creates split rows only through the approved accounting call', async () => {
  const dom = createDom();
  dom.window.postMessage = data => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, source: dom.window, origin: dom.window.location.origin }));
  const calls = [];
  const forbiddenCalls = [];
  dom.window.accounting = {
    addSplitEntry: id => calls.push(id),
    saveTransactionLines: () => forbiddenCalls.push('save'),
    cancelEditLines: () => forbiddenCalls.push('cancel')
  };
  loadIntoWindow(dom.window, 'modules/splitting/page-bridge.js');
  const request = { channel: 'CTES_SPLIT_BRIDGE', version: 1, type: 'CREATE_SPLIT_ENTRY', requestId: 'request-1', transactionId: '0' };
  const response = await requestResult(dom.window, request);
  assert.equal(response.success, true);
  assert.deepEqual(calls, ['0']);
  assert.deepEqual(forbiddenCalls, []);
  dom.window.close();
});

test('page bridge creates account transfer rows without exposing save or cancel operations', async () => {
  const dom = createDom();
  dom.window.postMessage = data => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, source: dom.window, origin: dom.window.location.origin }));
  const calls = [];
  const forbiddenCalls = [];
  dom.window.accounting = {
    addTransferSplitRow: () => calls.push('transfer-row'),
    saveTransactionLines: () => forbiddenCalls.push('save'),
    cancelEditLines: () => forbiddenCalls.push('cancel')
  };
  loadIntoWindow(dom.window, 'modules/splitting/page-bridge.js');
  const response = await requestResult(dom.window, {
    channel: 'CTES_SPLIT_BRIDGE', version: 1, type: 'CREATE_TRANSFER_SPLIT_ROW', requestId: 'transfer-request'
  });
  assert.equal(response.success, true);
  assert.deepEqual(calls, ['transfer-row']);
  assert.deepEqual(forbiddenCalls, []);
  dom.window.close();
});

test('page bridge validates transaction ids and reports missing page functions', async () => {
  const dom = createDom();
  dom.window.postMessage = data => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, source: dom.window, origin: dom.window.location.origin }));
  dom.window.accounting = { addSplitEntry: () => { throw new Error('Page refused split'); } };
  loadIntoWindow(dom.window, 'modules/splitting/page-bridge.js');
  let response = await requestResult(dom.window, { channel: 'CTES_SPLIT_BRIDGE', version: 1, type: 'CREATE_SPLIT_ENTRY', requestId: 'bad-id', transactionId: 'not-an-id' });
  assert.equal(response.success, false);
  assert.match(response.error, /Invalid transaction ID/);
  response = await requestResult(dom.window, { channel: 'CTES_SPLIT_BRIDGE', version: 1, type: 'CREATE_SPLIT_ENTRY', requestId: 'page-error', transactionId: '' });
  assert.equal(response.success, false);
  assert.equal(response.error, 'Page refused split');
  dom.window.close();
});

test('bridge client rejects invalid ids before injection and resolves page responses', async () => {
  const dom = createDom();
  dom.window.postMessage = data => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, source: dom.window, origin: dom.window.location.origin }));
  dom.window.crypto.randomUUID = () => 'client-request';
  dom.window.chrome = { runtime: { getURL: path => `extension://${path}` } };
  dom.window.accounting = { addSplitEntry() {}, addTransferSplitRow() {} };
  loadIntoWindow(dom.window, 'modules/splitting/page-bridge.js');
  const originalAppend = dom.window.document.head.appendChild.bind(dom.window.document.head);
  dom.window.document.head.appendChild = script => {
    const result = originalAppend(script);
    if (script.tagName === 'SCRIPT') dom.window.setTimeout(() => script.onload?.(), 0);
    return result;
  };
  loadIntoWindow(dom.window, 'modules/splitting/page-bridge-client.js');
  await assert.rejects(dom.window.PageBridgeClient.createSplitEntry('bad/id'), /Invalid transaction ID/);
  assert.equal(await dom.window.PageBridgeClient.createSplitEntry('0'), true);
  assert.equal(await dom.window.PageBridgeClient.createTransferSplitRow(), true);
  dom.window.close();
});
