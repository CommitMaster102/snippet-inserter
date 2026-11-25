// Layout tests with pseudo-languages in place of English: one about 40 percent longer than English,
// and one written from right to left. Chrome ignores a language folder it does not know, so each
// test run loads a copy of the extension whose English catalog is replaced (scripts/pseudo-locales.js)
// and starts the browser in English. Another test loads a catalog that names keys its own way, in a
// browser that reports a Mac.
'use strict';

const { test: base, expect, launchContext } = require('./fixtures');
const pseudo = require('../../scripts/pseudo-locales.js');
const { seedSnippets, selectInTextarea, openPanel, pressInPanel, openManager } = require('./helpers');

// A test that runs in the browser with the pseudo-language `kind`, built with `options`.
function testWith(kind, options) {
  return base.extend({
    context: async ({}, use) => {
      const directory = pseudo.build(kind, options);
      const context = await launchContext(directory, ['--lang=en-US']);
      await use(context);
      await context.close();
      pseudo.remove(directory);
    },
  });
}

const SNIPPETS = [
  { title: 'Address', content: '14 Elm Street\nSpringfield', abbreviation: ';addr', folder: 'Home' },
  { title: 'A snippet with a rather long name that cannot fit in one line of the panel', content: 'Kind regards,\nAna' },
  { title: 'Reply', content: 'Hello {input:Name}, thank you for your order {input:Order}.' },
];

/**
 * Finds text that a layout cuts off or pushes out of its place, in the document of `locator`'s
 * frame or page. An element meant to ellipsize, or to scroll, may hold a longer text. Anything else
 * must have its text inside its own box, the page must not scroll sideways, and nothing visible may
 * stick out of the window.
 */
async function layoutProblems(locator) {
  return locator.evaluate(() => {
    const problems = [];
    const name = (element) => `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().split(/\s+/).join('.')}` : ''}${element.id ? `#${element.id}` : ''}`;
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) problems.push(`the page scrolls sideways (${root.scrollWidth} > ${root.clientWidth})`);

    const scrolls = (element) => {
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
      return false;
    };

    for (const element of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width === 0 || box.height === 0) continue;
      if (element.closest('[hidden], svg, option, datalist')) continue;
      const ellipsis = style.textOverflow === 'ellipsis';

      if (!scrolls(element) && (box.right > window.innerWidth + 1 || box.left < -1)) {
        problems.push(`${name(element)} sticks out of the window (${Math.round(box.left)} to ${Math.round(box.right)} of ${window.innerWidth})`);
      }
      if (ellipsis || style.overflowX === 'auto' || style.overflowX === 'scroll') continue;

      if (style.overflowX === 'hidden' && element.scrollWidth > element.clientWidth + 1) {
        problems.push(`${name(element)} cuts its text off sideways (${element.scrollWidth} > ${element.clientWidth})`);
      }
      if (style.overflowY === 'hidden' && element.scrollHeight > element.clientHeight + 1 && !element.matches('.app, body, html')) {
        problems.push(`${name(element)} cuts its text off at the bottom (${element.scrollHeight} > ${element.clientHeight})`);
      }

      // Text that runs out of the box of the element that holds it.
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        if (text.left < box.left - 1 || text.right > box.right + 1) {
          problems.push(`${name(element)} has text outside its box (${Math.round(text.left)} to ${Math.round(text.right)}, box ${Math.round(box.left)} to ${Math.round(box.right)})`);
        }
      }
    }
    return problems;
  });
}

async function expectFit(locator, where) {
  expect(await layoutProblems(locator), where).toEqual([]);
}

// Text that may show without the marks of the stretched language: the snippets' own text, the
// extension's name, which is not translated, and the shortcut the browser names.
const NOT_FROM_CATALOG = [
  ...SNIPPETS.flatMap((snippet) => [snippet.title, ...snippet.content.split('\n'), snippet.abbreviation, snippet.folder]),
  'Name',
  'Order',
  'Snippet Inserter',
  'Ctrl+Shift+Space',
].filter(Boolean);

/**
 * Finds text in the stretched language that did not come from the message catalog: an element
 * whose own text, with the keys inside it, has Latin letters but neither mark of the stretched
 * language, and a title, aria-label, or placeholder attribute without them. Snippet text, the text
 * of a select's options, which name code languages, and addresses given as examples are left out.
 */
async function untranslated(locator, allowed = NOT_FROM_CATALOG) {
  return locator.evaluate((root, known) => {
    const doc = root.ownerDocument;
    const found = [];
    const name = (element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`;
    const marked = (text) => text.includes('⟦') || text.includes('⟧');
    const exempt = (text) =>
      !/[A-Za-z]{2,}/.test(text) || known.some((k) => text.startsWith(k)) || /^(\{[^}]*\}\s*)+$/.test(text) || /^(https:\/\/)?example\.com$/.test(text);
    for (const element of doc.body.querySelectorAll('*')) {
      if (element.closest('[hidden], option, kbd, textarea, [contenteditable], .fill-preview, script, style')) continue;
      if (getComputedStyle(element).display === 'none') continue;
      const own = [...element.childNodes]
        .map((node) => (node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName === 'KBD' ? node.textContent : ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (own && !marked(own) && !exempt(own)) found.push(`${name(element)}: ${own}`);
      for (const attribute of ['title', 'aria-label', 'placeholder']) {
        const value = element.getAttribute(attribute);
        if (value && !marked(value) && !exempt(value)) found.push(`${name(element)}[${attribute}]: ${value}`);
      }
    }
    return found;
  }, allowed);
}

