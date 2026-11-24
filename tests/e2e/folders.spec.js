// Folders in the panel and the manager: the folder buttons, the Folder field, and moving and
// renaming whole folders.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, readSnippets, selectInTextarea, openPanel, pressInPanel, expectPanelClosed } = require('./helpers');

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

test('Ctrl+1 under a folder starts the form in that folder, and Enter in the Folder field saves', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, FOUR);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await chips(panel).filter({ hasText: 'Work' }).click();
  await pressInPanel(page, '1', { ctrl: true });

  const field = panel.locator('input.input-folder');
  await expect(field).toHaveValue('Work');
  await panel.locator('textarea.input-content').fill('Fresh work text');
  await field.press('Enter');

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
