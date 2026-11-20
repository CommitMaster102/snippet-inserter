// Inserting snippets into textareas and rich editors, including the spaces added around them.
'use strict';

const { test, expect } = require('./fixtures');
const {
  seedSnippets,
  selectInTextarea,
  caretAtEndOf,
  openPanel,
  pressInPanel,
  expectPanelClosed,
  longText,
} = require('./helpers');

// Each case sets the textarea value and caret, inserts "XYZ", and checks where spaces were added.
const SPACING_CASES = [
  { name: 'between two words', value: 'Hello world', caret: 5, expected: 'Hello XYZ world' },
  { name: 'at the end of a word', value: 'Hello', caret: 5, expected: 'Hello XYZ' },
  { name: 'before punctuation', value: 'Hello.', caret: 5, expected: 'Hello XYZ.' },
  { name: 'at the start of a line', value: 'a\nb', caret: 2, expected: 'a\nXYZ b' },
  { name: 'in an empty field', value: '', caret: 0, expected: 'XYZ' },
];

for (const { name, value, caret, expected } of SPACING_CASES) {
  test(`applies the spacing rule ${name}`, async ({ page, serviceWorker }) => {
    await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
    await page.locator('#plain').fill(value);
    await selectInTextarea(page, '#plain', caret);
    const panel = await openPanel(page);
    await expect(panel.locator('.list .item-caption')).toHaveText(['XYZ']);

    await pressInPanel(page, '2', { ctrl: true });
    await expectPanelClosed(page);
    await expect(page.locator('#plain')).toHaveValue(expected);
  });
}

test('replaces the selected text', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
  await selectInTextarea(page, '#plain', 6, 11);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item-caption')).toHaveText(['XYZ']);

  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello XYZ');
});

test('inserts a long multi-line snippet in full, and undo removes it', async ({ page, serviceWorker }) => {
  const text = longText();
  await seedSnippets(serviceWorker, [{ title: 'Long', content: text }]);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item-caption')).toHaveText(['Long']);

  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue(`Hello world ${text}`);

  await page.keyboard.press('Control+z');
  await expect(page.locator('#plain')).toHaveValue('Hello world');
});

test('the arrow keys and Enter pick a later snippet', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'First' }, { content: 'Second' }]);
  await page.locator('#plain').fill('');
  await selectInTextarea(page, '#plain', 0);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item-caption')).toHaveText(['First', 'Second']);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(panel.locator('.item[data-focused]')).toHaveText('Second');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Second');
});

test('inserts into a contenteditable paragraph', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
  await caretAtEndOf(page, '#rich', 'p');
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item-caption')).toHaveText(['XYZ']);

  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect
    .poll(() => page.locator('#rich').evaluate((element) => element.innerHTML))
    .toMatch(/^<p>Dear team,(\s|&nbsp;)XYZ<\/p><p>Thanks<\/p>$/);
});

test('hands multi-line text to an editor that handles paste itself', async ({ page, serviceWorker }) => {
  const text = longText(5);
  await seedSnippets(serviceWorker, [{ title: 'Five lines', content: text }]);
  await caretAtEndOf(page, '#pasteEditor');
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item-caption')).toHaveText(['Five lines']);

  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect.poll(() => page.evaluate(() => window.pasteSeen)).not.toBeNull();
  const seen = await page.evaluate(() => window.pasteSeen);
  expect(seen.plain).toBe(` ${text}`);
  expect(seen.html.match(/<br>/g)).toHaveLength(4);
});
