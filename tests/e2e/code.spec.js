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
  expect(stored.html).toContain('<pre><code class="language-json">{<br>  &quot;name&quot;');
  expect(stored.html).toContain('</code></pre>Middle<pre><code>{<br>  &quot;b&quot;: 2<br>}</code></pre>After');
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
