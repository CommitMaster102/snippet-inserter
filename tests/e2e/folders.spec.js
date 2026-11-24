// Folders in the panel and the manager: the folder buttons, the Folder field, and moving and
// renaming whole folders.
'use strict';

const { test, expect } = require('./fixtures');
const {
  seedSnippets,
  readSnippets,
  readDeleted,
  selectInTextarea,
  openPanel,
  pressInPanel,
  expectPanelClosed,
  openManager,
} = require('./helpers');

const FOUR = [
  { title: 'Alpha', content: 'Alpha', folder: 'Work' },
  { title: 'Beta', content: 'Beta', folder: 'Personal' },
  { title: 'Gamma', content: 'Gamma', folder: 'Work' },
  { title: 'Delta', content: 'Delta' },
];

const chips = (panel) => panel.locator('#folderBar .folder-chip');
const captions = (panel) => panel.locator('.list .item-caption');

test('without any folder the panel has no folder buttons, and the Folder field starts empty', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Alpha' }, { content: 'Beta' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(captions(panel)).toHaveCount(2);
  await expect(panel.locator('#folderBar')).toBeHidden();

  await page.keyboard.press('Enter');
  const field = panel.locator('input.input-folder');
  await expect(field).toBeVisible();
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('placeholder', 'Folder (optional), such as Work …');
});

test('a folder button lists only that folder, Ctrl+2 inserts from it, and the next panel opens on All', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, FOUR);
  await selectInTextarea(page, '#plain', 5);
  let panel = await openPanel(page);

  await expect(chips(panel)).toHaveText(['All', 'Personal', 'Work', 'No folder']);
  await expect(chips(panel).first()).toHaveAttribute('aria-selected', 'true');
  await expect(captions(panel)).toHaveText(['Alpha', 'Beta', 'Gamma', 'Delta']);

  await chips(panel).filter({ hasText: 'Work' }).click();
  await expect(captions(panel)).toHaveText(['Alpha', 'Gamma']);
  await expect(chips(panel).filter({ hasText: 'Work' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.locator('#search')).toBeFocused();

  await panel.locator('#search').fill('gam');
  await expect(captions(panel)).toHaveText(['Gamma']);
  await panel.locator('#search').fill('');
  await expect(captions(panel)).toHaveText(['Alpha', 'Gamma']);

  await pressInPanel(page, '3', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello Gamma world');

  await selectInTextarea(page, '#plain', 5);
  panel = await openPanel(page);
  await expect(chips(panel).first()).toHaveAttribute('aria-selected', 'true');
  await expect(captions(panel)).toHaveCount(4);
});

test('Tab reaches the selected folder button, the arrows select, and Enter goes back to the search box', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, FOUR);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(chips(panel)).toHaveCount(4);

  await expect(panel.locator('#folderBar')).toHaveAttribute('role', 'tablist');
  await expect(chips(panel).first()).toHaveAttribute('role', 'tab');
  await page.keyboard.press('Tab');
  await expect(chips(panel).first()).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(chips(panel).nth(1)).toBeFocused();
  await expect(chips(panel).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(captions(panel)).toHaveText(['Beta']);

  await page.keyboard.press('End');
  await expect(chips(panel).nth(3)).toBeFocused();
  await expect(captions(panel)).toHaveText(['Delta']);
  await page.keyboard.press('Home');
  await expect(captions(panel)).toHaveCount(4);
  await page.keyboard.press('ArrowRight');
  await expect(captions(panel)).toHaveText(['Beta']);

  await page.keyboard.press('Enter');
  await expect(panel.locator('#search')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello Beta world');
});

test('Ctrl+1 under a folder starts the form in that folder, and only Ctrl+Enter saves from the Folder field', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, FOUR);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await chips(panel).filter({ hasText: 'Work' }).click();
  await pressInPanel(page, '1', { ctrl: true });

  const field = panel.locator('input.input-folder');
  await expect(field).toHaveValue('Work');
  await panel.locator('textarea.input-content').fill('Fresh work text');
  // Enter may pick a suggestion from the Folder field's list, so it does not save the form.
  await field.press('Enter');
  await page.waitForTimeout(300);
  expect(await readSnippets(serviceWorker)).toHaveLength(FOUR.length);
  await expect(field).toBeVisible();
  await field.press('Control+Enter');

  await expect(captions(panel)).toHaveText(['Alpha', 'Gamma', 'Fresh work textnew']);
  const stored = await readSnippets(serviceWorker);
  expect(stored.at(-1)).toMatchObject({ content: 'Fresh work text', folder: 'Work' });
});

