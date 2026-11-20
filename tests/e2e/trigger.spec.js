// What opens the panel: the double tap, the fields it works in, and the trigger setting.
'use strict';

const { test, expect } = require('./fixtures');
const { PANEL, selectInTextarea, doubleTap, openPanel } = require('./helpers');

// The content script loads at document idle; this waits until a double tap is known to work,
// then closes the panel, so later negative checks are not passing only because it was not ready.
async function waitForContentScript(page) {
  await selectInTextarea(page, '#plain', 0);
  await openPanel(page);
  await page.mouse.click(900, 650);
  await expect(page.locator(PANEL)).toHaveCount(0);
  await selectInTextarea(page, '#plain', 0);
}

test('ignores a single tap, Ctrl+C, and a slow double tap', async ({ page }) => {
  await waitForContentScript(page);

  await page.keyboard.press('Control');
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control');
  await page.waitForTimeout(500);

  await page.keyboard.press('Control');
  await page.waitForTimeout(600);
  await page.keyboard.press('Control');
  await page.waitForTimeout(500);

  await expect(page.locator(PANEL)).toHaveCount(0);
});

test('does not open in single-line or read-only fields', async ({ page }) => {
  await waitForContentScript(page);

  await page.locator('#single').focus();
  await doubleTap(page);
  await page.waitForTimeout(500);
  await expect(page.locator(PANEL)).toHaveCount(0);

  await page.locator('#readonly').focus();
  await doubleTap(page);
  await page.waitForTimeout(500);
  await expect(page.locator(PANEL)).toHaveCount(0);
});

test('does not open in a field inside a frame the user cannot see', async ({ page, pagesUrl }) => {
  await page.goto(`${pagesUrl}/hidden-frame.html`);
  await waitForContentScript(page);

  // Repeated, because the script in the frame loads at document idle like the one in the page.
  const box = page.frameLocator('#hidden').locator('#box');
  for (let attempt = 0; attempt < 6; attempt++) {
    await box.focus();
    await doubleTap(page);
    await page.waitForTimeout(400);
  }
  await expect(page.locator(PANEL)).toHaveCount(0);
  const panelsInFrame = await page.evaluate(
    () => document.getElementById('hidden').contentDocument.querySelectorAll('iframe').length
  );
  expect(panelsInFrame).toBe(0);
});

test('a click outside the panel closes it', async ({ page }) => {
  await selectInTextarea(page, '#plain', 5);
  await openPanel(page);
  await page.mouse.click(900, 650);
  await expect(page.locator(PANEL)).toHaveCount(0);
});

test('the options page switches the trigger to Shift', async ({ context, extensionId, page }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#settings`);
  await expect(options.locator('#hotkey')).toHaveValue('Control');
  await options.locator('#hotkey').selectOption('Shift');
  await expect(options.locator('#status')).toContainText('Saved');
  await options.close();

  await page.bringToFront();
  await selectInTextarea(page, '#plain', 5);
  await openPanel(page, 'Shift');
  await page.mouse.click(900, 650);
  await expect(page.locator(PANEL)).toHaveCount(0);

  await selectInTextarea(page, '#plain', 5);
  await doubleTap(page, 'Control');
  await page.waitForTimeout(500);
  await expect(page.locator(PANEL)).toHaveCount(0);
});
