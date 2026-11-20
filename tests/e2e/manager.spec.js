// The manager page: listing, editing, creating, reordering, deleting, restoring, and following
// changes made elsewhere.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, readSnippets, readDeleted, openManager, selectInTextarea, openPanel } = require('./helpers');

test('lists snippets in order and saves an edit with Ctrl+S', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Address', content: '14 Elm Street\nSpringfield' },
    { content: 'Kind regards,\nAna' },
  ]);
  const manager = await openManager(context, extensionId);
  const rows = manager.locator('#snippetList .row');
  await expect(rows.locator('.row-name')).toHaveText(['Address', 'Kind regards,']);
  await expect(rows.nth(0).locator('.row-preview')).toHaveText('14 Elm Street');
  await expect(manager.locator('#snippetCount')).toHaveText('2');

  await rows.nth(0).click();
  await expect(manager.locator('#editorHeading')).toHaveText('Edit snippet');
  await expect(manager.locator('#content')).toHaveValue('14 Elm Street\nSpringfield');
  await expect(manager.locator('#count')).toHaveText('25 characters');
  await manager.locator('#content').fill('15 Elm Street');
  await manager.keyboard.press('Control+s');
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  expect((await readSnippets(serviceWorker))[0]).toMatchObject({ title: 'Address', content: '15 Elm Street' });
});

test('creates a snippet and checks the form rules', async ({ context, extensionId, serviceWorker }) => {
  const manager = await openManager(context, extensionId);
  await expect(manager.locator('#listEmpty')).toBeVisible();
  await manager.locator('#newSnippet').click();
  await expect(manager.locator('#editorHeading')).toHaveText('New snippet');
  await expect(manager.locator('#content')).toBeFocused();

  await manager.locator('#title').fill('x'.repeat(129));
  await manager.locator('#save').click();
  await expect(manager.locator('#contentError')).toHaveText('This field must not be empty.');
  await expect(manager.locator('#titleError')).toHaveText('The input must not be longer than 128 characters.');
  expect(await readSnippets(serviceWorker)).toHaveLength(0);

  await manager.locator('#title').fill('Sign-off');
  await manager.locator('#content').fill('Best,\nAna');
  await manager.locator('#save').click();
  await expect(manager.locator('#snippetList .row-name')).toHaveText(['Sign-off']);
  await expect(manager.locator('#snippetList .row')).toHaveAttribute('aria-selected', 'true');
  expect(await readSnippets(serviceWorker)).toMatchObject([{ title: 'Sign-off', content: 'Best,\nAna' }]);
});

test('drag and Alt+Up reorder snippets, and the panel shows the same order', async ({ context, extensionId, serviceWorker, page }) => {
  await seedSnippets(serviceWorker, [{ content: 'Alpha' }, { content: 'Beta' }, { content: 'Gamma' }]);
  const manager = await openManager(context, extensionId);
  const names = manager.locator('#snippetList .row-name');
  await expect(names).toHaveText(['Alpha', 'Beta', 'Gamma']);

  // Drop Gamma on the upper half of Alpha, which places it first.
  await manager.locator('#snippetList .row').nth(2).dragTo(manager.locator('#snippetList .row').nth(0), {
    targetPosition: { x: 20, y: 4 },
  });
  await expect(names).toHaveText(['Gamma', 'Alpha', 'Beta']);

  await manager.locator('#snippetList .row').nth(2).focus();
  await manager.keyboard.press('Alt+ArrowUp');
  await expect(names).toHaveText(['Gamma', 'Beta', 'Alpha']);
  await expect(manager.locator('#snippetList .row').nth(1)).toBeFocused();
  expect((await readSnippets(serviceWorker)).map((s) => s.content)).toEqual(['Gamma', 'Beta', 'Alpha']);

  await page.bringToFront();
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item-caption')).toHaveText(['Gamma', 'Beta', 'Alpha']);
});

