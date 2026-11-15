'use strict';
(function (root) {
  async function validateAndRepair(raw) {
    const config = root.ConfigValidator.validate(raw);
    const hasLegacySplits = Object.prototype.hasOwnProperty.call(raw, 'splits');
    if (config.droppedTransactions.length || hasLegacySplits) {
      await chrome.storage.local.set({ memorizedConfig: root.ConfigValidator.serialize(config) });
    }
    return config;
  }
  async function load() {
    const stored = await chrome.storage.local.get('memorizedConfig');
    if (stored.memorizedConfig) return validateAndRepair(stored.memorizedConfig);
    return root.ConfigValidator.validate({ version: 1, simulationMode: true, memorizedTransactions: [] });
  }
  async function save(config) {
    const portable = root.ConfigValidator.serialize(root.ConfigValidator.validate(config));
    await chrome.storage.local.set({ memorizedConfig: portable });
    return root.ConfigValidator.validate(portable);
  }
  root.ConfigLoader = Object.freeze({ load, save });
})(globalThis);