async function expectTranslated(locator, where) {
  expect(await untranslated(locator), `${where}: text that is not from the catalog`).toEqual([]);
}

async function openEditForm(panel, name) {
  const item = panel.locator('.list .item', { hasText: name });
  await item.hover();
  await item.locator('.edit-button').click();
}

// The left and right edges of the text in `locator`. They are measured on the text, not on the
// element, because a line that fills its row has a box as wide as the row on whichever side its
// text sits.
async function textEdges(locator) {
  return locator.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const { left, right } = range.getBoundingClientRect();
    return { left, right };
  });
}

// Saves the snippet named `name` unchanged from the panel's edit form, which gives its row the
// "edited" label, and returns that row.
async function markEdited(panel, name) {
  await openEditForm(panel, name);
  await panel.locator('textarea.input-content').press('Control+Enter');
  const item = panel.locator('.list .item', { hasText: name });
  await expect(item.locator('.item-label')).toHaveCount(1);
  return item;
}

// Where the "new" or "edited" label of a panel row sits: whether the label shows in full, as the
// element at its center, and the edges of the label and of the snippet's name.
async function labelPlace(item) {
  return item.evaluate((node) => {
    const doc = node.ownerDocument;
    const label = node.querySelector('.item-label').getBoundingClientRect();
    const range = doc.createRange();
    range.selectNodeContents(node.querySelector('.item-caption').firstChild);
    const name = range.getBoundingClientRect();
    const atCenter = doc.elementFromPoint(label.left + label.width / 2, label.top + label.height / 2);
    const row = node.getBoundingClientRect();
    return {
      shown: Boolean(atCenter && atCenter.closest('.item-label')) && label.left >= row.left && label.right <= row.right,
      labelLeft: label.left,
      labelRight: label.right,
      nameLeft: name.left,
      nameRight: name.right,
    };
  });
}

