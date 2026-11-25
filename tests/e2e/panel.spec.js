// The snippet panel: empty state, creating, validating, searching, editing, deleting, and
// leaving with Escape.
'use strict';

const { test, expect } = require('./fixtures');
const {
  PANEL,
  seedSnippets,
  readSnippets,
  selectInTextarea,
  openPanel,
  waitForPanelFit,
  pressInPanel,
  expectPanelClosed,
  longText,
} = require('./helpers');

test('shows the empty state, and Enter opens the create form', async ({ page }) => {
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.empty-heading')).toHaveText('You have no snippets yet');
  await expect(panel.locator('#primaryLabel')).toHaveText('Create');

  await page.keyboard.press('Enter');
  await expect(panel.locator('.caption')).toHaveText('Create a new snippet');
  await expect(panel.locator('textarea.input-content')).toBeFocused();
});

test('saves a snippet longer than 1024 characters and labels it new', async ({ page, serviceWorker }) => {
  const text = longText();
  expect(text.length).toBeGreaterThan(1024);

  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.empty-heading')).toBeVisible();
  await page.keyboard.press('Enter');
  await panel.locator('textarea.input-content').fill(text);
  await panel.locator('input.input-title').fill('Long one');
  await page.keyboard.press('Control+Enter');

  const item = panel.locator('.list .item', { hasText: 'Long one' });
  await expect(item.locator('.item-label')).toHaveText('new');
  const stored = await readSnippets(serviceWorker);
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ title: 'Long one', content: text });
  expect(stored[0].id).toMatch(/^[A-Za-z0-9_-]{12}$/);
});

test('rejects blank content and names over 128 characters', async ({ page, serviceWorker }) => {
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.empty-heading')).toBeVisible();
  await page.keyboard.press('Enter');
  await panel.locator('textarea.input-content').fill('   ');
  await panel.locator('input.input-title').fill('x'.repeat(129));
  await page.keyboard.press('Control+Enter');

  await expect(panel.locator('.feedback:not([hidden])')).toHaveText([
    'This field must not be empty.',
    'The input must not be longer than 128 characters.',
  ]);
  expect(await readSnippets(serviceWorker)).toHaveLength(0);
});

test('offers to create a snippet from the selected text', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Existing' }]);
  await selectInTextarea(page, '#plain', 0, 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item').first()).toHaveText('Create snippet from selection');

  await page.keyboard.press('Control+1');
  await expect(panel.locator('textarea.input-content')).toHaveValue('Hello');
});

test('filters by word prefix from the first character', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Home address', content: '1 Main Street' },
    { content: 'Kind regards,\nAna' },
    { title: 'Email', content: 'me@example.com' },
  ]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  const captions = panel.locator('.list .item-caption');
  const search = panel.locator('#search');
  await expect(captions).toHaveCount(3);

  await search.fill('k');
  await expect(captions).toHaveText(['Kind regards,']);

  await search.fill('');
  await expect(captions).toHaveCount(3);

  await search.fill('add');
  await expect(captions).toHaveText(['Home address']);

  await search.fill('reg');
  await expect(captions).toHaveText(['Kind regards,']);

  await search.fill('ress');
  await expect(captions).toHaveCount(0);
});

test('edits a snippet, labels it edited, then deletes it', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Greeting', content: 'Hi there' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Greeting' });

  await item.hover();
  await item.locator('.edit-button').click();
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');
  await panel.locator('textarea.input-content').fill('Hello there');
  await page.keyboard.press('Control+Enter');
  await expect(item.locator('.item-label')).toHaveText('edited');
  expect((await readSnippets(serviceWorker))[0]).toMatchObject({ title: 'Greeting', content: 'Hello there' });

  await item.hover();
  await item.locator('.edit-button').click();
  await expect(panel.locator('.item-danger')).toHaveText('Delete snippet');
  await waitForPanelFit(page, panel);
  await panel.locator('.item-danger').click();
  await expect(panel.locator('.empty-heading')).toBeVisible();
  expect(await readSnippets(serviceWorker)).toHaveLength(0);
});

test('Escape leaves the form, then closes the panel and refocuses the field', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Something' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item-caption')).toHaveText(['Something']);
  await page.keyboard.press('Control+1');
  await expect(panel.locator('.caption')).toHaveText('Create a new snippet');

  await page.keyboard.press('Escape');
  await expect(panel.locator('.caption')).toHaveText('Insert snippet');

  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toBeFocused();
  await expect(page.locator('#plain')).toHaveValue('Hello world');
});

// A view that reports its size before it is built shrinks the frame to the panel's header and
// grows it back. Until the browser catches up, a click on the lower part of the form goes to the
// page and is lost, which is how the Save click in a test was lost now and then.
test('a form opens at its own height, without the frame first shrinking to the header', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Signature', content: 'Best,\n{input:Name}' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  // Every height the page gives the panel's frame, recorded as it is set.
  await page.locator(PANEL).evaluate((frame) => {
    window.frameHeights = [];
    new MutationObserver(() => window.frameHeights.push(parseFloat(frame.style.height))).observe(frame, {
      attributeFilter: ['style'],
    });
  });
  // Waits until the frame has the height of the view the panel shows, and returns the heights
  // below it that the frame took since the last call.
  const heightsBelowView = async () => {
    const view = Math.ceil(await panel.locator('#app').evaluate((app) => app.getBoundingClientRect().height));
    await expect.poll(() => page.evaluate(() => window.frameHeights.at(-1))).toBe(view);
    return page.evaluate((height) => window.frameHeights.splice(0).filter((h) => h < height), view);
  };

  await page.keyboard.press('Control+1');
  await expect(panel.locator('.caption')).toHaveText('Create a new snippet');
  expect(await heightsBelowView()).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(panel.locator('.caption')).toHaveText('Insert snippet');
  await heightsBelowView();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('F2');
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');
  expect(await heightsBelowView()).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(panel.locator('.caption')).toHaveText('Insert snippet');
  await heightsBelowView();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.fill-input')).toBeFocused();
  expect(await heightsBelowView()).toEqual([]);
});
