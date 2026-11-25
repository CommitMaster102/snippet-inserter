// The code tools of the snippet manager: the Format JSON button, the language menu of a code
// block, and the syntax colors that are stored with a snippet.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, readSnippets, openManager } = require('./helpers');

async function openSnippet(manager, name) {
  await manager.locator('#snippetList .row').filter({ hasText: name }).click();
  await expect(manager.locator('#title')).toHaveValue(name);
}

/** Puts the caret inside the text of the nth code block of the rich editor, `offset` characters in. */
async function caretInBlock(manager, n = 0, offset = 1) {
  await manager.locator('#richContent').evaluate(
    (editor, [index, at]) => {
      editor.focus();
      const pre = editor.querySelectorAll('pre')[index];
      const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      const range = document.createRange();
      range.setStart(node, Math.min(at, node.data.length));
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    },
    [n, offset]
  );
}

/** The text of each code block of the rich editor, with line breaks as the editor draws them. */
function blockTexts(manager) {
  return manager.locator('#richContent').evaluate((editor) =>
    [...editor.querySelectorAll('pre')].map((pre) => {
      const copy = pre.cloneNode(true);
      for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
      return copy.textContent;
    })
  );
}

const MESSY = '{"name":"Ana","tags":["a","b"],"n":{"x":1.50}}';
const PRETTY = '{\n  "name": "Ana",\n  "tags": [\n    "a",\n    "b"\n  ],\n  "n": {\n    "x": 1.50\n  }\n}';

test('Format JSON indents the text box with 2 spaces and keeps the numbers as typed', async ({ context, extensionId }) => {
  const manager = await openManager(context, extensionId);
  await manager.locator('#newSnippet').click();
  const button = manager.getByRole('button', { name: 'Format JSON' });
  await expect(button).toBeVisible();
  await manager.locator('#content').fill(MESSY);
  await button.click();
  await expect(manager.locator('#content')).toHaveValue(PRETTY);
  await expect(manager.locator('#contentError')).toBeHidden();
  await expect(manager.locator('#editorStatus')).toHaveText('JSON formatted.');
  await manager.locator('#title').fill('Config');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
});

test('Format JSON names the line and column of the first error and changes nothing', async ({ context, extensionId }) => {
  const manager = await openManager(context, extensionId);
  await manager.locator('#newSnippet').click();
  const text = '{\n  "a": 1,\n  "b": [1, 2,],\n  "c": x\n}';
  await manager.locator('#content').fill(text);
  await manager.getByRole('button', { name: 'Format JSON' }).click();
  await expect(manager.locator('#contentError')).toBeVisible();
  await expect(manager.locator('#contentError')).toContainText('Line 3, column 14:');
  await expect(manager.locator('#content')).toHaveValue(text);
  await expect(manager.locator('#editorStatus')).toHaveText('');
  // Fixing the text clears the message, and the button then works.
  await manager.locator('#content').fill('[1,2]');
  await expect(manager.locator('#contentError')).toBeHidden();
  await manager.getByRole('button', { name: 'Format JSON' }).click();
  await expect(manager.locator('#content')).toHaveValue('[\n  1,\n  2\n]');
});

test('the Format JSON button is described by an error only while the error shows', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Other', content: 'x' }]);
  const manager = await openManager(context, extensionId);
  await manager.locator('#newSnippet').click();
  const button = manager.getByRole('button', { name: 'Format JSON' });

  await manager.locator('#content').fill('{"a": x}');
  await button.click();
  await expect(button).toHaveAccessibleDescription(/^Line 1, column 7: /);
  await manager.locator('#content').fill('{"a": 1}');
  await expect(manager.locator('#contentError')).toBeHidden();
  await expect(button).toHaveAccessibleDescription('');

  // The check of an empty text on Save shares the error line with Format JSON.
  await manager.locator('#content').fill('');
  await manager.locator('#save').click();
  await expect(manager.locator('#contentError')).toHaveText('This field must not be empty.');
  await manager.locator('#content').fill('a');
  await expect(manager.locator('#contentError')).toBeHidden();
  await expect(button).toHaveAccessibleDescription('');

  // Opening another snippet clears the error too.
  await manager.locator('#content').fill('[');
  await button.click();
  await expect(manager.locator('#contentError')).toBeVisible();
  await manager.locator('#snippetList .row').filter({ hasText: 'Other' }).click();
  await manager.getByRole('button', { name: 'Discard' }).click();
  await expect(manager.locator('#title')).toHaveValue('Other');
  await expect(manager.locator('#contentError')).toBeHidden();
  await expect(button).toHaveAccessibleDescription('');
});

