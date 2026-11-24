// The panel in pages that put content in the browser's top layer, such as modal dialogs.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, selectInTextarea, openPanel, expectPanelClosed } = require('./helpers');

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
