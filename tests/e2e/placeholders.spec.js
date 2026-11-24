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
  const before = await expectedDates(page, 'en');
  await insertFirst(page);
  const after = await expectedDates(page, 'en');
  // The minute can change during the insert, so either moment's values are right.
  const expected = [before, after].map((d) => `Hello world ${d.long} / ${d.iso} / ${d.time}`);
  await expect.poll(() => page.locator('#plain').inputValue()).toMatch(new RegExp(`^(${expected.map((e) => e.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})$`));
});

/** The values for the offset placeholders, computed in the page with its own calendar arithmetic. */
function expectedOffsets(page) {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const day = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, 12);
    const month = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12);
    const last = new Date(now.getFullYear(), now.getMonth() + 2, 0, 12).getDate();
    const later = new Date(now.getTime() + 30 * 60000);
    return [
      iso(day(1)),
      iso(day(-7)),
      iso(new Date(month.getFullYear(), month.getMonth(), Math.min(now.getDate(), last), 12)),
      `${pad(later.getHours())}:${pad(later.getMinutes())}`,
    ].join(' ');
  });
}

test('fills in dates and times counted from now', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '{date+1d:iso} {date-1w:iso} {date+1m:iso} {time+30min:iso}' }]);
  await selectInTextarea(page, '#plain', 11);
  const before = await expectedOffsets(page);
  await insertFirst(page);
  const after = await expectedOffsets(page);
  // The minute can change during the insert, so either moment's values are right.
  await expect
    .poll(async () => [before, after].map((v) => `Hello world ${v}`).includes(await page.locator('#plain').inputValue()))
    .toBe(true);
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
  const list = panel.locator('.placeholder-list:not(.unrecognized-list):not(.reference-list)');
  await expect(list).toBeHidden();
  await panel.locator('textarea.input-content').fill('On {date}, {input:Name} said {price} {"a": 1}');
  await expect(list.locator('.placeholder-token')).toHaveText(['{date}', '{input:Name}']);
});

test('other braces are inserted as written', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '{price} {"a": 1} {date+3x}' }]);
  await selectInTextarea(page, '#plain', 11);
  await insertFirst(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world {price} {"a": 1} {date+3x}');
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

test('the form shows what each date and time placeholder gives, and lists near misses', async ({ page }) => {
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await page.keyboard.press('Enter');
  const list = panel.locator('.placeholder-list').first();
  const nearMisses = panel.locator('.unrecognized-list');
  await expect(nearMisses).toBeHidden();
  const expected = await expectedOffsets(page);
  await panel.locator('textarea.input-content').fill('Due {date+1d:iso}, {input:Name}, not {date+3x} or {"date": 1}');
  await expect(list.locator('.placeholder-token')).toHaveText(['{date+1d:iso}', '{input:Name}']);
  await expect(list.locator('.placeholder-value')).toHaveText([expected.split(' ')[0]]);
  await expect(nearMisses.locator('.placeholder-label')).toHaveText('Not recognized, inserted as written');
  await expect(nearMisses.locator('.placeholder-pill')).toHaveText(['{date+3x}']);
  await panel.locator('textarea.input-content').fill('');
  await expect(list).toBeHidden();
  await expect(nearMisses).toBeHidden();
});

test('the form lists near misses without any placeholder', async ({ page }) => {
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await page.keyboard.press('Enter');
  await panel.locator('textarea.input-content').fill('{Date} and {time+30m}');
  await expect(panel.locator('.placeholder-list').first()).toBeHidden();
  await expect(panel.locator('.unrecognized-list .placeholder-pill')).toHaveText(['{Date}', '{time+30m}']);
});

test('the form shows date values in the language of the field', async ({ page }) => {
  await page.evaluate(() => document.querySelector('#plain').setAttribute('lang', 'fr'));
  const dates = await expectedDates(page, 'fr');
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await page.keyboard.press('Enter');
  await panel.locator('textarea.input-content').fill('{date}');
  await expect(panel.locator('.placeholder-value')).toHaveText(dates.long);
});

test('the fill-in preview uses the language of the field', async ({ page, serviceWorker }) => {
  await page.evaluate(() => document.querySelector('#plain').setAttribute('lang', 'fr'));
  const dates = await expectedDates(page, 'fr');
  await seedSnippets(serviceWorker, [{ content: '{date} {input:Nom}' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await panel.locator('.list .item', { hasText: 'Nom' }).click();
  await expect(panel.locator('.fill-preview')).toContainText(dates.long);
});

test('a weekday placeholder shows its date in the form and is inserted', async ({ page, serviceWorker }) => {
  const expected = await page.evaluate(() => {
    const now = new Date();
    const gap = (5 - now.getDay() + 7) % 7 || 7;
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + gap, 12);
    const pad = (n) => String(n).padStart(2, '0');
    return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  });
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await page.keyboard.press('Enter');
  await panel.locator('textarea.input-content').fill('By {date+1fri:iso}');
  await expect(panel.locator('.placeholder-value')).toHaveText(expected);
  await pressInPanel(page, 'Escape');
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);

  await seedSnippets(serviceWorker, [{ content: 'By {date+1fri:iso}' }]);
  await selectInTextarea(page, '#plain', 11);
  await insertFirst(page);
  await expect(page.locator('#plain')).toHaveValue(`Hello world By ${expected}`);
});