for (const kind of ['stretched', 'mirrored']) {
  const test = testWith(kind);

  // Checks that a view fits, and in the stretched language that all its text is from the catalog.
  const expectView = async (locator, where) => {
    await expectFit(locator, where);
    if (kind === 'stretched') await expectTranslated(locator, where);
  };

  test.describe(`${kind} pseudo-language`, () => {
    test('the panel fits in the list, the create form, the edit form, the fill-in form, and with Undo', async ({ page, serviceWorker }) => {
      await seedSnippets(serviceWorker, SNIPPETS);
      await selectInTextarea(page, '#plain', 0, 5);
      const panel = await openPanel(page);
      const body = panel.locator('body');
      await expect(panel.locator('.list .item')).toHaveCount(4);
      if (kind === 'stretched') await expect(panel.locator('#caption')).toContainText('⟦');
      await expectView(body, 'list');

      await openEditForm(panel, 'Address');
      await expect(panel.locator('textarea.input-content')).toBeVisible();
      await expectView(body, 'edit form');
      await panel.locator('.item-danger').click();
      await expect(panel.locator('#undoBar')).toBeVisible();
      await expectView(body, 'list with Undo');

      await pressInPanel(page, '1', { ctrl: true });
      await expect(panel.locator('textarea.input-content')).toBeVisible();
      await expectView(body, 'create form');
      await panel.locator('textarea.input-content').fill('x');
      await panel.locator('.input-title').fill('A name that is long enough to need more than one line in a narrow box');
      await expectView(body, 'create form with a long name');
    });

    test('the fill-in form fits', async ({ page, serviceWorker }) => {
      await seedSnippets(serviceWorker, SNIPPETS);
      await selectInTextarea(page, '#plain', 0);
      const panel = await openPanel(page);
      await panel.locator('.list .item', { hasText: 'Reply' }).click();
      await expect(panel.locator('.fill-input').first()).toBeVisible();
      await expectView(panel.locator('body'), 'fill-in form');
    });

    // Below 900 pixels the manager puts the list above the editor.
    for (const width of [1000, 800]) {
      test(`the manager fits in its three views, ${width} pixels wide`, async ({ context, extensionId, serviceWorker }) => {
        await seedSnippets(serviceWorker, SNIPPETS);
        const manager = await openManager(context, extensionId);
        await manager.setViewportSize({ width, height: 720 });
        const body = manager.locator('body');
        await expect(manager.locator('#snippetList .row')).toHaveCount(3);
        await expectView(body, 'snippet list');
        await manager.locator('#snippetList .row').first().click();
        await expect(manager.locator('#content')).toBeVisible();
        await expectView(body, 'editor');

        // The formatting toolbar, its hint, and the language menu of a code block.
        await manager.locator('#formatted').check();
        await expect(manager.locator('#toolbar')).toBeVisible();
        await expect(manager.locator('#formatHint')).toBeVisible();
        await manager.locator('#richContent').click();
        await manager.locator('#toolbar [data-tool="codeBlock"]').click();
        await expect(manager.locator('#codeLanguage')).toBeEnabled();
        await expectView(body, 'formatted editor');

        // The link bar with its error.
        await manager.locator('#toolbar [data-tool="link"]').click();
        await expect(manager.locator('#linkBar')).toBeVisible();
        await manager.locator('#linkApply').click();
        await expect(manager.locator('#linkError')).toBeVisible();
        await expectView(body, 'link bar');

        for (const view of ['deleted', 'settings']) {
          await manager.goto(`chrome-extension://${extensionId}/options.html#${view}`);
          await expect(manager.locator(`#view-${view}`)).toBeVisible();
          await expectView(body, view);
        }
      });
    }

    test('a page notice fits', async ({ page, pagesUrl, serviceWorker }) => {
      await page.goto(`${pagesUrl}/article.html`);
      await expect(async () => {
        await serviceWorker.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ active: true });
          await self.snippetInserter.onMenuClick({ menuItemId: 'insert-snippet', frameId: 0 }, tab);
        });
        await expect(page.getByRole('status')).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 10_000 });
      const box = await page.getByRole('status').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1000);
      const clipped = await page.getByRole('status').evaluate((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1);
      expect(clipped).toBe(false);
    });
  });
}

const mirrored = testWith('mirrored');

