// The shared international text through the parts of extension/lib that do not touch storage.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../../extension/lib/snippets.js');
const placeholders = require('../../extension/lib/placeholders.js');
const { PARTS, TEXT, TEXT_CRLF, TITLE, FILL_IN_TEXT, LABEL, characterCount } = require('../shared/international-text.js');

const snippet = { title: TITLE, content: TEXT, id: 'aaaaaaaaaaaa', createdAt: '2026-01-01T00:00:00.000Z' };

test('the shared text survives an export and an import byte for byte', () => {
  const crlf = { ...snippet, id: 'bbbbbbbbbbbb', title: 'crlf', content: TEXT_CRLF };
  const result = lib.parseImport(lib.buildExport([snippet, crlf]), []);
  assert.deepEqual(result.add, [snippet, crlf]);
});

test('search finds the shared text in every script', () => {
  const list = [snippet, { title: '', content: 'Other', id: 'cccccccccccc' }];
  const find = (query) => lib.filterSnippets(list, query).map((s) => s.id);
  for (const query of ['世話', '感谢', '감사', 'שלום', 'ขอบคุณ', 'दुनिया', 'お名前', 'テスト']) {
    assert.deepEqual(find(query), ['aaaaaaaaaaaa'], query);
  }
  // A letter with a separate accent mark matches the same letter stored as one character.
  assert.deepEqual(find('café'), ['aaaaaaaaaaaa']);
  assert.deepEqual(find('école'), ['aaaaaaaaaaaa']);
});

test('the list shows the first line of the shared text, and the count treats an emoji as one', () => {
  assert.equal(lib.displayTitle({ title: '', content: TEXT }), PARTS.japanese);
  assert.equal(lib.previewLine({ title: '', content: TEXT }), PARTS.chinese);
  assert.equal(lib.characterCount(PARTS.family), '5 characters');
  assert.equal(lib.characterCount(TEXT, 'en'), `${characterCount(TEXT)} characters`);
});

test('a placeholder label in Japanese is found, and the text around it is kept', () => {
  assert.deepEqual(placeholders.inputLabels(FILL_IN_TEXT), [LABEL]);
  assert.deepEqual(placeholders.listPlaceholders(FILL_IN_TEXT), [`{input:${LABEL}}`]);
  const filled = placeholders.expand(FILL_IN_TEXT, { values: { [LABEL]: '山田' } });
  assert.equal(filled.text, 'ご連絡ありがとうございます、山田様。');
  const emoji = placeholders.expand(`{input:${PARTS.family}} {cursor}`, { values: { [PARTS.family]: PARTS.flag } });
  assert.equal(emoji.text, `${PARTS.flag} `);
  assert.equal(emoji.cursor, PARTS.flag.length + 1);
});

test('a snippet with Windows line endings is listed without a stray carriage return', () => {
  assert.equal(lib.displayTitle({ title: '', content: TEXT_CRLF }), PARTS.japanese);
});