test('a snippet saved into another folder switches to that folder, so its label stays visible', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, FOUR);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await chips(panel).filter({ hasText: 'Work' }).click();
  await pressInPanel(page, '1', { ctrl: true });

  await panel.locator('textarea.input-content').fill('Home text');
  await panel.locator('input.input-folder').fill('personal');
  await pressInPanel(page, 'Enter', { ctrl: true });

  await expect(chips(panel).filter({ hasText: 'Personal' })).toHaveAttribute('aria-selected', 'true');
  await expect(captions(panel)).toHaveText(['Beta', 'Home textnew']);
  const stored = await readSnippets(serviceWorker);
  expect(stored.at(-1).folder).toBe('Personal');
});

test('editing shows the folder, Duplicate keeps it, and a folder name over 64 characters is refused', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, FOUR);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Beta' });
  await item.hover();
  await item.locator('.edit-button').click();
  const field = panel.locator('input.input-folder');
  await expect(field).toHaveValue('Personal');

  await field.fill('x'.repeat(65));
  await pressInPanel(page, 'Enter', { ctrl: true });
  await expect(panel.locator('.feedback:visible')).toHaveText('The input must not be longer than 64 characters.');
  expect((await readSnippets(serviceWorker))[1].folder).toBe('Personal');

  await field.fill('Personal');
  await panel.locator('.item-action', { hasText: 'Duplicate snippet' }).click();
  await expect(captions(panel)).toHaveCount(5);
  const stored = await readSnippets(serviceWorker);
  expect(stored[2]).toMatchObject({ title: 'Copy of Beta', folder: 'Personal' });
});

test('Alt+Down under a folder moves a snippet past the next one of that folder only', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'A', content: 'A', folder: 'Work' },
    { title: 'X', content: 'X', folder: 'Personal' },
    { title: 'B', content: 'B', folder: 'Work' },
  ]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await chips(panel).filter({ hasText: 'Work' }).click();
  await expect(captions(panel)).toHaveText(['A', 'B']);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(captions(panel)).toHaveText(['B', 'A']);
  await expect(panel.locator('.list .item[data-focused] .item-caption')).toHaveText('A');
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['X', 'B', 'A']);

  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(200);
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['X', 'B', 'A']);
});

test('deleting the last snippet of the selected folder returns to All, and Undo brings the folder back', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, FOUR);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await chips(panel).filter({ hasText: 'Personal' }).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('F2');
  await panel.locator('.item-action', { hasText: 'Delete snippet' }).click();

  await expect(panel.locator('#undoBar')).toBeVisible();
  await expect(chips(panel)).toHaveText(['All', 'Work', 'No folder']);
  await expect(chips(panel).first()).toHaveAttribute('aria-selected', 'true');
  await expect(captions(panel)).toHaveCount(3);

  await panel.locator('#undoButton').click();
  await expect(chips(panel)).toHaveText(['All', 'Personal', 'Work', 'No folder']);
  expect((await readSnippets(serviceWorker)).find((s) => s.title === 'Beta').folder).toBe('Personal');
});

test('the folder row is one Tab stop, and a Hebrew folder name reads right to left', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'One', content: 'One', folder: 'עבודה' },
    { title: 'Two', content: 'Two', folder: 'Work' },
  ]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(chips(panel)).toHaveCount(3);

  const stops = await chips(panel).evaluateAll((nodes) => nodes.filter((n) => n.tabIndex === 0).length);
  expect(stops).toBe(1);
  const hebrew = chips(panel).filter({ hasText: 'עבודה' });
  expect(await hebrew.evaluate((node) => node.matches(':dir(rtl)'))).toBe(true);
  expect(await chips(panel).filter({ hasText: 'Work' }).evaluate((node) => node.matches(':dir(ltr)'))).toBe(true);
});

