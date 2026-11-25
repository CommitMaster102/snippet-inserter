// Formatted snippets: the editor in the snippet manager, the read-only view in the panel, and what
// each kind of field receives on insert.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, readSnippets, openManager } = require('./helpers');

const TOOL_NAMES = [
  'Bold (Ctrl+B)',
  'Italic (Ctrl+I)',
  'Underline (Ctrl+U)',
  'Link (Ctrl+K)',
  'Bulleted list',
  'Numbered list',
  'Code',
  'Code block',
  'Clear formatting',
];

/** Selects `text` inside the manager's rich editor, at its first occurrence. */
async function selectInEditor(manager, text) {
  await manager.locator('#richContent').evaluate((editor, wanted) => {
    editor.focus();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.data.indexOf(wanted);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + wanted.length);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      return;
    }
    throw new Error(`"${wanted}" is not in the editor`);
  }, text);
}

/** Puts the caret at the end of the manager's rich editor. */
async function caretAtEnd(manager) {
  await manager.locator('#richContent').evaluate((editor) => {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
}

async function openSnippet(manager, name) {
  await manager.locator('#snippetList .row').filter({ hasText: name }).click();
  await expect(manager.locator('#title')).toHaveValue(name);
}

test('Formatted text swaps the text box for an editor with a labelled toolbar, and Save stores the formatting', async ({ context, extensionId, serviceWorker }) => {
  const [seeded] = await seedSnippets(serviceWorker, [
    { title: 'Order', content: 'Your order ships {date+3d}.\nThanks {snippet:;sig}' },
    { title: 'Signature', content: 'Ana', abbreviation: ';sig' },
  ]);
  const manager = await openManager(context, extensionId);
  await openSnippet(manager, 'Order');
  const box = manager.getByLabel('Formatted text');
  await expect(box).not.toBeChecked();
  await expect(manager.locator('#toolbar')).toBeHidden();

  await box.check();
  const editor = manager.locator('#richContent');
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(manager.locator('#content')).toBeHidden();
  expect(await editor.evaluate((el) => el.innerText)).toBe('Your order ships {date+3d}.\nThanks {snippet:;sig}');
  const toolbar = manager.getByRole('toolbar', { name: 'Formatting' });
  expect(await toolbar.locator('button').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')))).toEqual(TOOL_NAMES);
  expect(await toolbar.locator('button[tabindex="0"]').count()).toBe(1);
  // Opening the snippet and turning the box on changes no text, so nothing is unsaved yet.
  await expect(manager.locator('#placeholderList')).toContainText('{date+3d}');
  await expect(manager.locator('#referenceList')).toContainText('Signature (;sig)');

  await selectInEditor(manager, 'order');
  await manager.keyboard.press('Control+b');
  await expect(toolbar.getByRole('button', { name: 'Bold (Ctrl+B)' })).toHaveAttribute('aria-pressed', 'true');

  await selectInEditor(manager, 'Thanks');
  await manager.keyboard.press('Control+k');
  const address = manager.getByLabel('Link address');
  await expect(address).toBeFocused();
  await address.fill('javascript:alert(1)');
  await address.press('Enter');
  await expect(manager.locator('#linkError')).toHaveText('Use an address that starts with https://, http://, mailto:, or tel:.');
  await address.fill('example.com');
  await address.press('Enter');
  await expect(manager.locator('#linkBar')).toBeHidden();
  // Enter in the address field applies the link and does not save the snippet.
  await expect(manager.locator('#editorStatus')).toHaveText('');
  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/');

  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  const [stored] = await readSnippets(serviceWorker);
  expect(stored.html).toBe('Your <b>order</b> ships {date+3d}.<br><a href="https://example.com/">Thanks</a> {snippet:;sig}');
  expect(stored.content).toBe('Your order ships {date+3d}.\nThanks (https://example.com/) {snippet:;sig}');

  await manager.reload();
  await openSnippet(manager, 'Order');
  await expect(box).toBeChecked();
  await expect(editor.locator('b')).toHaveText('order');
  await expect(editor.locator('a')).toHaveAttribute('title', 'https://example.com/');
  // An unchanged formatted snippet has nothing unsaved.
  await manager.locator('#snippetList .row').filter({ hasText: 'Signature' }).click();
  await expect(manager.locator('#title')).toHaveValue('Signature');
  await expect(manager.locator('#editorNotice')).toBeHidden();
  expect(seeded.id).toBe(stored.id);
});

test('turning Formatted text off asks nothing and keeps the plain text, and Save drops the formatting', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    {
      title: 'Steps',
      content: '• one\n• two\nSee site (https://example.com/)',
      html: '<ul><li>one</li><li>two</li></ul>See <a href="https://example.com/">site</a>',
    },
  ]);
  const manager = await openManager(context, extensionId);
  await openSnippet(manager, 'Steps');
  await expect(manager.getByLabel('Formatted text')).toBeChecked();
  await manager.getByLabel('Formatted text').uncheck();
  await expect(manager.locator('#editorNotice')).toBeHidden();
  await expect(manager.locator('#content')).toBeVisible();
  await expect(manager.locator('#content')).toHaveValue('• one\n• two\nSee site (https://example.com/)');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  const [stored] = await readSnippets(serviceWorker);
  expect(stored.content).toBe('• one\n• two\nSee site (https://example.com/)');
  expect('html' in stored).toBe(false);
});

