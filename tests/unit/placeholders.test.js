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

const ex = (content, now = NOW) => placeholders.expand(content, { locale: 'en-us', now }).text;

test('dates counted from today', () => {
  assert.equal(
    ex('{date+3d}|{date-1w:iso}|{date+1m}|{date+1y:short}|{date+0d:iso}'),
    'November 23, 2026|2026-11-13|December 20, 2026|11/20/27|2026-11-20'
  );
  assert.equal(ex('{date+007d:iso}'), '2026-11-27');
});

test('times counted from now, and a time past midnight shows only the time', () => {
  assert.equal(ex('{time+30min}|{time-2h:iso}|{time+15h:iso}'), '9:44 AM|07:14|00:14');
});

test('adding months or years keeps the day or uses the last day of a shorter month', () => {
  const at = (y, m, d) => new Date(y, m, d, 9, 14);
  assert.equal(ex('{date+1m}', at(2027, 0, 31)), 'February 28, 2027');
  assert.equal(ex('{date+1m}', at(2028, 0, 31)), 'February 29, 2028');
  assert.equal(ex('{date-1m:iso}', at(2027, 2, 31)), '2027-02-28');
  assert.equal(ex('{date+1y:iso}', at(2028, 1, 29)), '2029-02-28');
  assert.equal(ex('{date+13m:iso}', at(2026, 0, 31)), '2027-02-28');
  assert.equal(ex('{date-1m:iso}', at(2026, 0, 15)), '2025-12-15');
});

test('an offset is 0 to 999', () => {
  assert.equal(ex('{date+999y:iso}'), '3025-11-20');
  assert.equal(ex('{date-999y:iso}'), '1027-11-20');
  assert.equal(ex('{date+1000d}'), '{date+1000d}');
});

test('near misses of an offset stay as written', () => {
  const content =
    '{date+3x} {date+3D} {date + 3d} {date3d} {date+3} {date+3days} {date:iso+3d} {date+1m-1d} ' +
    '{date+3d:long} {time+30m} {time+1d} {date+1h} {"date": "+3d"}';
  assert.equal(ex(content), content);
  assert.deepEqual(placeholders.listPlaceholders(content), []);
});

test('a doubled brace around an offset keeps the outer braces', () => {
  assert.equal(ex('{{date+1d:iso}}'), '{2026-11-21}');
});

test('the placeholder list holds each offset form once', () => {
  assert.deepEqual(
    placeholders.listPlaceholders('{date+3d} {time-1h:iso} {date+3d}'),
    ['{date+3d}', '{time-1h:iso}']
  );
});

test('every placeholder in one insert counts from the same moment', () => {
  assert.equal(ex('{date+0d:iso} {date+1d:iso}'), '2026-11-20 2026-11-21');
});

test('text that looks like a date or time placeholder but is not one is listed once, in order', () => {
  const content = '{date+3x} {Date} { date } {date:long} {date+3x} {time+30m} {date–3d} {date−3d}';
  assert.deepEqual(placeholders.unrecognized(content), [
    '{date+3x}',
    '{Date}',
    '{ date }',
    '{date:long}',
    '{time+30m}',
    '{date–3d}',
    '{date−3d}',
  ]);
});

test('text that is a placeholder, or only resembles one by name, is not listed as a near miss', () => {
  const content = '{datetime} {times} {Time sensitive} {"date": 1} {{date:iso}} {date+1d} {cursor} {input:Name}';
  assert.deepEqual(placeholders.unrecognized(content), []);
});

test('currentValue gives what a date or time placeholder gives now', () => {
  const options = { locale: 'en-us', now: NOW };
  assert.equal(placeholders.currentValue('{date+3d:iso}', options), '2026-11-23');
  assert.equal(placeholders.currentValue('{date}', options), 'November 20, 2026');
  assert.equal(placeholders.currentValue('{time+30min}', options), '9:44 AM');
  assert.equal(placeholders.currentValue('{input:Name}', options), '');
  assert.equal(placeholders.currentValue('{cursor}', options), '');
});

test('a weekday counts the Nth such day after or before today', () => {
  // NOW is Friday 20 November 2026.
  const days = (offset) => ex(`{date${offset}:iso}`);
  assert.equal(days('+1fri'), '2026-11-27');
  assert.equal(days('+0fri'), '2026-11-20');
  assert.equal(days('-1fri'), '2026-11-13');
  assert.equal(days('+1mon'), '2026-11-23');
  assert.equal(days('-1mon'), '2026-11-16');
  assert.equal(days('+2sat'), '2026-11-28');
  assert.equal(days('+0mon'), '2026-11-23');
  assert.equal(days('-0mon'), '2026-11-16');
  assert.equal(days('+3sun'), '2026-12-06');
});

test('every weekday unit is recognized, and a weekday cannot go in a time', () => {
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    assert.deepEqual(placeholders.listPlaceholders(`{date+1${day}}`), [`{date+1${day}}`]);
  }
  const literal = '{date+1fr} {date+1Fri} {date+1friday} {time+1fri} {date+1fri+1d}';
  assert.equal(ex(literal), literal);
});

test('a weekday keeps the format style, and a date value reaches the pill', () => {
  assert.equal(ex('{date+1fri}|{date+1fri:short}'), 'November 27, 2026|11/27/26');
  assert.equal(placeholders.currentValue('{date+1fri:iso}', { locale: 'en-us', now: NOW }), '2026-11-27');
});
