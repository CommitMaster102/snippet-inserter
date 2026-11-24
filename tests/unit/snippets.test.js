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

// A stand-in for chrome.storage.local that keeps values in a Map and copies them like the real
// storage does.
function fakeStorage() {
  const values = new Map();
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const result = {};
          for (const key of [].concat(keys)) if (values.has(key)) result[key] = copy(values.get(key));
          return result;
        },
        async set(items) {
          for (const [key, value] of Object.entries(items)) values.set(key, copy(value));
        },
      },
    },
  };
  return values;
}

test('every change to the list rewrites the abbreviation index with it', async () => {
  const values = fakeStorage();
  const index = () => values.get(lib.ABBREVIATIONS_KEY);
  try {
    const { snippet: a } = await lib.createSnippet({ content: 'A', title: '', abbreviation: ';a1' });
    const { snippet: b } = await lib.createSnippet({ content: 'B', title: '', abbreviation: '' });
    assert.deepEqual(index(), { ';a1': a.id });
    await lib.updateSnippet(b.id, { content: 'B', title: '', abbreviation: ';b1' });
    assert.deepEqual(index(), { ';a1': a.id, ';b1': b.id });
    await lib.deleteSnippet(a.id);
    assert.deepEqual(index(), { ';b1': b.id });
    await lib.restoreSnippet(a.id);
    assert.deepEqual(index(), { ';a1': a.id, ';b1': b.id });
    await lib.updateSnippet(a.id, { content: 'A', title: '', abbreviation: '' });
    assert.deepEqual(index(), { ';b1': b.id });
  } finally {
    delete globalThis.chrome;
  }
});

test('saving refuses an abbreviation that clashes with the stored list and writes nothing', async () => {
  const values = fakeStorage();
  try {
    const { snippet: a } = await lib.createSnippet({ content: 'A', title: '', abbreviation: ';sig' });
    const { snippet: b } = await lib.createSnippet({ content: 'B', title: '', abbreviation: '' });
    await assert.rejects(
      lib.createSnippet({ content: 'C', title: '', abbreviation: ';sigs' }),
      { message: lib.abbreviationProblem(';sigs', [a]) }
    );
    await assert.rejects(
      lib.updateSnippet(b.id, { content: 'B', title: '', abbreviation: ';sig' }),
      { message: 'Another snippet already uses ;sig.' }
    );
    assert.equal(values.get(lib.STORAGE_KEY).length, 2);
    assert.deepEqual(values.get(lib.ABBREVIATIONS_KEY), { ';sig': a.id });
    await lib.updateSnippet(a.id, { content: 'A2', title: '', abbreviation: ';sig' });
  } finally {
    delete globalThis.chrome;
  }
});

test('search finds text in the middle of scripts written without spaces', () => {
  const list = [
    { title: '', content: 'お世話になっております', id: 'a' },
    { title: '', content: 'สวัสดีครับ', id: 'b' },
    { title: '', content: 'Hello there', id: 'c' },
  ];
  assert.deepEqual(lib.filterSnippets(list, '世話').map((s) => s.id), ['a']);
  assert.deepEqual(lib.filterSnippets(list, 'ครับ').map((s) => s.id), ['b']);
  // Latin text still matches only at the start of a word.
  assert.deepEqual(lib.filterSnippets(list, 'ello'), []);
});

test('search finds a word after an apostrophe or a hyphen, and accented words', () => {
  const list = [
    { title: "Message à l'école", content: 'x', id: 'a' },
    { title: '', content: 'Rendez-vous demain', id: 'b' },
    { title: '', content: 'Über uns', id: 'c' },
  ];
  assert.deepEqual(lib.filterSnippets(list, 'école').map((s) => s.id), ['a']);
  assert.deepEqual(lib.filterSnippets(list, 'vous').map((s) => s.id), ['b']);
  assert.deepEqual(lib.filterSnippets(list, 'über').map((s) => s.id), ['c']);
  // A letter in the middle of a word is not a word start.
  assert.deepEqual(lib.filterSnippets(list, 'cole'), []);
});

test('search compares text in one Unicode form', () => {
  const stored = [{ title: 'café menu', content: 'x', id: 'a' }];
  assert.deepEqual(lib.filterSnippets(stored, 'café').map((s) => s.id), ['a']);
  const decomposed = [{ title: 'café menu', content: 'x', id: 'a' }];
  assert.deepEqual(lib.filterSnippets(decomposed, 'café').map((s) => s.id), ['a']);
  assert.deepEqual(lib.filterSnippets(decomposed, 'menu').map((s) => s.id), ['a']);
});

test('a name is cut at whole characters, never inside an emoji', async () => {
  const cut = lib.parseImport(JSON.stringify([{ title: `x${'😀'.repeat(200)}`, content: 'A', id: 'aaaaaaaaaaaa' }]), []);
  const title = cut.add[0].title;
  assert.ok(title.isWellFormed());
  assert.equal([...title].length, lib.TITLE_MAX_LENGTH);
  assert.equal(title, `x${'😀'.repeat(lib.TITLE_MAX_LENGTH - 1)}`);

  fakeStorage();
  try {
    const { snippet } = await lib.createSnippet({ content: 'A', title: `${'x'.repeat(119)}😀😀`, abbreviation: '' });
    const { snippets } = await lib.duplicateSnippet(snippet.id);
    const copy = snippets[1].title;
    assert.ok(copy.isWellFormed());
    assert.equal(copy, `Copy of ${'x'.repeat(119)}😀`);
  } finally {
    delete globalThis.chrome;
  }
});

test('a name is measured in characters, as the form counts', () => {
  assert.equal(lib.titleLength('😀'.repeat(128)), 128);
  assert.equal(lib.titleLength('abc'), 3);
});