mirrored.describe('mirrored pseudo-language layout', () => {
  mirrored('the panel mirrors: Close at the left of the caption, Back arrow flipped, the footer button at the left edge', async ({ page, serviceWorker }) => {
    await seedSnippets(serviceWorker, SNIPPETS);
    await selectInTextarea(page, '#plain', 0, 5);
    const panel = await openPanel(page);
    await expect(panel.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(panel.locator('html')).toHaveAttribute('lang', /^ar/);

    const closeBox = await panel.locator('#close').boundingBox();
    const captionBox = await panel.locator('#caption').boundingBox();
    expect(closeBox.x + closeBox.width / 2).toBeLessThan(captionBox.x + captionBox.width / 2);

    await panel.locator('.list .item', { hasText: 'Reply' }).click();
    await expect(panel.locator('.fill-input').first()).toBeVisible();
    const back = panel.locator('#back');
    const backBox = await back.boundingBox();
    expect(backBox.x + backBox.width / 2).toBeGreaterThan(captionBox.x + captionBox.width / 2);
    const flipped = await back.locator('svg').evaluate((svg) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(svg).transform === 'none' ? undefined : getComputedStyle(svg).transform);
      return matrix.a < 0;
    });
    expect(flipped, 'the Back arrow is mirrored').toBe(true);

    const primary = await panel.locator('#primary').boundingBox();
    expect(primary.x).toBeLessThan(180);
    await expect(panel.locator('#primaryKey')).toHaveCSS('direction', 'ltr');
  });

  mirrored('a snippet name keeps its own direction, and a notice follows the language', async ({ page, pagesUrl, serviceWorker }) => {
    await seedSnippets(serviceWorker, SNIPPETS);
    await selectInTextarea(page, '#plain', 0, 5);
    const panel = await openPanel(page);
    const caption = panel.locator('.list .item', { hasText: 'Address' }).locator('.item-caption');
    expect(await caption.evaluate((element) => getComputedStyle(element).direction)).toBe('ltr');
    expect(await caption.evaluate((element) => element.closest('[dir]').getAttribute('dir'))).toBe('auto');
    // An abbreviation reads left to right, as its input does, so ;addr keeps its semicolon in front.
    const abbreviation = panel.locator('.list .item', { hasText: 'Address' }).locator('.item-abbreviation');
    expect(await abbreviation.evaluate((element) => getComputedStyle(element).direction)).toBe('ltr');
    await pressInPanel(page, 'Escape');

    await page.goto(`${pagesUrl}/article.html`);
    await expect(async () => {
      await serviceWorker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true });
        await self.snippetInserter.onMenuClick({ menuItemId: 'insert-snippet', frameId: 0 }, tab);
      });
      await expect(page.getByRole('status')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    const direction = await page.getByRole('status').evaluate((element) => getComputedStyle(element).direction);
    expect(direction).toBe('rtl');
  });

  // A snippet's lines keep their own reading direction but line up with the page, so a left to
  // right name and its preview both start at the right edge.
  mirrored('a left to right name and its preview line up at the right edge, in the panel and the manager', async ({ context, extensionId, page, serviceWorker }) => {
    await seedSnippets(serviceWorker, [
      { title: 'Address', content: '14 Elm Street' },
      { title: 'Reply', content: 'Thanks', folder: 'Home' },
    ]);
    await selectInTextarea(page, '#plain', 0, 5);
    const panel = await openPanel(page);
    const item = panel.locator('.list .item', { hasText: 'Address' });
    const name = await textEdges(item.locator('.item-caption'));
    const preview = await textEdges(item.locator('.item-preview'));
    expect(Math.abs(name.right - preview.right), 'panel: right edges of the name and the preview').toBeLessThanOrEqual(1);
    await pressInPanel(page, 'Escape');

    const manager = await openManager(context, extensionId);
    const address = manager.locator('#snippetList .row', { hasText: 'Address' });
    const rowName = await textEdges(address.locator('.row-name'));
    const rowPreview = await textEdges(address.locator('.row-preview'));
    expect(Math.abs(rowName.right - rowPreview.right), 'manager: right edges of the name and the preview').toBeLessThanOrEqual(1);
    // Under All, the second line of a snippet in a folder starts with the folder.
    const reply = manager.locator('#snippetList .row', { hasText: 'Reply' });
    const replyName = await textEdges(reply.locator('.row-name'));
    const folder = await reply.locator('.row-folder').boundingBox();
    expect(Math.abs(replyName.right - (folder.x + folder.width)), 'manager: right edges of the name and the folder').toBeLessThanOrEqual(1);
  });

  mirrored('the edited label of a left to right name sits at its left, the end of a right to left row', async ({ page, serviceWorker }) => {
    await seedSnippets(serviceWorker, [{ title: 'Address', content: '14 Elm Street' }]);
    await selectInTextarea(page, '#plain', 0, 5);
    const panel = await openPanel(page);
    const place = await labelPlace(await markEdited(panel, 'Address'));
    expect(place.shown, 'the label shows in full').toBe(true);
    expect(place.labelRight, 'the label is at the left of the name').toBeLessThanOrEqual(place.nameLeft + 1);
  });

  mirrored('the manager mirrors: its navigation sits at the right and the page is right to left', async ({ context, extensionId, serviceWorker }) => {
    await seedSnippets(serviceWorker, SNIPPETS);
    const manager = await openManager(context, extensionId);
    await expect(manager.locator('html')).toHaveAttribute('dir', 'rtl');
    const nav = await manager.locator('nav').first().boundingBox();
    const list = await manager.locator('#snippetList').boundingBox();
    expect(nav.x).toBeGreaterThan(list.x);
    const abbreviation = manager.locator('#snippetList .row', { hasText: 'Address' }).locator('.pill');
    expect(await abbreviation.evaluate((element) => getComputedStyle(element).direction)).toBe('ltr');
  });

  // The abbreviation is typed left to right, but its placeholder is a sentence in the language.
  mirrored('an empty abbreviation input shows its placeholder right to left, and a typed one left to right', async ({ context, extensionId, page, serviceWorker }) => {
    const direction = (input) => input.evaluate((element) => getComputedStyle(element).direction);
    await seedSnippets(serviceWorker, SNIPPETS);
    await selectInTextarea(page, '#plain', 0, 5);
    const panel = await openPanel(page);
    await pressInPanel(page, '1', { ctrl: true });
    const inPanel = panel.locator('input.input-abbreviation');
    await expect(inPanel).toBeVisible();
    expect(await direction(inPanel)).toBe('rtl');
    await inPanel.fill(';x');
    expect(await direction(inPanel)).toBe('ltr');

    const manager = await openManager(context, extensionId);
    await manager.locator('#snippetList .row', { hasText: 'Reply' }).click();
    const inManager = manager.locator('#abbreviation');
    await expect(inManager).toBeVisible();
    expect(await direction(inManager)).toBe('rtl');
    await inManager.fill(';x');
    expect(await direction(inManager)).toBe('ltr');
  });
});

