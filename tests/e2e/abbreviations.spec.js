// Abbreviations: typing a snippet's abbreviation replaces it with the snippet.
'use strict';

const { test, expect } = require('./fixtures');
const {
  PANEL,
  seedSnippets,
  readSnippets,
  selectInTextarea,
  caretAtEndOf,
  doubleTap,
  openPanel,
  pressInPanel,
  expectPanelClosed,
  openManager,
} = require('./helpers');

const SNIPPETS = [
  { title: 'Address', content: '14 Elm Street\nSpringfield', abbreviation: ';addr' },
  { title: 'Signature', content: 'Best,\n{input:Name}', abbreviation: ';sig' },
];

// Opening and closing the panel once shows that the content script has loaded, and with it the
// abbreviations it read from storage.
async function ready(page, place) {
  await place();
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await place();
}

test('expands in a textarea, and Ctrl+Z brings the typed text back', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr');
  await expect(page.locator('#plain')).toHaveValue('Hello world 14 Elm Street\nSpringfield');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr');
});

test('does not expand inside a word', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' x;addr');
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world x;addr');
});

test('expands in a single-line input as one line', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#search', 4));
  await page.keyboard.type(' ;addr');
  await expect(page.locator('#search')).toHaveValue('Find 14 Elm Street Springfield');
});

test('expands in rich-text editors', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await ready(page, () => caretAtEndOf(page, '#rich', 'p:last-child'));
  await page.keyboard.type(' ;tt');
  await expect(page.locator('#rich p').last()).toHaveText('Thanks Tea time');

  await caretAtEndOf(page, '#pasteEditor');
  await page.keyboard.type(' ;tt');
  await expect(page.locator('#pasteEditor')).toHaveText('Editor: Tea time');
});

test('a snippet with fill-in fields opens its fill-in form', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type('\n;sig');
  const panel = page.frameLocator(PANEL);
  await expect(panel.locator('.caption')).toHaveText('Signature');
  await expect(panel.locator('#back')).toBeHidden();
  await expect(panel.locator('.fill-input')).toBeFocused();
  await page.keyboard.type('Ana');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world\nBest,\nAna');
});

test('Escape in that form keeps the typed abbreviation and the caret after it', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;sig');
  await expect(page.frameLocator(PANEL).locator('.fill-input')).toBeFocused();
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await page.keyboard.type('!');
  await expect(page.locator('#plain')).toHaveValue('Hello world ;sig!');
});

test('the setting turns expansion off', async ({ context, extensionId, page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  const manager = await openManager(context, extensionId, 'settings');
  await expect(manager.locator('#abbreviations')).toBeChecked();
  await manager.locator('#abbreviations').uncheck();
  await manager.close();

  await page.bringToFront();
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr');
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr');
});

test('does not expand inside a frame the user cannot see', async ({ page, pagesUrl, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await page.goto(`${pagesUrl}/hidden-frame.html`);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  const box = page.frameLocator('#hidden').locator('#box');
  await box.focus();
  await page.keyboard.type('a ;tt');
  await page.waitForTimeout(300);
  await expect(box).toHaveText('a ;tt');
});

test('the panel form checks abbreviations, and saves one', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);
  await page.keyboard.press('Control+1');
  await panel.locator('textarea.input-content').fill('Thanks!');
  const abbreviation = panel.locator('input.input-abbreviation');
  const message = panel.locator('.feedback:not([hidden])');

  await abbreviation.fill(';addr');
  await page.keyboard.press('Control+Enter');
  await expect(message).toHaveText('Another snippet already uses ;addr.');
  await abbreviation.fill(';ad');
  await page.keyboard.press('Control+Enter');
  await expect(message).toHaveText("Another snippet's abbreviation, ;addr, starts with this one.");
  await abbreviation.fill('has space');
  await page.keyboard.press('Control+Enter');
  await expect(message).toHaveText('Use 2 to 32 characters without spaces.');

  await abbreviation.fill(';thx');
  await page.keyboard.press('Control+Enter');
  await expect(panel.locator('.list .item-abbreviation')).toHaveText([';addr', ';sig', ';thx']);
  const stored = await readSnippets(serviceWorker);
  expect(stored[2]).toMatchObject({ content: 'Thanks!', abbreviation: ';thx' });
  const index = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('snippet_manager.abbreviations'))['snippet_manager.abbreviations']);
  expect(Object.keys(index)).toEqual([';addr', ';sig', ';thx']);

  // The new abbreviation works right away in the open page.
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await selectInTextarea(page, '#plain', 11);
  await page.keyboard.type(' ;thx');
  await expect(page.locator('#plain')).toHaveValue('Hello world Thanks!');
});

test('the manager edits an abbreviation and checks it', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  const manager = await openManager(context, extensionId);
  await manager.locator('#snippetList .row', { hasText: 'Signature' }).click();
  await expect(manager.locator('#abbreviation')).toHaveValue(';sig');
  await manager.locator('#abbreviation').fill(';addr');
  await manager.locator('#save').click();
  await expect(manager.locator('#abbreviationError')).toHaveText('Another snippet already uses ;addr.');
  await manager.locator('#abbreviation').fill(';sign');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  expect((await readSnippets(serviceWorker))[1].abbreviation).toBe(';sign');
});

test('a double tap still works with abbreviations active', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await selectInTextarea(page, '#plain', 11);
  await doubleTap(page);
  await openPanel(page);
});

test('a clashing abbreviation set in the manager is refused by a panel that is still open', async ({ context, extensionId, page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Signature', content: 'Best' }]);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);

  const manager = await openManager(context, extensionId);
  await manager.locator('#snippetList .row', { hasText: 'Signature' }).click();
  await manager.locator('#abbreviation').fill(';sig');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  await page.bringToFront();

  await panel.locator('.list .item', { hasText: 'Create new snippet' }).click();
  await panel.locator('textarea.input-content').fill('More');
  await panel.locator('input.input-abbreviation').fill(';sigs');
  await panel.locator('#primary').click();
  await expect(panel.locator('#error')).toHaveText("This starts with another snippet's abbreviation, ;sig.");

  const stored = await readSnippets(serviceWorker);
  expect(stored).toHaveLength(1);
  expect(stored.filter((s) => s.abbreviation === ';sig')).toHaveLength(1);
});
