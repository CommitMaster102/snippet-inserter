// Google Docs: the double tap in the hidden input frame, the panel at the Docs caret, inserting
// through a paste, and the fallbacks for changes Google could make to the editor.
// tests/pages/docs.html stands in for the Docs editor and is served at a docs.google.com address,
// so the extension takes its Google Docs path. Its query parameters imitate those changes.
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
const PANEL_GAP = 6;
// Longer than the extension waits for the caret to move after a paste.
const CONFIRM_WAIT_MS = 1500;
const NOTICE_TEXT = 'Snippet copied. If it did not appear in the document, press Ctrl+V.';

test.beforeEach(async ({ context }) => {
  await context.route('https://docs.google.com/**', (route) =>
    route.fulfill({ path: DOCS_PAGE, contentType: 'text/html; charset=utf-8' })
  );
});

async function openDocs(page, query = '') {
  await page.goto(`${DOCS_URL}${query}`);
}

/** Set the document selection (a caret when start equals end) and focus the hidden textbox. */
async function focusDocument(page, start, end = start) {
  await page.evaluate(
    ([from, to]) => {
      window.docState.start = from;
      window.docState.end = to;
      window.renderDocument();
    },
    [start, end]
  );
  await page.evaluate(() => {
    const frame = document.querySelector('iframe');
    frame.focus();
    frame.contentDocument.querySelector('[role="textbox"]').focus();
  });
}

function documentText(page) {
  return page.evaluate(() => window.docState.text);
}

function framesInsideInputFrame(page) {
  return page.evaluate(() => document.querySelector('iframe').contentDocument.querySelectorAll('iframe').length);
}

/** The local caret's position, read even while the page hides it. */
function caretRect(page) {
  return page.evaluate(() => window.caretRect());
}

/**
 * Wait past the insert check, then count notices once. A retrying assertion would wait for the
 * notice to go away by itself.
 */
async function expectNoNotice(page) {
  await page.waitForTimeout(CONFIRM_WAIT_MS);
  expect(await page.getByRole('status').count()).toBe(0);
}

/** The panel's top-left corner sits PANEL_GAP pixels below the bottom-left of `rect`. */
async function expectPanelBelow(page, rect) {
  const panel = await page.locator(PANEL).boundingBox();
  expect(Math.abs(panel.x - rect.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(panel.y - (rect.y + rect.height + PANEL_GAP))).toBeLessThanOrEqual(1);
}

test('opens the panel in the top frame, below the Docs caret', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
  await openDocs(page);
  await focusDocument(page, 5);
  await openPanel(page);

  expect(await framesInsideInputFrame(page)).toBe(0);
  await expectPanelBelow(page, await caretRect(page));
});

test('inserts the snippet as a paste, with no spaces added and no notice', async ({
  page,
  serviceWorker,
}) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }, { content: 'First line\nSecond line' }]);
  await openDocs(page);
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
  await expectNoNotice(page);
});

test('offers the Docs selection as a new snippet and replaces it on insert', async ({
  context,
  page,
  serviceWorker,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://docs.google.com',
  });
  await seedSnippets(serviceWorker, [{ content: 'Hi' }]);
  await openDocs(page);
  await page.evaluate(() => navigator.clipboard.writeText('clipboard before the insert'));
  await focusDocument(page, 0, 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.item-text').first()).toHaveText('Create snippet from selection');
  // Docs hides its caret while text is selected; the panel still opens at it.
  await expectPanelBelow(page, await caretRect(page));

  await pressInPanel(page, '1', { ctrl: true });
  await expect(panel.locator('.input-content')).toHaveValue('Hello');
  await pressInPanel(page, 'Escape');
  await expect(panel.locator('.list .item-caption')).toHaveText(['Hi']);

  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect.poll(() => documentText(page)).toBe('Hi world.');
  // The caret was hidden before the insert and moved after it, so the insert counts as done.
  await expectNoNotice(page);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('clipboard before the insert');
});

