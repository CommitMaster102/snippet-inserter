// Unit tests for the parts of extension/lib/snippets.js that do not touch browser storage.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../../extension/lib/snippets.js');

const stored = [
  { createdAt: '2026-01-01T00:00:00.000Z', title: 'Address', content: '14 Elm Street', id: 'aaaaaaaaaaaa', abbreviation: ';addr' },
  { createdAt: '2026-01-02T00:00:00.000Z', title: '', content: 'Kind regards,\nAna', id: 'bbbbbbbbbbbb' },
];

test('an export parses back into the same records', () => {
  const text = lib.buildExport(stored, new Date('2026-11-20T09:30:00Z'));
  const data = JSON.parse(text);
  assert.equal(data.format, 'snippet-inserter');
  assert.equal(data.version, 1);
  assert.equal(data.exportedAt, '2026-11-20T09:30:00.000Z');
  const result = lib.parseImport(text, []);
  assert.deepEqual(result.add, stored);
  assert.equal(lib.importReport(result), 'Imported 2 snippets.');
});

test('the export file name uses the local date', () => {
  assert.equal(lib.exportFileName(new Date(2026, 10, 5)), 'snippets-2026-11-05.json');
});

test('import skips snippets that are already stored, whatever their id', () => {
  const file = JSON.stringify([
    { ...stored[0], id: 'zzzzzzzzzzzz' },
    { title: 'New', content: 'Fresh', id: 'cccccccccccc', createdAt: '2026-02-01T00:00:00.000Z' },
  ]);
  const result = lib.parseImport(file, stored);
  assert.equal(result.skipped, 1);
  assert.equal(result.add.length, 1);
  assert.equal(result.add[0].id, 'cccccccccccc');
  assert.equal(lib.importReport(result), 'Imported 1 snippet. Skipped 1 snippet that was already here.');
});

test('import gives a new id to a record whose id is in use, and skips duplicates inside the file', () => {
  const file = JSON.stringify([
    { title: 'Other', content: 'Different text', id: 'aaaaaaaaaaaa' },
    { title: 'Other', content: 'Different text', id: 'dddddddddddd' },
  ]);
  const result = lib.parseImport(file, stored);
  assert.equal(result.add.length, 1);
  assert.equal(result.renamed, 1);
  assert.notEqual(result.add[0].id, 'aaaaaaaaaaaa');
  assert.match(result.add[0].id, /^[A-Za-z0-9_-]{12}$/);
  assert.equal(result.skipped, 1);
});

test('import drops an abbreviation that clashes, and keeps the snippet', () => {
  const file = JSON.stringify([
    { title: 'Address 2', content: 'Other street', abbreviation: ';addr' },
    { title: 'Prefix', content: 'Prefix clash', abbreviation: ';ad' },
    { title: 'Fine', content: 'No clash', abbreviation: ';fine' },
  ]);
  const result = lib.parseImport(file, stored);
  assert.equal(result.add.length, 3);
  assert.equal(result.abbreviationsDropped, 2);
  assert.equal(result.add[0].abbreviation, undefined);
  assert.equal(result.add[1].abbreviation, undefined);
  assert.equal(result.add[2].abbreviation, ';fine');
  assert.match(lib.importReport(result), /2 snippets lost an abbreviation/);
});

test('import skips records without text and cuts long names', () => {
  const file = JSON.stringify({
    format: 'snippet-inserter',
    version: 1,
    snippets: [{ title: 'Empty', content: '   ' }, { content: 42 }, null, { title: 'x'.repeat(200), content: 'Long name' }],
  });
  const result = lib.parseImport(file, []);
  assert.equal(result.invalid, 3);
  assert.equal(result.add.length, 1);
  assert.equal(result.add[0].title.length, 128);
  assert.match(result.add[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('import refuses files that are not backups, and backups from a newer version', () => {
  assert.throws(() => lib.parseImport('{ nope', []), /not valid JSON/);
  assert.throws(() => lib.parseImport('{"hello": 1}', []), /not a snippet backup/);
  assert.throws(
    () => lib.parseImport(JSON.stringify({ format: 'snippet-inserter', version: 2, snippets: [] }), []),
    /newer version/
  );
});

test('abbreviation rules', () => {
  assert.equal(lib.abbreviationProblem('', stored), null);
  assert.equal(lib.abbreviationProblem(';x', stored), null);
  assert.match(lib.abbreviationProblem('a', stored), /2 to 32 characters/);
  assert.match(lib.abbreviationProblem('has space', stored), /without spaces/);
  assert.match(lib.abbreviationProblem(';addr', stored), /already uses ;addr/);
  assert.match(lib.abbreviationProblem(';ad', stored), /starts with this one/);
  assert.match(lib.abbreviationProblem(';address', stored), /starts with another snippet's abbreviation, ;addr/);
  assert.equal(lib.abbreviationProblem(';addr', stored, 'aaaaaaaaaaaa'), null);
});

test('search matches word starts in names and text, and abbreviation starts', () => {
  const titles = (query) => lib.filterSnippets(stored, query).map(lib.displayTitle);
  assert.deepEqual(titles(''), ['Address', 'Kind regards,']);
  assert.deepEqual(titles('k'), ['Kind regards,']);
  assert.deepEqual(titles('elm'), ['Address']);
  assert.deepEqual(titles('lm'), []);
  assert.deepEqual(titles(';ad'), ['Address']);
});

test('preview line and character count', () => {
  assert.equal(lib.previewLine(stored[0]), '14 Elm Street');
  assert.equal(lib.previewLine(stored[1]), 'Ana');
  assert.equal(lib.previewLine({ title: '', content: 'One line' }), '');
  assert.equal(lib.characterCount('', 'en-US'), '0 characters');
  assert.equal(lib.characterCount('x', 'en-US'), '1 character');
  assert.equal(lib.characterCount('x'.repeat(7693), 'en-US'), '7,693 characters');
});
