// Unit tests for date and time offsets across daylight-saving changes. The time zone is set before
// the module loads. node --test runs each file in its own process, so it does not leak elsewhere.
'use strict';

process.env.TZ = 'America/New_York';

const test = require('node:test');
const assert = require('node:assert/strict');
const placeholders = require('../../extension/lib/placeholders.js');

const ex = (content, now) => placeholders.expand(content, { locale: 'en-us', now }).text;

test('the test runs in New York', () => {
  assert.equal(new Date(2027, 2, 14, 12).getTimezoneOffset(), 240);
  assert.equal(new Date(2027, 2, 13, 12).getTimezoneOffset(), 300);
});

test('days count on the calendar across the spring change', () => {
  assert.equal(ex('{date+1d:iso}', new Date(2027, 2, 13, 23, 30)), '2027-03-14');
  assert.equal(ex('{date-1d:iso}', new Date(2027, 2, 15, 0, 30)), '2027-03-14');
  assert.equal(ex('{date+1w:iso}', new Date(2027, 2, 10, 23, 30)), '2027-03-17');
});

test('hours count elapsed time across the spring change', () => {
  assert.equal(ex('{time+1h:iso}', new Date(2027, 2, 14, 1, 30)), '03:30');
});

test('hours count elapsed time across the autumn change', () => {
  const now = new Date(2027, 10, 7, 0, 30);
  assert.equal(ex('{time+1h:iso}', now), '01:30');
  assert.equal(ex('{time+2h:iso}', now), '01:30');
});
