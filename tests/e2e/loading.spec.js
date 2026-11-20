// The content script loads content-main.js only when a frame needs the panel or an insert.
// These tests check that the on-demand load stays out of idle frames and works on pages that
// make loading harder: strict security headers and editors inside frames.
'use strict';

const { test, expect } = require('./fixtures');
const { PANEL, seedSnippets, selectInTextarea, openPanel, pressInPanel, expectPanelClosed, doubleTap } = require('./helpers');

const TEXTAREA_PAGE =
  '<!doctype html><html lang="en"><body><textarea id="plain" rows="4" cols="60">Hello world</textarea></body></html>';

// Records the URLs of the extension's own scripts that the page's frames load.
async function watchExtensionScripts(context, page) {
  const cdp = await context.newCDPSession(page);
  const urls = [];
  cdp.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.startsWith('chrome-extension://')) urls.push(event.request.url);
  });
  await cdp.send('Network.enable');
  return urls;
}

test('an idle page never loads the panel code; opening the panel does', async ({ context, page, pagesUrl, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time' }]);
  const urls = await watchExtensionScripts(context, page);
  await page.goto(`${pagesUrl}/editors.html`);
  await selectInTextarea(page, '#plain', 11);
  await page.keyboard.type(' and more');
  await page.waitForTimeout(500);
  expect(urls.filter((url) => url.endsWith('/content-main.js'))).toEqual([]);

  await openPanel(page);
  await expect.poll(() => urls.filter((url) => url.endsWith('/content-main.js')).length).toBe(1);
});

// The settings are read at the first focus or key press in a frame. A field that has the focus
// before the content script runs, through autofocus, counts as that first focus.
test('a field focused before the script runs gets the stored trigger key', async ({ context, page, serviceWorker }) => {
  await context.route('https://autofocus.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="en"><body><textarea id="plain" autofocus>Hello world</textarea></body></html>',
    })
  );
  await serviceWorker.evaluate(() => chrome.storage.local.set({ settings: { hotkey: 'Shift' } }));
  await page.goto('https://autofocus.test/');
  await expect(page.locator('#plain')).toBeFocused();
  // Give the content script time to load at document idle and read the settings.
  await page.waitForTimeout(1000);
  await doubleTap(page, 'Control');
  await page.waitForTimeout(500);
  await expect(page.locator(PANEL)).toHaveCount(0);
  await doubleTap(page, 'Shift');
  await expect(page.locator(PANEL)).toBeAttached();
});

test('works on a page with a strict Content-Security-Policy and Trusted Types', async ({ context, page, serviceWorker }) => {
  await context.route('https://strict-csp.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      headers: {
        'content-security-policy': "default-src 'none'; require-trusted-types-for 'script'",
        'cross-origin-embedder-policy': 'require-corp',
        'cross-origin-opener-policy': 'same-origin',
      },
      body: TEXTAREA_PAGE,
    })
  );
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await page.goto('https://strict-csp.test/');
  await selectInTextarea(page, '#plain', 11);
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world Tea time');

  await page.keyboard.type(' ;tt');
  await expect(page.locator('#plain')).toHaveValue('Hello world Tea time Tea time');
});

test('opens, inserts, and expands abbreviations inside a visible frame', async ({ context, page, serviceWorker }) => {
  const inner = "<!doctype html><html lang='en'><body><textarea id='inner' rows='4' cols='40'>Inside</textarea></body></html>";
  await context.route('https://frames.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><body><iframe id="editor" style="width: 600px; height: 200px" srcdoc="${inner}"></iframe></body></html>`,
    })
  );
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await page.goto('https://frames.test/');
  const frame = page.frameLocator('#editor');
  const field = frame.locator('#inner');
  const caretAtEnd = () =>
    field.evaluate((element) => {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    });

  await caretAtEnd();
  const panel = frame.locator(PANEL);
  await expect(async () => {
    if ((await panel.count()) === 0) await doubleTap(page);
    await expect(panel).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(panel).toHaveCSS('opacity', '1');
  await expect(frame.frameLocator(PANEL).locator('.list .item-caption')).toHaveText(['Tea time']);
  await pressInPanel(frame, '2', { ctrl: true });
  await expectPanelClosed(frame);
  await expect(field).toHaveValue('Inside Tea time');

  await caretAtEnd();
  await page.keyboard.type(' ;tt');
  await expect(field).toHaveValue('Inside Tea time Tea time');
  // The panel never opened in the top document.
  await expect(page.locator(PANEL)).toHaveCount(0);
});
