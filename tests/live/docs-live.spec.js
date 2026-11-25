// The Google Docs support, checked against the real Docs editor.
//
// It needs a Google Doc that anyone with the link can edit, given in the DOCS_TEST_URL
// environment variable, and it replaces that document's text. It is skipped when the variable is
// not set, and `npm test` never runs it; use `npm run test:docs-live`.
//
// The fixture tests in tests/e2e prove the extension's side. This check proves that Docs still
// behaves the way the extension expects. If it fails while the fixture tests pass, Google has
// changed the editor: the failure message names the part, and the names to update are in the
// DOCS constant at the top of extension/content.js.
'use strict';

const { chromium } = require('@playwright/test');
const { test, expect } = require('../e2e/fixtures');
const { PANEL, seedSnippets, openPanel, pressInPanel, expectPanelClosed } = require('../e2e/helpers');

const DOCS_TEST_URL = process.env.DOCS_TEST_URL;
const OWN_CARET = '#kix-current-user-cursor-caret';
const ANY_CARET = '.kix-cursor-caret';
const CLIPBOARD_SENTINEL = 'clipboard before the check';

test.skip(!DOCS_TEST_URL, 'Set DOCS_TEST_URL to a Google Doc that anyone with the link can edit.');

/** Wait until Docs has drawn the document and created its input frame, then click into the text. */
async function openDocument(page) {
  await page.goto(DOCS_TEST_URL);
  await page.waitForFunction(
    () =>
      document.querySelector('canvas') &&
      [...document.querySelectorAll('iframe')].some((frame) => {
        try {
          return Boolean(frame.contentDocument.querySelector('[contenteditable]'));
        } catch {
          return false;
        }
      }),
    null,
    { timeout: 60_000 }
  );
  await page.waitForTimeout(2000);
  // The largest canvas is the page of text.
  const point = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')].map((canvas) => canvas.getBoundingClientRect());
    const page = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return { x: page.left + 120, y: page.top + 100 };
  });
  await page.mouse.click(point.x, point.y);
}

/**
 * Read the document's text the way the extension reads a selection: select everything and ask
 * Docs to answer a copy event. The selection then collapses to the end of the document.
 */
async function readDocument(page) {
  await page.keyboard.press('Control+a');
  const text = await page.evaluate(() => {
    for (const frame of document.querySelectorAll('iframe')) {
      let doc = null;
      try {
        doc = frame.contentDocument;
      } catch {
        continue;
      }
      const target = doc && doc.activeElement;
      if (!target || !target.isContentEditable) continue;
      const data = new frame.contentWindow.DataTransfer();
      target.dispatchEvent(new frame.contentWindow.ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
      return data.getData('text/plain');
    }
    return null;
  });
  await page.keyboard.press('Control+End');
  return text === null ? null : text.replace(/\r\n/g, '\n').trimEnd();
}

// Docs hides its caret while the panel has the focus, so the caret is read before the panel opens.
async function ownCaret(page) {
  const caret = await page.locator(OWN_CARET).boundingBox();
  expect(caret, `Docs no longer marks the local caret as ${OWN_CARET}`).not.toBeNull();
  return caret;
}

async function expectPanelBelow(page, caret) {
  const panel = await page.locator(PANEL).boundingBox();
  expect(Math.abs(panel.x - caret.x), 'the panel is not beside the Docs caret').toBeLessThanOrEqual(2);
  expect(Math.abs(panel.y - (caret.y + caret.height + 6)), 'the panel is not below the Docs caret').toBeLessThanOrEqual(2);
}

// Waits past the extension's insert check, then counts once: a retrying assertion would wait for
// the notice to go away by itself.
async function expectNoNotice(page) {
  await page.waitForTimeout(1500);
  const notices = await page.getByRole('status').filter({ hasText: 'Snippet copied' }).count();
  expect(notices, 'an insert was not confirmed, so the extension showed its notice').toBe(0);
}

test('the Docs support works in the live editor', async ({ context, page, serviceWorker }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.google.com' });
  await seedSnippets(serviceWorker, [
    { title: 'one', content: 'XYZ' },
    { title: 'three', content: 'Line A\nLine B\nLine C' },
  ]);

  await openDocument(page);
  await page.evaluate((text) => navigator.clipboard.writeText(text), CLIPBOARD_SENTINEL);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('Hello world.');
  expect(await readDocument(page), 'Docs no longer answers a copy event with the selected text').toBe('Hello world.');

  await test.step('the panel opens in the page, below the caret', async () => {
    const caret = await ownCaret(page);
    await openPanel(page);
    const panelsInFrames = await page.evaluate(() =>
      [...document.querySelectorAll('iframe')].reduce((count, frame) => {
        try {
          return count + frame.contentDocument.querySelectorAll('iframe[title="Snippets"]').length;
        } catch {
          return count;
        }
      }, 0)
    );
    expect(panelsInFrames, 'the panel opened inside a frame').toBe(0);
    await expectPanelBelow(page, caret);
  });

  await test.step('a one-line snippet is inserted at the caret', async () => {
    await pressInPanel(page, '2', { ctrl: true });
    await expectPanelClosed(page);
    await expectNoNotice(page);
    expect(await readDocument(page), 'Docs did not take the pasted snippet').toBe('Hello world.XYZ');
  });

  await test.step('a three-line snippet becomes three paragraphs', async () => {
    await openPanel(page);
    await pressInPanel(page, '3', { ctrl: true });
    await expectPanelClosed(page);
    await expectNoNotice(page);
    expect(await readDocument(page)).toBe('Hello world.XYZLine A\nLine B\nLine C');
  });

  await test.step('a selection is offered as a new snippet and replaced on insert', async () => {
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    const panel = await openPanel(page);
    await expect(panel.locator('.item-text').first()).toHaveText('Create snippet from selection');
    await pressInPanel(page, '1', { ctrl: true });
    await expect(panel.locator('.input-content')).toHaveValue(' C');
    await pressInPanel(page, 'Escape');
    await pressInPanel(page, '2', { ctrl: true });
    await expectPanelClosed(page);
    await expectNoNotice(page);
    expect(await readDocument(page)).toBe('Hello world.XYZLine A\nLine B\nLineXYZ');
  });

  await test.step('one Ctrl+Z removes an insert', async () => {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await readDocument(page)).toBe('Hello world.XYZLine A\nLine B\nLine C');
  });

  await test.step("the panel opens at the local caret while a collaborator's cursor is shown", async () => {
    const browser = await chromium.launch({ channel: 'chromium' });
    try {
      const other = await browser.newPage();
      await openDocument(other);
      await other.keyboard.press('Control+Home');
      await expect
        .poll(() => page.locator(ANY_CARET).count(), { timeout: 30_000, message: "the collaborator's cursor never appeared" })
        .toBeGreaterThan(1);
      await page.keyboard.press('Control+End');
      await page.waitForTimeout(300);
      const caret = await ownCaret(page);
      await openPanel(page);
      await expectPanelBelow(page, caret);
      await pressInPanel(page, 'Escape');
      await expectPanelClosed(page);
    } finally {
      await browser.close();
    }
  });

  expect(await page.evaluate(() => navigator.clipboard.readText()), 'the clipboard was written').toBe(CLIPBOARD_SENTINEL);
});

