// Formatted snippets: the editor in the snippet manager, the read-only view in the panel, and what
// each kind of field receives on insert.
'use strict';

const { test, expect } = require('./fixtures');
const {
  seedSnippets,
  readSnippets,
  openManager,
  selectInTextarea,
  caretAtEndOf,
  openPanel,
  pressInPanel,
  waitForPanelFit,
  waitForStablePanel,
  expectPanelClosed,
} = require('./helpers');

/** Opens the panel from the focused field and inserts the snippet with the given Ctrl+number. */
async function insertWith(page, key = '2') {
  await openPanel(page);
  await pressInPanel(page, key, { ctrl: true });
  await expectPanelClosed(page);
}

const LETTER = {
  title: 'Letter',
  content: 'Hello friend and our site (https://example.com/)\n• one\n• two',
  html: '<b>Hello</b> <i>friend</i> and <a href="https://example.com/">our site</a><ul><li>one</li><li>two</li></ul>',
};

const ORDER = {
  title: 'Order',
  content: 'Your order ships {date}.\n• Track it',
  html: '<b>Your order</b> ships {date}.<ul><li>Track it</li></ul>',
};

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
  // The error is announced, belongs to the field, and marks it invalid until it goes away.
  await expect(manager.locator('#linkError')).toHaveAttribute('role', 'alert');
  await expect(address).toHaveAttribute('aria-describedby', 'linkError');
  await expect(address).toHaveAttribute('aria-invalid', 'true');
  await address.fill('example.com');
  await expect(address).not.toHaveAttribute('aria-invalid', 'true');
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

test('the panel shows a formatted snippet read-only, and saving a new name keeps its text', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [ORDER]);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Order' });
  await item.hover();
  await item.locator('.edit-button').click();
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');
  const view = panel.getByRole('document', { name: 'Snippet text' });
  await expect(view.locator('b')).toHaveText('Your order');
  await expect(view.locator('li')).toHaveText('Track it');
  await expect(panel.locator('textarea')).toHaveCount(0);
  await expect(panel.getByText('This snippet has formatting. Change its text in the snippet manager.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Open in snippet manager' })).toBeVisible();
  await expect(panel.locator('.placeholder-list').first()).toContainText('{date}');
  await expect(panel.locator('.input-title')).toBeFocused();

  await panel.locator('.input-title').fill('Order confirmation');
  await page.keyboard.press('Control+Enter');
  await expect(item.locator('.item-label')).toHaveText('edited');
  const [stored] = await readSnippets(serviceWorker);
  expect(stored).toMatchObject({ title: 'Order confirmation', content: ORDER.content, html: ORDER.html });

  // A snippet made in the panel is plain.
  await page.keyboard.press('Control+1');
  await expect(panel.locator('.caption')).toHaveText('Create a new snippet');
  await panel.locator('textarea.input-content').fill('Made in the panel');
  await page.keyboard.press('Control+Enter');
  await expect(panel.locator('.list .item-caption')).toHaveCount(2);
  const made = (await readSnippets(serviceWorker)).find((s) => s.content === 'Made in the panel');
  expect('html' in made).toBe(false);
});

test('Open in snippet manager opens that snippet in the manager and closes the panel', async ({ context, page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Plain', content: 'Plain text' }, ORDER]);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Order' });
  await item.hover();
  await item.locator('.edit-button').click();
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');
  await waitForPanelFit(page, panel);
  await waitForStablePanel(page);
  const [manager] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('button', { name: 'Open in snippet manager' }).click(),
  ]);
  await expect(manager.locator('#title')).toHaveValue('Order');
  await expect(manager.getByLabel('Formatted text')).toBeChecked();
  expect(new URL(manager.url()).hash).toBe('#snippets');
  await expectPanelClosed(page);
});