// Headless Chromium draws no suggestion popup, so picking one with the keyboard cannot be driven
// here. The test checks the list the browser would offer.
test('the Folder field offers the existing folder names as suggestions', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, FOUR);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await pressInPanel(page, '1', { ctrl: true });

  await expect(panel.locator('input.input-folder')).toHaveAttribute('list', 'folderOptions');
  await expect(panel.locator('#folderOptions option')).toHaveCount(2);
  const offered = await panel.locator('#folderOptions option').evaluateAll((nodes) => nodes.map((n) => n.value));
  expect(offered).toEqual(['Personal', 'Work']);
});

// The manager.

const mChips = (manager) => manager.locator('#folderBar .folder-chip');
const mRows = (manager) => manager.locator('#snippetList .row');
const mNames = (manager) => manager.locator('#snippetList .row-name');
const chipFor = (manager, name) => mChips(manager).filter({ has: manager.locator('.folder-name', { hasText: new RegExp(`^${name}$`) }) });
const folders = async (serviceWorker) => (await readSnippets(serviceWorker)).map((s) => s.folder);

test('a folder typed in the editor is saved, and its button shows the count and filters the list', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'Alpha' },
    { title: 'Beta', content: 'Beta' },
  ]);
  const manager = await openManager(context, extensionId);
  await expect(manager.locator('#folderBar')).toBeHidden();

  await mRows(manager).first().click();
  await expect(manager.locator('#folder')).toHaveValue('');
  await manager.locator('#folder').fill('Work');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  await expect(mChips(manager)).toHaveText(['All 2', 'Work 1', 'No folder 1']);
  expect(await folders(serviceWorker)).toEqual(['Work', undefined]);
  await expect(mRows(manager).first().locator('.row-folder')).toHaveText('Work');

  await chipFor(manager, 'Work').click();
  await expect(mNames(manager)).toHaveText(['Alpha']);
  await expect(mRows(manager).first().locator('.row-folder')).toHaveCount(0);
  await expect(manager.locator('#folderActions')).toBeVisible();
  await manager.locator('#search').fill('beta');
  await expect(mNames(manager)).toHaveCount(0);
  await manager.locator('#search').fill('');

  await chipFor(manager, 'No folder').click();
  await expect(mNames(manager)).toHaveText(['Beta']);
  await expect(manager.locator('#folderActions')).toBeHidden();
  await mRows(manager).first().click();
  await manager.locator('#folder').fill('x'.repeat(65));
  await manager.locator('#save').click();
  await expect(manager.locator('#folderError')).toHaveText('The input must not be longer than 64 characters.');
  expect(await folders(serviceWorker)).toEqual(['Work', undefined]);
});

test('dragging a row onto a folder button moves the snippet and keeps its place', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'Alpha', folder: 'Work' },
    { title: 'Beta', content: 'Beta', folder: 'Personal' },
    { title: 'Gamma', content: 'Gamma' },
    { title: 'Delta', content: 'Delta' },
  ]);
  const manager = await openManager(context, extensionId);
  await expect(mRows(manager).first().locator('.handle')).toHaveAttribute('title', 'Drag to reorder, or onto a folder to move it');

  await mRows(manager).nth(2).dragTo(chipFor(manager, 'Work'));
  await expect(mChips(manager)).toHaveText(['All 4', 'Personal 1', 'Work 2', 'No folder 1']);
  expect(await folders(serviceWorker)).toEqual(['Work', 'Personal', 'Work', undefined]);
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);

  // The open editor follows the move without an unsaved-changes notice, also while a search
  // narrows the list.
  await mRows(manager).nth(2).click();
  await expect(manager.locator('#folder')).toHaveValue('Work');
  await manager.locator('#search').fill('gamma');
  await mRows(manager).first().dragTo(chipFor(manager, 'Personal'));
  await expect(manager.locator('#folder')).toHaveValue('Personal');
  await expect(manager.locator('#editorNotice')).toBeHidden();
  expect(await folders(serviceWorker)).toEqual(['Work', 'Personal', 'Personal', undefined]);

  await mRows(manager).first().dragTo(chipFor(manager, 'No folder'));
  await expect(manager.locator('#folder')).toHaveValue('');
  expect(await folders(serviceWorker)).toEqual(['Work', 'Personal', undefined, undefined]);
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
});