test('deletes with Undo, and restores or deletes for good from Recently deleted', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'One', content: '1' }, { title: 'Two', content: '2' }]);
  const manager = await openManager(context, extensionId);
  const names = manager.locator('#snippetList .row-name');

  await manager.locator('#snippetList .row', { hasText: 'Two' }).click();
  await manager.locator('#delete').click();
  await expect(names).toHaveText(['One']);
  await expect(manager.locator('#undoBar')).toBeVisible();
  await expect(manager.locator('#editorEmpty')).toBeVisible();
  await manager.locator('#undoButton').click();
  await expect(names).toHaveText(['One', 'Two']);
  await expect(manager.locator('#editorHeading')).toHaveText('Edit snippet');
  await expect(manager.locator('#title')).toHaveValue('Two');

  await manager.locator('#delete').click();
  await manager.locator('#snippetList .row', { hasText: 'One' }).click();
  await manager.locator('#delete').click();
  await expect(manager.locator('#deletedCount')).toHaveText('2');

  await manager.locator('.nav a[data-view="deleted"]').click();
  const deletedRows = manager.locator('#deletedList .deleted-row');
  await expect(deletedRows.locator('.row-name')).toHaveText(['One', 'Two']);
  await deletedRows.filter({ hasText: 'Two' }).getByRole('button', { name: 'Restore' }).click();
  await expect(deletedRows.locator('.row-name')).toHaveText(['One']);
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['Two']);

  const purge = deletedRows.filter({ hasText: 'One' }).locator('button.danger');
  await purge.click();
  await expect(purge).toHaveText('Click again to delete forever');
  expect(await readDeleted(serviceWorker)).toHaveLength(1);
  await purge.click();
  await expect(manager.locator('#deletedEmpty')).toBeVisible();
  expect(await readDeleted(serviceWorker)).toHaveLength(0);
});

test('follows changes made in a panel, and warns before replacing unsaved edits', async ({ context, extensionId, serviceWorker, page }) => {
  await seedSnippets(serviceWorker, [{ title: 'Shared', content: 'Version one' }]);
  const manager = await openManager(context, extensionId);
  await manager.locator('#snippetList .row').click();
  await expect(manager.locator('#content')).toHaveValue('Version one');

  // A change from elsewhere replaces the editor's text when it has no unsaved edits.
  await serviceWorker.evaluate(async () => {
    const key = 'snippet_manager.snippets';
    const list = (await chrome.storage.local.get(key))[key];
    list[0].content = 'Version two';
    await chrome.storage.local.set({ [key]: list });
  });
  await expect(manager.locator('#content')).toHaveValue('Version two');

  // With unsaved edits, the manager asks instead.
  await manager.locator('#content').fill('My version');
  await page.bringToFront();
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Shared' });
  await item.hover();
  await item.locator('.edit-button').click();
  await panel.locator('textarea.input-content').fill('Panel version');
  await page.keyboard.press('Control+Enter');
  await expect(panel.locator('.list .item-label')).toHaveText('edited');

  await expect(manager.locator('#editorNoticeText')).toHaveText('This snippet changed in another tab.');
  await expect(manager.locator('#content')).toHaveValue('My version');
  await manager.locator('#noticePrimary').click();
  await expect(manager.locator('#content')).toHaveValue('Panel version');
});

test('asks to save or discard before switching away from unsaved edits', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'First', content: 'A' }, { title: 'Second', content: 'B' }]);
  const manager = await openManager(context, extensionId);
  await manager.locator('#snippetList .row', { hasText: 'First' }).click();
  await manager.locator('#content').fill('A changed');
  await manager.locator('#snippetList .row', { hasText: 'Second' }).click();

  await expect(manager.locator('#editorNoticeText')).toHaveText('You have unsaved changes.');
  await expect(manager.locator('#title')).toHaveValue('First');
  await manager.locator('#noticePrimary').click();
  await expect(manager.locator('#title')).toHaveValue('Second');
  expect((await readSnippets(serviceWorker))[0].content).toBe('A changed');
});
