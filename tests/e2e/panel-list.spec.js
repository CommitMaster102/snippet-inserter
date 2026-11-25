// The snippet list and form: preview lines, the character count, Duplicate, and moving a
// snippet with Alt+Up and Alt+Down.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, readSnippets, selectInTextarea, openPanel, waitForPanelFit, pressInPanel, expectPanelClosed } = require('./helpers');

test('each row shows a preview line under the name', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Address', content: '\n14 Elm Street\nSpringfield' },
    { content: 'Kind regards,\n\nCustomer Success Team' },
    { content: 'One line only' },
  ]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);

  const rows = panel.locator('.list .item').filter({ has: panel.locator('.item-caption') });
  await expect(rows.nth(0).locator('.item-preview')).toHaveText('14 Elm Street');
  await expect(rows.nth(1).locator('.item-caption')).toHaveText('Kind regards,');
  await expect(rows.nth(1).locator('.item-preview')).toHaveText('Customer Success Team');
  await expect(rows.nth(2).locator('.item-preview')).toHaveCount(0);
});

test('the form counts characters as you type', async ({ page }) => {
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await page.keyboard.press('Enter');
  const count = panel.locator('.count');
  await expect(count).toHaveText('0 characters');
  await panel.locator('textarea.input-content').fill('x');
  await expect(count).toHaveText('1 character');
  await panel.locator('textarea.input-content').fill('y'.repeat(1234));
  await expect(count).toHaveText('1,234 characters');
});

test('Duplicate places a copy right after the original', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Greeting', content: 'Hi there' }, { title: 'Other', content: 'Bye' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);

  const item = panel.locator('.list .item', { hasText: 'Greeting' });
  await item.hover();
  await item.locator('.edit-button').click();
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');
  await waitForPanelFit(page, panel);
  await panel.locator('.item-action', { hasText: 'Duplicate snippet' }).click();

  await expect(panel.locator('.list .item-caption')).toHaveText(['Greeting', 'Copy of Greeting', 'Other']);
  await expect(panel.locator('.list .item', { hasText: 'Copy of Greeting' }).locator('.item-label')).toHaveText('new');
  const stored = await readSnippets(serviceWorker);
  expect(stored.map((s) => s.title)).toEqual(['Greeting', 'Copy of Greeting', 'Other']);
  expect(stored[1].content).toBe('Hi there');
  expect(stored[1].id).not.toBe(stored[0].id);
});

test('Alt+Down moves the highlighted snippet, and the Ctrl numbers follow', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Alpha' }, { content: 'Beta' }, { content: 'Gamma' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  const captions = panel.locator('.list .item-caption');
  await expect(captions).toHaveText(['Alpha', 'Beta', 'Gamma']);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(captions).toHaveText(['Beta', 'Alpha', 'Gamma']);
  await expect(panel.locator('.list .item[data-focused] .item-caption')).toHaveText('Alpha');
  expect((await readSnippets(serviceWorker)).map((s) => s.content)).toEqual(['Beta', 'Alpha', 'Gamma']);

  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(captions).toHaveText(['Alpha', 'Beta', 'Gamma']);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(captions).toHaveText(['Alpha', 'Gamma', 'Beta']);

  // Ctrl+3 is the second snippet in the new order.
  await pressInPanel(page, '3', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello Gamma world');
});

test('Alt+arrows do not move snippets while the list is filtered', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Apple pie' }, { content: 'Apple tart' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await panel.locator('#search').fill('apple');
  await expect(panel.locator('.list .item-caption')).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(300);
  expect((await readSnippets(serviceWorker)).map((s) => s.content)).toEqual(['Apple pie', 'Apple tart']);
});