test('the toolbar makes lists, code, and code blocks, and moves with the arrow keys', async ({ context, extensionId, serviceWorker }) => {
  const manager = await openManager(context, extensionId);
  await manager.locator('#newSnippet').click();
  await manager.getByLabel('Formatted text').check();
  const editor = manager.locator('#richContent');
  const toolbar = manager.getByRole('toolbar', { name: 'Formatting' });
  await expect(editor).toBeFocused();
  await manager.keyboard.type('Steps');
  await manager.keyboard.press('Enter');
  await manager.keyboard.type('first');
  await toolbar.getByRole('button', { name: 'Bulleted list' }).click();
  await expect(toolbar.getByRole('button', { name: 'Bulleted list' })).toHaveAttribute('aria-pressed', 'true');
  await manager.keyboard.press('Enter');
  await manager.keyboard.type('second');
  await manager.keyboard.press('Enter');
  await manager.keyboard.press('Enter');
  await manager.keyboard.type('run npm test now');
  await selectInEditor(manager, 'npm test');
  await toolbar.getByRole('button', { name: 'Code', exact: true }).click();
  await caretAtEnd(manager);
  await manager.keyboard.press('Enter');
  await manager.keyboard.insertText('  indented\tline');
  await toolbar.getByRole('button', { name: 'Code block' }).click();
  await expect(toolbar.getByRole('button', { name: 'Code block' })).toHaveAttribute('aria-pressed', 'true');

  // The toolbar is one Tab stop, and the arrow keys, Home, and End move along it.
  await toolbar.getByRole('button', { name: 'Bold (Ctrl+B)' }).focus();
  await manager.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Italic (Ctrl+I)' })).toBeFocused();
  await manager.keyboard.press('End');
  await expect(toolbar.getByRole('button', { name: 'Clear formatting' })).toBeFocused();
  await manager.keyboard.press('Home');
  await expect(toolbar.getByRole('button', { name: 'Bold (Ctrl+B)' })).toBeFocused();
  expect(await toolbar.locator('button[tabindex="0"]').count()).toBe(1);

  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  const [stored] = await readSnippets(serviceWorker);
  expect(stored.html).toBe('Steps<ul><li>first</li><li>second</li></ul>run <code>npm test</code> now<pre><code>  indented\tline</code></pre>');
  expect(stored.content).toBe('Steps\n• first\n• second\nrun npm test now\n  indented\tline');
});

test('a paste keeps the allowed formatting and loads nothing', async ({ context, extensionId, pagesUrl }) => {
  const manager = await openManager(context, extensionId);
  const requests = [];
  context.on('request', (request) => {
    if (request.url().includes('/ping')) requests.push(request.url());
  });
  await manager.locator('#newSnippet').click();
  await manager.getByLabel('Formatted text').check();
  await manager.locator('#richContent').evaluate((editor, base) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      `<p><b>Bold</b> text<img src="${base}/ping.png" onerror="document.title = 'ran'"></p>` +
        `<table><tr><td>cell</td></tr></table><a href="javascript:alert(1)">no link</a> <a href="https://example.com/">link</a>`
    );
    data.setData('text/plain', 'Bold text');
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, pagesUrl);
  await expect(manager.locator('#richContent')).toContainText('Bold text');
  expect(await manager.locator('#richContent').evaluate((el) => el.innerHTML)).toBe(
    '<b>Bold</b> text<br>cell<br>no link <a href="https://example.com/">link</a>'
  );
  await manager.waitForTimeout(300);
  expect(requests).toEqual([]);
  expect(await manager.title()).toBe('Snippet Inserter');
});

test('options.html#edit= opens that snippet, and an unknown id says so', async ({ context, extensionId, serviceWorker }) => {
  const [, second] = await seedSnippets(serviceWorker, [{ title: 'One', content: 'A' }, { title: 'Two', content: 'B', html: '<b>B</b>' }]);
  const manager = await context.newPage();
  await manager.goto(`chrome-extension://${extensionId}/options.html#edit=${second.id}`);
  await expect(manager.locator('#title')).toHaveValue('Two');
  await expect(manager.getByLabel('Formatted text')).toBeChecked();
  await expect(manager.locator('#richContent b')).toHaveText('B');
  expect(new URL(manager.url()).hash).toBe('#snippets');
  await manager.goto(`chrome-extension://${extensionId}/options.html#edit=missing`);
  await expect(manager.locator('#pageError')).toHaveText('Could not find the snippet.');
});
