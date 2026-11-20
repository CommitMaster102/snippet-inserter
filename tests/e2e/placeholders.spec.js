// Placeholders: dates and times, {cursor} in each kind of field, the fill-in form, and the list
// of placeholders under the form's text box.
'use strict';

const path = require('path');
const { test, expect } = require('./fixtures');
const {
  PANEL,
  seedSnippets,
  selectInTextarea,
  caretAtEndOf,
  openPanel,
  pressInPanel,
  expectPanelClosed,
} = require('./helpers');

const DOCS_URL = 'https://docs.google.com/document/d/test/edit';
const DOCS_PAGE = path.resolve(__dirname, '..', 'pages', 'docs.html');

/** The values the extension should produce now, computed in the page with the same options. */
function expectedDates(page, locale) {
  return page.evaluate((lang) => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return {
      long: new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(now),
      iso: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    };
  }, locale);
}

async function insertFirst(page) {
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
}

test('fills in the date and time in the field language', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '{date} / {date:iso} / {time:iso}' }]);
  await selectInTextarea(page, '#plain', 11);
  const dates = await expectedDates(page, 'en');
  await insertFirst(page);
  await expect(page.locator('#plain')).toHaveValue(`Hello world ${dates.long} / ${dates.iso} / ${dates.time}`);
});

test('{cursor} puts the caret inside the inserted text of a textarea', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Dear {cursor},\nThanks' }]);
  await selectInTextarea(page, '#plain', 11);
  await insertFirst(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world Dear ,\nThanks');
  await page.keyboard.type('Ana');
  await expect(page.locator('#plain')).toHaveValue('Hello world Dear Ana,\nThanks');
});

test('{cursor} survives joining the lines of a single-line field', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Ref:\n{cursor}\nEnd' }]);
  await selectInTextarea(page, '#search', 4);
  await insertFirst(page);
  await expect(page.locator('#search')).toHaveValue('Find Ref: End');
  await page.keyboard.type('42 ');
  await expect(page.locator('#search')).toHaveValue('Find Ref: 42 End');
});

test('{cursor} moves the caret back in a rich-text editor', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'A{cursor}B' }]);
  await caretAtEndOf(page, '#rich', 'p:last-child');
  await insertFirst(page);
  await expect(page.locator('#rich')).toContainText('Thanks AB');
  // The caret moves a few tens of milliseconds after the paste; wait until it sits before "B".
  await expect
    .poll(() => page.evaluate(() => getSelection().focusNode.textContent.slice(getSelection().focusOffset)))
    .toBe('B');
  await page.keyboard.type('x');
  await expect(page.locator('#rich')).toContainText('Thanks AxB');
});

test('the fill-in form asks once per label, previews, and inserts', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Reply', content: 'Hello {input:Name}, order {input:Order}. Bye {input:Name}.' }]);
  await selectInTextarea(page, '#plain', 0, 11);
  const panel = await openPanel(page);
  await panel.locator('.list .item', { hasText: 'Reply' }).click();

  await expect(panel.locator('.caption')).toHaveText('Reply');
  await expect(panel.locator('.fill-count')).toHaveText('Fill in 2 fields');
  await expect(panel.locator('.fill-label').first()).toHaveText('Name');
  await expect(panel.locator('.fill-input').first()).toBeFocused();
  await page.keyboard.type('Dana');
  await expect(panel.locator('.fill-preview')).toHaveText('Hello Dana, order . Bye Dana.');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.fill-input').nth(1)).toBeFocused();
  await page.keyboard.type('42');

  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello Dana, order 42. Bye Dana.');
});

test('Escape leaves the fill-in form for the list', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Reply', content: 'Hi {input:Name}' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await panel.locator('.list .item', { hasText: 'Reply' }).click();
  await expect(panel.locator('.fill-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel.locator('.caption')).toHaveText('Insert snippet');
  await expect(page.locator('#plain')).toHaveValue('Hello world');
});

test('the form lists the placeholders in the text', async ({ page }) => {
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await page.keyboard.press('Enter');
  const list = panel.locator('.placeholder-list');
  await expect(list).toBeHidden();
  await panel.locator('textarea.input-content').fill('On {date}, {input:Name} said {price} {"a": 1}');
  await expect(list.locator('.placeholder-pill')).toHaveText(['{date}', '{input:Name}']);
});

test('other braces are inserted as written', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '{price} {"a": 1}' }]);
  await selectInTextarea(page, '#plain', 11);
  await insertFirst(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world {price} {"a": 1}');
});

test('Google Docs gets the date, and {cursor} is dropped', async ({ context, page, serviceWorker }) => {
  await context.route('https://docs.google.com/**', (route) =>
    route.fulfill({ path: DOCS_PAGE, contentType: 'text/html; charset=utf-8' })
  );
  await seedSnippets(serviceWorker, [{ content: 'Due {date:iso}{cursor}' }]);
  await page.goto(DOCS_URL);
  await page.evaluate(() => {
    window.docState.start = window.docState.text.length;
    window.docState.end = window.docState.start;
    window.renderDocument();
    const frame = document.querySelector('iframe');
    frame.focus();
    frame.contentDocument.querySelector('[role="textbox"]').focus();
  });
  const iso = (await expectedDates(page, 'en')).iso;
  const before = await page.evaluate(() => window.docState.text);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item-caption')).toHaveText([`Due {date:iso}{cursor}`]);
  await pressInPanel(page, '2', { ctrl: true });
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.docState.text)).toBe(`${before}Due ${iso}`);
});