// The mirrored language with the plural rules and digits of Persian, whose digits differ from the
// Latin ones that String() and an English toLocaleString() write.
const persian = testWith('mirrored', { localeCode: 'fa' });
const LATIN_DIGIT = /[0-9]/;

persian.describe('mirrored pseudo-language with Persian digits', () => {
  persian('the manager writes its counts and positions in the digits of the language', async ({ context, extensionId, serviceWorker }) => {
    await seedSnippets(serviceWorker, SNIPPETS);
    await serviceWorker.evaluate(() =>
      chrome.storage.local.set({
        'snippet_manager.deleted': [
          { id: 'gone00000000', title: 'Gone', content: 'x', createdAt: '2026-01-01T00:00:00.000Z', deletedAt: '2026-11-20T09:14:00.000Z', index: 0 },
        ],
      })
    );
    const manager = await openManager(context, extensionId);
    await expect(manager.locator('#snippetCount')).toHaveText('۳');
    await expect(manager.locator('#deletedCount')).toHaveText('۱');
    // All, Home, and No folder.
    await expect(manager.locator('.folder-count')).toHaveText(['۳', '۱', '۲']);

    await manager.locator('#snippetList .row').first().click();
    await expect(manager.locator('#count')).toContainText('۲۵');
    expect(await manager.locator('#count').textContent()).not.toMatch(LATIN_DIGIT);

    await manager.locator('#content').fill('[1,\n  x]');
    await manager.locator('#formatJson').click();
    await expect(manager.locator('#contentError')).toContainText('۲');
    expect(await manager.locator('#contentError').textContent()).not.toMatch(LATIN_DIGIT);

    await manager.locator('#abbreviation').fill('x');
    await manager.locator('#save').click();
    await expect(manager.locator('#abbreviationError')).toContainText('۳۲');
    expect(await manager.locator('#abbreviationError').textContent()).not.toMatch(LATIN_DIGIT);
  });

  persian('a page notice gives its counts in the digits of the language', async ({ page, serviceWorker }) => {
    await seedSnippets(serviceWorker, [{ content: 'This is too long' }]);
    await selectInTextarea(page, '#limited', 2);
    await openPanel(page);
    await pressInPanel(page, '2', { ctrl: true });
    await expect(page.getByRole('status')).toContainText('۱۰');
    await expect(page.getByRole('status')).toContainText('۱۷');
    expect(await page.getByRole('status').textContent()).not.toMatch(LATIN_DIGIT);
  });
});

