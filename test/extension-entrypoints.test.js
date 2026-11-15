'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, loadIntoWindow } = require('./helpers/load-extension-module.js');

test('content script handles only the extension action and returns results', async () => {
  const dom = createDom();
  let messageListener;
  const toastCalls = [];
  const notifications = [];
  dom.window.chrome = { runtime: { onMessage: { addListener(listener) { messageListener = listener; } } } };
  dom.window.MemorizedTransactionOrchestrator = { async run() { return { status: 'applied', message: 'Applied.' }; } };
  dom.window.MemorizedTransactionSelector = {
    toast: (...args) => toastCalls.push(args),
    notifyMemorized: payee => notifications.push(payee)
  };
  loadIntoWindow(dom.window, 'content.js');
  assert.equal(messageListener({ type: 'OTHER' }, {}, () => {}), undefined);
  let response;
  assert.equal(messageListener({ type: 'MEMORIZED_TRANSACTIONS_ACTION' }, {}, value => { response = value; }), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(response.status, 'applied');
  assert.equal(toastCalls[0][0], 'Applied.');
  dom.window.close();
});

test('content script reports action failures as persistent errors', async () => {
  const dom = createDom();
  let messageListener;
  const toastCalls = [];
  dom.window.chrome = { runtime: { onMessage: { addListener(listener) { messageListener = listener; } } } };
  dom.window.MemorizedTransactionOrchestrator = { async run() { throw new Error('Could not apply.'); } };
  dom.window.MemorizedTransactionSelector = { toast: (...args) => toastCalls.push(args) };
  loadIntoWindow(dom.window, 'content.js');
  let response;
  messageListener({ type: 'MEMORIZED_TRANSACTIONS_ACTION' }, {}, value => { response = value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(response.status, 'error');
  assert.equal(toastCalls[0][0], 'Could not apply.');
  assert.equal(toastCalls[0][1].error, true);
  assert.equal(toastCalls[0][1].duration, 3500);
  dom.window.close();
});

test('does not add a redundant toast after the simulation preview dialog closes', async () => {
  const dom = createDom();
  let messageListener;
  const toastCalls = [];
  dom.window.chrome = { runtime: { onMessage: { addListener(listener) { messageListener = listener; } } } };
  dom.window.MemorizedTransactionOrchestrator = { async run() { return { status: 'simulation', message: 'Preview shown.' }; } };
  dom.window.MemorizedTransactionSelector = { toast: (...args) => toastCalls.push(args) };
  loadIntoWindow(dom.window, 'content.js');
  messageListener({ type: 'MEMORIZED_TRANSACTIONS_ACTION' }, {}, () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(toastCalls.length, 0);
  dom.window.close();
});

test('service worker forwards extension clicks to the matching tab', async () => {
  const dom = createDom();
  let clickListener;
  const messages = [];
  dom.window.chrome = {
    action: { onClicked: { addListener(listener) { clickListener = listener; } } },
    tabs: { sendMessage: async (...args) => messages.push(args) }
  };
  loadIntoWindow(dom.window, 'background.js');
  clickListener({ id: 17 });
  clickListener({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.length, 1);
  assert.equal(messages[0][0], 17);
  assert.equal(messages[0][1].type, 'MEMORIZED_TRANSACTIONS_ACTION');
  dom.window.close();
});
