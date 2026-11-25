// Unit test for the way the manifest takes its text from the English message catalog.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read, messages } = require('../shared/locale-files.js');

const manifest = JSON.parse(read('manifest.json'));

test('the manifest names the default language and takes its text from the catalog', () => {
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extName__');
  assert.equal(manifest.description, '__MSG_extDescription__');
  assert.equal(manifest.action.default_title, '__MSG_extName__');
  assert.equal(manifest.commands['open-panel'].description, '__MSG_commandOpenPanel__');
  assert.equal(messages.extName.message, 'Snippet Inserter');
});