test('Escape returns focus to the Docs input frame', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
  await openDocs(page);
  await focusDocument(page, 5);
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const frame = document.querySelector('iframe');
        return document.activeElement === frame && frame.contentDocument.activeElement.getAttribute('role');
      })
    )
    .toBe('textbox');
  expect(await documentText(page)).toBe('Hello world.');
});

test('other fields on a Docs page keep the spacing rule', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
  await openDocs(page);
  await selectInTextarea(page, '#comment', 5);
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.locator('#comment')).toHaveValue('Hello XYZ world');
});

test.describe('when Google changes the editor', () => {
  test('a renamed input frame still opens the panel in the top frame', async ({
    page,
    serviceWorker,
  }) => {
    await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
    await openDocs(page, '?frameClass=renamed');
    await focusDocument(page, 5);
    await openPanel(page);

    expect(await framesInsideInputFrame(page)).toBe(0);
    await expectPanelBelow(page, await caretRect(page));
    await pressInPanel(page, '2', { ctrl: true });
    await expect.poll(() => documentText(page)).toBe('HelloXYZ world.');
  });

  test('without a caret element, the panel opens at the last click', async ({
    page,
    serviceWorker,
  }) => {
    await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
    await openDocs(page, '?caret=none');
    await page.mouse.click(300, 120);
    await openPanel(page);
    await expectPanelBelow(page, { x: 300, y: 120, height: 0 });
  });

  test('without a caret element or a click, the panel opens at the top of the editor', async ({
    page,
    serviceWorker,
  }) => {
    await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
    await openDocs(page, '?caret=none');
    await focusDocument(page, 5);
    await openPanel(page);

    const expected = await page.evaluate(() => {
      const box = document.querySelector('.kix-appview-editor').getBoundingClientRect();
      const left = Math.max(box.left, 0);
      const right = Math.min(box.right, document.documentElement.clientWidth);
      return { x: left + Math.max(0, (right - left - 360) / 2), y: Math.max(box.top, 0) + 8, height: 0 };
    });
    await expectPanelBelow(page, expected);
  });

  test("a collaborator's cursor earlier in the page is skipped", async ({ page, serviceWorker }) => {
    await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
    await openDocs(page, '?collaborator=1');
    await focusDocument(page, 5);
    await openPanel(page);
    await expectPanelBelow(page, await caretRect(page));
  });

  test("without the local caret's id, the caret without a name label is used", async ({
    page,
    serviceWorker,
  }) => {
    await seedSnippets(serviceWorker, [{ content: 'XYZ' }]);
    await openDocs(page, '?collaborator=1&caretId=none');
    await focusDocument(page, 5);
    await openPanel(page);
    await expectPanelBelow(page, await caretRect(page));
  });

  test('an ignored paste puts the snippet on the clipboard and shows a notice', async ({
    context,
    page,
    serviceWorker,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'https://docs.google.com',
    });
    await seedSnippets(serviceWorker, [{ content: 'Line one\nLine two' }]);
    await openDocs(page, '?paste=ignore');
    await focusDocument(page, 5);
    await openPanel(page);
    await pressInPanel(page, '2', { ctrl: true });
    await expectPanelClosed(page);

    await expect(page.getByRole('status')).toHaveText(NOTICE_TEXT);
    // Windows stores clipboard line breaks as \r\n.
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.replace(/\r\n/g, '\n')).toBe('Line one\nLine two');
    expect(await documentText(page)).toBe('Hello world.');
  });

  test('an unanswered copy event only loses the selection offer', async ({
    page,
    serviceWorker,
  }) => {
    await seedSnippets(serviceWorker, [{ content: 'Hi' }]);
    await openDocs(page, '?copy=ignore');
    await focusDocument(page, 0, 5);
    const panel = await openPanel(page);
    await expect(panel.locator('.item-text').first()).toHaveText('Create new snippet');

    await pressInPanel(page, '2', { ctrl: true });
    await expectPanelClosed(page);
    await expect.poll(() => documentText(page)).toBe('Hi world.');
  });
});
