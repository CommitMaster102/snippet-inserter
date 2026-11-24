// A snippet inside a snippet: {snippet:;abbreviation} is replaced by the text of that snippet when
// the outer one is inserted, from the panel and by typing its abbreviation.
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

const SIG = { title: 'Signature', content: 'Best,\nAna', abbreviation: ';sig' };
const THANKS = { title: 'Thanks', content: 'Thanks for your order.\n{snippet:;sig}', abbreviation: ';thx' };

async function insertSecond(page) {
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
}

test('a snippet that includes another goes in as one text, and one Ctrl+Z removes it', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [THANKS, SIG]);
  await selectInTextarea(page, '#plain', 11);
  await insertSecond(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world Thanks for your order.\nBest,\nAna');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#plain')).toHaveValue('Hello world');
});

test('typing the outer abbreviation in a rich editor inserts the combined text', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [THANKS, SIG]);
  await caretAtEndOf(page, '#rich', 'p:last-child');
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await caretAtEndOf(page, '#rich', 'p:last-child');
  await page.keyboard.type(' ;thx');
  await expect(page.locator('#rich')).toContainText('Thanks for your order.');
  await expect(page.locator('#rich')).toContainText('Best,');
  await expect(page.locator('#rich')).not.toContainText('{snippet');
});

test('a label used in both snippets opens one fill-in form with one field', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Reply', content: 'Hi {input:Name},\n{snippet:;sig}' },
    { title: 'Signature', content: 'Thanks, {input:Name}\n{input:Day}', abbreviation: ';sig' },
  ]);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expect(panel.locator('.fill-count')).toHaveText('Fill in 2 fields');
  await expect(panel.locator('.fill-input')).toHaveCount(2);
  await expect(panel.locator('.fill-preview')).toHaveText('Hi ,\nThanks, \n');
  await panel.locator('.fill-input').first().fill('Dana');
  await expect(panel.locator('.fill-preview')).toContainText('Hi Dana,');
  await expect(panel.locator('.fill-preview')).toContainText('Thanks, Dana');
  await pressInPanel(page, 'Enter', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world Hi Dana,\nThanks, Dana\n');
});

test('typing an abbreviation whose snippet includes a fill-in snippet opens the fill-in form', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { content: 'Hello\n{snippet:;sig}', abbreviation: ';hi' },
    { content: 'Bye {input:Name}', abbreviation: ';sig' },
  ]);
  await selectInTextarea(page, '#plain', 11);
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await selectInTextarea(page, '#plain', 11);
  await page.keyboard.type(' ;hi');
  const panel = page.frameLocator(PANEL);
  await expect(panel.locator('.fill-count')).toHaveText('Fill in 1 field');
  await page.keyboard.type('Ana');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world Hello\nBye Ana');
});

test('a multi-line included snippet is joined into one line in a single-line input', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Thanks. {snippet:;sig}' }, SIG]);
  await selectInTextarea(page, '#single', 6);
  await insertSecond(page);
  await expect(page.locator('#single')).toHaveValue('Single Thanks. Best, Ana line');
});

test('with two snippets that include each other, the second reference is inserted as written', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { content: 'A {snippet:;b}', abbreviation: ';a' },
    { content: 'B {snippet:;a}', abbreviation: ';b' },
  ]);
  await selectInTextarea(page, '#plain', 11);
  await insertSecond(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world A B {snippet:;a}');
});

async function deleteSignature(page, serviceWorker) {
  await seedSnippets(serviceWorker, [THANKS, SIG]);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Signature' });
  await item.hover();
  await item.locator('.edit-button').click();
  await panel.locator('.item-danger').click();
  await expect(panel.locator('#undoBar')).toBeVisible();
  return panel;
}

test('a reference to a deleted snippet is inserted as written', async ({ page, serviceWorker }) => {
  await deleteSignature(page, serviceWorker);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world Thanks for your order.\n{snippet:;sig}');
});

test('Undo brings the deleted snippet back, and the reference works again', async ({ page, serviceWorker }) => {
  const panel = await deleteSignature(page, serviceWorker);
  await panel.locator('#undoButton').click();
  await expect(panel.locator('.list .item-caption')).toHaveText(['Thanks', 'Signature']);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world Thanks for your order.\nBest,\nAna');
});

test('in the Google Docs stand-in, the paste carries the combined text', async ({ context, page, serviceWorker }) => {
  await context.route('https://docs.google.com/**', (route) =>
    route.fulfill({ path: DOCS_PAGE, contentType: 'text/html; charset=utf-8' })
  );
  await seedSnippets(serviceWorker, [THANKS, SIG]);
  await page.goto(DOCS_URL);
  await page.evaluate(() => {
    window.docState.start = 5;
    window.docState.end = 5;
    window.renderDocument();
    const frame = document.querySelector('iframe');
    frame.focus();
    frame.contentDocument.querySelector('[role="textbox"]').focus();
  });
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect
    .poll(() => page.evaluate(() => window.docState.pastes))
    .toEqual(['Thanks for your order.\nBest,\nAna']);
});