test('a placeholder outside quotes makes the JSON invalid, and the message says so', async ({ context, extensionId }) => {
  const manager = await openManager(context, extensionId);
  await manager.locator('#newSnippet').click();
  await manager.locator('#content').fill('{"count": {input:Count}, "when": "{date}"}');
  await manager.getByRole('button', { name: 'Format JSON' }).click();
  await expect(manager.locator('#contentError')).toContainText('Line 1, column 11:');
  await expect(manager.locator('#contentError')).toContainText('{input:Count} is a placeholder');
  await expect(manager.locator('#contentError')).toContainText('outside quotes');
  // In quotes, the same placeholder is text.
  await manager.locator('#content').fill('{"count": "{input:Count}"}');
  await manager.getByRole('button', { name: 'Format JSON' }).click();
  await expect(manager.locator('#content')).toHaveValue('{\n  "count": "{input:Count}"\n}');
});

test('in a formatted snippet, Format JSON works on the code block that holds the caret', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    {
      title: 'Config',
      content: `Before\n${MESSY}\nMiddle\n{"b":2}\nAfter`,
      html: `<b>Before</b><pre><code class="language-json">${MESSY.replace(/"/g, '&quot;')}</code></pre>Middle<pre><code>{&quot;b&quot;:2}</code></pre>After`,
    },
  ]);
  const manager = await openManager(context, extensionId);
  await openSnippet(manager, 'Config');
  const button = manager.getByRole('button', { name: 'Format JSON' });

  // With the caret outside every code block, nothing is formatted.
  await manager.locator('#richContent').evaluate((editor) => {
    editor.focus();
    const range = document.createRange();
    range.setStart(editor.firstChild.firstChild, 1);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await button.click();
  await expect(manager.locator('#contentError')).toHaveText('Put the caret in a code block first.');
  // A screen reader announces the error, and the button names it as its description.
  await expect(manager.locator('#contentError')).toHaveAttribute('role', 'alert');
  await expect(button).toHaveAttribute('aria-describedby', 'contentError');
  expect(await blockTexts(manager)).toEqual([MESSY, '{"b":2}']);

  // Only the block with the caret changes, and the rest of the snippet stays.
  await caretInBlock(manager, 1, 3);
  await button.click();
  await expect(manager.locator('#contentError')).toBeHidden();
  await expect(manager.locator('#editorStatus')).toHaveText('JSON formatted.');
  expect(await blockTexts(manager)).toEqual([MESSY, '{\n  "b": 2\n}']);
  await expect(manager.locator('#richContent b')).toHaveText('Before');

  // A block that names a language keeps it.
  await caretInBlock(manager, 0, 2);
  await button.click();
  expect(await blockTexts(manager)).toEqual([PRETTY, '{\n  "b": 2\n}']);

  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  const [stored] = await readSnippets(serviceWorker);
  expect(stored.content).toBe(`Before\n${PRETTY}\nMiddle\n{\n  "b": 2\n}\nAfter`);
  // The JSON block is colored on save; the colors are checked in the tests below.
  const plain = stored.html.replace(/<span style="color:#[0-9a-f]{6}">|<\/span>/g, '');
  expect(plain).toContain('<pre><code class="language-json">{<br>  &quot;name&quot;');
  expect(plain).toContain('</code></pre>Middle<pre><code>{<br>  &quot;b&quot;: 2<br>}</code></pre>After');
});

test('in a formatted snippet, invalid JSON in the block gives its line and column and changes nothing', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Broken', content: 'x\n{\n  "a": 1,\n}', html: 'x<pre><code>{<br>  &quot;a&quot;: 1,<br>}</code></pre>' },
  ]);
  const manager = await openManager(context, extensionId);
  await openSnippet(manager, 'Broken');
  await caretInBlock(manager, 0, 1);
  await manager.getByRole('button', { name: 'Format JSON' }).click();
  await expect(manager.locator('#contentError')).toContainText('Line 3, column 1:');
  expect(await blockTexts(manager)).toEqual(['{\n  "a": 1,\n}']);
});

const KEYWORD = '#2f7fc0';
const STRING = '#2f8f4e';
const NUMBER = '#c0602a';
const COMMENT = '#7a7f87';

// One snippet of code per language, and the palette colors Prism gives it.
const SAMPLES = {
  json: ['{"a": "x", "n": 12} // c', [KEYWORD, STRING, NUMBER, COMMENT]],
  javascript: ['const a = "x" + 42; // c', [KEYWORD, STRING, NUMBER, COMMENT]],
  typescript: ["let a: string = 'x'; // c\nconst n = 42;", [KEYWORD, STRING, NUMBER, COMMENT]],
  python: ['# c\ndef f():\n    return "x" + 42', [KEYWORD, STRING, NUMBER, COMMENT]],
  html: ['<!-- c -->\n<a href="x">t</a>', [KEYWORD, STRING, COMMENT]],
  css: ['/* c */\na { margin: 10px; content: "x" }', [KEYWORD, STRING, NUMBER, COMMENT]],
  sql: ["-- c\nSELECT 42 FROM t WHERE x = 'y'", [KEYWORD, STRING, NUMBER, COMMENT]],
  shell: ['# c\nif true; then echo "x" 3; fi', [KEYWORD, STRING, NUMBER, COMMENT]],
};

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

