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
  assert.equal(lib.characterCount(PARTS.family), '1 character');
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

test('counting characters gives the same number on the fast path and the segmenter path', () => {
  const mix = ['a', '👍', '👍🏽', '🇯🇵🇺🇸', '👨‍👩‍👧', 'é', '\r\n', '한글', '한', 'क्षि', '؀a', '❤️'];
  const samples = [...Object.values(PARTS), TEXT, TEXT_CRLF, mix.join(''), mix.join(' '), ''];
  for (const text of samples) assert.equal(lib.countCharacters(text), characterCount(text), JSON.stringify(text));
});

test('counting characters around a cluster matches the segmenter wherever a cluster sits', () => {
  const plain = 'The quick brown fox. ';
  const clusters = [
    '\u{1F44D}\u{1F3FD}',
    '❤️',
    'é',
    '\r\n',
    '\r',
    '한ᆨ',
    'क्षि',
    '\u{1F468}‍\u{1F469}‍\u{1F467}',
    '\u{1F1EF}\u{1F1F5}',
  ];
  const parts = [...Object.values(PARTS), TEXT, TEXT_CRLF, ...clusters];
  const afters = ['', plain, plain.repeat(40), '́', '‍\u{1F44D}', '\u{1F1EF}', '\n'];
  for (const part of parts) {
    for (const before of ['', plain, plain.repeat(40)]) {
      for (const after of afters) {
        const text = before + part + after;
        assert.equal(lib.countCharacters(text), characterCount(text), JSON.stringify(text.slice(-60)));
      }
    }
  }
  // Clusters side by side, and at each end of the text.
  const joined = clusters.join('') + plain + clusters.join(plain) + clusters.join('');
  assert.equal(lib.countCharacters(joined), characterCount(joined));
});

const MEGABYTE = 1048576;
const PLAIN_MEGABYTE = 'The quick brown fox jumps over the lazy dog. '.repeat(Math.ceil(MEGABYTE / 45)).slice(0, MEGABYTE);

// Times lib.characterCount, the function the panel and the manager call, after one warm-up call.
function timeCount(text) {
  lib.characterCount(text, 'en');
  const start = performance.now();
  const result = lib.characterCount(text, 'en');
  return { result, took: performance.now() - start };
}

test('the character count of 1 MB of plain text takes under 15 ms', () => {
  const { result, took } = timeCount(PLAIN_MEGABYTE);
  assert.equal(result, '1,048,576 characters');
  assert.ok(took < 15, `took ${took} ms`);
});

test('the character count of 1 MB with one clustering character takes under 15 ms', () => {
  const middle = MEGABYTE / 2;
  for (const cluster of ['❤️', '\r\n', 'é', '\u{1F468}‍\u{1F469}‍\u{1F467}']) {
    const text = PLAIN_MEGABYTE.slice(0, middle) + cluster + PLAIN_MEGABYTE.slice(middle);
    const { result, took } = timeCount(text);
    assert.equal(result, `${(MEGABYTE + 1).toLocaleString('en')} characters`, JSON.stringify(cluster));
    assert.equal(lib.countCharacters(text), characterCount(text), JSON.stringify(cluster));
    assert.ok(took < 15, `${JSON.stringify(cluster)} took ${took} ms`);
  }
});
