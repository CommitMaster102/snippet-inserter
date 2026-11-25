// Unit tests for how extension/lib/snippets.js stores, exports, and imports formatted snippets.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../../extension/lib/snippets.js');

// A stand-in for lib/richtext.js, which needs the browser's HTML parser. It takes the text from
// between the tags and counts any tag but <br> as formatting. The cleaner's own tests are in
// tests/e2e/richtext.spec.js.
const richText = {
  clean(html) {
    return {
      html,
      text: html.replace(/<br>/g, '\n').replace(/<[^>]*>/g, ''),
      formatted: /<(?!br>)[a-z]/.test(html),
    };
  },
  renameText: (html, from, to) => html.split(from).join(to),
};

const createdAt = '2026-01-01T00:00:00.000Z';

function backup(snippets) {
  return JSON.stringify({ format: 'snippet-inserter', version: 1, exportedAt: createdAt, snippets });
}

// A stand-in for chrome.storage.local that keeps values in a Map and copies them like the real
// storage does, with the cleaner stand-in where the extension pages load the real one.
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
  globalThis.SnippetInserter = { richText };
  return values;
}

function clearStorage() {
  delete globalThis.chrome;
  delete globalThis.SnippetInserter;
}

test('an export writes html only for a formatted snippet, and stays version 1', () => {
  const data = JSON.parse(
    lib.buildExport([
      { createdAt, content: 'Plain', title: '', id: 'aaaaaaaaaaaa', html: '' },
      { createdAt, content: 'Bold', title: '', id: 'bbbbbbbbbbbb', html: '<b>Bold</b>' },
    ])
  );
  assert.equal(data.version, 1);
  assert.deepEqual(Object.keys(data.snippets[0]), ['createdAt', 'content', 'title', 'id']);
  assert.equal(data.snippets[1].html, '<b>Bold</b>');
});

test('import takes the text from the html, so a backup cannot show other text than it inserts', () => {
  const file = backup([{ title: 'F', content: 'Something else', html: '<b>Hello</b><br>world', id: 'cccccccccccc', createdAt }]);
  const [added] = lib.parseImport(file, [], richText).add;
  assert.equal(added.content, 'Hello\nworld');
  assert.equal(added.html, '<b>Hello</b><br>world');
});

test('import keeps a snippet whose html has no formatting as plain, and needs text in one of the two', () => {
  const file = backup([
    { title: 'A', content: 'x', html: 'just text' },
    { title: 'B', html: '<i>Only html</i>' },
    { title: 'C', content: '  ', html: '<b> </b>' },
    { title: 'D', content: 42, html: 7 },
  ]);
  const result = lib.parseImport(file, [], richText);
  assert.deepEqual(
    result.add.map((s) => [s.title, s.content, s.html]),
    [
      ['A', 'just text', undefined],
      ['B', 'Only html', '<i>Only html</i>'],
    ]
  );
  assert.equal('html' in result.add[0], false);
  assert.equal(result.invalid, 2);
});

test('import adds a formatted copy of a stored plain snippet, and skips an identical formatted one', () => {
  const existing = [{ createdAt, title: 'T', content: 'Hi', id: 'aaaaaaaaaaaa' }];
  const file = backup([
    { title: 'T', content: 'Hi', html: '<b>Hi</b>' },
    { title: 'T', content: 'Hi' },
  ]);
  const first = lib.parseImport(file, existing, richText);
  assert.equal(first.add.length, 1);
  assert.equal(first.add[0].html, '<b>Hi</b>');
  assert.equal(first.skipped, 1);
  const second = lib.parseImport(file, [...existing, ...first.add], richText);
  assert.equal(second.add.length, 0);
  assert.equal(second.skipped, 2);
});

test('without the cleaner, import keeps the text and drops the formatting', () => {
  const file = backup([{ title: 'F', content: 'Hello world', html: '<b>Hello</b> world' }]);
  const [added] = lib.parseImport(file, []).add;
  assert.equal(added.content, 'Hello world');
  assert.equal('html' in added, false);
});

test('saving stores html only with formatting, and takes the text from it', async () => {
  const values = fakeStorage();
  const stored = (id) => values.get(lib.STORAGE_KEY).find((s) => s.id === id);
  try {
    const { snippet: formatted } = await lib.createSnippet({ content: 'ignored', html: '<b>Hi</b> there', title: 'F' });
    assert.deepEqual([stored(formatted.id).content, stored(formatted.id).html], ['Hi there', '<b>Hi</b> there']);
    const { snippet: plain } = await lib.createSnippet({ content: 'ignored', html: 'no tags', title: 'P' });
    assert.deepEqual(Object.keys(stored(plain.id)), ['createdAt', 'content', 'title', 'id']);
    assert.equal(stored(plain.id).content, 'no tags');

    await lib.updateSnippet(formatted.id, { folder: 'Work' });
    assert.equal(stored(formatted.id).html, '<b>Hi</b> there');
    await lib.updateSnippet(formatted.id, { content: 'Hi there', html: '<i>Hi</i> there' });
    assert.equal(stored(formatted.id).html, '<i>Hi</i> there');
    await lib.updateSnippet(formatted.id, { content: 'Plain now', html: '' });
    assert.deepEqual([stored(formatted.id).content, 'html' in stored(formatted.id)], ['Plain now', false]);
  } finally {
    clearStorage();
  }
});

test('duplicate, delete, and restore keep the formatting', async () => {
  const values = fakeStorage();
  try {
    const { snippet } = await lib.createSnippet({ content: '', html: '<u>Under</u>', title: 'U' });
    const { snippet: copy } = await lib.duplicateSnippet(snippet.id);
    assert.equal(copy.html, '<u>Under</u>');
    await lib.deleteSnippet(snippet.id);
    assert.equal(values.get(lib.DELETED_KEY)[0].html, '<u>Under</u>');
    const { snippet: restored } = await lib.restoreSnippet(snippet.id);
    assert.equal(restored.html, '<u>Under</u>');
    assert.equal(restored.content, 'Under');
  } finally {
    clearStorage();
  }
});

test('renaming an abbreviation rewrites references in formatted text too', async () => {
  const list = [
    { createdAt, title: '', id: 'a', content: '{snippet:;sig}', html: '<b>{snippet:;sig}</b>' },
    { createdAt, title: '', id: 'b', content: 'Sig', abbreviation: ';sig' },
  ];
  // Without the cleaner the escaped token is replaced in the html.
  const plainList = list.map((s) => ({ ...s }));
  assert.equal(lib.renameReferences(plainList, ';sig', ';s&g', 'b'), 1);
  assert.deepEqual([plainList[0].content, plainList[0].html], ['{snippet:;s&g}', '<b>{snippet:;s&amp;g}</b>']);

  fakeStorage();
  try {
    await chrome.storage.local.set({ [lib.STORAGE_KEY]: list });
    const result = await lib.updateSnippet('b', { abbreviation: ';sign' });
    assert.equal(result.referencesRenamed, 1);
    const [renamed] = result.snippets;
    assert.deepEqual([renamed.content, renamed.html], ['{snippet:;sign}', '<b>{snippet:;sign}</b>']);
  } finally {
    clearStorage();
  }
});
