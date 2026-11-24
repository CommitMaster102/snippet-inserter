// The panel in pages that put content in the browser's top layer, such as modal dialogs.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, selectInTextarea, openPanel, expectPanelClosed, doubleTap, longText } = require('./helpers');

test('the panel opens above a modal dialog and inserts on a click', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/dialog.html`);
  await seedSnippets(serviceWorker, [{ title: 'Tea time', content: 'Tea time' }]);
  await selectInTextarea(page, '#t', 5);
  const panel = await openPanel(page);

  // The panel must be the topmost element at its own centre, not hidden under the dialog.
  const frame = page.locator('iframe[title="Snippets"]');
  const box = await frame.boundingBox();
  const topmost = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.tagName,
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  expect(topmost).toBe('IFRAME');

  // The panel sits near the caret, inside the dialog's box.
  const field = await page.locator('#t').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(field.x - 1);
  expect(box.y).toBeGreaterThanOrEqual(field.y);

  await panel.locator('.list .item', { hasText: 'Tea time' }).click();
  await expectPanelClosed(page);
  await expect(page.locator('#t')).toHaveValue('Hello Tea time');
});

test('the edit form stays inside a short window with Save visible', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/editors.html`);
  await page.setViewportSize({ width: 1000, height: 420 });
  await seedSnippets(serviceWorker, [{ title: 'Long', content: longText(20) }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Long' });
  await item.hover();
  await item.locator('.edit-button').click();
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');

  const frame = await page.locator('iframe[title="Snippets"]').boundingBox();
  expect(frame.y).toBeGreaterThanOrEqual(8);
  expect(frame.y + frame.height).toBeLessThanOrEqual(420 - 8 + 1);
  const save = await panel.locator('#primary').boundingBox();
  expect(save.y + save.height).toBeLessThanOrEqual(420 - 8 + 1);
});

test('the list scrolls inside a small frame and the panel keeps to its size', async ({ context, page, serviceWorker }) => {
  const inner = "<!doctype html><html lang='en'><body><textarea id='inner' rows='2' cols='20'>Inside</textarea></body></html>";
  await context.route('https://short-frame.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><body><iframe id="editor" style="width: 300px; height: 200px" srcdoc="${inner}"></iframe></body></html>`,
    })
  );
  await seedSnippets(
    serviceWorker,
    Array.from({ length: 8 }, (_, i) => ({ title: `Snippet ${i + 1}`, content: `Body ${i + 1}` }))
  );
  await page.goto('https://short-frame.test/');
  const frame = page.frameLocator('#editor');
  await frame.locator('#inner').evaluate((element) => {
    element.focus();
    element.setSelectionRange(6, 6);
  });
  const panelFrame = frame.locator('iframe[title="Snippets"]');
  await expect(async () => {
    if ((await panelFrame.count()) === 0) await doubleTap(page);
    await expect(panelFrame).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(panelFrame).toHaveCSS('opacity', '1');

  // The editor frame has a 2 px border on each side.
  const editor = await page.locator('#editor').boundingBox();
  await expect(async () => {
    const box = await panelFrame.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(editor.y + editor.height - 2 - 8 + 1);
    expect(box.x + box.width).toBeLessThanOrEqual(editor.x + editor.width - 2 - 8 + 1);
  }).toPass({ timeout: 5000 });

  // The last snippet can be scrolled into view inside the panel.
  const last = panelFrame.contentFrame().locator('.list .item', { hasText: 'Snippet 8' });
  await last.scrollIntoViewIfNeeded();
  const box = await last.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(editor.y + editor.height - 2);
});