const MAC_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// The catalog with Ctrl written as Strg and the Mac Cmd key as Befehl, as a translation may.
function germanKeys(catalog) {
  catalog.keyCtrl.message = 'Strg';
  catalog.keyCmd.message = 'Befehl';
  for (const entry of Object.values(catalog)) {
    for (const definition of Object.values(entry.placeholders || {})) definition.content = definition.content.replace(/^Ctrl\b/, 'Strg');
  }
  return catalog;
}

// A copy of the extension with that catalog, in a browser that reports a Mac.
const macKeys = base.extend({
  context: async ({}, use) => {
    const directory = pseudo.build(germanKeys);
    const context = await launchContext(directory, ['--lang=en-US', `--user-agent=${MAC_AGENT}`]);
    await use(context);
    await context.close();
    pseudo.remove(directory);
  },
});

macKeys('on a Mac, the toolbar shortcuts and the notes in the settings name the Cmd key as the catalog writes it', async ({ context, extensionId }) => {
  const manager = await openManager(context, extensionId);
  for (const [tool, name] of [['bold', 'Bold (Befehl+B)'], ['link', 'Link (Befehl+K)']]) {
    const button = manager.locator(`#toolbar [data-tool="${tool}"]`);
    await expect(button).toHaveAttribute('title', name);
    await expect(button).toHaveAttribute('aria-label', name);
  }
  // The panel's Cmd+1 to Cmd+9, and Cmd+Z after an abbreviation.
  await expect(manager.locator('[data-i18n-rich="usageNote"] kbd')).toHaveText(['Enter', 'Befehl', '2', 'Befehl', '9', 'Befehl', '1']);
  await expect(manager.locator('[data-i18n-rich="abbreviationsNote"] kbd')).toHaveText(['Befehl', 'Z']);
});

// The browser in Malayalam, with the extension's own Malayalam catalog. Its names for Duplicate,
// Delete, and Save are wider than the stretched language's, so they do not fit on one line next to
// the character count at 1000 pixels.
const malayalam = base.extend({
  context: async ({}, use) => {
    const context = await launchContext(undefined, ['--lang=ml']);
    await use(context);
    await context.close();
  },
});

malayalam('in Malayalam the editor buttons wrap instead of pushing Save out of the window', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  const manager = await openManager(context, extensionId);
  await expect(manager.locator('html')).toHaveAttribute('lang', 'ml');
  await manager.locator('#snippetList .row').first().click();
  await expect(manager.locator('#content')).toBeVisible();
  await expectFit(manager.locator('body'), 'editor');
});

base('the layout check reports text that is cut off, and accepts an ellipsis', async ({ page }) => {
  await page.setContent(`
    <body style="margin:0">
      <div id="cut" style="width:40px;overflow:hidden;white-space:nowrap">A long text that does not fit</div>
      <div id="dots" style="width:40px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">A long text that does not fit</div>
    </body>`);
  const problems = await layoutProblems(page.locator('body'));
  expect(problems.filter((problem) => problem.includes('#cut'))).not.toEqual([]);
  expect(problems.filter((problem) => problem.includes('#dots'))).toEqual([]);
});

const ARABIC_NAME = 'عنوان المنزل';

