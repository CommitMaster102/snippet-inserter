// Sites where the double tap and abbreviations are off: the list in the manager, the check in
// the content script, and the shortcut and menu that keep working on those sites.
'use strict';

const path = require('path');
const { test, expect } = require('./fixtures');
const {
  PANEL,
  seedSnippets,
  seedSettings,
  selectInTextarea,
  doubleTap,
  openPanel,
  pressInPanel,
  expectPanelClosed,
  openManager,
} = require('./helpers');

const SNIPPETS = [{ title: 'Address', content: '14 Elm Street', abbreviation: ';addr' }];
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

/** Repeat `open` until the panel shows, because the content script may still be loading. */
async function openWith(page, open) {
  await expect(async () => {
    if ((await page.locator(PANEL).count()) === 0) await open();
    await expect(page.locator(PANEL)).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  // Wait until the panel is shown and still, as openPanel does.
  return openPanel(page);
}

/** The content script reads the settings at the first focus, so give that read time to finish. */
async function settle(page) {
  await page.waitForTimeout(400);
}

test('on a listed site the double tap and abbreviations do nothing', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, { offSites: ['127.0.0.1'] });
  await selectInTextarea(page, '#plain', 11);
  await settle(page);
  await doubleTap(page);
  await page.keyboard.type(' ;addr');
  await page.waitForTimeout(500);
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr');
});

test('on a listed site the shortcut and the menu item still open the panel', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, { offSites: ['127.0.0.1'] });
  await selectInTextarea(page, '#plain', 11);
  await settle(page);

  await openWith(page, () => callHandler(serviceWorker, 'onCommand', ['open-panel']));
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);

  await selectInTextarea(page, '#plain', 11);
  await openWith(page, () => callHandler(serviceWorker, 'onMenuClick', [{ menuItemId: 'insert-snippet', frameId: 0 }]));
});

test('a site includes its subdomains, but not other names that end the same way', async ({ context, page, serviceWorker }) => {
  const body = '<!doctype html><html lang="en"><body><textarea id="plain" rows="4" cols="60">Hello world</textarea></body></html>';
  await context.route('https://**/', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body }));
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, { offSites: ['site.test'] });

  await page.goto('https://mail.site.test/');
  await selectInTextarea(page, '#plain', 11);
  await settle(page);
  await doubleTap(page);
  await page.waitForTimeout(500);
  await expectPanelClosed(page);

  await page.goto('https://notsite.test/');
  await selectInTextarea(page, '#plain', 11);
  await openPanel(page);
});

test('a frame is off when the top page is on the list, and on when only the page it embeds is', async ({ context, page, serviceWorker }) => {
  const inner = '<!doctype html><html lang="en"><body><textarea id="inner" rows="4" cols="40">Inside</textarea></body></html>';
  await context.route('https://widget.test/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: inner }));
  for (const host of ['site.test', 'other.test']) {
    await context.route(`https://${host}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html lang="en"><body><iframe id="editor" src="https://widget.test/" style="width: 600px; height: 200px"></iframe></body></html>',
      })
    );
  }
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, { offSites: ['site.test'] });
  const focusField = async () => {
    const field = page.frameLocator('#editor').locator('#inner');
    await field.evaluate((element) => {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    });
    return field;
  };

  await page.goto('https://site.test/');
  await focusField();
  await settle(page);
  await doubleTap(page);
  await page.waitForTimeout(500);
  await expect(page.frameLocator('#editor').locator(PANEL)).toHaveCount(0);

  await page.goto('https://other.test/');
  await focusField();
  const panel = page.frameLocator('#editor').locator(PANEL);
  await expect(async () => {
    if ((await panel.count()) === 0) await doubleTap(page);
    await expect(panel).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
});

test('in the Docs stand-in, a listed docs.google.com stops the double tap and keeps the shortcut', async ({ context, page, serviceWorker }) => {
  await context.route('https://docs.google.com/**', (route) =>
    route.fulfill({ path: DOCS_PAGE, contentType: 'text/html; charset=utf-8' })
  );
  await seedSnippets(serviceWorker, [{ title: 'Greeting', content: 'Hello there' }]);
  await seedSettings(serviceWorker, { offSites: ['docs.google.com'] });
  await page.goto('https://docs.google.com/document/d/test/edit');
  await page.evaluate(() => {
    window.docState.start = 0;
    window.docState.end = 0;
  });
  await page.frameLocator('.docs-texteventtarget-iframe').locator('[contenteditable]').focus();
  await settle(page);
  await doubleTap(page);
  await page.waitForTimeout(500);
  await expectPanelClosed(page);

  await openWith(page, () => callHandler(serviceWorker, 'onCommand', ['open-panel']));
});

test('the manager adds a site from an address, refuses bad input, and turns a site on again', async ({ context, extensionId, serviceWorker }) => {
  const stored = () => serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  const manager = await openManager(context, extensionId, 'settings');
  const input = manager.locator('#offSiteInput');
  const error = manager.locator('#offSiteError');
  const rows = manager.locator('#offSiteList .site-name');

  await expect(manager.locator('#offSitesEmpty')).toHaveText('No sites yet. The double tap and abbreviations work on every site.');
  await expect(error).toBeHidden();

  await input.fill('https://Mail.Example.com/inbox');
  await input.press('Enter');
  await expect(rows).toHaveText(['mail.example.com']);
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(manager.locator('#offSitesEmpty')).toBeHidden();
  expect(await stored()).toEqual({ offSites: ['mail.example.com'] });

  await input.fill('not a site');
  await manager.getByRole('button', { name: 'Add site' }).click();
  await expect(error).toHaveText('Enter a site such as example.com.');
  await input.fill('mail.example.com');
  await manager.getByRole('button', { name: 'Add site' }).click();
  await expect(error).toHaveText('mail.example.com is already on the list.');
  await input.fill('a.mail.example.com');
  await manager.getByRole('button', { name: 'Add site' }).click();
  await expect(error).toHaveText('a.mail.example.com is already off, because mail.example.com is on the list.');
  await input.fill('x');
  await expect(error).toBeHidden();

  await input.fill('example.com');
  await manager.getByRole('button', { name: 'Add site' }).click();
  await expect(rows).toHaveText(['example.com']);
  await input.fill('zeta.test');
  await manager.getByRole('button', { name: 'Add site' }).click();
  await expect(rows).toHaveText(['example.com', 'zeta.test']);

  await manager.getByRole('button', { name: 'Turn on example.com again' }).click();
  await expect(rows).toHaveText(['zeta.test']);
  await expect(manager.getByRole('button', { name: 'Turn on zeta.test again' })).toBeFocused();
  await manager.getByRole('button', { name: 'Turn on zeta.test again' }).click();
  await expect(manager.locator('#offSitesEmpty')).toBeVisible();
  await expect(input).toBeFocused();
  expect(await stored()).toEqual({ offSites: [] });
});

test('a site added elsewhere shows in an open manager without a reload', async ({ context, extensionId, serviceWorker }) => {
  const manager = await openManager(context, extensionId, 'settings');
  await expect(manager.locator('#offSiteList .site-name')).toHaveCount(0);
  await seedSettings(serviceWorker, { offSites: ['elsewhere.test'] });
  await expect(manager.locator('#offSiteList .site-name')).toHaveText(['elsewhere.test']);
});
