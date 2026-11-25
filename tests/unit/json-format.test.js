// Unit tests for extension/lib/json-format.js, which checks and indents the JSON in the manager.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { format } = require('../../extension/lib/json-format.js');

test('indents with 2 spaces, as JSON.stringify would', () => {
  const input = '{"a":1,"b":[1,2,{"c":null}],"d":{},"e":[],"f":"x y"}';
  const result = format(input);
  assert.equal(result.ok, true);
  assert.equal(result.text, JSON.stringify(JSON.parse(input), null, 2));
});

test('keeps every number and string as written, and the order of the keys', () => {
  const result = format('{"2":1.0,"1":12345678901234567890,"s":"\\u00e9\\n","e":1E+5}');
  assert.equal(result.ok, true);
  assert.equal(result.text, '{\n  "2": 1.0,\n  "1": 12345678901234567890,\n  "s": "\\u00e9\\n",\n  "e": 1E+5\n}');
});

test('formatted JSON formats to itself, and white space around it goes', () => {
  const once = format('  \n[1,\n\t{"a" : true}]\n ').text;
  assert.equal(once, '[\n  1,\n  {\n    "a": true\n  }\n]');
  assert.equal(format(once).text, once);
});

test('accepts every kind of value on its own', () => {
  for (const value of ['0', '-1.5e-3', '"x"', 'true', 'false', 'null', '[]', '{}']) {
    assert.deepEqual(format(value), { ok: true, text: value });
  }
});

const BAD = [
  // text, line, column, part of the message
  ['{"a": 1,}', 1, 9, 'property name'],
  ['{"a" 1}', 1, 6, ':'],
  ["{'a': 1}", 1, 2, 'property name'],
  ['[1, 2', 1, 6, 'text ends'],
  ['[1 2]', 1, 4, ', or ]'],
  ['{\n  "a": tru\n}', 2, 8, 'true'],
  ['{\n  "a": 01\n}', 2, 9, ', or }'],
  ['{"a": "x', 1, 7, 'not closed'],
  ['{"a": "x\ny"}', 1, 9, 'line break'],
  ['{"a": "\\q"}', 1, 8, 'escape'],
  ['[1] x', 1, 5, 'end of the text'],
  ['// comment\n{}', 1, 1, 'Comments'],
  ['[-]', 1, 3, 'digit'],
  ['[1.]', 1, 4, 'digit'],
  ['[1e]', 1, 4, 'digit'],
  ['[1.5.3]', 1, 5, ', or ]'],
];

test('reports the line and column of the first error and changes nothing', () => {
  for (const [text, line, column, part] of BAD) {
    const result = format(text);
    assert.equal(result.ok, false, text);
    assert.equal(result.line, line, `${JSON.stringify(text)} line`);
    assert.equal(result.column, column, `${JSON.stringify(text)} column`);
    assert.ok(result.message.includes(part), `${JSON.stringify(text)}: ${result.message}`);
    assert.ok(result.message.startsWith(`Line ${line}, column ${column}: `), result.message);
    assert.equal('text' in result, false);
  }
});

test('text with nothing in it has no position', () => {
  for (const text of ['', ' \n\t ']) {
    const result = format(text);
    assert.equal(result.ok, false);
    assert.equal(result.line, undefined);
    assert.equal(result.message, 'There is no text to format.');
  }
});

test('a placeholder outside quotes makes the text invalid, and the message says so', () => {
  const text = '{\n  "count": {input:Count},\n  "when": "{date}"\n}';
  const result = format(text);
  assert.equal(result.ok, false);
  assert.equal(result.line, 2);
  assert.equal(result.column, 12);
  assert.match(result.message, /\{input:Count\} is a placeholder/);
  assert.match(result.message, /outside quotes/);
  for (const bare of ['[{date}]', '{"a": {cursor}}', '[1, {time}]', '{"a": {date+3d:iso}}']) {
    const bad = format(bare);
    assert.equal(bad.ok, false, bare);
    assert.match(bad.message, /placeholder/, bare);
  }
});

test('a placeholder inside quotes is just text', () => {
  const result = format('{"count":"{input:Count}","when":"{date}"}');
  assert.equal(result.ok, true);
  assert.equal(result.text, '{\n  "count": "{input:Count}",\n  "when": "{date}"\n}');
});

test('braces that are not placeholders are ordinary errors', () => {
  const result = format('{"a": {b}}');
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.message, /placeholder/);
});

test('deep nesting is an error, not a crash', () => {
  const result = format('['.repeat(5000) + ']'.repeat(5000));
  assert.equal(result.ok, false);
  assert.match(result.message, /nested/);
  assert.equal(format('['.repeat(50) + ']'.repeat(50)).ok, true);
});

test('columns count characters, and a line break is not a column', () => {
  const result = format('{\r\n"é😀": x}');
  assert.equal(result.line, 2);
  assert.equal(result.column, 7);
});

test('an error at the end of the text is one whole sentence, not a sentence with a fragment put in', () => {
  const cases = [
    ['[1, 2', 'The text ends where , or ] is expected.'],
    ['{"a": 1', 'The text ends where , or } is expected.'],
    ['{"a": 1,', 'The text ends where a property name in double quotes is expected.'],
    ['{', 'The text ends where a property name in double quotes is expected.'],
    ['{"a"', 'The text ends where : is expected after the property name.'],
    ['[', 'The text ends where a value is expected.'],
    ['[1,', 'The text ends where a value is expected.'],
    ['{"a":', 'The text ends where a value is expected.'],
  ];
  for (const [text, message] of cases) assert.equal(format(text).message.replace(/^Line \d+, column \d+: /, ''), message, text);
});