test('Rename folder renames it on every snippet, and merges into an existing folder', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'Alpha', folder: 'Work' },
    { title: 'Beta', content: 'Beta', folder: 'Personal' },
    { title: 'Gamma', content: 'Gamma', folder: 'Work' },
    { title: 'Delta', content: 'Delta' },
  ]);
  const manager = await openManager(context, extensionId);
  await chipFor(manager, 'Work').click();
  await manager.getByRole('button', { name: 'Rename folder' }).click();

  const input = manager.locator('#renameInput');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Work');
  await expect(input).toHaveAccessibleName('Folder name');
  await expect(manager.getByRole('button', { name: 'Remove folder' })).toBeHidden();

  await input.fill('');
  await input.press('Enter');
  await expect(manager.locator('#renameError')).toHaveText('Enter a folder name.');
  await input.fill('x'.repeat(65));
  await input.press('Enter');
  await expect(manager.locator('#renameError')).toHaveText('The input must not be longer than 64 characters.');
  expect(await folders(serviceWorker)).toEqual(['Work', 'Personal', 'Work', undefined]);

  await input.fill('Job');
  await input.press('Enter');
  await expect(manager.locator('#renameForm')).toBeHidden();
  await expect(mChips(manager)).toHaveText(['All 4', 'Job 2', 'Personal 1', 'No folder 1']);
  await expect(chipFor(manager, 'Job')).toHaveAttribute('aria-selected', 'true');
  expect(await folders(serviceWorker)).toEqual(['Job', 'Personal', 'Job', undefined]);
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);

  await manager.getByRole('button', { name: 'Rename folder' }).click();
  await input.fill('personal');
  await expect(manager.locator('#renameHint')).toHaveText('Personal already exists. Renaming moves these snippets into it.');
  await input.press('Escape');
  await expect(manager.locator('#renameForm')).toBeHidden();
  expect(await folders(serviceWorker)).toEqual(['Job', 'Personal', 'Job', undefined]);

  await manager.getByRole('button', { name: 'Rename folder' }).click();
  await input.fill('personal');
  await manager.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(mChips(manager)).toHaveText(['All 4', 'Personal 3', 'No folder 1']);
  expect(await folders(serviceWorker)).toEqual(['Personal', 'Personal', 'Personal', undefined]);
});

test('Remove folder needs a second click, and keeps its snippets without a folder', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'Alpha', folder: 'Work' },
    { title: 'Beta', content: 'Beta', folder: 'Personal' },
  ]);
  const manager = await openManager(context, extensionId);
  await chipFor(manager, 'Work').click();
  const remove = manager.locator('#removeFolder');
  await remove.click();
  await expect(remove).toHaveText('Click again to remove the folder');
  expect(await folders(serviceWorker)).toEqual(['Work', 'Personal']);
  await remove.click();
  await expect(mChips(manager)).toHaveText(['All 2', 'Personal 1', 'No folder 1']);
  await expect(chipFor(manager, 'No folder')).toHaveAttribute('aria-selected', 'true');
  expect(await folders(serviceWorker)).toEqual([undefined, 'Personal']);
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['Alpha', 'Beta']);

  await chipFor(manager, 'Personal').click();
  await manager.locator('#removeFolder').click();
  await manager.locator('#removeFolder').click();
  await expect(manager.locator('#folderBar')).toBeHidden();
  await expect(manager.locator('#folderActions')).toBeHidden();
  await expect(mNames(manager)).toHaveText(['Alpha', 'Beta']);
  expect(await folders(serviceWorker)).toEqual([undefined, undefined]);
});

test('New snippet under a folder starts in it, with no unsaved-changes notice on leaving', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'Alpha', folder: 'Work' },
    { title: 'Beta', content: 'Beta', folder: 'Work' },
  ]);
  const manager = await openManager(context, extensionId);
  await chipFor(manager, 'Work').click();
  await manager.locator('#newSnippet').click();
  await expect(manager.locator('#folder')).toHaveValue('Work');
  await mRows(manager).nth(1).click();
  await expect(manager.locator('#editorNotice')).toBeHidden();
  await expect(manager.locator('#title')).toHaveValue('Beta');

  await manager.locator('#newSnippet').click();
  await manager.locator('#content').fill('Fresh');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  expect((await readSnippets(serviceWorker)).at(-1)).toMatchObject({ content: 'Fresh', folder: 'Work' });
  await expect(mRows(manager)).toHaveCount(3);
});

