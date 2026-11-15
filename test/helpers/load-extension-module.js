'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const projectRoot = path.resolve(__dirname, '../..');

function loadExtensionModules(...relativePaths) {
  return loadExtensionModulesWithGlobals({}, ...relativePaths);
}

function loadExtensionModulesWithGlobals(globals, ...relativePaths) {
  const sandbox = { crypto: { randomUUID: () => 'test-uuid' }, console, setTimeout, clearTimeout, ...globals };
  sandbox.globalThis = sandbox;

  for (const relativePath of relativePaths) {
    const filePath = path.join(projectRoot, relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    vm.runInNewContext(source, sandbox, { filename: filePath });
  }

  return sandbox;
}

module.exports = { loadExtensionModules, loadExtensionModulesWithGlobals };

function createDom(html = '<!doctype html><html><head></head><body></body></html>') {
  return new JSDOM(html, { url: 'https://www.churchtrac.com/', runScripts: 'outside-only' });
}

function loadIntoWindow(window, ...relativePaths) {
  for (const relativePath of relativePaths) {
    const filePath = path.join(projectRoot, relativePath);
    window.eval(fs.readFileSync(filePath, 'utf8'));
  }
}

module.exports.createDom = createDom;
module.exports.loadIntoWindow = loadIntoWindow;
