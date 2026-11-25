// Unit tests that every number the pages build into a message is written in the digits of the
// catalog's language. Outside the browser lib/i18n.js reads the English catalog object, so setting
// its localeCode to Persian, which has digits of its own, acts as a Persian catalog.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../extension/_locales/en/messages.json');
const lib = require('../../extension/lib/snippets.js');
const { format } = require('../../extension/lib/json-format.js');

const LATIN_DIGIT = /[0-9]/;

test.before(() => {
  catalog.localeCode.message = 'fa';
});
test.after(() => {
  catalog.localeCode.message = 'en';
});

test('the import report counts in Persian digits, with the Persian separator', () => {
  const records = Array.from({ length: 1200 }, (_, i) => ({ content: `Text ${i}`, title: '' }));
  const report = lib.importReport(lib.parseImport(JSON.stringify(records), []));
  assert.doesNotMatch(report, LATIN_DIGIT, report);
  assert.match(report, /۱٬۲۰۰/, report);
});

test('the abbreviation rule and the character count use Persian digits', () => {
  const problem = lib.abbreviationProblem('x', [], '');
  assert.doesNotMatch(problem, LATIN_DIGIT, problem);
  assert.match(problem, /۲/);
  assert.equal(lib.characterCount('x'.repeat(1234)).replace(/[^۰-۹٬]/g, ''), '۱٬۲۳۴');
});

test('a JSON error gives its line, column, and depth in Persian digits', () => {
  const position = format('[1,\n  x]');
  assert.doesNotMatch(position.message, LATIN_DIGIT, position.message);
  assert.match(position.message, /۲.*۳/, position.message);
  const deep = format('['.repeat(200) + ']'.repeat(200));
  assert.doesNotMatch(deep.message, LATIN_DIGIT, deep.message);
});