test('a rich editor gets the formatting, and text boxes get the plain text', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [LETTER]);

  // An editor that handles the paste itself gets the HTML and the plain text.
  await caretAtEndOf(page, '#pasteEditor');
  await insertWith(page);
  await expect.poll(() => page.evaluate(() => window.pasteSeen)).not.toBeNull();
  const seen = await page.evaluate(() => window.pasteSeen);
  expect(seen.plain).toBe(` ${LETTER.content}`);
  expect(seen.html).toBe(`&nbsp;${LETTER.html}`);

  // An editor that leaves the paste to the browser gets the elements, and one Ctrl+Z removes them.
  await caretAtEndOf(page, '#rich', 'p:last-child');
  await insertWith(page);
  await expect(page.locator('#rich b')).toHaveText('Hello');
  await expect(page.locator('#rich a')).toHaveAttribute('href', 'https://example.com/');
  await expect(page.locator('#rich li')).toHaveText(['one', 'two']);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.locator('#rich').evaluate((el) => el.innerHTML)).toBe('<p>Dear team,</p><p>Thanks</p>');

  await page.locator('#plain').fill('');
  await selectInTextarea(page, '#plain', 0);
  await insertWith(page);
  await expect(page.locator('#plain')).toHaveValue(LETTER.content);

  await selectInTextarea(page, '#single', 11);
  await insertWith(page);
  await expect(page.locator('#single')).toHaveValue('Single line Hello friend and our site (https://example.com/) • one • two');
});

test('a code block keeps every space, tab, and line break in each kind of field', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Code', content: 'Run:\n  if (a) {\n\treturn  1;\n  }', html: 'Run:<pre><code class="language-javascript">  if (a) {<br>\treturn  1;<br>  }</code></pre>' }]);
  await caretAtEndOf(page, '#pasteEditor');
  await insertWith(page);
  await expect.poll(() => page.evaluate(() => window.pasteSeen)).not.toBeNull();
  const seen = await page.evaluate(() => window.pasteSeen);
  expect(seen.html).toBe('&nbsp;Run:<pre><code class="language-javascript">  if (a) {<br>\treturn  1;<br>  }</code></pre>');
  expect(seen.plain).toBe(' Run:\n  if (a) {\n\treturn  1;\n  }');

  await caretAtEndOf(page, '#rich', 'p:last-child');
  await insertWith(page);
  await expect.poll(() => page.locator('#rich pre').evaluate((el) => el.innerText)).toBe('  if (a) {\n\treturn  1;\n  }');

  await page.locator('#plain').fill('');
  await selectInTextarea(page, '#plain', 0);
  await insertWith(page);
  await expect(page.locator('#plain')).toHaveValue('Run:\n  if (a) {\n\treturn  1;\n  }');

  // A single-line field joins the lines and drops the indent of each, but keeps the spaces inside a line.
  await page.locator('#single').fill('');
  await selectInTextarea(page, '#single', 0);
  await insertWith(page);
  await expect(page.locator('#single')).toHaveValue('Run: if (a) { return  1; }');
});

test('values fill formatted text as text, also where formatting splits a placeholder, and {cursor} places the caret', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Dear', content: 'Dear {input:Name}, on {date:iso}.', html: '<b>Dear {input:Name}</b>, on {da<i>te:iso}</i>.' },
    { title: 'Cursor', content: 'Hello {cursor}world', html: '<b>Hello {cursor}world</b>' },
  ]);
  await caretAtEndOf(page, '#pasteEditor');
  const panel = await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expect(panel.locator('.fill-count')).toHaveText('Fill in 1 field');
  await panel.locator('.fill-input').fill('<i>x</i>');
  await expect(panel.locator('.fill-preview b')).toHaveText('Dear <i>x</i>');
  await pressInPanel(page, 'Enter', { ctrl: true });
  await expectPanelClosed(page);
  await expect.poll(() => page.evaluate(() => window.pasteSeen)).not.toBeNull();
  const seen = await page.evaluate(() => window.pasteSeen);
  expect(seen.html).toMatch(/^&nbsp;<b>Dear &lt;i&gt;x&lt;\/i&gt;<\/b>, on \d{4}-\d{2}-\d{2}\.$/);
  expect(seen.plain).toMatch(/^ Dear <i>x<\/i>, on \d{4}-\d{2}-\d{2}\.$/);

  await caretAtEndOf(page, '#rich', 'p:last-child');
  await insertWith(page, '3');
  await expect(page.locator('#rich b')).toHaveText('Hello world');
  await page.keyboard.type('X');
  await expect(page.locator('#rich p').last()).toHaveText('Thanks Hello Xworld');
});