test('Duplicate keeps the folder, and Restore puts a deleted snippet back in its folder', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'Alpha', folder: 'Work' },
    { title: 'Beta', content: 'Beta' },
  ]);
  const manager = await openManager(context, extensionId);
  await mRows(manager).first().click();
  await manager.locator('#duplicate').click();
  await expect(mNames(manager)).toHaveText(['Alpha', 'Copy of Alpha', 'Beta']);
  await expect(manager.locator('#folder')).toHaveValue('Work');
  expect(await folders(serviceWorker)).toEqual(['Work', 'Work', undefined]);

  await manager.locator('#delete').click();
  await expect(mNames(manager)).toHaveText(['Alpha', 'Beta']);
  expect(await readDeleted(serviceWorker)).toHaveLength(1);
  await manager.goto(`chrome-extension://${extensionId}/options.html#deleted`);
  await manager.getByRole('button', { name: 'Restore' }).click();
  await expect(manager.locator('#deletedList .deleted-row')).toHaveCount(0);
  expect(await folders(serviceWorker)).toEqual(['Work', 'Work', undefined]);
});

test('a snippet restored by Undo selects its folder when the chosen folder would hide it', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'Alpha', folder: 'Work' },
    { title: 'Beta', content: 'Beta', folder: 'Personal' },
  ]);
  const manager = await openManager(context, extensionId);
  await mRows(manager).first().click();
  await manager.locator('#delete').click();
  await expect(manager.locator('#undoBar')).toBeVisible();
  await chipFor(manager, 'Personal').click();
  await manager.locator('#undoButton').click();
  await expect(chipFor(manager, 'Work')).toHaveAttribute('aria-selected', 'true');
  await expect(mNames(manager)).toHaveText(['Alpha']);
});

test('Alt+Down under a folder moves a row past the next row of that folder', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'A', content: 'A', folder: 'Work' },
    { title: 'X', content: 'X', folder: 'Personal' },
    { title: 'B', content: 'B', folder: 'Work' },
  ]);
  const manager = await openManager(context, extensionId);
  await chipFor(manager, 'Work').click();
  await expect(mNames(manager)).toHaveText(['A', 'B']);
  await mRows(manager).first().focus();
  await manager.keyboard.press('Alt+ArrowDown');
  await expect(mNames(manager)).toHaveText(['B', 'A']);
  expect((await readSnippets(serviceWorker)).map((s) => s.title)).toEqual(['X', 'B', 'A']);
});

test('the manager folder row is one Tab stop, selects with the arrows, and reads Hebrew right to left', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'One', content: 'One', folder: 'עבודה' },
    { title: 'Two', content: 'Two', folder: 'Work' },
  ]);
  const manager = await openManager(context, extensionId);
  await expect(mChips(manager)).toHaveCount(3);
  await expect(manager.locator('#folderBar')).toHaveAttribute('role', 'tablist');
  const stops = await mChips(manager).evaluateAll((nodes) => nodes.filter((n) => n.tabIndex === 0).length);
  expect(stops).toBe(1);
  expect(await chipFor(manager, 'עבודה').evaluate((node) => node.matches(':dir(rtl)'))).toBe(true);

  await manager.locator('#search').focus();
  await manager.keyboard.press('Tab');
  await expect(mChips(manager).first()).toBeFocused();
  await manager.keyboard.press('End');
  await expect(mChips(manager).last()).toBeFocused();
  await expect(mChips(manager).last()).toHaveAttribute('aria-selected', 'true');
  await expect(mNames(manager)).toHaveCount(1);
  await manager.keyboard.press('Home');
  await expect(mChips(manager).first()).toHaveAttribute('aria-selected', 'true');
  await expect(mNames(manager)).toHaveCount(2);
});

test('Enter in the manager Folder field does not save, and Ctrl+S does', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Alpha', content: 'Alpha' }]);
  const manager = await openManager(context, extensionId);
  await mRows(manager).first().click();
  await manager.locator('#folder').fill('Work');
  await manager.locator('#folder').press('Enter');
  await manager.waitForTimeout(300);
  await expect(manager.locator('#editorStatus')).not.toHaveText('Saved.');
  expect(await folders(serviceWorker)).toEqual([undefined]);

  await manager.locator('#folder').press('Control+s');
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  expect(await folders(serviceWorker)).toEqual(['Work']);
});
