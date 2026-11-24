// The shared international text (tests/shared/international-text.js) through every path: create,
// the lists, search, insert into each kind of field, abbreviations, fill-in labels, the
// character count, and export and import.
'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect, launchContext, extensionWorker } = require('./fixtures');
const {
  seedSnippets,
  readSnippets,
  openManager,
  selectInTextarea,
  caretAtEndOf,
  openPanel,
  pressInPanel,
  expectPanelClosed,
} = require('./helpers');
const { PARTS, TEXT, TEXT_CRLF, TITLE, ABBREVIATION, LABEL, FILL_IN_TEXT, characterCount } = require('../shared/international-text');

const DOCS_PAGE = path.resolve(__dirname, '..', 'pages', 'docs.html');
const lines = (text) => text.replace(/\r\n?/g, '\n');
const oneLine = (text) => lines(text).replace(/ *\n */g, ' ');

async function insertFirst(page) {
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
}

test('the manager creates the text, lists it, counts it, and finds it by search', async ({ context, extensionId, serviceWorker }) => {
  const manager = await openManager(context, extensionId);
  await manager.locator('#newSnippet').click();
  await manager.locator('#title').fill(TITLE);
  await manager.locator('#content').fill(TEXT);
  await expect(manager.locator('#count')).toHaveText(`${characterCount(TEXT).toLocaleString('en')} characters`);
  await manager.locator('#save').click();
  await expect(manager.locator('#snippetList .row-name')).toHaveText([TITLE]);
  expect(await readSnippets(serviceWorker)).toMatchObject([{ title: TITLE, content: TEXT }]);

  for (const query of ['世話', '感谢', 'שלום', 'ขอบคุณ', 'café']) {
    await manager.locator('#search').fill(query);
    await expect(manager.locator('#snippetList .row'), query).toHaveCount(1);
  }
  await manager.locator('#search').fill('zzz');
  await expect(manager.locator('#snippetList .row')).toHaveCount(0);
});

test('the panel creates the text, lists it, and finds it by search', async ({ page, serviceWorker }) => {
  await selectInTextarea(page, '#plain', 0, 11);
  const panel = await openPanel(page);
  await page.keyboard.press('Enter');
  await panel.locator('input.input-title').fill(TITLE);
  await panel.locator('textarea.input-content').fill(TEXT);
  await page.keyboard.press('Control+Enter');
  await expect(panel.locator('.list .item-caption')).toContainText([TITLE]);
  expect(await readSnippets(serviceWorker)).toMatchObject([{ title: TITLE, content: TEXT }]);
  await panel.locator('input[type="search"], #search').first().fill('世話');
  await expect(panel.locator('.list .item-caption')).toContainText([TITLE]);
});

test('inserts the text into a text box, and keeps Windows line endings as line breaks', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'crlf', content: TEXT_CRLF }]);
  await selectInTextarea(page, '#plain', 0, 11);
  await insertFirst(page);
  await expect(page.locator('#plain')).toHaveValue(lines(TEXT_CRLF));
});

test('inserts the text into a single-line field as one line', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'one', content: TEXT_CRLF }]);
  await selectInTextarea(page, '#single', 0, 11);
  await insertFirst(page);
  await expect(page.locator('#single')).toHaveValue(oneLine(TEXT_CRLF));
});

test('inserts the text into a rich editor and into one that handles paste itself', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'rich', content: TEXT }]);
  await caretAtEndOf(page, '#pasteEditor');
  await insertFirst(page);
  await expect.poll(() => page.evaluate(() => window.pasteSeen && window.pasteSeen.plain)).toBe(` ${TEXT}`);

  await caretAtEndOf(page, '#rich', 'p:last-child');
  await insertFirst(page);
  await expect.poll(() => page.locator('#rich').evaluate((el) => el.textContent)).toContain(PARTS.tab);
  const plain = await page.locator('#rich').evaluate((el) => el.textContent);
  for (const part of Object.values(PARTS)) expect(plain, part).toContain(part);
});

test('inserts the text into the Google Docs stand-in', async ({ context, page, serviceWorker }) => {
  await context.route('https://docs.google.com/**', (route) =>
    route.fulfill({ path: DOCS_PAGE, contentType: 'text/html; charset=utf-8' })
  );
  await seedSnippets(serviceWorker, [{ title: 'docs', content: TEXT_CRLF }]);
  await page.goto('https://docs.google.com/document/d/test/edit');
  await page.evaluate(() => {
    window.docState.start = window.docState.end = 5;
    window.renderDocument();
    const frame = document.querySelector('iframe');
    frame.focus();
    frame.contentDocument.querySelector('[role="textbox"]').focus();
  });
  await insertFirst(page);
  await expect.poll(() => page.evaluate(() => window.docState.pastes)).toEqual([lines(TEXT_CRLF)]);
});

test('an abbreviation in Japanese expands when typed with an input method', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'greet', content: TEXT, abbreviation: ABBREVIATION }]);
  await selectInTextarea(page, '#plain', 11);
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await selectInTextarea(page, '#plain', 11);
  await page.keyboard.type(' ');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: ABBREVIATION, selectionStart: 4, selectionEnd: 4 });
  await cdp.send('Input.insertText', { text: ABBREVIATION });
  await cdp.detach();
  await expect(page.locator('#plain')).toHaveValue(`Hello world ${lines(TEXT)}`);
});

test('a fill-in label in Japanese is asked and filled in', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Reply', content: FILL_IN_TEXT }]);
  await selectInTextarea(page, '#plain', 0, 11);
  const panel = await openPanel(page);
  await panel.locator('.list .item', { hasText: 'Reply' }).click();
  await expect(panel.locator('.fill-label').first()).toHaveText(LABEL);
  await page.keyboard.insertText('山田👍🏽');
  await expect(panel.locator('.fill-preview')).toHaveText('ご連絡ありがとうございます、山田👍🏽様。');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('ご連絡ありがとうございます、山田👍🏽様。');
});

test('a backup carries the text to another profile unchanged', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: TITLE, content: TEXT, abbreviation: ABBREVIATION },
    { title: 'crlf', content: TEXT_CRLF },
  ]);
  const source = await openManager(context, extensionId, 'settings');
  const [download] = await Promise.all([source.waitForEvent('download'), source.locator('#export').click()]);
  const file = fs.readFileSync(await download.path());
  const before = await readSnippets(serviceWorker);
  expect(JSON.parse(file.toString('utf8')).snippets).toEqual(before);

  const other = await launchContext();
  try {
    const { worker, id } = await extensionWorker(other);
    const target = await openManager(other, id, 'settings');
    await target.locator('#importFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: file });
    await expect(target.locator('#importResult')).toHaveText('Imported 2 snippets.');
    expect(await readSnippets(worker)).toEqual(before);
  } finally {
    await other.close();
  }
});
