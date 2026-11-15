
'use strict';

/**
 * Page Bridge Client
 *
 * Runs in the Chrome content-script isolated context.
 *
 * Responsibilities:
 * - Inject page-bridge.js into the MAIN page context.
 * - Send requests to the page bridge.
 * - Match responses using request IDs.
 * - Handle timeouts and errors.
 *
 * Does not expose save or cancel operations.
 */

const PageBridgeClient = (() => {

    const CHANNEL = 'CTES_SPLIT_BRIDGE';
    const VERSION = 1;
    const TIMEOUT_MS = 5000;

    const pendingRequests = new Map();

    let initialized = false;
    let initializationPromise = null;

    /**
     * Listen for responses from the page bridge.
     */
    function handleMessage(event) {

        if (event.source !== window) {
            return;
        }

        const response = event.data;

        if (
            !response ||
            response.channel !== CHANNEL ||
            response.version !== VERSION ||
            !['CREATE_SPLIT_ENTRY_RESULT', 'CREATE_TRANSFER_SPLIT_ROW_RESULT'].includes(response.type)
        ) {
            return;
        }

        const pending = pendingRequests.get(response.requestId);

        if (!pending) {
            return;
        }

        clearTimeout(pending.timeout);
        pendingRequests.delete(response.requestId);

        if (response.success) {
            pending.resolve(true);
        } else {
            pending.reject(
                new Error(response.error || 'Split row creation failed.')
            );
        }
    }

    /**
     * Initialize the message listener.
     */
    function initializeListener() {

        if (!initialized) {
            window.addEventListener('message', handleMessage);
            initialized = true;
        }
    }

    /**
     * Inject the page-context bridge.
     */
    function injectBridge() {

        if (initializationPromise) {
            return initializationPromise;
        }

        initializationPromise = new Promise((resolve, reject) => {

            const script = document.createElement('script');

            script.src = chrome.runtime.getURL(
                'modules/splitting/page-bridge.js'
            );

            script.onload = () => {
                script.remove();
                resolve();
            };

            script.onerror = () => {
                script.remove();

                initializationPromise = null;

                reject(
                    new Error('Unable to inject page bridge.')
                );
            };

            (document.head || document.documentElement)
                .appendChild(script);

        });

        return initializationPromise;
    }

    /**
     * Initialize the bridge.
     */
    async function initialize() {

        initializeListener();

        if (initialized && initializationPromise === null) {
            // Listener is ready; bridge may already be installed.
        }

        if (!initializationPromise) {
            await injectBridge();
        } else {
            await initializationPromise;
        }

        return true;
    }

    /**
     * Request creation of one split row.
     *
     * Returns a Promise that resolves when the page
     * confirms the row creation operation.
     */
    async function requestSplitRow(type, transactionId = '') {
        const id = String(transactionId ?? '');
        if (type === 'CREATE_SPLIT_ENTRY' && id !== '' && !/^\d+$/.test(id)) {
            throw new Error('Invalid transaction ID for split row creation.');
        }

        await initialize();

        const requestId = crypto.randomUUID();

        return new Promise((resolve, reject) => {

            const timeout = setTimeout(() => {

                pendingRequests.delete(requestId);

                reject(
                    new Error('Timed out waiting for page bridge.')
                );

            }, TIMEOUT_MS);

            pendingRequests.set(requestId, {
                resolve,
                reject,
                timeout
            });

            window.postMessage({
                channel: CHANNEL,
                version: VERSION,
                type,
                requestId,
                transactionId: id
            }, window.location.origin);

        });
    }

    function createSplitEntry(transactionId = '') {
        return requestSplitRow('CREATE_SPLIT_ENTRY', transactionId);
    }

    function createTransferSplitRow() {
        return requestSplitRow('CREATE_TRANSFER_SPLIT_ROW');
    }

    return Object.freeze({
        initialize,
        createSplitEntry,
        createTransferSplitRow
    });

})();

globalThis.PageBridgeClient = PageBridgeClient;
