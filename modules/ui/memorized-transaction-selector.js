'use strict';
(function (root) {
  function summarizedValues(lines, idKey, labelKey) {
    const unique = new Map();
    lines.forEach(line => {
      const id = String(line[idKey]);
      if (!unique.has(id)) unique.set(id, line[labelKey] || `${idKey === 'categoryId' ? 'Category' : 'Fund'} ${id}`);
    });
    const values = [...unique.values()];
    if (!values.length) return '';
    return `${values[0]}${values.length > 1 ? ` +${values.length - 1}` : ''}`;
  }

  function choose(transactions, onRemove) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:#0008;z-index:2147483647;display:grid;place-items:center;font:14px system-ui';
      const panel = document.createElement('section');
      panel.style.cssText = 'background:white;color:#222;padding:22px;border-radius:10px;max-width:1000px;width:calc(100% - 36px);max-height:82vh;overflow:auto;box-shadow:0 12px 40px #0005';
      const heading = document.createElement('h2'); heading.textContent = 'MemTx Transactions'; heading.style.margin = '0 0 16px'; panel.append(heading);
      const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.style.cssText = 'min-height:1.4em;margin:8px 0;color:#555';
      const scroller = document.createElement('div'); scroller.style.cssText = 'max-height:min(620px,55vh);overflow:auto;border:1px solid #e1e5e9;border-radius:6px';
      const table = document.createElement('table'); table.style.cssText = 'width:100%;border-collapse:collapse;text-align:left;table-layout:fixed';
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      ['Payee', 'Category / account', 'Fund', 'Transaction type', 'Amount', ''].forEach((text, index) => {
        const widths = ['23%', '23%', '19%', '15%', '10%', '10%'];
        const cell = document.createElement('th'); cell.textContent = text; cell.style.cssText = `position:sticky;top:0;z-index:1;background:#fff;width:${widths[index]};padding:10px 8px;border-bottom:2px solid #d8dde2;white-space:nowrap`; headRow.append(cell);
      });
      head.append(headRow);
      const body = document.createElement('tbody');
      table.append(head, body);
      const empty = document.createElement('p'); empty.textContent = 'No MemTx entries. Memorize an entered transaction first.'; empty.hidden = true;
      let activeRemoveDialog = null;
      const onKeyDown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        if (activeRemoveDialog) {
          const returnFocus = activeRemoveDialog._returnFocus;
          activeRemoveDialog.remove();
          activeRemoveDialog = null;
          returnFocus?.focus();
          return;
        }
        finish(null);
      };
      const finish = value => {
        window.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        resolve(value);
      };

      let items = [...transactions].sort((left, right) =>
        left.payee.localeCompare(right.payee, undefined, { sensitivity: 'base' })
      );
      function renderRows() {
        body.replaceChildren();
        table.hidden = items.length === 0;
        scroller.hidden = items.length === 0;
        empty.hidden = items.length !== 0;
        items.forEach(transaction => {
          const row = document.createElement('tr');
          const payeeCell = document.createElement('td'); payeeCell.style.cssText = 'padding:9px 8px;border-bottom:1px solid #e8ebee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
          const select = document.createElement('button'); select.type = 'button'; select.textContent = transaction.payee;
          select.style.cssText = 'border:0;background:none;padding:0;color:#1769aa;text-decoration:underline;cursor:pointer;font:inherit;text-align:left';
          select.addEventListener('click', () => finish(transaction)); payeeCell.append(select);
          row.append(payeeCell);

          [transaction.paymentTypeId === '0'
            ? (transaction.transferDirection === '1'
              ? `${transaction.targetAccountLabel} → ${transaction.sourceAccountLabel}`
              : `${transaction.sourceAccountLabel} → ${transaction.targetAccountLabel}`)
            : summarizedValues(transaction.lines, 'categoryId', 'categoryLabel'), summarizedValues(transaction.lines, 'fundId', 'fundLabel')].forEach(value => {
            const cell = document.createElement('td'); cell.textContent = value; cell.title = value; cell.style.cssText = 'padding:9px 8px;border-bottom:1px solid #e8ebee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; row.append(cell);
          });

          const typeCell = document.createElement('td'); typeCell.textContent = transaction.paymentTypeId === '0' ? 'Transfer' : transaction.paymentTypeId === '1' ? 'Income' : 'Expense'; typeCell.style.cssText = 'padding:9px 8px;border-bottom:1px solid #e8ebee;white-space:nowrap'; row.append(typeCell);
          const amountCell = document.createElement('td'); amountCell.textContent = `$${root.MoneyUtils.fromCents(transaction.totalCents)}`; amountCell.style.cssText = 'padding:9px 8px;border-bottom:1px solid #e8ebee;white-space:nowrap'; row.append(amountCell);

          const removeCell = document.createElement('td'); removeCell.style.cssText = 'padding:9px 8px;border-bottom:1px solid #e8ebee;text-align:right;white-space:nowrap';
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.style.cssText = 'padding:5px 9px;cursor:pointer';
          remove.addEventListener('click', () => {
            activeRemoveDialog?.remove();
            const confirmOverlay = document.createElement('div');
            confirmOverlay.id = 'memtx-remove-confirmation';
            confirmOverlay._returnFocus = remove;
            confirmOverlay.style.cssText = 'position:fixed;inset:0;z-index:1;background:#0006;display:grid;place-items:center;padding:16px;box-sizing:border-box';
            const confirmPanel = document.createElement('section');
            confirmPanel.setAttribute('role', 'dialog');
            confirmPanel.setAttribute('aria-modal', 'true');
            confirmPanel.setAttribute('aria-labelledby', 'memtx-remove-title');
            confirmPanel.style.cssText = 'width:min(400px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;background:#fff;color:#222;padding:20px;border-radius:10px;box-shadow:0 12px 40px #0005';
            const confirmTitle = document.createElement('h3');
            confirmTitle.id = 'memtx-remove-title';
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
              confirmOverlay.remove();
              if (activeRemoveDialog === confirmOverlay) activeRemoveDialog = null;
              remove.focus();
            };
            cancel.addEventListener('click', closeConfirmation);
            confirmOverlay.addEventListener('click', event => { if (event.target === confirmOverlay) closeConfirmation(); });
            confirm.addEventListener('click', async () => {
              confirm.disabled = true; cancel.disabled = true; status.textContent = `Removing “${transaction.payee}”…`;
              try {
                await onRemove(transaction);
                items = items.filter(item => item.id !== transaction.id);
                status.textContent = `Removed “${transaction.payee}”.`;
                confirmOverlay.remove();
                activeRemoveDialog = null;
                renderRows();
              } catch (error) {
                status.textContent = error?.message || 'Could not remove the memorized transaction.';
                confirmOverlay.remove();
                activeRemoveDialog = null;
                renderRows();
              }
            });
            buttons.append(cancel, confirm);
            confirmPanel.append(confirmTitle, prompt, buttons);
            confirmOverlay.append(confirmPanel);
            overlay.append(confirmOverlay);
            activeRemoveDialog = confirmOverlay;
            confirm.focus();
          });
          removeCell.append(remove); row.append(removeCell);
          body.append(row);
        });
      }

      renderRows();
      const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Done'; close.style.cssText = 'margin-top:14px;padding:7px 12px;cursor:pointer'; close.addEventListener('click', () => finish(null));
      overlay.addEventListener('click', event => { if (event.target === overlay) finish(null); });
      scroller.append(table);
      panel.append(scroller, empty, status, close); overlay.append(panel); document.documentElement.append(overlay);
      window.addEventListener('keydown', onKeyDown, true);
    });
  }

  function reviewApply(plan, { simulation = false } = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:#0008;z-index:2147483647;display:grid;place-items:center;padding:18px;box-sizing:border-box;font:14px system-ui';
      const panel = document.createElement('section');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'memtx-review-title');
      panel.style.cssText = 'background:white;color:#222;padding:20px;border-radius:10px;max-width:760px;width:100%;max-height:86vh;overflow:auto;box-shadow:0 12px 40px #0005';
      const title = document.createElement('h2');
      title.id = 'memtx-review-title';
      title.textContent = `${simulation ? 'Would apply' : 'Ready to apply'} “${plan.payee}” as ${plan.paymentType}, total ${plan.total}.`;
      panel.append(title);
      if (simulation) {
        const simulationLabel = document.createElement('p');
        simulationLabel.textContent = 'Simulation only. No changes will be made.';
        simulationLabel.style.cssText = 'margin:0 0 14px;color:#59636e';
        panel.append(simulationLabel);
      }
      if (plan.reference) {
        const reference = document.createElement('p');
        reference.textContent = `Reference: ${plan.reference}`;
        reference.style.cssText = 'margin:0 0 12px;color:#59636e';
        panel.append(reference);
      }

      const scroller = document.createElement('div');
      scroller.style.cssText = 'max-height:42vh;overflow:auto;border:1px solid #e1e5e9;border-radius:6px';
      const list = document.createElement('ol');
      list.style.cssText = 'margin:0;padding:0;list-style:none';
      plan.lines.forEach((line, index) => {
        const item = document.createElement('li');
        item.style.cssText = `display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px;padding:9px 11px;${index ? 'border-top:1px solid #e8ebee;' : ''}`;
        const number = document.createElement('span'); number.textContent = `${index + 1}.`; number.style.color = '#65717d';
        const details = document.createElement('div');
        const category = document.createElement('div'); category.textContent = line.category; category.style.cssText = 'font-weight:600;overflow-wrap:anywhere';
        const fund = document.createElement('div'); fund.textContent = line.fund; fund.style.cssText = 'font-size:13px;color:#59636e;margin-top:2px';
        details.append(category, fund);
        if (line.note) {
          const note = document.createElement('div'); note.textContent = `Note: ${line.note}`; note.style.cssText = 'font-size:12px;color:#59636e;margin-top:3px'; details.append(note);
        }
        const amount = document.createElement('strong'); amount.textContent = line.amount; amount.style.whiteSpace = 'nowrap';
        item.append(number, details, amount);
        list.append(item);
      });
      scroller.append(list); panel.append(scroller);

      if (plan.actions?.length) {
        const heading = document.createElement('h3');
        heading.textContent = 'Please enter';
        heading.style.cssText = 'color:#a12622;margin:16px 0 6px';
        panel.append(heading);
        const actionsList = document.createElement('ol');
        actionsList.setAttribute('role', 'alert');
        actionsList.style.cssText = 'color:#a12622;margin:0;padding-left:23px';
        plan.actions.forEach(message => {
          const item = document.createElement('li'); item.textContent = message; item.style.margin = '3px 0'; actionsList.append(item);
        });
        panel.append(actionsList);
        const explanation = document.createElement('p');
        explanation.textContent = plan.isAccountTransfer
          ? (simulation
            ? 'In simulation, no fields are changed. If applied, choose any unavailable target account or fund and enter amounts left blank.'
            : 'Choose any unavailable target account or fund and enter amounts left blank before saving.')
          : (simulation
            ? 'In simulation, no fields are changed. If applied, MemTx would leave failed-line amounts blank and put them in Notes.'
            : 'MemTx has not filled out amounts on the lines that failed validation. You will find them in the notes section.');
        explanation.style.cssText = 'margin:8px 0 0;color:#333';
        panel.append(explanation);
      } else if (plan.warnings.length) {
        const note = document.createElement('p');
        note.textContent = plan.warnings.join(' ');
        note.style.cssText = 'margin:12px 0 0;color:#59636e';
        panel.append(note);
      }

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = simulation ? 'Close' : 'Cancel';
      cancel.style.cssText = 'padding:8px 12px;cursor:pointer';
      const finish = value => {
        window.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        resolve(value);
      };
      const onKeyDown = event => {
        if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      };
      cancel.addEventListener('click', () => finish(false));
      actions.append(cancel);
      if (!simulation && plan.warnings.length) {
        const proceed = document.createElement('button');
        proceed.type = 'button';
        proceed.textContent = plan.actions?.length ? 'Apply available lines' : 'Continue';
        proceed.style.cssText = 'padding:8px 12px;cursor:pointer;background:#8d2525;color:white;border:0;border-radius:4px';
        proceed.addEventListener('click', () => finish(true));
        actions.append(proceed);
      }
      panel.append(actions);
      overlay.addEventListener('click', event => { if (event.target === overlay) finish(false); });
      overlay.append(panel);
      document.documentElement.append(overlay);
      window.addEventListener('keydown', onKeyDown, true);
      (plan.warnings.length && !simulation ? actions.querySelector('button:last-child') : cancel).focus();
    });
  }

  function toast(message, { camera = false, error = false, duration = 2500 } = {}) {
    const previous = document.getElementById('memorized-transactions-toast');
    previous?._toastCleanup?.();
    previous?.remove();
    const node = document.createElement('div');
    node.id = 'memorized-transactions-toast';
    node.setAttribute('role', error ? 'alert' : 'status');
    if (error) node.title = 'Click outside or press Escape to dismiss.';
    node.style.cssText = `position:fixed;top:20px;right:20px;z-index:2147483647;display:flex;align-items:center;gap:11px;max-width:min(520px,calc(100vw - 40px));padding:13px 17px;border-radius:12px;background:${error ? '#8d2525' : '#19232d'};color:#fff;font:500 14px/1.4 system-ui,sans-serif;white-space:pre-line;box-shadow:0 8px 30px #0004;opacity:0;transform:translateY(-8px);pointer-events:${error ? 'auto' : 'none'};${error ? 'cursor:default' : ''}`;
    if (camera) {
      node.innerHTML = '<svg width="30" height="25" viewBox="0 0 30 25" aria-hidden="true" style="flex:none"><path d="M3 6h5l2-3h8l2 3h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="none" stroke="white" stroke-width="1.8"/><circle cx="15" cy="13.5" r="6" fill="none" stroke="white" stroke-width="1.8"/><path d="M15 7.5 17 12l4-2-2 4 3 3-5-.5-2 4-1-4.5-4-1.5 4-2Z" fill="white" style="transform-origin:15px 13.5px;animation:mt-shutter .38s ease-out"/></svg>';
    } else {
      node.style.paddingLeft = '17px';
    }
    const label = document.createElement('span'); label.textContent = message; node.append(label);
    document.documentElement.append(node);
    if (error) {
      const cleanup = () => {
        document.removeEventListener('pointerdown', onOutsideClick, true);
        window.removeEventListener('keydown', onEscape, true);
      };
      const dismiss = () => { cleanup(); node.remove(); };
      const onOutsideClick = event => { if (!node.contains(event.target)) dismiss(); };
      const onEscape = event => { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } };
      node._toastCleanup = cleanup;
      document.addEventListener('pointerdown', onOutsideClick, true);
      window.addEventListener('keydown', onEscape, true);
      node.animate([
        { opacity: 0, transform: 'translateY(-8px) scale(.98)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration: 180, easing: 'ease-out', fill: 'forwards' });
    } else {
      node.animate([
        { opacity: 0, transform: 'translateY(-8px) scale(.98)' },
        { opacity: 1, transform: 'translateY(0) scale(1)', offset: .18 },
        { opacity: 1, transform: 'translateY(0) scale(1)', offset: .82 },
        { opacity: 0, transform: 'translateY(-4px) scale(.99)' }
      ], { duration, easing: 'ease-out' }).onfinish = () => node.remove();
    }
    if (camera) {
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#fff;opacity:0;pointer-events:none';
      document.documentElement.append(flash);
      flash.animate([{ opacity: 0 }, { opacity: .22, offset: .08 }, { opacity: 0 }], { duration: 280, easing: 'ease-out' }).onfinish = () => flash.remove();
    }
    return node;
  }

  function notifyMemorized(payee) {
    const toastNode = toast(`Memorized “${payee}”`, { camera: true, duration: 2000 });
    const transactionView = document.querySelector('#transaction-view');
    const bounds = transactionView?.getBoundingClientRect();
    const width = Math.min(440, Math.max(300, window.innerWidth * .58));
    const height = 270;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, bounds ? bounds.left + (bounds.width - width) / 2 : (window.innerWidth - width) / 2));
    const top = Math.max(56, Math.min(window.innerHeight - height - 12, bounds ? bounds.top + Math.min(bounds.height / 2, 160) : (window.innerHeight - height) / 2));
    const card = document.createElement('div');
    card.setAttribute('aria-hidden', 'true');
    card.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${width}px;height:${height}px;z-index:2147483646;overflow:hidden;border:1px solid #d8dde2;border-radius:10px;background:#fff;box-shadow:0 18px 55px #0005;transform-origin:top left;filter:blur(.7px);pointer-events:none`;
    card.innerHTML = '<div style="height:44px;background:#f4f6f8;border-bottom:1px solid #e1e5e9;padding:13px 18px;box-sizing:border-box;color:#43505c;font:600 14px system-ui">Transaction</div><div style="padding:15px 18px;font:12px system-ui;color:#66727d"><div style="display:flex;gap:12px;margin-bottom:16px"><div style="width:42%;height:30px;border-radius:4px;background:#edf0f3"></div><div style="flex:1;height:30px;border-radius:4px;background:#edf0f3"></div></div><div style="display:grid;grid-template-columns:1.4fr 1fr .65fr .8fr;gap:8px;margin-bottom:8px;color:#64717d"><span>Category</span><span>Fund</span><span>Amount</span><span>Note</span></div><div style="height:1px;background:#e3e7eb;margin-bottom:9px"></div><div style="display:grid;grid-template-columns:1.4fr 1fr .65fr .8fr;gap:8px;margin:10px 0"><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i></div><div style="display:grid;grid-template-columns:1.4fr 1fr .65fr .8fr;gap:8px;margin:10px 0"><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i></div><div style="display:grid;grid-template-columns:1.4fr 1fr .65fr .8fr;gap:8px;margin:10px 0"><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i><i style="height:25px;border-radius:4px;background:#f1f3f5"></i></div><div style="margin:15px 0 0 auto;width:36%;height:34px;border-radius:4px;background:#e9edf1"></div></div>';
    document.documentElement.append(card);
    const target = toastNode.getBoundingClientRect();
    const scale = Math.min(30 / width, 23 / height);
    const targetX = target.left + 13;
    const targetY = target.top + (target.height - height * scale) / 2;
    card.animate([
      { transform: 'translate(0,0) scale(1)', filter: 'blur(.7px)', opacity: .98 },
      { transform: `translate(${targetX - left}px,${targetY - top}px) scale(${scale})`, filter: 'blur(2px)', opacity: .22 }
    ], { duration: 850, easing: 'cubic-bezier(.2,.72,.25,1)', fill: 'forwards' }).onfinish = () => card.remove();
  }

  root.MemorizedTransactionSelector = Object.freeze({ choose, reviewApply, toast, notifyMemorized });
})(globalThis);