test('an abbreviation inserts the formatting in a rich editor', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Hi', content: 'Hello there', html: '<b>Hello</b> there', abbreviation: ';hi' }]);
  const place = () => caretAtEndOf(page, '#rich', 'p:last-child');
  await place();
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await place();
  await page.keyboard.type(' ;hi');
  await expect(page.locator('#rich b')).toHaveText('Hello');
  await expect(page.locator('#rich p').last()).toHaveText('Thanks Hello there');
});

test('an abbreviation of a plain snippet that includes a formatted one inserts the formatting', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Bye', content: 'Bye {snippet:;sig}', abbreviation: ';bye' },
    { title: 'Signature', content: 'Ana', html: '<b>Ana</b>', abbreviation: ';sig' },
  ]);
  const place = () => caretAtEndOf(page, '#rich', 'p:last-child');
  await place();
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await place();
  await page.keyboard.type(' ;bye');
  await expect(page.locator('#rich b')).toHaveText('Ana');
  await expect(page.locator('#rich p').last()).toHaveText('Thanks Bye Ana');
});

test('an included snippet keeps its formatting in a formatted snippet, and a plain snippet that includes one goes into a rich editor as formatted text', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Formatted', content: 'Hi {snippet:;sig}', html: '<i>Hi {snippet:;sig}</i>' },
    { title: 'Plain', content: 'Bye {snippet:;sig}' },
    { title: 'Signature', content: 'Ana (https://example.com/)', html: '<a href="https://example.com/"><b>Ana</b></a>', abbreviation: ';sig' },
  ]);
  await caretAtEndOf(page, '#pasteEditor');
  await insertWith(page, '2');
  await expect.poll(() => page.evaluate(() => window.pasteSeen)).not.toBeNull();
  expect(await page.evaluate(() => window.pasteSeen)).toEqual({
    plain: ' Hi Ana (https://example.com/)',
    html: '&nbsp;<i>Hi </i><a href="https://example.com/"><b><i>Ana</i></b></a>',
  });

  await page.evaluate(() => {
    window.pasteSeen = null;
  });
  await caretAtEndOf(page, '#pasteEditor');
  await insertWith(page, '3');
  await expect.poll(() => page.evaluate(() => window.pasteSeen)).not.toBeNull();
  expect(await page.evaluate(() => window.pasteSeen)).toEqual({
    plain: ' Bye Ana (https://example.com/)',
    html: '&nbsp;Bye <a href="https://example.com/"><b>Ana</b></a>',
  });
});

