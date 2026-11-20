// The right-click menu items and the keyboard shortcut. Playwright cannot open the browser's own
// menu or press an extension command, so the tests call the service worker's handlers, which the
// real menu and shortcut call too.
'use strict';

const path = require('path');
const { test, expect } = require('./fixtures');
const {
  PANEL,
  seedSnippets,
  readSnippets,
  selectInTextarea,
  openPanel,
  pressInPanel,
  expectPanelClosed,
  openManager,
} = require('./helpers');

const DOCS_URL = 'https://docs.google.com/document/d/test/edit';
const DOCS_PAGE = path.resolve(__dirname, '..', 'pages', 'docs.html');

/** Run a service worker handler for the active tab, as the browser would. */
async function callHandler(serviceWorker, name, args) {
  await serviceWorker.evaluate(
    async ([handler, handlerArgs]) => {
      const [tab] = await chrome.tabs.query({ active: true });
      await self.snippetInserter[handler](...handlerArgs, tab);
    },
    [name, args]
  );
}

const menuClick = (serviceWorker, info) => callHandler(serviceWorker, 'onMenuClick', [info]);
const shortcut = (serviceWorker) => callHandler(serviceWorker, 'onCommand', ['open-panel']);

/** Select the whole content of the element `selector` in `frame` (a Page or a Frame). */
async function selectElement(frame, selector) {
  await frame.evaluate((sel) => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(sel));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, selector);
}

