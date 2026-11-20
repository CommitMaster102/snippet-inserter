// Single-line inputs: which types get the panel, the spacing rule, joining multi-line snippets
// into one line, the maxlength check, and undo.
'use strict';

const { test, expect } = require('./fixtures');
const { PANEL, seedSnippets, selectInTextarea, openPanel, pressInPanel, expectPanelClosed } = require('./helpers');

for (const [field, caret, expected] of [
  ['#single', 6, 'Single Tea line'],
  ['#search', 4, 'Find Tea'],
  ['#url', 8, 'https:// Tea example.com/'],
  ['#tel', 3, '555 Tea'],
  ['#untyped', 2, 'No Tea type'],
]) {
  test(`inserts into ${field} with the spacing rule`, async ({ page, serviceWorker }) => {
    await seedSnippets(serviceWorker, [{ content: 'Tea' }]);
    await selectInTextarea(page, field, caret);
    await openPanel(page);
    await pressInPanel(page, '2', { ctrl: true });
    await expectPanelClosed(page);
    await expect(page.locator(field)).toHaveValue(expected);
  });
}

test('a multi-line snippet goes in as one line, and one Ctrl+Z removes it', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '\n14 Elm Street  \n\n\t Springfield, IL 62704\n' }]);
  await selectInTextarea(page, '#single', 6);
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#single')).toHaveValue('Single 14 Elm Street Springfield, IL 62704 line');

  await expect(page.locator('#single')).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#single')).toHaveValue('Single line');
});

test('replaces the selected text in an input', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Double' }]);
  await selectInTextarea(page, '#single', 0, 6);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item').first()).toHaveText('Create snippet from selection');
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#single')).toHaveValue('Double line');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#single')).toHaveValue('Single line');
});

test('inserts nothing and says why when maxlength is too short', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'This is too long' }]);
  await selectInTextarea(page, '#limited', 2);
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.getByRole('status')).toHaveText(
    'This field takes 10 more characters, and the snippet has 17. Nothing was inserted.'
  );
  await expect(page.locator('#limited')).toHaveValue('Hi');
});

test('the panel opens below the input, near the caret', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea' }]);
  await selectInTextarea(page, '#single', 6);
  await openPanel(page);
  const field = await page.locator('#single').boundingBox();
  const panel = await page.locator(PANEL).boundingBox();
  expect(panel.y).toBeGreaterThanOrEqual(field.y + field.height);
  expect(panel.y).toBeLessThan(field.y + field.height + 20);
  expect(panel.x).toBeGreaterThan(field.x);
  expect(panel.x).toBeLessThan(field.x + field.width);
});
