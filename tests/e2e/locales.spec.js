// Layout tests with pseudo-languages in place of English: one about 40 percent longer than English,
// and one written from right to left. Chrome ignores a language folder it does not know, so each
// test run loads a copy of the extension whose English catalog is replaced (scripts/pseudo-locales.js)
// and starts the browser in English.
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

  mirrored('the manager mirrors: its navigation sits at the right and the page is right to left', async ({ context, extensionId, serviceWorker }) => {
    await seedSnippets(serviceWorker, SNIPPETS);
    const manager = await openManager(context, extensionId);
    await expect(manager.locator('html')).toHaveAttribute('dir', 'rtl');
    const nav = await manager.locator('nav').first().boundingBox();
    const list = await manager.locator('#snippetList').boundingBox();
    expect(nav.x).toBeGreaterThan(list.x);
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
