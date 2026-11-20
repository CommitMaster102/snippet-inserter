// Google Docs: the double tap in the hidden input frame, the panel at the Docs caret, and
// inserting through a paste. tests/pages/docs.html stands in for the Docs editor and is served at
// a docs.google.com address, so the extension takes its Google Docs path.
'use strict';

const path = require('path');
const { test, expect } = require('./fixtures');
const {
  seedSnippets,
  selectInTextarea,
  openPanel,
  pressInPanel,
  expectPanelClosed,
} = require('./helpers');

const DOCS_URL = 'https://docs.google.com/document/d/test/edit';
const DOCS_PAGE = path.resolve(__dirname, '..', 'pages', 'docs.html');
const PANEL = 'iframe[title="Snippets"]';
const INPUT_FRAME = 'iframe.docs-texteventtarget-iframe';

test.beforeEach(async ({ context, page }) => {
  await context.route('https://docs.google.com/**', (route) =>
    route.fulfill({ path: DOCS_PAGE, contentType: 'text/html; charset=utf-8' })
  );
  await page.goto(DOCS_URL);
});

/** Set the document selection (a caret when start equals end) and focus the hidden textbox. */
async function focusDocument(page, start, end = start) {
  await page.evaluate(
    ([from, to]) => {
      window.docState.start = from;
      window.docState.end = to;
    },
    [start, end]
  );
  await page.frameLocator(INPUT_FRAME).locator('[role="textbox"]').focus();
}

function documentText(page) {
  return page.evaluate(() => window.docState.text);
}

test('opens the panel in the top frame, below the Docs caret', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
  await focusDocument(page, 5);
  await openPanel(page);

  const framesInInput = await page.evaluate(
    (selector) => document.querySelector(selector).contentDocument.querySelectorAll('iframe').length,
    INPUT_FRAME
  );
  expect(framesInInput).toBe(0);
  const caret = await page.locator('.kix-cursor-caret').boundingBox();
  const panel = await page.locator(PANEL).boundingBox();
  expect(Math.abs(panel.x - caret.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(panel.y - (caret.y + caret.height + 6))).toBeLessThanOrEqual(1);
});

test('inserts the snippet as a paste, with no spaces added', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }, { content: 'First line\nSecond line' }]);
  await focusDocument(page, 5);
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect.poll(() => documentText(page)).toBe('HelloXYZ world.');

  await focusDocument(page, 'HelloXYZ world.'.length);
  await openPanel(page);
  await pressInPanel(page, '3', { ctrl: true });
  await expectPanelClosed(page);
  await expect
    .poll(() => page.evaluate(() => window.docState.pastes))
    .toEqual(['XYZ', 'First line\nSecond line']);
});

test('offers the Docs selection as a new snippet and replaces it on insert', async ({
  page,
  serviceWorker,
}) => {
  await seedSnippets(serviceWorker, [{ content: 'Hi' }]);
  await focusDocument(page, 0, 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.item-text').first()).toHaveText('Create snippet from selection');

  await pressInPanel(page, '1', { ctrl: true });
  await expect(panel.locator('.input-content')).toHaveValue('Hello');
  await pressInPanel(page, 'Escape');
  await expect(panel.locator('.list .item-caption')).toHaveText(['Hi']);

  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect.poll(() => documentText(page)).toBe('Hi world.');
});

test('Escape returns focus to the Docs input frame', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
  await focusDocument(page, 5);
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);

  await expect
    .poll(() =>
      page.evaluate((selector) => {
        const frame = document.querySelector(selector);
        return document.activeElement === frame && frame.contentDocument.activeElement.getAttribute('role');
      }, INPUT_FRAME)
    )
    .toBe('textbox');
  expect(await documentText(page)).toBe('Hello world.');
});

test('other fields on a Docs page keep the spacing rule', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
  await selectInTextarea(page, '#comment', 5);
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#comment')).toHaveValue('Hello XYZ world');
});