/** Wait until the content script in the page answers, so a menu click is not lost. */
async function waitForContentScript(page, serviceWorker) {
  await expect(async () => {
    const answered = await serviceWorker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true });
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'ping' }, { frameId: 0 });
        return true;
      } catch {
        return false;
      }
    });
    expect(answered).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test.describe('Save selection as snippet', () => {
  test.beforeEach(async ({ page, pagesUrl, serviceWorker }) => {
    await page.goto(`${pagesUrl}/article.html`);
    await waitForContentScript(page, serviceWorker);
  });

  test('saves text selected on a page, keeping its line breaks', async ({ page, serviceWorker }) => {
    await selectElement(page, '#para');
    await menuClick(serviceWorker, { menuItemId: 'save-selection', frameId: 0, selectionText: 'collapsed' });

    const panel = page.frameLocator(PANEL);
    await expect(panel.locator('.caption')).toHaveText('Create a new snippet');
    await expect(panel.locator('#back')).toBeHidden();
    await expect(panel.locator('textarea.input-content')).toHaveValue('First line of the note\nSecond line of the note');
    const box = await page.locator(PANEL).boundingBox();
    const para = await page.locator('#para').boundingBox();
    expect(box.y).toBeGreaterThan(para.y);

    await panel.locator('input.input-title').fill('Note');
    await page.keyboard.press('Control+Enter');
    await expectPanelClosed(page);
    await expect(page.getByRole('status')).toHaveText('Snippet saved.');
    expect(await readSnippets(serviceWorker)).toMatchObject([
      { title: 'Note', content: 'First line of the note\nSecond line of the note' },
    ]);
  });

  test('works inside a frame', async ({ page, serviceWorker }) => {
    const inner = page.frame({ url: /srcdoc/ });
    await selectElement(inner, '#innerPara');
    // A real click names the frame; sending to every frame reaches it the same way, because the
    // top page has no selection and ignores the message.
    await menuClick(serviceWorker, { menuItemId: 'save-selection' });

    const panel = page.frameLocator('#inner').frameLocator(PANEL);
    await expect(panel.locator('textarea.input-content')).toHaveValue('Inner first\nInner second');
    await page.keyboard.press('Control+Enter');
    await expect(page.frameLocator('#inner').locator(PANEL)).toHaveCount(0);
    expect(await readSnippets(serviceWorker)).toMatchObject([{ content: 'Inner first\nInner second' }]);
  });

  test('Escape closes the form without saving', async ({ page, serviceWorker }) => {
    await selectElement(page, '#para');
    await menuClick(serviceWorker, { menuItemId: 'save-selection', frameId: 0 });
    const panel = page.frameLocator(PANEL);
    await expect(panel.locator('textarea.input-content')).toBeFocused();
    await pressInPanel(page, 'Escape');
    await expectPanelClosed(page);
    expect(await readSnippets(serviceWorker)).toHaveLength(0);
  });

  test('on a page without a content script, the manager opens with the text', async ({ context, page, serviceWorker }) => {
    await page.goto('chrome://version/');
    const opened = context.waitForEvent('page');
    await menuClick(serviceWorker, { menuItemId: 'save-selection', frameId: 0, selectionText: 'Chromium version' });
    const manager = await opened;
    await expect(manager.locator('#editorHeading')).toHaveText('New snippet');
    await expect(manager.locator('#content')).toHaveValue('Chromium version');
    await expect(manager).toHaveURL(/options\.html#snippets$/);
  });
});

test('Insert snippet... opens the panel in the field, and explains an unsupported one', async ({ page, pagesUrl, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea' }]);
  await waitForContentScript(page, serviceWorker);
  await selectInTextarea(page, '#plain', 5);
  await menuClick(serviceWorker, { menuItemId: 'insert-snippet', frameId: 0 });
  await expect(page.frameLocator(PANEL).locator('.list .item-caption')).toHaveText(['Tea']);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello Tea world');

  await page.goto(`${pagesUrl}/article.html`);
  await waitForContentScript(page, serviceWorker);
  await page.locator('#password').focus();
  await menuClick(serviceWorker, { menuItemId: 'insert-snippet', frameId: 0 });
  await expect(page.getByRole('status')).toHaveText('Snippets cannot be inserted in this kind of field.');
  await expect(page.locator(PANEL)).toHaveCount(0);
});

for (const [field, place] of [
  ['#plain', (page) => selectInTextarea(page, '#plain', 5)],
  ['#single', (page) => selectInTextarea(page, '#single', 6)],
  ['#rich', (page) => page.locator('#rich').focus()],
]) {
  test(`the shortcut opens the panel in ${field}`, async ({ page, serviceWorker }) => {
    await seedSnippets(serviceWorker, [{ content: 'Tea' }]);
    await waitForContentScript(page, serviceWorker);
    await place(page);
    await shortcut(serviceWorker);
    await expect(page.frameLocator(PANEL).locator('.list .item-caption')).toHaveText(['Tea']);
  });
}

test('the shortcut opens the panel in Google Docs', async ({ context, page, serviceWorker }) => {
  await context.route('https://docs.google.com/**', (route) =>
    route.fulfill({ path: DOCS_PAGE, contentType: 'text/html; charset=utf-8' })
  );
  await seedSnippets(serviceWorker, [{ content: 'Tea' }]);
  await page.goto(DOCS_URL);
  await waitForContentScript(page, serviceWorker);
  await page.evaluate(() => {
    const frame = document.querySelector('iframe');
    frame.focus();
    frame.contentDocument.querySelector('[role="textbox"]').focus();
  });
  await expect(async () => {
    if ((await page.locator(PANEL).count()) === 0) await shortcut(serviceWorker);
    await expect(page.locator(PANEL)).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(page.frameLocator(PANEL).locator('.list .item-caption')).toHaveText(['Tea']);
  // The panel opens in the visible page, not inside the hidden input frame.
  const nested = await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelectorAll('iframe').length);
  expect(nested).toBe(0);
});

test('Ctrl+Shift+Space is the default shortcut, and the manager shows it', async ({ context, extensionId, serviceWorker }) => {
  const commands = await serviceWorker.evaluate(() => chrome.commands.getAll());
  const command = commands.find((c) => c.name === 'open-panel');
  // The browser names the Space key in its interface language, for example "Espacio".
  expect(command.shortcut).toMatch(/^Ctrl\+Shift\+\S+$/);
  const manager = await openManager(context, extensionId, 'settings');
  await expect(manager.locator('#shortcut')).toHaveText(command.shortcut);
});

test('the double tap still opens the panel after the shortcut was used', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea' }]);
  await waitForContentScript(page, serviceWorker);
  await selectInTextarea(page, '#plain', 5);
  await shortcut(serviceWorker);
  await expect(page.frameLocator(PANEL).locator('.list .item-caption')).toHaveText(['Tea']);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await selectInTextarea(page, '#plain', 5);
  await openPanel(page);
});
