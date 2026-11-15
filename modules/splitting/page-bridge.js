
'use strict';

/**
 * Page Bridge
 *
 * Runs in the financial application's MAIN JavaScript context.
 *
 * Exposes a narrowly scoped operation to the extension:
 *   accounting.addSplitEntry('')
 *   accounting.addTransferSplitRow()
 *
 * Does NOT expose:
 * - accounting.saveTransactionLines()
 * - accounting.cancelEditLines()
 * - Other accounting methods
 */

(() => {

    const CHANNEL = 'CTES_SPLIT_BRIDGE';
    const VERSION = 1;

    /**
     * Handle requests originating from the extension.
     */
    window.addEventListener('message', (event) => {

        // Only accept messages from this window.
        if (event.source !== window) {
            return;
        }

        const request = event.data;

        if (!request || request.channel !== CHANNEL) {
            return;
        }

        if (request.version !== VERSION) {
            return;
        }

        if (!['CREATE_SPLIT_ENTRY', 'CREATE_TRANSFER_SPLIT_ROW'].includes(request.type)) {
            return;
        }

        const response = {
            channel: CHANNEL,
            version: VERSION,
            type: `${request.type}_RESULT`,
            requestId: request.requestId,
            success: false
        };

        try {

            if (typeof window.accounting === 'undefined') throw new Error('ChurchTrac accounting functions are unavailable.');
            if (request.type === 'CREATE_TRANSFER_SPLIT_ROW') {
                if (typeof window.accounting.addTransferSplitRow !== 'function') throw new Error('accounting.addTransferSplitRow is unavailable.');
                window.accounting.addTransferSplitRow();
            } else {
                if (typeof window.accounting.addSplitEntry !== 'function') throw new Error('accounting.addSplitEntry is unavailable.');
                const transactionId = request.transactionId == null ? '' : String(request.transactionId);
                if (transactionId !== '' && !/^\d+$/.test(transactionId)) throw new Error('Invalid transaction ID for split row creation.');
                // Imports use an empty ID; manually entered transactions use their ID.
                window.accounting.addSplitEntry(transactionId);
            }

            response.success = true;

        } catch (error) {

            response.error = error.message || 'Unable to create split row.';

        }

        window.postMessage(response, window.location.origin);

    });

})();
