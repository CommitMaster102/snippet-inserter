// Deleting a snippet moves it to the recently deleted list, and the panel can undo the delete.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, readSnippets, readDeleted, selectInTextarea, openPanel } = require('./helpers');

async function openEditForm(panel, name) {
  const item = panel.locator('.list .item', { hasText: name });
  await item.hover();
  await item.locator('.edit-button').click();
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');
}

test('Undo puts a deleted snippet back at its old position', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'First', content: 'One' }, { title: 'Second', content: 'Two' }, { title: 'Third', content: 'Three' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);

  await openEditForm(panel, 'Second');
  await panel.locator('.item-danger').click();
  const captions = panel.locator('.list .item-caption');
  await expect(captions).toHaveText(['First', 'Third']);
  await expect(panel.locator('#undoBar')).toBeVisible();
  await expect(panel.locator('#undoText')).toHaveText('Snippet deleted.');
  const deleted = await readDeleted(serviceWorker);
  expect(deleted).toHaveLength(1);
  expect(deleted[0]).toMatchObject({ title: 'Second', content: 'Two', index: 1 });

  await panel.locator('#undoButton').click();
  await expect(captions).toHaveText(['First', 'Second', 'Third']);
  await expect(panel.locator('#undoBar')).toBeHidden();
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['First', 'Second', 'Third']);
  expect(await readDeleted(serviceWorker)).toHaveLength(0);
});

test('Ctrl+Z in the list undoes a delete, also of the last snippet', async ({ page, serviceWorker }) => {
  const [seeded] = await seedSnippets(serviceWorker, [{ title: 'Only', content: 'Alone' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);

  await openEditForm(panel, 'Only');
  await panel.locator('.item-danger').click();
  await expect(panel.locator('.empty-heading')).toBeVisible();
  await expect(panel.locator('#undoBar')).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect(panel.locator('.list .item-caption')).toHaveText(['Only']);
  const stored = await readSnippets(serviceWorker);
  expect(stored).toEqual([seeded]);
});

test('Ctrl+1 in the edit form does not delete the snippet', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Keep me', content: 'Important' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);

  await openEditForm(panel, 'Keep me');
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(300);
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');
  expect(await readSnippets(serviceWorker)).toHaveLength(1);
  expect(await readDeleted(serviceWorker)).toHaveLength(0);

  // Delete is still reachable from the keyboard: Tab from the name field to Duplicate, then to
  // Delete, and Enter.
  await panel.locator('input.input-title').focus();
  await page.keyboard.press('Tab');
  await expect(panel.locator('.item-action', { hasText: 'Duplicate snippet' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel.locator('.item-danger')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel.locator('.empty-heading')).toBeVisible();
  expect(await readSnippets(serviceWorker)).toHaveLength(0);
});

test('the recently deleted list keeps the newest 20 snippets', async ({ context, extensionId, serviceWorker }) => {
  const seeded = await seedSnippets(
    serviceWorker,
    Array.from({ length: 21 }, (_, i) => ({ title: `Snippet ${i + 1}`, content: `Text ${i + 1}` }))
  );
  // The panel page loads lib/snippets.js, so its functions can be called there directly.
  const host = await context.newPage();
  await host.goto(`chrome-extension://${extensionId}/panel.html`);
  await host.evaluate(async (ids) => {
    for (const id of ids) await window.SnippetInserter.deleteSnippet(id);
  }, seeded.map((s) => s.id));

  expect(await readSnippets(serviceWorker)).toHaveLength(0);
  const deleted = await readDeleted(serviceWorker);
  expect(deleted).toHaveLength(20);
  expect(deleted[0].title).toBe('Snippet 21');
  expect(deleted[19].title).toBe('Snippet 2');
});