test('the language menu follows the code block that holds the caret, and Save stores that language', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Two', content: 'a\nb\nc', html: 'text<pre><code>a</code></pre><pre><code class="language-python">b</code></pre>' },
  ]);
  const manager = await openManager(context, extensionId);
  await openSnippet(manager, 'Two');
  const menu = manager.getByLabel('Code block language');
  await expect(menu.locator('option')).toHaveText(['Plain text', 'JSON', 'JavaScript', 'TypeScript', 'Python', 'HTML', 'CSS', 'SQL', 'Shell']);
  await manager.locator('#richContent').evaluate((editor) => {
    editor.focus();
    const range = document.createRange();
    range.setStart(editor.firstChild, 1);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await expect(menu).toBeDisabled();
  await caretInBlock(manager, 1, 0);
  await expect(menu).toBeEnabled();
  await expect(menu).toHaveValue('python');
  await caretInBlock(manager, 0, 0);
  await expect(menu).toHaveValue('');
  await menu.selectOption('sql');
  await expect(manager.locator('#richContent pre').first()).toHaveAttribute('data-label', 'SQL');
  await expect(manager.locator('#richContent pre').nth(1)).toHaveAttribute('data-label', 'Python');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  const [stored] = await readSnippets(serviceWorker);
  expect(stored.html).toBe('text<pre><code class="language-sql">a</code></pre><pre><code class="language-python">b</code></pre>');
  // Back to Plain text removes the language and the colors.
  await caretInBlock(manager, 0, 0);
  await menu.selectOption('');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  expect((await readSnippets(serviceWorker))[0].html).toBe('text<pre><code>a</code></pre><pre><code class="language-python">b</code></pre>');
});

for (const [language, [code, colors]] of Object.entries(SAMPLES)) {
  test(`Save colors a ${language} code block with the palette, and keeps the text`, async ({ context, extensionId, serviceWorker }) => {
    await seedSnippets(serviceWorker, [
      { title: 'Code', content: `x\n${code}`, html: `x<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>` },
    ]);
    const manager = await openManager(context, extensionId);
    await openSnippet(manager, 'Code');
    await manager.locator('#save').click();
    await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
    const [stored] = await readSnippets(serviceWorker);
    expect(stored.content).toBe(`x\n${code}`);
    for (const color of colors) expect(stored.html, `${language} ${color}`).toContain(`<span style="color:${color}">`);
    // Nothing but the palette is stored, and only in spans.
    const used = [...stored.html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    for (const style of used) expect([KEYWORD, STRING, NUMBER, COMMENT].map((c) => `color:${c}`)).toContain(style);
    expect(stored.html.replace(/<span style="color:#[0-9a-f]{6}">|<\/span>/g, '')).toBe(`x<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`);
    // The editor shows the colors after the save, and the saved snippet has nothing unsaved.
    const first = manager.locator('#richContent pre span').first();
    await expect(first).toBeVisible();
    expect(await first.evaluate((el) => getComputedStyle(el).color)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    await manager.locator('#newSnippet').click();
    await expect(manager.locator('#editorNotice')).toBeHidden();
  });
}

test('a hostile color in a stored snippet is gone after Save, and a plain-text block has no colors', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    {
      title: 'Hostile',
      content: 'a b',
      html: '<span style="color:red">a</span><pre><span style="color:red;background:url(https://example.com/p.png)">b</span><span style="color:#2f7fc0">c</span></pre>',
    },
  ]);
  const manager = await openManager(context, extensionId);
  await openSnippet(manager, 'Hostile');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  const [stored] = await readSnippets(serviceWorker);
  expect(stored.html).toBe('a<pre><code>bc</code></pre>');
});

test('only the manager loads Prism', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Code', content: 'x', html: '<pre><code class="language-json"><span style="color:#2f7fc0">x</span></code></pre>' },
  ]);
  const loaded = [];
  context.on('request', (request) => {
    if (request.url().includes('/vendor/prism/')) loaded.push(request.url());
  });
  const manager = await openManager(context, extensionId);
  expect(await manager.evaluate(() => typeof window.Prism)).toBe('object');
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.every((url) => url.includes(extensionId))).toBe(true);
  loaded.length = 0;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  expect(await panel.evaluate(() => typeof window.Prism)).toBe('undefined');
  expect(loaded).toEqual([]);
});

test('a snippet with colors goes into a rich editor with its colors', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Code', content: 'Run:\nlet a', html: 'Run:<pre><code class="language-javascript"><span style="color:#2f7fc0">let</span> a</code></pre>' },
  ]);
  const { caretAtEndOf, openPanel, pressInPanel, expectPanelClosed } = require('./helpers');
  await caretAtEndOf(page, '#pasteEditor');
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect.poll(() => page.evaluate(() => window.pasteSeen)).not.toBeNull();
  const seen = await page.evaluate(() => window.pasteSeen);
  expect(seen.html).toBe('&nbsp;Run:<pre><code class="language-javascript"><span style="color:#2f7fc0">let</span> a</code></pre>');
  expect(seen.plain).toBe(' Run:\nlet a');
});
