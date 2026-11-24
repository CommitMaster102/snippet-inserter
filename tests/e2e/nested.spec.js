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
  openManager,
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

// The Includes row and the problem lines in the two edit forms.

const MISSING = 'No snippet has the abbreviation ;sgi, so {snippet:;sgi} is inserted as written.';

async function openPanelForm(page, name) {
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  if (name) {
    const item = panel.locator('.list .item', { has: panel.getByText(name, { exact: true }) });
    await item.hover();
    await item.locator('.edit-button').click();
  } else {
    await page.keyboard.press('Enter');
  }
  return panel;
}

test('the panel form names each included snippet, flags one with no target, and still saves', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [SIG]);
  const panel = await openPanelForm(page);
  const row = panel.locator('.reference-list');
  await expect(row).toBeHidden();
  await panel.locator('textarea.input-content').fill('Thanks.\n{snippet:;sig}\n{snippet:;sgi}');
  await expect(row.locator('.placeholder-label')).toHaveText('Includes');
  await expect(row.locator('.placeholder-pill')).toHaveText(['Signature (;sig)', ';sgi']);
  await expect(row.locator('.reference-missing')).toHaveText([';sgi']);
  await expect(panel.locator('.reference-problems .feedback')).toHaveText([MISSING]);

  await panel.locator('textarea.input-content').fill('Plain');
  await expect(row).toBeHidden();
  await expect(panel.locator('.reference-problems .feedback')).toHaveCount(0);

  await panel.locator('textarea.input-content').fill('Thanks.\n{snippet:;sgi}');
  await pressInPanel(page, 'Enter', { ctrl: true });
  await expect(panel.locator('.list .item-caption')).toHaveText(['Signature', 'Thanks.new']);
});

test('the panel form says so when a snippet would include itself, before the first save', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [SIG]);
  const panel = await openPanelForm(page);
  await panel.locator('textarea.input-content').fill('Hi {snippet:;me}');
  await expect(panel.locator('.reference-problems .feedback')).toHaveText(['No snippet has the abbreviation ;me, so {snippet:;me} is inserted as written.']);
  await panel.locator('input.input-abbreviation').fill(';me');
  await expect(panel.locator('.reference-problems .feedback')).toHaveText(['{snippet:;me} would put a snippet inside itself, so it is inserted as written.']);
  await expect(panel.locator('.reference-list .placeholder-pill')).toHaveText(['Hi {snippet:;me} (;me)']);
});

test('a loop between two snippets shows in the edit form of the first', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'A', content: 'A {snippet:;b}', abbreviation: ';a' },
    { title: 'B', content: 'B {snippet:;a}', abbreviation: ';b' },
  ]);
  const panel = await openPanelForm(page, 'A');
  await expect(panel.locator('.reference-problems .feedback')).toHaveText([
    '{snippet:;a} would put a snippet inside itself, so it is inserted as written.',
  ]);
});

test('the panel form says when the references go past 100 snippets', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Leaf', content: 'x', abbreviation: ';leaf' }]);
  const panel = await openPanelForm(page);
  await panel.locator('textarea.input-content').fill('{snippet:;leaf}'.repeat(101));
  await expect(panel.locator('.reference-problems .feedback')).toHaveText([
    'One insert includes at most 100 snippets, so the other references are inserted as written.',
  ]);
});

test('the manager editor shows the same Includes row and problem lines', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [SIG]);
  const manager = await openManager(context, extensionId);
  await manager.locator('#newSnippet').click();
  await expect(manager.locator('#referenceList')).toBeHidden();
  await manager.locator('#content').fill('Thanks.\n{snippet:;sig}\n{snippet:;sgi}');
  await expect(manager.locator('#referenceList .muted')).toHaveText('Includes');
  await expect(manager.locator('#referenceList .placeholder-pill')).toHaveText(['Signature (;sig)', ';sgi']);
  await expect(manager.locator('#referenceProblems .field-error')).toHaveText([MISSING]);
  await manager.locator('#abbreviation').fill(';sgi');
  await expect(manager.locator('#referenceProblems .field-error')).toHaveText([
    '{snippet:;sgi} would put a snippet inside itself, so it is inserted as written.',
  ]);
  await manager.locator('#content').fill('Plain');
  await expect(manager.locator('#referenceList')).toBeHidden();
  await expect(manager.locator('#referenceProblems')).toBeHidden();
});
