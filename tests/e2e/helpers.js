/**
 * Shared steps for the end-to-end tests: seeding storage, placing the caret, opening the panel,
 * and pressing keys inside it.
 */
'use strict';

const { expect } = require('@playwright/test');

const PANEL = 'iframe[title="Snippets"]';
const STORAGE_KEY = 'snippet_manager.snippets';
const DELETED_KEY = 'snippet_manager.deleted';
const ABBREVIATIONS_KEY = 'snippet_manager.abbreviations';

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
  // The extension writes an { abbreviation: id } index beside the list; see lib/snippets.js.
  const index = Object.fromEntries(records.filter((r) => r.abbreviation).map((r) => [r.abbreviation, r.id]));
  await serviceWorker.evaluate(
    ([key, value, indexKey, indexValue]) => chrome.storage.local.set({ [key]: value, [indexKey]: indexValue }),
    [STORAGE_KEY, records, ABBREVIATIONS_KEY, index]
  );
  return records;
}

/** Store the settings object directly, as the manager does, for example { hotkey: 'Shift' }. */
async function seedSettings(serviceWorker, settings) {
  await serviceWorker.evaluate((value) => chrome.storage.local.set({ settings: value }), settings);
}

async function readSnippets(serviceWorker) {
  return serviceWorker.evaluate(async (key) => (await chrome.storage.local.get(key))[key] || [], STORAGE_KEY);
}

async function readDeleted(serviceWorker) {
  return serviceWorker.evaluate(async (key) => (await chrome.storage.local.get(key))[key] || [], DELETED_KEY);
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
  await waitForStablePanel(page);
  const panel = frame.contentFrame();
  await waitForPanelFit(page, panel);
  return panel;
}

/**
 * Wait until the panel's frame has grown to fit its content.
 *
 * When the panel changes view, it tells the page its new height, and the browser needs a round
 * trip before the frame and the panel's own viewport have that size. A click Playwright computes
 * from the panel's content in that time lands on the page underneath and is lost. Call this
 * after the new view is on screen (for example after expecting its caption) and before clicking
 * into its lower part. Pass the iframe locator when the panel is inside another frame.
 */
async function waitForPanelFit(page, panel, iframe = page.locator(PANEL)) {
  await expect
    .poll(
      async () => {
        const viewport = await panel.locator('#app').evaluate((app) => ({
          inner: window.innerHeight,
          content: Math.ceil(app.getBoundingClientRect().height),
        }));
        const box = await iframe.boundingBox();
        return viewport.inner >= viewport.content && box !== null && Math.abs(box.height - viewport.inner) <= 1;
      },
      { timeout: 5000 }
    )
    .toBe(true);
}

/**
 * Wait until the panel's frame keeps the same position and size for 100 ms.
 *
 * The panel runs in its own process, and right after its frame is resized the browser can still
 * send a click to the page underneath, which closes the panel. A person cannot click that fast;
 * a test can.
 */
async function waitForStablePanel(page) {
  let previous = null;
  await expect(async () => {
    const box = await page.locator(PANEL).boundingBox();
    const same = previous && box && ['x', 'y', 'width', 'height'].every((k) => box[k] === previous[k]);
    previous = box;
    expect(same).toBe(true);
  }).toPass({ intervals: [100], timeout: 5000 });
}

/**
 * Press a key inside the panel by dispatching it in the panel document.
 *
 * Use this for keys that close the panel (Escape, Enter or a hotkey that inserts). The panel
 * iframe is removed on keydown, and Playwright's real key presses wait for the keyup to reach a
 * frame that no longer exists. Pass the iframe locator as `iframe` when the panel is inside another
 * frame.
 */
async function pressInPanel(page, key, { ctrl = false, iframe = page.locator(PANEL) } = {}) {
  const handle = await iframe.elementHandle();
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

/** Open the manager page (the extension's options page) at one of its views. */
async function openManager(context, extensionId, view = 'snippets') {
  const manager = await context.newPage();
  await manager.goto(`chrome-extension://${extensionId}/options.html#${view}`);
  await expect(manager.locator(`#view-${view}`)).toBeVisible();
  return manager;
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
  seedSettings,
  readSnippets,
  readDeleted,
  selectInTextarea,
  caretAtEndOf,
  doubleTap,
  openPanel,
  waitForPanelFit,
  pressInPanel,
  openManager,
  expectPanelClosed,
  longText,
};
