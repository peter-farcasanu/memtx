# memtx
Memorized Transactions Chrome extension for web-based accounting software

## Disclaimer
MemTx is an independent, unofficial browser extension. It is not affiliated with, endorsed by, sponsored by, or supported by ChurchTrac or its owners. “ChurchTrac” and related names and marks belong to their respective owners and are used only to identify the software with which MemTx is designed to interact.

MemTx is provided “AS IS” and “AS AVAILABLE,” without warranties of any kind, to the fullest extent permitted by law. The developer disclaims all express and implied warranties, including warranties of merchantability, fitness for a particular purpose, accuracy, reliability, availability, and compatibility.

ChurchTrac may change its website, forms, fields, workflows, or other software at any time. MemTx may then stop working or work differently than expected. It may misread information, leave fields incomplete, enter incorrect information, fail to perform an intended action, or perform an action that is unexpected, unintended, or undesirable. No guarantee is made that MemTx will work with every ChurchTrac version or configuration.

You are responsible for checking all information MemTx enters—including accounts, transfer direction, payee, categories, funds, amounts, and other details—before saving or relying on a transaction. Keep your own records and backups. MemTx is not accounting, tax, legal, or financial advice.

To the fullest extent permitted by law, the developer is not liable for losses or damages arising from use of, inability to use, or reliance on MemTx, including transaction errors, data loss, or unexpected changes.


## User actions

Click MemTx while an existing manual expense, deposit, or account-to-account transfer is open to memorize it, whether reconciled or not. Memorizing reads the transaction and saves its details in the extension; it does not change the ChurchTrac transaction. Expense and deposit entries capture the payee, payment type, nonnumeric reference, total, memo, and ordered category/fund/amount/note lines. Account transfer entries capture the reason/payee, reference, memo, transfer direction, source account, target account, total, and ordered fund/amount lines. Numeric references are treated as check numbers and omitted. Duplicate detection compares normalized transaction details, including both accounts and direction for transfers.

Click MemTx while the blank New Transaction dialog is open to choose a memorized transaction from a scrollable grid alphabetized by payee. Expense and deposit rows show category and fund summaries; transfer rows show the account path based on transfer direction and a fund summary. The transaction type and total are also shown. The payee is the selection control, and each row can be removed from the working config. A blank target requires `data-lang="new_transaction"`, `#TransactionID` equal to `0`, no payee, no entered amount, and a displayed total of zero. For account transfers, the active account must match the saved source account; MemTx refuses to apply the transfer in a different account. The transaction list and expanded list rows are never targets. Reconciled transactions are never populated or changed.

Simulation mode applies only to the apply action. With simulation enabled, the user may still memorize transactions. After the user selects a memorized transaction, MemTx runs a read-only preflight and shows the payee, payment type, reference, total, line details, and any unavailable categories, funds, or transfer targets. It makes no changes to ChurchTrac.

Before a real apply, MemTx runs a read-only preflight. If a category, fund, or transfer target is unavailable, it lists the needed corrections and asks whether to cancel or continue. Cancel leaves the transaction untouched. If continued, an unresolved expense/deposit line's amount stays blank and is moved into its Note as an amount-to-enter reminder. For transfers, an unavailable fund leaves that line's amount blank; transfers have no Note field. Applying fills the payee/reason, payment type, nonnumeric reference, and transaction lines. For transfers it also fills the saved direction and target account, after confirming the active source account. Memo is memorized but not applied. Numeric references/check numbers are never applied. MemTx never clicks Save, Save and New, or Cancel. Review the completed form and save it in ChurchTrac only if it is correct.

## Portable configuration

The config is version 1 JSON with `simulationMode` and `memorizedTransactions`. Each memorized item stores an id, payee, payment type id and label, total, memo, and lines with fund id/label, amount, and note; expense/deposit lines also store category id/label. Account transfers additionally store the source account id/name, transfer direction, and target account id/name. A new installation starts with an empty memorized transaction list and simulation mode enabled.

MemTx keeps an active working copy in `chrome.storage.local`. The Options page shows the payee, category or source-to-target account path, fund, type, and amount, with plain payee text and row removal. Config import and export are available there. Invalid memorized entries are dropped individually, reported by recovered payee/id and reason, and valid entries continue loading; the cleaned config replaces the working copy. Simulation mode is saved immediately when its checkbox changes. Memorizing updates the working copy without opening a download; export the portable JSON config from Options when you want to share it with another user or computer.

## Current implementation scope

- Existing manual expense, deposit, and account-to-account transfer transactions can be memorized.
- Blank new expense, deposit, and account-to-account transfer transactions can receive a memorized entry.
- Account-to-account transfers are tied to the account where they were memorized and can only be applied from that same account.
- Fund-to-fund transfers are not supported yet.
- No facility to edit memorized-transaction list; the workaround is to export, edit, and re-import the configuration.
