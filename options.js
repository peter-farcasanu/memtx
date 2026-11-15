'use strict';

let currentConfig;
const status = document.getElementById('status');
const gridRoot = document.getElementById('memorized-grid');

async function loadConfig() {
  const stored = await chrome.storage.local.get('memorizedConfig');
  let config;
  if (stored.memorizedConfig) config = ConfigValidator.validate(stored.memorizedConfig);
  else config = ConfigValidator.validate({ version: 1, simulationMode: true, memorizedTransactions: [] });
  const hasLegacySplits = Object.prototype.hasOwnProperty.call(stored.memorizedConfig || {}, 'splits');
  if (config.droppedTransactions.length || hasLegacySplits) await chrome.storage.local.set({ memorizedConfig: ConfigValidator.serialize(config) });
  return config;
}

function portableConfig() {
  return ConfigValidator.serialize(currentConfig);
}

function setStatusWithDropped(message, transactions) {
  status.replaceChildren();
  const summary = document.createElement('span');
  summary.textContent = message;
  status.append(summary);
  if (transactions?.length) {
    const list = document.createElement('ul');
    transactions.forEach(item => {
      const row = document.createElement('li');
      row.textContent = `“${item.label}” — ${item.reason}`;
      list.append(row);
    });
    status.append(list);
  }
}

async function storeConfig() {
  currentConfig = ConfigValidator.validate(portableConfig());
  await chrome.storage.local.set({ memorizedConfig: portableConfig() });
}