/** Like readDocument, but returns the HTML that Docs puts in a copy event. */
async function readDocumentHtml(page) {
  await page.keyboard.press('Control+a');
  const html = await page.evaluate(() => {
    for (const frame of document.querySelectorAll('iframe')) {
      let doc = null;
      try {
        doc = frame.contentDocument;
      } catch {
        continue;
      }
      const target = doc && doc.activeElement;
      if (!target || !target.isContentEditable) continue;
      const data = new frame.contentWindow.DataTransfer();
      target.dispatchEvent(new frame.contentWindow.ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
      return data.getData('text/html');
    }
    return null;
  });
  await page.keyboard.press('Control+End');
  return html;
}

// The formatted step. The extension inserts a formatted snippet into Docs as a paste that carries
// its HTML beside its plain text. If this step fails while the first test passes, Docs no longer
// takes the HTML of such a paste, or no longer keeps every space of a code block in it.
test('formatted step: a formatted snippet keeps its bold text, link, paragraphs, and code block in Docs', async ({
  context,
  page,
  serviceWorker,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.google.com' });
  await seedSnippets(serviceWorker, [
    {
      title: 'formatted',
      content: 'Plain, bold and link (https://example.com/)\nSecond line\n  if (a) {\n\treturn  1;\n\n  }',
      html:
        'Plain, <b>bold</b> and <a href="https://example.com/">link</a><br>Second line' +
        '<pre><code class="language-javascript">  if (a) {<br>\treturn  1;<br><br>  }</code></pre>',
    },
  ]);

  await openDocument(page);
  await page.evaluate((text) => navigator.clipboard.writeText(text), CLIPBOARD_SENTINEL);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expectNoNotice(page);
  expect(await readDocument(page), 'Docs did not take the formatted snippet, or changed the spaces of its code block').toBe(
    'Plain, bold and link\nSecond line\n  if (a) {\n\treturn  1;\n\n  }'
  );
  const html = await readDocumentHtml(page);
  expect(html, 'Docs dropped the bold text of the formatted snippet').toMatch(/font-weight:\s*700/);
  expect(html, 'Docs dropped the link of the formatted snippet').toContain('href="https://example.com/"');
  expect(await page.evaluate(() => navigator.clipboard.readText()), 'the clipboard was written').toBe(CLIPBOARD_SENTINEL);
});
