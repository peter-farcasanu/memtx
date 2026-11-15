# MemTx

An independent Chrome extension for memorizing and applying transactions in compatible accounting software.

## Install in Chrome

1. Download or clone this project into a folder on your computer. Keep the folder in place after loading it in Chrome.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this project folder—the folder with `manifest.json` at its top level. Do not select `test`.
5. Confirm that MemTx appears in the extensions list. Pin its icon from Chrome’s Extensions menu if you want quick access.
6. Open the supported accounting software in Chrome and sign in. MemTx currently runs on pages at `churchtrac.com` and `www.churchtrac.com`. Open an existing manual expense, deposit, or account-to-account transfer and click the MemTx toolbar icon to memorize it. To apply a saved transaction, open a blank **New Transaction** dialog and click the icon.
7. Simulation mode is on by default. Applying a saved transaction shows a preview without filling the form. To allow MemTx to fill the form, open `chrome://extensions`, select **Details** for MemTx, choose **Extension options**, and turn off simulation mode. Review all fields; MemTx does not save the transaction.

After changing extension files, click MemTx’s **Reload** icon on `chrome://extensions`, then refresh the accounting software tab. See Chrome’s [unpacked extension instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) for more detail.

## Memorize transactions

Click MemTx while an existing manual expense, deposit, or account transfer is open. MemTx reads the transaction and saves its details in the extension; it does not change the transaction in the accounting software. Reconciled transactions can be memorized.

Expense and deposit entries store the payee, payment type, nonnumeric reference, total, memo, and ordered category, fund, amount, and note lines. Account transfer entries also store the transfer direction, the active source account, the target account, and ordered fund and amount lines. Numeric references, such as check numbers, are omitted. MemTx reports a duplicate instead of adding an entry when its normalized transaction details already exist; transfer matching includes the source account, target account, and direction.

## Apply transactions

Click MemTx while the blank **New Transaction** dialog is open to choose a saved transaction from the scrollable list, which is alphabetized by payee. Expense and deposit entries show category and fund summaries. Transfer entries show the account path for the saved direction and a fund summary. The list also shows transaction type and total. Select an entry by clicking its payee. You can remove entries from this list after confirming.

MemTx applies only to a blank new transaction: `data-lang="new_transaction"`, `#TransactionID` equal to `0`, no payee, no entered amount, and a displayed total of zero. It does not act on the transaction list or expanded transaction rows. It will not populate a reconciled transaction. For account transfers, the active account ID must match the saved source account; MemTx refuses to apply the transfer from another account.

Simulation mode affects applying, not memorizing. When it is on, MemTx shows a read-only preview and makes no changes to the accounting software. Before a real apply, MemTx checks that the saved categories, funds, and transfer target are available. If something is unavailable, it describes what needs attention and lets you cancel or continue. Cancel leaves the form unchanged. If you continue, an unresolved expense or deposit line has its amount left blank and moved into its Note as a reminder. Transfers have no Note field, so an unresolved transfer fund leaves the amount blank. Review the form and save it only if it is correct. MemTx never clicks Save, Save and New, or Cancel.

## Portable configuration

The portable config is JSON with `version: 1`, a `simulationMode` boolean, and a `memorizedTransactions` array. Each entry stores its ID, payee, transaction type, reference, total, memo, and lines. Expense and deposit lines include category and fund details, amount, and note; account transfers store fund and amount lines plus source and target account details and transfer direction. A new installation starts with an empty list and simulation mode on.

MemTx keeps its working config in `chrome.storage.local`. Open **Extension options** from the MemTx details page in `chrome://extensions` to review entries, remove an entry, import a config, export a portable config, or change simulation mode. The payee in this grid is plain text. Invalid entries are skipped individually and reported by recovered payee or ID and reason; valid entries continue loading, and the cleaned config replaces the working copy. Changes made by memorizing or removing entries update the working copy. Export the portable config to share or back it up.

## Supported transactions

- Manual expenses and deposits can be memorized and applied to a blank new transaction.
- Account-to-account transfers can be memorized and applied only when the blank new transaction is open in the same source account.
- Fund-to-fund transfers are not supported.
- Memorized entries cannot be edited in place. Export the config, edit it, and import it again to change an entry.

## Disclaimer

MemTx is an independent, unofficial browser extension. It is not affiliated with, endorsed by, sponsored by, or supported by ChurchTrac or its owners. “ChurchTrac” and related names and marks belong to their respective owners and are used only to identify the software with which MemTx is designed to interact.

MemTx is provided **“AS IS”** and **“AS AVAILABLE,”** without warranties of any kind, to the fullest extent permitted by law. The developer disclaims all express and implied warranties, including warranties of merchantability, fitness for a particular purpose, accuracy, reliability, availability, and compatibility.

The supported software may change its website, forms, fields, workflows, or other features at any time. MemTx may then stop working or work differently than expected. It may misread information, leave fields incomplete, enter incorrect information, fail to perform an intended action, or perform an action that is unexpected, unintended, or undesirable. No guarantee is made that MemTx will work with every version or configuration.

You are responsible for checking all information MemTx enters—including accounts, transfer direction, payee, categories, funds, amounts, and other details—before saving or relying on a transaction. Keep your own records and backups. MemTx is not accounting, tax, legal, or financial advice.

To the fullest extent permitted by law, the developer is not liable for losses or damages arising from use of, inability to use, or reliance on MemTx, including transaction errors, data loss, or unexpected changes.
