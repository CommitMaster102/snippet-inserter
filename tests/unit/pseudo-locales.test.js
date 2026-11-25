// Unit tests for scripts/pseudo-locales.js, which makes the stretched and the mirrored
// pseudo-language that the layout tests load in place of English. Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pseudo = require('../../scripts/pseudo-locales.js');
const check = require('../../scripts/check-locales.js');
const { messages: english } = require('../shared/locale-files.js');

const PROTECTED = /\$\$|\$[A-Za-z0-9_@]+\$|\$[1-9]|<\/?kbd>|\{[^}]*\}/g;

test('the stretched language is about 40 percent longer, accented, and marked at both ends', () => {
  const catalog = pseudo.stretched(english);
  for (const key of Object.keys(english)) {
    if (['localeCode', 'textDirection', 'languageName', 'extName'].includes(key)) continue;
    const before = check.renderedLength(english[key]);
    const after = check.renderedLength(catalog[key]);
    if (before < 6) continue;
    assert.ok(after >= before * 1.4, `${key}: ${after} is not 40 percent over ${before}`);
    assert.ok(after <= before * 1.4 + 6, `${key}: ${after} is far over 40 percent of ${before}`);
    assert.ok(catalog[key].message.startsWith('⟦') && catalog[key].message.endsWith('⟧'), key);
  }
  assert.match(catalog.captionCreate.message, /[à-ÿ]/);
  assert.equal(catalog.textDirection.message, 'ltr');
});

test('both pseudo-languages keep placeholders, kbd tags and braces, and add no message', () => {
  for (const make of [pseudo.stretched, pseudo.mirrored]) {
    const catalog = make(english);
    for (const key of Object.keys(english)) {
      if (['localeCode', 'textDirection', 'languageName', 'extName'].includes(key)) continue;
      assert.deepEqual(catalog[key].message.match(PROTECTED) || [], english[key].message.match(PROTECTED) || [], key);
      assert.deepEqual(catalog[key].placeholders, english[key].placeholders, key);
    }
    for (const key of Object.keys(catalog)) assert.ok(english[key] || /_(zero|two|few|many)$/.test(key), key);
  }
});

test('the mirrored language is written in Arabic letters, right to left, with the six plural forms', () => {
  const catalog = pseudo.mirrored(english);
  assert.equal(catalog.textDirection.message, 'rtl');
  assert.equal(catalog.localeCode.message, 'ar');
  assert.match(catalog.captionCreate.message, /^[؀-ۿ ]+$/);
  assert.deepEqual(check.checkCatalog('ar', catalog, english, {}), []);
});

test('a pseudo-language is built as a copy of the extension, with only the English catalog replaced', () => {
  const directory = pseudo.build('mirrored');
  try {
    const original = path.join(__dirname, '..', '..', 'extension');
    assert.equal(fs.readFileSync(path.join(directory, 'panel.js'), 'utf8'), fs.readFileSync(path.join(original, 'panel.js'), 'utf8'));
    const written = JSON.parse(fs.readFileSync(path.join(directory, '_locales', 'en', 'messages.json'), 'utf8'));
    assert.equal(written.textDirection.message, 'rtl');
    assert.deepEqual(fs.readdirSync(path.join(directory, '_locales')), ['en']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(original, '_locales', 'en', 'messages.json'), 'utf8')).textDirection.message, 'ltr');
  } finally {
    pseudo.remove(directory);
  }
});

test('a copy can be built with a catalog that a function makes from the English one', () => {
  const directory = pseudo.build((catalog) => ({ ...catalog, keyCtrl: { ...catalog.keyCtrl, message: 'Strg' } }));
  try {
    const written = JSON.parse(fs.readFileSync(path.join(directory, '_locales', 'en', 'messages.json'), 'utf8'));
    assert.equal(written.keyCtrl.message, 'Strg');
    assert.equal(written.keyCmd.message, english.keyCmd.message);
  } finally {
    pseudo.remove(directory);
  }
});

test('remove() refuses a folder that build() could not have made', () => {
  assert.throws(() => pseudo.remove(path.join(__dirname, '..', '..', 'extension')), /Not a folder that build\(\) made/);
});