base('a right to left name and its preview line up at the left edge in English, in the panel and the manager', async ({ context, extensionId, page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: ARABIC_NAME, content: 'شارع النخيل' },
    { title: 'رد', content: 'شكرا لك', folder: 'Home' },
  ]);
  await selectInTextarea(page, '#plain', 0, 5);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: ARABIC_NAME });
  const name = await textEdges(item.locator('.item-caption'));
  const preview = await textEdges(item.locator('.item-preview'));
  expect(Math.abs(name.left - preview.left), 'panel: left edges of the name and the preview').toBeLessThanOrEqual(1);
  await pressInPanel(page, 'Escape');

  const manager = await openManager(context, extensionId);
  const row = manager.locator('#snippetList .row', { hasText: ARABIC_NAME });
  const rowName = await textEdges(row.locator('.row-name'));
  const rowPreview = await textEdges(row.locator('.row-preview'));
  expect(Math.abs(rowName.left - rowPreview.left), 'manager: left edges of the name and the preview').toBeLessThanOrEqual(1);
  const reply = manager.locator('#snippetList .row', { hasText: 'رد' });
  const replyName = await textEdges(reply.locator('.row-name'));
  const folder = await reply.locator('.row-folder').boundingBox();
  expect(Math.abs(replyName.left - folder.x), 'manager: left edges of the name and the folder').toBeLessThanOrEqual(1);
});

base('the edited label shows in full after a long name, and sits at the right of a right to left name in English', async ({ page, serviceWorker }) => {
  const long = 'A snippet with a rather long name that cannot fit in one line of the panel';
  await seedSnippets(serviceWorker, [
    { title: long, content: 'Kind regards' },
    { title: ARABIC_NAME, content: 'شارع النخيل' },
  ]);
  await selectInTextarea(page, '#plain', 0, 5);
  const panel = await openPanel(page);
  const cut = await labelPlace(await markEdited(panel, long));
  expect(cut.shown, 'the label after a long name shows in full').toBe(true);

  const arabic = await labelPlace(await markEdited(panel, ARABIC_NAME));
  expect(arabic.shown, 'the label after an Arabic name shows in full').toBe(true);
  expect(arabic.labelLeft, 'the label is at the right of the Arabic name').toBeGreaterThanOrEqual(arabic.nameRight - 1);
});

// A catalog whose No folder button has a name wider than the 140 pixels a folder button may take.
const longNoFolder = testWith((catalog) => {
  catalog.folderNone.message = 'Snippets that are in no folder';
  return catalog;
});

longNoFolder('the All and No folder buttons show their whole name, and only a folder name the user typed is cut', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Loose', content: 'x' },
    { title: 'Filed', content: 'y', folder: 'A folder name long enough to be cut short' },
  ]);
  await selectInTextarea(page, '#plain', 0, 5);
  const panel = await openPanel(page);
  const chips = panel.locator('.folder-chip');
  await expect(chips).toHaveText(['All', 'A folder name long enough to be cut short', 'Snippets that are in no folder']);
  const cut = await chips.evaluateAll((list) => list.map((chip) => chip.scrollWidth > chip.clientWidth + 1));
  expect(cut).toEqual([false, true, false]);
});

// Below 900 pixels the navigation is a row, where the links no longer spread their name and count
// apart, and a flex container drops the space between the two.
base('below 900 pixels the manager navigation keeps a space between a section name and its count', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  const manager = await openManager(context, extensionId);
  await manager.setViewportSize({ width: 800, height: 720 });
  const link = manager.locator('.nav a[data-view="snippets"]');
  await expect(link.locator('.nav-count')).toHaveText('3');
  const name = await link.locator('span').first().boundingBox();
  const count = await link.locator('.nav-count').boundingBox();
  expect(count.x - (name.x + name.width)).toBeGreaterThanOrEqual(4);
});

const REPORT_URL = 'https://github.com/CommitMaster102/snippet-inserter/issues/new?template=translation.yml';

base('the English settings have no language line and no link to the translation form', async ({ context, extensionId }) => {
  const manager = await openManager(context, extensionId, 'settings');
  await expect(manager.locator('#translationReport')).toBeHidden();
  await expect(manager.locator('#languageNote')).toBeHidden();
});

testWith('stretched')('the settings of another language name it and link to the translation form', async ({ context, extensionId }) => {
  const manager = await openManager(context, extensionId, 'settings');
  const link = manager.locator('#translationReport');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', REPORT_URL);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toContainText('⟦');
  await expect(manager.locator('#languageNoteText')).toContainText('Stretched');
});
