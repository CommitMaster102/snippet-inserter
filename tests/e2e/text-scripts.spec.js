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

test('tabs and indentation stay in a rich editor', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'if x:\n\treturn 1\n    four spaces' }]);
  await caretAtEndOf(page, '#rich', 'p:last-child');
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect.poll(() => page.locator('#rich').evaluate((el) => el.innerText)).toContain('four spaces');
  const text = await page.locator('#rich').evaluate((el) => el.innerText);
  expect(text).toMatch(/if x:\s*\n\treturn 1/);
  expect(text).toMatch(/\n[\u00a0 ]{4}four spaces/);
});

test('the notice for a field with a length limit counts an emoji as one character', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '😀'.repeat(6) }]);
  await selectInTextarea(page, '#limited', 2);
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.getByRole('status')).toHaveText(
    'This field takes 5 more characters, and the snippet has 7. Nothing was inserted.'
  );
  await expect(page.locator('#limited')).toHaveValue('Hi');
});

test('the notice for a field with a length limit counts a family emoji as one character', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '👨‍👩‍👧'.repeat(3) }]);
  await selectInTextarea(page, '#limited', 2);
  await openPanel(page);
  await pressInPanel(page, '2', { ctrl: true });
  await expectPanelClosed(page);
  await expect(page.getByRole('status')).toHaveText(
    // The count includes the space that is added after "Hi".
    'This field takes 2 more characters, and the snippet has 4. Nothing was inserted.'
  );
  await expect(page.locator('#limited')).toHaveValue('Hi');
});

// A Korean input method commits a syllable on Space or Enter and inserts that space or line
// break in the same keystroke. This sends the commit and the inserted character back to back,
// before the timer that content.js sets on the commit can run. With `delay`, the character
// arrives that many milliseconds later instead, in a later task, as it does when the browser
// gets the commit and the key as separate input messages.
async function commitAndInsert(page, abbreviation, inserted, delay = null) {
  await page.locator('#plain').evaluate(
    (el, [typed, extra, ms]) =>
      new Promise((resolve) => {
        el.value = `Hello world ${typed}`;
        el.setSelectionRange(el.value.length, el.value.length);
        el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: typed }));
        const insert = () => {
          document.execCommand('insertText', false, extra);
          resolve();
        };
        if (ms === null) insert();
        else setTimeout(insert, ms);
      }),
    [abbreviation, inserted, delay]
  );
}

test('an abbreviation committed together with a space expands and keeps the space', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '감사합니다.', abbreviation: '감사' }]);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.locator('#plain').focus();
  await commitAndInsert(page, '감사', ' ');
  await expect(page.locator('#plain')).toHaveValue('Hello world 감사합니다. ');
});

test('an abbreviation committed together with a line break expands and keeps the line break', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '감사합니다.', abbreviation: '감사' }]);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.locator('#plain').focus();
  await commitAndInsert(page, '감사', '\n');
  await expect(page.locator('#plain')).toHaveValue('Hello world 감사합니다.\n');
});

for (const [name, inserted] of [['space', ' '], ['line break', '\n']]) {
  for (const delay of [0, 1]) {
    test(`an abbreviation expands when the ${name} after the commit arrives ${delay} ms later`, async ({ page, serviceWorker }) => {
      await seedSnippets(serviceWorker, [{ content: '감사합니다.', abbreviation: '감사' }]);
      await ready(page, () => selectInTextarea(page, '#plain', 11));
      await page.locator('#plain').focus();
      await commitAndInsert(page, '감사', inserted, delay);
      await expect(page.locator('#plain')).toHaveValue(`Hello world 감사합니다.${inserted}`);
    });
  }
}

test('a tab or an ideographic space after the commit does not expand the abbreviation', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '감사합니다.', abbreviation: '감사' }]);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.locator('#plain').focus();
  for (const inserted of ['\t', String.fromCharCode(0x3000)]) {
    await commitAndInsert(page, '감사', inserted);
    await page.waitForTimeout(300);
    await expect(page.locator('#plain')).toHaveValue(`Hello world 감사${inserted}`);
  }
  // A space still expands it, so the listener was active.
  await commitAndInsert(page, '감사', ' ');
  await expect(page.locator('#plain')).toHaveValue('Hello world 감사합니다. ');
});

// In a rich editor the abbreviation is selected before the snippet is pasted. A space from the
// input method that arrives while the selection settles must not replace the abbreviation.
test('in a rich editor, a space that arrives 5 ms after the commit is kept after the snippet', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: '감사합니다.', abbreviation: '감사' }]);
  await ready(page, () => caretAtEndOf(page, '#pasteEditor'));
  await page.locator('#pasteEditor').evaluate(
    (el) =>
      new Promise((resolve) => {
        el.focus();
        el.textContent = 'Hi 감사';
        getSelection().collapse(el.firstChild, el.firstChild.data.length);
        el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '감사' }));
        setTimeout(() => {
          document.execCommand('insertText', false, ' ');
          resolve();
        }, 5);
      })
  );
  const text = () => page.locator('#pasteEditor').evaluate((el) => el.textContent.replace(/ /g, ' '));
  await expect.poll(text).toBe('Hi 감사합니다. ');
  await page.waitForTimeout(100);
  expect(await text()).toBe('Hi 감사합니다. ');
});
