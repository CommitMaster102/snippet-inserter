// Reads the English message catalog and finds which messages the code and the pages ask for. The
// unit tests for the catalog share it.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXTENSION = path.resolve(__dirname, '..', '..', 'extension');
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const read = (...parts) => fs.readFileSync(path.join(EXTENSION, ...parts), 'utf8');
const messages = JSON.parse(read('_locales', 'en', 'messages.json'));

// Every file that can name a message: the scripts, the pages, and the manifest.
function sources() {
  const files = ['manifest.json', 'background.js', 'content.js', 'content-main.js', 'panel.js', 'options.js',
    'panel.html', 'options.html'];
  for (const name of fs.readdirSync(path.join(EXTENSION, 'lib'))) if (name.endsWith('.js')) files.push(`lib/${name}`);
  return files.map((file) => [file, read(file)]);
}

// The keys that the code and the pages ask for, with every form of each plural family.
function usedKeys() {
  const used = new Set();
  const plain = /\b(?:t|msg|getMessage)\(\s*'([A-Za-z0-9_]+)'/g;
  const plural = /\b(?:plural|msgPlural|sentence)\(\s*'([A-Za-z0-9_]+)'/g;
  const attributes = /data-i18n(?:-[a-z-]+)?="([A-Za-z0-9_]+)"/g;
  const manifestKeys = /__MSG_([A-Za-z0-9_]+)__/g;
  for (const [file, text] of sources()) {
    if (file === 'lib/i18n.js') continue;
    for (const match of text.matchAll(plain)) used.add(match[1]);
    for (const match of text.matchAll(attributes)) used.add(match[1]);
    for (const match of text.matchAll(manifestKeys)) used.add(match[1]);
    for (const match of text.matchAll(plural)) {
      assert.ok(messages[`${match[1]}_other`], `${match[1]} has no _other form`);
      for (const key of Object.keys(messages)) {
        if (key.startsWith(`${match[1]}_`) && PLURAL_SUFFIX.test(key)) used.add(key);
      }
    }
  }
  return used;
}

module.exports = { EXTENSION, PLURAL_SUFFIX, read, messages, usedKeys };