// Lists what the root contains that the cleaner would never let through: an element or attribute outside
// the allowlist, a style that loads something, and a link that is not a web, mail, or phone address.
const AUDIT = (root) => {
  const tags = new Set(['B', 'I', 'U', 'S', 'A', 'BR', 'UL', 'OL', 'LI', 'PRE', 'CODE', 'SPAN', 'P', 'DIV']);
  const attributes = new Set(['href', 'title', 'class', 'style', 'data-language', 'dir', 'tabindex', 'role', 'aria-label']);
  const found = [];
  for (const element of root.querySelectorAll('*')) {
    if (!tags.has(element.tagName)) found.push(`element ${element.tagName}`);
    for (const { name, value } of element.attributes) {
      if (!attributes.has(name)) found.push(`attribute ${name}`);
      if (name === 'style' && /url\s*\(|expression|@import/i.test(value)) found.push(`style ${value}`);
      if (name === 'href' && !/^(https?:|mailto:|tel:)/i.test(value)) found.push(`href ${value}`);
    }
  }
  return found;
};

// An html field written straight into storage skips the cleaner, so every place that shows or
// inserts it has to clean it again.
test('stored html with scripts, a style url(), and a javascript: link reaches no page, view, or editor', async ({ context, extensionId, page, pagesUrl, serviceWorker }) => {
  const hostile =
    `<b>Hi {input:Name}</b><img src="${pagesUrl}/ping.png" onerror="document.title = 'ran'">` +
    `<span style="color:red;background:url(${pagesUrl}/ping-style.png)" onclick="document.title = 'ran'">styled</span>` +
    `<a href="javascript:document.title = 'ran'" onmouseover="document.title = 'ran'">bad link</a> ` +
    `<a href="https://example.com/">good link</a><script>document.title = 'ran'</script>` +
    `<iframe src="${pagesUrl}/ping-frame.html"></iframe><svg onload="document.title = 'ran'"></svg>`;
  await seedSnippets(serviceWorker, [
    { title: 'Hostile', content: 'Hi styled bad link good link', html: hostile.replace(' {input:Name}', '') },
    { title: 'Fill', content: 'Hi {input:Name} styled bad link good link', html: hostile },
  ]);
  const requests = [];
  context.on('request', (request) => {
    if (request.url().includes('/ping')) requests.push(request.url());
  });

  const manager = await openManager(context, extensionId);
  await manager.locator('#snippetList .row').filter({ hasText: 'Hostile' }).first().click();
  await expect(manager.locator('#richContent')).toContainText('good link');
  expect(await manager.locator('#richContent').evaluate(AUDIT)).toEqual([]);
  expect(await manager.title()).toBe('Snippet Inserter');

  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Hostile' }).first();
  await item.hover();
  await item.locator('.edit-button').click();
  const view = panel.getByRole('document', { name: 'Snippet text' });
  await expect(view).toContainText('good link');
  expect(await view.evaluate(AUDIT)).toEqual([]);
  await pressInPanel(page, 'Escape');
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);

  await caretAtEndOf(page, '#rich', 'p:last-child');
  const fill = await openPanel(page);
  await pressInPanel(page, '3', { ctrl: true });
  await fill.locator('.fill-input').fill('Ana');
  const preview = fill.locator('.fill-preview');
  await expect(preview).toContainText('Hi Ana');
  expect(await preview.evaluate(AUDIT)).toEqual([]);
  await pressInPanel(page, 'Enter', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#rich')).toContainText('Hi Ana');
  expect(await page.locator('#rich').evaluate((el) => [...el.querySelectorAll(':scope > p:last-child *')].map((n) => n.tagName))).not.toContain('IMG');
  expect(await page.locator('#rich p').last().evaluate(AUDIT)).toEqual([]);

  await caretAtEndOf(page, '#rich', 'p:last-child');
  await insertWith(page, '2');
  await expect(page.locator('#rich')).toContainText('good link');
  expect(await page.locator('#rich p').last().evaluate(AUDIT)).toEqual([]);
  expect(await page.title()).not.toBe('ran');
  await manager.waitForTimeout(300);
  expect(requests).toEqual([]);
});

// HTML that got past the cleaner into the manager or the panel could still try to load something.
// The extension pages' Content-Security-Policy allows scripts from the extension only and no loads
// from the network.
test('the manager and the panel load nothing from the network', async ({ context, extensionId, pagesUrl }) => {
  for (const name of ['options.html', 'panel.html']) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/${name}`);
    const result = await page.evaluate(async (base) => {
      const violations = new Set();
      window.addEventListener('securitypolicyviolation', (event) => violations.add(event.effectiveDirective), true);
      let fetched = true;
      try {
        await fetch(`${base}/editors.html`, { mode: 'no-cors' });
      } catch {
        fetched = false;
      }
      await new Promise((resolve) => {
        const image = new Image();
        image.onload = image.onerror = resolve;
        image.src = `${base}/ping.png`;
      });
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.onload = script.onerror = resolve;
        script.src = `${base}/editors.html`;
        document.head.append(script);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { fetched, violations: [...violations].sort() };
    }, pagesUrl);
    expect(result, name).toEqual({ fetched: false, violations: ['connect-src', 'img-src', 'script-src-elem'] });
    await page.close();
  }
});
