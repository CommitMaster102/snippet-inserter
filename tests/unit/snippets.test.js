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

test('search matches Korean at word starts, because Korean puts spaces between words', () => {
  const list = [
    { title: '', content: '우리학교에서 만나요', id: 'a' },
    { title: '', content: '학교 앞', id: 'b' },
  ];
  // A word start is found, including the start of a later word.
  assert.deepEqual(lib.filterSnippets(list, '학교').map((s) => s.id), ['b']);
  assert.deepEqual(lib.filterSnippets(list, '만나').map((s) => s.id), ['a']);
  // Text in the middle of a Korean word is not found.
  assert.deepEqual(lib.filterSnippets(list, '에서'), []);
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

// Folders. A folder is an optional name on a snippet; the list of folders is worked out from the
// snippets, so there is nothing else to store.

const inFolders = [
  { createdAt: '2026-01-01T00:00:00.000Z', title: 'A', content: 'a', id: 'aaaaaaaaaaaa', folder: 'Work' },
  { createdAt: '2026-01-02T00:00:00.000Z', title: 'B', content: 'b', id: 'bbbbbbbbbbbb' },
  { createdAt: '2026-01-03T00:00:00.000Z', title: 'C', content: 'c', id: 'cccccccccccc', folder: 'Personal' },
  { createdAt: '2026-01-04T00:00:00.000Z', title: 'D', content: 'd', id: 'dddddddddddd', folder: 'Work' },
  { createdAt: '2026-01-05T00:00:00.000Z', title: 'E', content: 'e', id: 'eeeeeeeeeeee', folder: 'Work' },
];

test('a record keeps a folder only when it has one, so 1.2.0 records keep their keys', () => {
  const plain = { createdAt: 't', content: 'x', title: 'n', id: 'i' };
  const written = (record) => JSON.parse(lib.buildExport([record])).snippets[0];
  assert.deepEqual(Object.keys(written(plain)), ['createdAt', 'content', 'title', 'id']);
  assert.equal(written({ ...plain, folder: 'Work' }).folder, 'Work');
  assert.ok(!('folder' in written({ ...plain, folder: '' })));
});

test('cleanFolder trims, joins white space into one space, and cuts to 64 characters', () => {
  assert.equal(lib.cleanFolder('  Work  '), 'Work');
  assert.equal(lib.cleanFolder('a\tb\r\nc   d\u0001e'), 'a b c d e');
  assert.equal(lib.cleanFolder('x'.repeat(70)), 'x'.repeat(64));
  assert.equal(lib.cleanFolder('😀'.repeat(70)), '😀'.repeat(64));
  assert.equal(lib.cleanFolder(42), '');
  assert.equal(lib.cleanFolder(undefined), '');
  assert.equal(lib.FOLDER_MAX_LENGTH, 64);
  assert.equal(lib.folderLength('😀'.repeat(65)), 65);
});

test('folderNames lists each folder once, ignores capitals, and sorts numbers as numbers', () => {
  const list = [
    { folder: '10 Support' },
    { folder: 'banana' },
    { folder: '2 Sales' },
    { folder: 'Apple' },
    { folder: 'banana' },
    {},
    { folder: '' },
  ];
  assert.deepEqual(lib.folderNames(list), ['2 Sales', '10 Support', 'Apple', 'banana']);
  assert.deepEqual(lib.folderNames([{}, { title: 'x' }]), []);
});

test('matchFolder uses the stored spelling of a folder that differs only in capitals', () => {
  assert.equal(lib.matchFolder('work', inFolders), 'Work');
  assert.equal(lib.matchFolder('  PERSONAL ', inFolders), 'Personal');
  assert.equal(lib.matchFolder('Travel', inFolders), 'Travel');
  assert.equal(lib.matchFolder('', inFolders), '');
  assert.equal(lib.matchFolder(null, inFolders), '');
  // An accent is a different letter, not a capital.
  assert.equal(lib.matchFolder('Wörk', inFolders), 'Wörk');
});

test('matchFolder keeps hiragana and katakana, and full-width and normal letters, apart', () => {
  const list = [{ folder: 'しごと' }, { folder: 'Work' }];
  assert.equal(lib.matchFolder('シゴト', list), 'シゴト');
  assert.equal(lib.matchFolder('Ｗｏｒｋ', list), 'Ｗｏｒｋ');
  assert.equal(lib.matchFolder('しごと', list), 'しごと');
});

test('inFolder returns everything, no folder, or one folder', () => {
  assert.equal(lib.inFolder(inFolders, null), inFolders);
  assert.deepEqual(lib.inFolder(inFolders, '').map((s) => s.id), ['bbbbbbbbbbbb']);
  assert.deepEqual(lib.inFolder(inFolders, 'Work').map((s) => s.id), ['aaaaaaaaaaaa', 'dddddddddddd', 'eeeeeeeeeeee']);
  assert.deepEqual(lib.inFolder(inFolders, 'Nope'), []);
});

test('moveTarget finds the neighbour among the snippets shown and returns its place in the list', () => {
  const shown = lib.inFolder(inFolders, 'Work');
  // A moves past D, skipping the snippets of other folders in between.
  assert.equal(lib.moveTarget(inFolders, shown, 'aaaaaaaaaaaa', 1), 3);
  assert.equal(lib.moveTarget(inFolders, shown, 'eeeeeeeeeeee', -1), 3);
  assert.equal(lib.moveTarget(inFolders, shown, 'aaaaaaaaaaaa', -1), -1);
  assert.equal(lib.moveTarget(inFolders, shown, 'eeeeeeeeeeee', 1), -1);
  assert.equal(lib.moveTarget(inFolders, shown, 'missing', 1), -1);
  // On the whole list the target is the current place plus the step, as in 1.2.0.
  assert.equal(lib.moveTarget(inFolders, inFolders, 'cccccccccccc', 1), 3);
  assert.equal(lib.moveTarget(inFolders, inFolders, 'cccccccccccc', -1), 1);
});

test('search finds a snippet by a word in its folder name', () => {
  assert.deepEqual(lib.filterSnippets(inFolders, 'pers').map((s) => s.id), ['cccccccccccc']);
  assert.deepEqual(lib.filterSnippets(inFolders, 'ork').map((s) => s.id), []);
});

test('an export with folders parses back into the same records, and stays version 1', () => {
  const text = lib.buildExport(inFolders, new Date('2026-11-20T09:30:00Z'));
  assert.equal(JSON.parse(text).version, 1);
  assert.deepEqual(lib.parseImport(text, []).add, inFolders);
});

test('a 1.2.0 export imports with no folder on any record', () => {
  const file = `{
  "format": "snippet-inserter",
  "version": 1,
  "exportedAt": "2026-11-20T09:30:00.000Z",
  "snippets": [
    { "createdAt": "2026-01-01T00:00:00.000Z", "content": "14 Elm Street", "title": "Address", "id": "aaaaaaaaaaaa", "abbreviation": ";addr" },
    { "createdAt": "2026-01-02T00:00:00.000Z", "content": "Kind regards", "title": "", "id": "bbbbbbbbbbbb" }
  ]
}`;
  const result = lib.parseImport(file, []);
  assert.equal(result.add.length, 2);
  assert.ok(result.add.every((s) => !('folder' in s)));
  assert.equal(lib.importReport(result), 'Imported 2 snippets.');
});

test('import joins a folder that differs in capitals, and drops a folder that is not text', () => {
  const file = JSON.stringify([
    { content: 'one', title: '1', folder: 'work', id: 'xxxxxxxxxxx1' },
    { content: 'two', title: '2', folder: 7, id: 'xxxxxxxxxxx2' },
    { content: 'three', title: '3', folder: ['Work'], id: 'xxxxxxxxxxx3' },
    { content: 'four', title: '4', folder: 'TRAVEL', id: 'xxxxxxxxxxx4' },
    { content: 'five', title: '5', folder: 'travel', id: 'xxxxxxxxxxx5' },
    { content: 'six', title: '6', folder: '  ', id: 'xxxxxxxxxxx6' },
  ]);
  const result = lib.parseImport(file, inFolders);
  assert.equal(result.add.length, 6);
  assert.deepEqual(
    result.add.map((s) => s.folder),
    ['Work', undefined, undefined, 'TRAVEL', 'TRAVEL', undefined]
  );
});

test('import skips a record that matches a stored snippet, whatever folder either is in', () => {
  const file = JSON.stringify([{ title: 'A', content: 'a', folder: 'Elsewhere' }]);
  const result = lib.parseImport(file, inFolders);
  assert.equal(result.skipped, 1);
  assert.equal(result.add.length, 0);
});

test('create, update, duplicate, delete, and restore keep a snippet in its folder', async () => {
  fakeStorage();
  try {
    const { snippet: a } = await lib.createSnippet({ content: 'A', title: 'A', abbreviation: '', folder: 'Work' });
    assert.equal(a.folder, 'Work');
    const { snippet: b } = await lib.createSnippet({ content: 'B', title: 'B', abbreviation: '', folder: 'work' });
    assert.equal(b.folder, 'Work');
    const { snippet: plain } = await lib.createSnippet({ content: 'P', title: 'P', abbreviation: '' });
    assert.deepEqual(Object.keys(plain), ['createdAt', 'content', 'title', 'id']);

    // A change that does not mention the folder keeps it.
    const kept = await lib.updateSnippet(a.id, { content: 'A2', title: 'A', abbreviation: '' });
    assert.equal(kept.snippet.folder, 'Work');
    const only = await lib.updateSnippet(a.id, { folder: 'Home' });
    assert.equal(only.snippet.content, 'A2');
    assert.equal(only.snippet.folder, 'Home');
    const cleared = await lib.updateSnippet(a.id, { folder: '' });
    assert.ok(!('folder' in cleared.snippet));

    const copied = await lib.duplicateSnippet(b.id);
    assert.equal(copied.snippet.folder, 'Work');

    await lib.deleteSnippet(b.id);
    const restored = await lib.restoreSnippet(b.id);
    assert.equal(restored.snippet.folder, 'Work');
    assert.equal(restored.snippets.indexOf(restored.snippet), 1);
  } finally {
    delete globalThis.chrome;
  }
});

test('updateSnippet keeps a stored abbreviation when the change leaves it out', async () => {
  fakeStorage();
  try {
    const { snippet } = await lib.createSnippet({ content: 'A', title: 'A', abbreviation: ';aa', folder: 'Work' });
    const result = await lib.updateSnippet(snippet.id, { folder: 'Home' });
    assert.equal(result.snippet.abbreviation, ';aa');
    assert.equal((await lib.readSnippets())[0].abbreviation, ';aa');
  } finally {
    delete globalThis.chrome;
  }
});

test('renameFolder changes a whole folder in one write, keeps the order, and merges by capitals', async () => {
  const values = fakeStorage();
  try {
    const make = (title, folder, abbreviation = '') => lib.createSnippet({ content: title, title, abbreviation, folder });
    await make('A', 'Work', ';aa');
    await make('B', '');
    await make('C', 'Personal');
    await make('D', 'Work', ';dd');
    const before = values.get(lib.ABBREVIATIONS_KEY);
    let writes = 0;
    const set = globalThis.chrome.storage.local.set;
    globalThis.chrome.storage.local.set = async (items) => {
      writes++;
      return set(items);
    };

    let list = await lib.renameFolder('Work', 'Job');
    assert.equal(writes, 1);
    assert.deepEqual(list.map((s) => s.title), ['A', 'B', 'C', 'D']);
    assert.deepEqual(list.map((s) => s.folder), ['Job', undefined, 'Personal', 'Job']);

    list = await lib.renameFolder('Job', 'personal');
    assert.deepEqual(list.map((s) => s.folder), ['Personal', undefined, 'Personal', 'Personal']);

    list = await lib.removeFolder('Personal');
    assert.deepEqual(list.map((s) => s.title), ['A', 'B', 'C', 'D']);
    assert.ok(list.every((s) => !('folder' in s)));
    assert.deepEqual(values.get(lib.ABBREVIATIONS_KEY), before);
  } finally {
    delete globalThis.chrome;
  }
});

// Renaming an abbreviation rewrites {snippet:...} references in other snippets.

test('renameReferences changes only exact tokens in other snippets, and keeps every other field', () => {
  const list = [
    { id: 'a', content: 'see {snippet:;sig} and {snippet:;older} {snippet:;sig}', title: 'T', folder: 'Work', abbreviation: ';aa', createdAt: 'x' },
    { id: 'b', content: 'own {snippet:;sig}', abbreviation: ';sig' },
    { id: 'c', content: 'none' },
  ];
  const changed = lib.renameReferences(list, ';sig', ';sign', 'b');
  assert.equal(changed, 1);
  assert.deepEqual(list[0], { id: 'a', content: 'see {snippet:;sign} and {snippet:;older} {snippet:;sign}', title: 'T', folder: 'Work', abbreviation: ';aa', createdAt: 'x' });
  assert.equal(list[1].content, 'own {snippet:;sig}');
  assert.equal(list[2].content, 'none');
  assert.equal(lib.countUsers(list, ';older'), 1);
  assert.equal(lib.countUsers(list, ';sig'), 1);
});

test('updateSnippet rewrites references in the same write when an abbreviation changes', async () => {
  const values = fakeStorage();
  try {
    const { snippet: target } = await lib.createSnippet({ content: 'Sig', title: '', abbreviation: ';a1' });
    const { snippet: user } = await lib.createSnippet({ content: 'Hi {snippet:;a1}', title: '' });
    const writes = [];
    const set = chrome.storage.local.set;
    chrome.storage.local.set = async (items) => {
      writes.push(items);
      return set(items);
    };
    const result = await lib.updateSnippet(target.id, { content: 'Sig', title: '', abbreviation: ';a2' });
    assert.equal(result.referencesRenamed, 1);
    assert.equal(writes.length, 1);
    assert.equal(values.get(lib.STORAGE_KEY)[1].content, 'Hi {snippet:;a2}');
    assert.equal(result.snippets.find((s) => s.id === user.id).content, 'Hi {snippet:;a2}');

    const cleared = await lib.updateSnippet(target.id, { content: 'Sig', title: '', abbreviation: '' });
    assert.equal(cleared.referencesRenamed, 0);
    assert.equal(values.get(lib.STORAGE_KEY)[1].content, 'Hi {snippet:;a2}');
  } finally {
    delete globalThis.chrome;
  }
});

test('renaming an abbreviation to one with a brace leaves the references as they were', async () => {
  const values = fakeStorage();
  try {
    const { snippet: target } = await lib.createSnippet({ content: 'Sig', title: '', abbreviation: ';sig' });
    await lib.createSnippet({ content: 'Hello\n{snippet:;sig}', title: '' });
    const result = await lib.updateSnippet(target.id, { content: 'Sig', title: '', abbreviation: ';s{g' });
    assert.equal(result.referencesRenamed, 0);
    assert.equal(values.get(lib.STORAGE_KEY)[1].content, 'Hello\n{snippet:;sig}');
    assert.equal(lib.isReferenceable(';s{g'), false);
    assert.equal(lib.isReferenceable(';sig'), true);
    assert.equal(lib.isReferenceable(';s}'), false);
  } finally {
    delete globalThis.chrome;
  }
});

test('a snippet that gets its first abbreviation rewrites nothing, and a failed rename writes nothing', async () => {
  const values = fakeStorage();
  try {
    const { snippet: target } = await lib.createSnippet({ content: 'Sig', title: '' });
    await lib.createSnippet({ content: 'Hi {snippet:;a1}', title: '' });
    const first = await lib.updateSnippet(target.id, { content: 'Sig', title: '', abbreviation: ';a1' });
    assert.equal(first.referencesRenamed, 0);
    const { snippet: other } = await lib.createSnippet({ content: 'Other', title: '', abbreviation: ';zz' });
    const before = JSON.stringify(values.get(lib.STORAGE_KEY));
    await assert.rejects(lib.updateSnippet(target.id, { content: 'Sig', title: '', abbreviation: ';zz' }));
    assert.equal(JSON.stringify(values.get(lib.STORAGE_KEY)), before);
    assert.ok(other);
  } finally {
    delete globalThis.chrome;
  }
});

test('an export holding a reference parses back unchanged', () => {
  const list = [
    { createdAt: '2026-01-01T00:00:00.000Z', title: '', content: 'Hi {snippet:;sig}', id: 'aaaaaaaaaaaa' },
    { createdAt: '2026-01-02T00:00:00.000Z', title: 'Sig', content: 'Ana', id: 'bbbbbbbbbbbb', abbreviation: ';sig' },
  ];
  const text = lib.buildExport(list, new Date('2026-11-20T09:30:00Z'));
  assert.equal(JSON.parse(text).version, 1);
  assert.deepEqual(lib.parseImport(text, []).add, list);
});

test('abbreviationMode reads a 1.2.0 settings object as immediate or off', () => {
  assert.equal(lib.abbreviationMode({ hotkey: 'Control', abbreviations: true }), 'immediate');
  assert.equal(lib.abbreviationMode({ hotkey: 'Control', abbreviations: false }), 'off');
  assert.equal(lib.abbreviationMode({ abbreviations: true, abbreviationTiming: 'delimiter' }), 'delimiter');
  assert.equal(lib.abbreviationMode({ abbreviations: false, abbreviationTiming: 'delimiter' }), 'off');
});

test('writeAbbreviationMode stores abbreviationTiming only when the user picks the delimiter mode', async () => {
  const values = fakeStorage();
  try {
    await lib.writeAbbreviationMode('off');
    assert.deepEqual(values.get(lib.SETTINGS_KEY), { abbreviations: false });
    await lib.writeAbbreviationMode('immediate');
    assert.deepEqual(values.get(lib.SETTINGS_KEY), { abbreviations: true });
    await lib.writeAbbreviationMode('delimiter');
    assert.deepEqual(values.get(lib.SETTINGS_KEY), { abbreviations: true, abbreviationTiming: 'delimiter' });
    // Off keeps the stored timing, so going back to the delimiter mode is one pick.
    await lib.writeAbbreviationMode('off');
    assert.deepEqual(values.get(lib.SETTINGS_KEY), { abbreviations: false, abbreviationTiming: 'delimiter' });
    assert.equal(lib.abbreviationMode(await lib.readSettings()), 'off');
    await lib.writeAbbreviationMode('immediate');
    assert.deepEqual(values.get(lib.SETTINGS_KEY), { abbreviations: true, abbreviationTiming: 'immediate' });
  } finally {
    delete globalThis.chrome;
  }
});

test('siteHost reduces what the user types to a host name', () => {
  assert.equal(lib.siteHost('Example.COM'), 'example.com');
  assert.equal(lib.siteHost('https://mail.example.com/inbox'), 'mail.example.com');
  assert.equal(lib.siteHost('*.example.com'), 'example.com');
  assert.equal(lib.siteHost('localhost:3000'), 'localhost');
  assert.equal(lib.siteHost('example.com.'), 'example.com');
  assert.equal(lib.siteHost('bücher.de'), 'xn--bcher-kva.de');
  for (const bad of ['not a site', '..', 'http://', 'chrome://extensions', '', '   ', 'a%20b.com']) {
    assert.equal(lib.siteHost(bad), '', JSON.stringify(bad));
  }
});

test('offSiteEntry matches a host and its subdomains only', () => {
  const entries = ['example.com', 'other.org'];
  assert.equal(lib.offSiteEntry('example.com', entries), 'example.com');
  assert.equal(lib.offSiteEntry('a.b.example.com', entries), 'example.com');
  assert.equal(lib.offSiteEntry('notexample.com', entries), null);
  assert.equal(lib.offSiteEntry('example.com.evil.net', entries), null);
  assert.equal(lib.offSiteEntry('example.com', []), null);
});

test('addOffSite stores sorted host names and refuses what is invalid, listed, or covered', async () => {
  const values = fakeStorage();
  try {
    assert.deepEqual(await lib.addOffSite('https://Zeta.example.net/x'), { host: 'zeta.example.net', offSites: ['zeta.example.net'] });
    await lib.addOffSite('mail.example.com');
    assert.deepEqual(values.get(lib.SETTINGS_KEY).offSites, ['mail.example.com', 'zeta.example.net']);
    await assert.rejects(lib.addOffSite('not a site'), { message: 'Enter a site such as example.com.' });
    await assert.rejects(lib.addOffSite('zeta.example.net'), { message: 'zeta.example.net is already on the list.' });
    await assert.rejects(lib.addOffSite('a.zeta.example.net'), {
      message: 'a.zeta.example.net is already off, because zeta.example.net is on the list.',
    });
    // Adding the parent drops the subdomain it now covers.
    const added = await lib.addOffSite('example.com');
    assert.deepEqual(added.offSites, ['example.com', 'zeta.example.net']);
    assert.deepEqual(values.get(lib.SETTINGS_KEY), { offSites: ['example.com', 'zeta.example.net'] });
  } finally {
    delete globalThis.chrome;
  }
});

test('removeOffSite removes only the named entry and leaves an empty list behind', async () => {
  const values = fakeStorage();
  try {
    await lib.addOffSite('one.test');
    await lib.addOffSite('two.test');
    assert.deepEqual(await lib.removeOffSite('one.test'), ['two.test']);
    assert.deepEqual(await lib.removeOffSite('two.test'), []);
    assert.deepEqual(values.get(lib.SETTINGS_KEY), { offSites: [] });
  } finally {
    delete globalThis.chrome;
  }
});

// A flag, a skin-tone emoji, and a family emoji are each built from several code points, but a
// person sees one character.
const MULTI_CODE_POINT_EMOJI = ['🇯🇵', '👍🏽', '👨‍👩‍👧'];

test('a name counts a flag, a skin-tone emoji, and a family emoji as one character each', () => {
  for (const emoji of MULTI_CODE_POINT_EMOJI) assert.equal(lib.titleLength(emoji), 1, emoji);
  assert.equal(lib.titleLength(`a${MULTI_CODE_POINT_EMOJI.join('')}`), 4);
});

test('a name is never cut inside a flag, a skin-tone emoji, or a family emoji', () => {
  for (const emoji of MULTI_CODE_POINT_EMOJI) {
    const cut = lib.cutTitle(`${'x'.repeat(lib.TITLE_MAX_LENGTH - 1)}${emoji}${emoji}`);
    assert.equal(cut, `${'x'.repeat(lib.TITLE_MAX_LENGTH - 1)}${emoji}`, emoji);
    assert.equal(lib.titleLength(cut), lib.TITLE_MAX_LENGTH);
  }
});

test('a folder name counts and cuts a flag, a skin-tone emoji, and a family emoji as one character each', () => {
  for (const emoji of MULTI_CODE_POINT_EMOJI) {
    assert.equal(lib.folderLength(emoji), 1, emoji);
    assert.equal(lib.cleanFolder(emoji.repeat(lib.FOLDER_MAX_LENGTH + 1)), emoji.repeat(lib.FOLDER_MAX_LENGTH), emoji);
  }
});

test('the character count treats a flag, a skin-tone emoji, and a family emoji as one character each', () => {
  for (const emoji of MULTI_CODE_POINT_EMOJI) assert.equal(lib.characterCount(emoji, 'en'), '1 character', emoji);
  assert.equal(lib.characterCount(MULTI_CODE_POINT_EMOJI.join(''), 'en'), '3 characters');
});
