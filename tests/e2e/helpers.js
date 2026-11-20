/**
 * Shared steps for the end-to-end tests: seeding storage, placing the caret, opening the panel,
 * and pressing keys inside it.
 */
'use strict';

const { expect } = require('@playwright/test');

const PANEL = 'iframe[title="Snippets"]';
const STORAGE_KEY = 'snippet_manager.snippets';

/**
 * Store snippets directly, in the same record shape the panel writes.
 *
 * Each entry needs `content` and may set `title` and `id`.
 */
async function seedSnippets(serviceWorker, snippets) {
  const records = snippets.map((snippet, index) => ({
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    title: '',
    id: `seed${String(index).padStart(8, '0')}`,
    ...snippet,
  }));
  await serviceWorker.evaluate(
    ([key, value]) => chrome.storage.local.set({ [key]: value }),
    [STORAGE_KEY, records]
  );
  return records;
}

async function readSnippets(serviceWorker) {
  return serviceWorker.evaluate(async (key) => (await chrome.storage.local.get(key))[key] || [], STORAGE_KEY);
}

/** Focus a textarea and select the range from `start` to `end` (a caret when they are equal). */
async function selectInTextarea(page, selector, start, end = start) {
  await page.locator(selector).evaluate(
    (element, [from, to]) => {
      element.focus();
      element.setSelectionRange(from, to);
    },
    [start, end]
  );
}

/** Focus a contenteditable element and put the caret at the end of the given child element. */
async function caretAtEndOf(page, editorSelector, childSelector) {
  await page.evaluate(
    ([editorSel, childSel]) => {
      const editor = document.querySelector(editorSel);
      const target = childSel ? editor.querySelector(childSel) : editor;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    },
    [editorSelector, childSelector]
  );
}

async function doubleTap(page, key = 'Control') {
  await page.keyboard.down(key);
  await page.keyboard.up(key);
  await page.waitForTimeout(50);
  await page.keyboard.down(key);
  await page.keyboard.up(key);
}

/**
 * Open the panel from the focused field and wait until it is shown and focused.
 *
 * The content script loads at document idle, which can be slightly after page.goto resolves, so
 * the double tap is repeated until the panel appears.
 */
async function openPanel(page, key = 'Control') {
  const frame = page.locator(PANEL);
  await expect(async () => {
    if ((await frame.count()) === 0) await doubleTap(page, key);
    await expect(frame).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(frame).toHaveCSS('opacity', '1');
  return frame.contentFrame();
}

/**
 * Press a key inside the panel by dispatching it in the panel document.
 *
 * Use this for keys that close the panel (Escape, Enter or a hotkey that inserts). The panel
 * iframe is removed on keydown, and Playwright's real key presses wait for the keyup to reach a
 * frame that no longer exists.
 */
async function pressInPanel(page, key, { ctrl = false } = {}) {
  const handle = await page.locator(PANEL).elementHandle();
  const frame = await handle.contentFrame();
  await frame.evaluate(
    ([name, withCtrl]) => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, ctrlKey: withCtrl, bubbles: true, cancelable: true })
      );
    },
    [key, ctrl]
  );
}

async function expectPanelClosed(page) {
  await expect(page.locator(PANEL)).toHaveCount(0);
}

/** A multi-line text of about 5,400 characters, for checking that long snippets work. */
function longText(lines = 60) {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: ${'lorem ipsum dolor sit amet '.repeat(3).trim()}`
  ).join('\n');
}

module.exports = {
  PANEL,
  seedSnippets,
  readSnippets,
  selectInTextarea,
  caretAtEndOf,
  doubleTap,
  openPanel,
  pressInPanel,
  expectPanelClosed,
  longText,
};
