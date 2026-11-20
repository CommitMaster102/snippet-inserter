// Unit tests for extension/lib/placeholders.js.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const placeholders = require('../../extension/lib/placeholders.js');

const NOW = new Date(2026, 10, 20, 9, 14);

test('dates and times', () => {
  const { text } = placeholders.expand('{date}|{date:short}|{date:iso}|{time}|{time:iso}', { locale: 'en-us', now: NOW });
  assert.equal(text, 'November 20, 2026|11/20/26|2026-11-20|9:14 AM|09:14');
});

test('dates follow the field language', () => {
  const { text } = placeholders.expand('{date}', { locale: 'fr', now: NOW });
  assert.equal(text, '20 novembre 2026');
});

test('a malformed language tag falls back to the default language', () => {
  assert.doesNotThrow(() => placeholders.expand('{date}', { locale: 'not a tag!', now: NOW }));
});

test('{cursor} marks the caret position, and only the first one counts', () => {
  assert.deepEqual(placeholders.expand('Hello {cursor}!{cursor}', { now: NOW }), { text: 'Hello !', cursor: 6 });
  assert.deepEqual(placeholders.expand('{date:iso} {cursor}', { now: NOW }), { text: '2026-11-20 ', cursor: 11 });
  assert.equal(placeholders.expand('No cursor').cursor, null);
});

test('fill-in fields', () => {
  const content = 'Hello {input:Name}, order {input:Order number}. Bye {input:Name}.';
  assert.deepEqual(placeholders.inputLabels(content), ['Name', 'Order number']);
  const { text } = placeholders.expand(content, { values: { Name: 'Dana', 'Order number': '42' } });
  assert.equal(text, 'Hello Dana, order 42. Bye Dana.');
  assert.equal(placeholders.expand('{input:Missing}').text, '');
});

test('other text in braces is left as written', () => {
  const content = '{price} {Date} { date } {date:long} {"a": 1} {input:} {{date:iso}}';
  const { text } = placeholders.expand(content, { now: NOW });
  assert.equal(text, '{price} {Date} { date } {date:long} {"a": 1} {input:} {2026-11-20}');
  assert.deepEqual(placeholders.listPlaceholders(content), ['{date:iso}']);
  assert.deepEqual(placeholders.inputLabels('{input:' + 'x'.repeat(41) + '}'), []);
});

test('the placeholder list has each placeholder once, in order', () => {
  assert.deepEqual(placeholders.listPlaceholders('{time} {date} {time} {cursor}'), ['{time}', '{date}', '{cursor}']);
});