function downloadConfig() {
  const blob = new Blob([JSON.stringify(portableConfig(), null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'memtx-config.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function summarizeLines(lines, idKey, labelKey) {
  const unique = new Map();
  lines.forEach(line => {
    const id = String(line[idKey]);
    if (!unique.has(id)) unique.set(id, line[labelKey] || `${idKey === 'categoryId' ? 'Category' : 'Fund'} ${id}`);
  });
  const values = [...unique.values()];
  return values.length ? `${values[0]}${values.length > 1 ? ` +${values.length - 1}` : ''}` : '';
}

function renderGrid() {
  gridRoot.replaceChildren();
  const transactions = [...(currentConfig?.memorizedTransactions || [])].sort((left, right) =>
    left.payee.localeCompare(right.payee, undefined, { sensitivity: 'base' })
  );
  if (!transactions.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No MemTx entries yet.';
    gridRoot.append(empty);
    return;
  }

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;text-align:left;table-layout:fixed';
  const scroller = document.createElement('div');
  scroller.style.cssText = 'max-height:620px;overflow:auto;border:1px solid #e1e5e9;border-radius:6px;margin:12px 0 24px';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Payee', 'Category / account', 'Fund', 'Transaction type', 'Amount', ''].forEach((text, index) => {
    const widths = ['23%', '23%', '19%', '15%', '10%', '10%'];
    const cell = document.createElement('th'); cell.textContent = text;
    cell.style.cssText = `position:sticky;top:0;z-index:1;background:#fff;width:${widths[index]};padding:10px 8px;border-bottom:2px solid #d8dde2;white-space:nowrap`; headRow.append(cell);
  });
  head.append(headRow);
  const body = document.createElement('tbody');

  transactions.forEach(transaction => {
    const row = document.createElement('tr');
    const values = [
      transaction.payee,
      transaction.paymentTypeId === '0'
        ? (transaction.transferDirection === '1'
          ? `${transaction.targetAccountLabel} → ${transaction.sourceAccountLabel}`
          : `${transaction.sourceAccountLabel} → ${transaction.targetAccountLabel}`)
        : summarizeLines(transaction.lines, 'categoryId', 'categoryLabel'),
      summarizeLines(transaction.lines, 'fundId', 'fundLabel'),
      transaction.paymentTypeId === '0' ? 'Transfer' : transaction.paymentTypeId === '1' ? 'Income' : 'Expense',
      `$${MoneyUtils.fromCents(transaction.totalCents)}`
    ];
    values.forEach((value, index) => {
      const cell = document.createElement('td'); cell.textContent = value;
      cell.title = index === 1 || index === 2 ? value : '';
      cell.style.cssText = 'padding:9px 8px;border-bottom:1px solid #e8ebee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      row.append(cell);
    });

    const removeCell = document.createElement('td');
    removeCell.style.cssText = 'padding:9px 8px;border-bottom:1px solid #e8ebee;text-align:right;white-space:nowrap';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.style.cssText = 'padding:5px 9px;cursor:pointer';
    remove.addEventListener('click', () => {
      if (document.getElementById('memtx-options-remove-confirmation')) return;
      const confirmOverlay = document.createElement('div');
      confirmOverlay.id = 'memtx-options-remove-confirmation';
      confirmOverlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0006;display:grid;place-items:center;padding:16px;box-sizing:border-box';
      const confirmPanel = document.createElement('section');
      confirmPanel.setAttribute('role', 'dialog');
      confirmPanel.setAttribute('aria-modal', 'true');
      confirmPanel.setAttribute('aria-labelledby', 'memtx-options-remove-title');
      confirmPanel.style.cssText = 'width:min(400px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;background:#fff;color:#222;padding:20px;border-radius:10px;box-shadow:0 12px 40px #0005';
      const confirmTitle = document.createElement('h3');
      confirmTitle.id = 'memtx-options-remove-title';
      confirmTitle.textContent = 'Remove MemTx entry?';
      confirmTitle.style.margin = '0 0 8px';
      const prompt = document.createElement('p');
      prompt.textContent = `Remove “${transaction.payee}” from MemTx?`;
      prompt.style.margin = '0';
      const buttons = document.createElement('div');
      buttons.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:18px';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'No'; cancel.style.cssText = 'padding:7px 12px;cursor:pointer';
      const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = 'Yes, remove'; confirm.style.cssText = 'padding:7px 12px;cursor:pointer;background:#8d2525;color:white;border:0;border-radius:4px';
      const closeConfirmation = () => {
        document.removeEventListener('keydown', onKeyDown, true);
        confirmOverlay.remove();
        remove.focus();
      };
      const onKeyDown = event => {
        if (event.key === 'Escape') { event.preventDefault(); closeConfirmation(); }
      };
      cancel.addEventListener('click', closeConfirmation);
      confirmOverlay.addEventListener('click', event => { if (event.target === confirmOverlay) closeConfirmation(); });
      confirm.addEventListener('click', async () => {
        confirm.disabled = true; cancel.disabled = true; status.textContent = `Removing “${transaction.payee}”…`;
        try {
          const remaining = currentConfig.memorizedTransactions.filter(item => item.id !== transaction.id);
          if (remaining.length === currentConfig.memorizedTransactions.length) throw new Error('This memorized transaction no longer exists.');
          currentConfig = ConfigValidator.validate({ ...portableConfig(), memorizedTransactions: remaining });
          await storeConfig();
          document.removeEventListener('keydown', onKeyDown, true);
          confirmOverlay.remove();
          renderGrid();
          status.textContent = `Removed “${transaction.payee}”. Export the config to update your portable copy.`;
        } catch (error) {
          document.removeEventListener('keydown', onKeyDown, true);
          confirmOverlay.remove();
          status.textContent = error.message || 'Could not remove the memorized transaction.';
          renderGrid();
        }
      });
      buttons.append(cancel, confirm);
      confirmPanel.append(confirmTitle, prompt, buttons);
      confirmOverlay.append(confirmPanel);
      document.body.append(confirmOverlay);
      document.addEventListener('keydown', onKeyDown, true);
      confirm.focus();
    });
    removeCell.append(remove); row.append(removeCell); body.append(row);
  });

  table.append(head, body);
  scroller.append(table);
  gridRoot.append(scroller);
}

async function initialize() {
  try {
    currentConfig = await loadConfig();
    document.getElementById('simulation').checked = currentConfig.simulationMode;
    renderGrid();
    const count = currentConfig.memorizedTransactions.length;
    const prefix = `${count} MemTx ${count === 1 ? 'entry' : 'entries'} loaded.`;
    if (currentConfig.droppedTransactions.length) setStatusWithDropped(`${prefix} Dropped ${currentConfig.droppedTransactions.length} invalid transaction(s) from the config:`, currentConfig.droppedTransactions);
    else status.textContent = prefix;
  } catch (error) {
    status.textContent = error.message || 'Config could not be loaded.';
  }
}

document.getElementById('config-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    currentConfig = ConfigValidator.validate(parsed);
    await chrome.storage.local.set({ memorizedConfig: portableConfig() });
    document.getElementById('simulation').checked = currentConfig.simulationMode;
    renderGrid();
    const count = currentConfig.memorizedTransactions.length;
    const prefix = `Imported ${count} MemTx ${count === 1 ? 'entry' : 'entries'}.`;
    if (currentConfig.droppedTransactions.length) setStatusWithDropped(`${prefix} Dropped ${currentConfig.droppedTransactions.length} invalid transaction(s) from the config:`, currentConfig.droppedTransactions);
    else status.textContent = prefix;
  } catch (error) {
    status.textContent = error.message || 'Config file is invalid.';
  } finally {
    event.target.value = '';
  }
});

document.getElementById('load').addEventListener('click', () => {
  document.getElementById('config-file').click();
});

let modeSaveQueue = Promise.resolve();
document.getElementById('simulation').addEventListener('change', event => {
  const requestedMode = event.target.checked;
  modeSaveQueue = modeSaveQueue.then(async () => {
    const previousConfig = currentConfig;
    try {
      currentConfig = ConfigValidator.validate({
        ...ConfigValidator.serialize(previousConfig),
        simulationMode: requestedMode
      });
      await storeConfig();
      status.textContent = `Simulation mode ${currentConfig.simulationMode ? 'on' : 'off'} is active.`;
    } catch (error) {
      currentConfig = previousConfig;
      document.getElementById('simulation').checked = previousConfig?.simulationMode ?? true;
      status.textContent = error.message || 'Could not save the setting.';
    }
  });
});

document.getElementById('export').addEventListener('click', () => {
  if (!currentConfig) return;
  downloadConfig();
  status.textContent = 'Portable config exported.';
});

initialize();
