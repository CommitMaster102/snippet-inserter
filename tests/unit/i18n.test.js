// Unit tests for extension/lib/i18n.js. Outside the browser it reads the English catalog, so these
// tests also pin the English wording that the interface had before it moved into the catalog.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../../extension/lib/i18n.js');

test('a message takes its substitutions in order', () => {
  assert.equal(i18n.t('validationTooLong', [128]), 'The input must not be longer than 128 characters.');
  assert.equal(
    i18n.t('referenceMissing', [';addr', '{snippet:;addr}']),
    'No snippet has the abbreviation ;addr, so {snippet:;addr} is inserted as written.'
  );
});

test('a placeholder with fixed content needs no substitution', () => {
  assert.equal(i18n.t('toolBold'), 'Bold (Ctrl+B)');
  assert.equal(i18n.t('hotkeyShift'), 'Double tap Shift');
});

test('expand follows the rules of chrome.i18n', () => {
  const entry = {
    message: 'Cost $$5 for $NAME$ and $FIXED$',
    placeholders: { name: { content: '$1' }, fixed: { content: 'x$2y' } },
  };
  assert.equal(i18n.expand(entry, ['Ann', 'B']), 'Cost $5 for Ann and xBy');
});

test('plural forms follow the language of the catalog', () => {
  assert.equal(i18n.plural('fillCount', 0, [0]), 'Fill in 0 fields');
  assert.equal(i18n.plural('fillCount', 1, [1]), 'Fill in 1 field');
  assert.equal(i18n.plural('fillCount', 2, [2]), 'Fill in 2 fields');
});

test('a missing key reads as the key, so a gap is seen', () => {
  assert.equal(i18n.t('noSuchMessage'), 'noSuchMessage');
});

test('numbers have no grouping, as the English text had none', () => {
  assert.equal(i18n.number(1234567), '1234567');
});

test('the language and direction come from the catalog', () => {
  assert.equal(i18n.languageTag(), 'en');
  assert.equal(i18n.direction(), 'ltr');
});

test('a rich message splits into text and keys without any markup reaching the page', () => {
  assert.deepEqual(i18n.richParts('Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> now'), [
    { text: 'Press ' },
    { key: 'Ctrl' },
    { text: '+' },
    { key: 'Z' },
    { text: ' now' },
  ]);
  assert.deepEqual(i18n.richParts('plain'), [{ text: 'plain' }]);
});
