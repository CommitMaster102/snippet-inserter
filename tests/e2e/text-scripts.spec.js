// Text in other scripts: input-method typing, tabs in rich editors, and the field-length notice.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, selectInTextarea, caretAtEndOf, openPanel, pressInPanel, expectPanelClosed } = require('./helpers');

// Opening and closing the panel once shows that the content script has loaded, and with it the
// abbreviations it read from storage.
async function ready(page, place) {
  await place();
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await place();
}

// Types `text` the way an input method does: composing, then committing.
async function typeWithInputMethod(page, text) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
  await cdp.send('Input.insertText', { text });
  await cdp.detach();
}

test('an abbreviation typed with an input method expands once it is committed', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'お世話になっております。', abbreviation: 'あいさつ' }]);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ');
  await typeWithInputMethod(page, 'あいさつ');
  await expect(page.locator('#plain')).toHaveValue('Hello world お世話になっております。');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#plain')).toHaveValue('Hello world あいさつ');
});

test('an abbreviation is not expanded while the input method is still composing it', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'お世話になっております。', abbreviation: 'あいさつ' }]);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'あいさつ', selectionStart: 4, selectionEnd: 4 });
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world あいさつ');
  await cdp.send('Input.insertText', { text: 'あいさつ' });
  await expect(page.locator('#plain')).toHaveValue('Hello world お世話になっております。');
  await cdp.detach();
});
