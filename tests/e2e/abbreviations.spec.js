// Abbreviations: typing a snippet's abbreviation replaces it with the snippet.
'use strict';

const { test, expect } = require('./fixtures');
const {
  PANEL,
  seedSnippets,
  seedSettings,
  readSnippets,
  selectInTextarea,
  caretAtEndOf,
  doubleTap,
  openPanel,
  waitForPanelFit,
  pressInPanel,
  expectPanelClosed,
  openManager,
} = require('./helpers');

const SNIPPETS = [
  { title: 'Address', content: '14 Elm Street\nSpringfield', abbreviation: ';addr' },
  { title: 'Signature', content: 'Best,\n{input:Name}', abbreviation: ';sig' },
];

// Opening and closing the panel once shows that the content script has loaded, and with it the
// abbreviations it read from storage.
async function ready(page, place) {
  await place();
  await openPanel(page);
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await place();
}

test('expands in a textarea, and Ctrl+Z brings the typed text back', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr');
  await expect(page.locator('#plain')).toHaveValue('Hello world 14 Elm Street\nSpringfield');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr');
});

test('does not expand inside a word', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' x;addr');
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world x;addr');
});

test('expands in a single-line input as one line', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#search', 4));
  await page.keyboard.type(' ;addr');
  await expect(page.locator('#search')).toHaveValue('Find 14 Elm Street Springfield');
});

test('expands in rich-text editors', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await ready(page, () => caretAtEndOf(page, '#rich', 'p:last-child'));
  await page.keyboard.type(' ;tt');
  await expect(page.locator('#rich p').last()).toHaveText('Thanks Tea time');

  await caretAtEndOf(page, '#pasteEditor');
  await page.keyboard.type(' ;tt');
  await expect(page.locator('#pasteEditor')).toHaveText('Editor: Tea time');
});

// The tracking editor pastes at the selection it last saw in a "selectionchange" event, as
// ProseMirror does, so the selected abbreviation must reach it before the paste.
test('expands in an editor that reads the selection from selectionchange', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await ready(page, () => caretAtEndOf(page, '#trackingEditor'));
  await page.keyboard.type(' ;tt');
  await expect(page.locator('#trackingEditor')).toHaveText('Editor: Tea time');
});

// Types each key of `keys` into the editor `selector` 5 ms after the expansion selects `typed`,
// while the insert waits for the editor to take the selection. `keys` is a string of characters,
// or an array that may also hold 'Enter' and 'Shift+Enter'. For each key the page does what the
// browser does: it sends a cancelable keydown event, then, unless a listener cancels it, a
// cancelable "beforeinput" event, and then, unless a listener cancels that, inserts the character,
// the paragraph, or the line break in place of the selection. With `collapse`, the page then moves
// the caret to the end of the selection, so the selection no longer covers the abbreviation.
async function typeDuringExpansion(page, selector, typed, keys, { collapse = false } = {}) {
  await page.evaluate(
    ([editorSelector, abbreviation, pressed, moveCaret]) => {
      const editor = document.querySelector(editorSelector);
      const type = (key) => {
        const enter = key === 'Enter' || key === 'Shift+Enter';
        const shiftKey = key === 'Shift+Enter';
        const down = enter
          ? { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey }
          : { key, keyCode: 0, which: 0 };
        const events = { bubbles: true, cancelable: true, composed: true };
        if (!editor.dispatchEvent(new KeyboardEvent('keydown', { ...down, ...events }))) return;
        const inputType = !enter ? 'insertText' : shiftKey ? 'insertLineBreak' : 'insertParagraph';
        const input = { inputType, data: enter ? null : key, ...events };
        if (!editor.dispatchEvent(new InputEvent('beforeinput', input))) return;
        if (enter) document.execCommand(inputType);
        else document.execCommand('insertText', false, key);
      };
      const onSelectionChange = () => {
        const selection = getSelection();
        if (!selection.rangeCount || !editor.contains(selection.anchorNode)) return;
        if (selection.toString() !== abbreviation) return;
        document.removeEventListener('selectionchange', onSelectionChange);
        setTimeout(() => {
          for (const key of pressed) type(key);
          if (moveCaret) getSelection().collapseToEnd();
        }, 5);
      };
      document.addEventListener('selectionchange', onSelectionChange);
    },
    [selector, typed, Array.from(keys), collapse]
  );
}

for (const [where, editor] of [
  ['a rich editor', '#pasteEditor'],
  ['an editor that reads the selection from selectionchange', '#trackingEditor'],
]) {
  test(`in ${where}, a key typed while the selection settles goes in after the snippet`, async ({ page, serviceWorker }) => {
    await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
    await ready(page, () => caretAtEndOf(page, editor));
    await typeDuringExpansion(page, editor, ';tt', '!');
    await page.keyboard.type(' ;tt');
    await expect(page.locator(editor)).toHaveText('Editor: Tea time!');
    await page.waitForTimeout(100);
    await expect(page.locator(editor)).toHaveText('Editor: Tea time!');
  });
}

// The keymap editor handles Enter at keydown, as ProseMirror and Lexical do, so no "beforeinput"
// would show the key. The paste editor leaves Enter to the browser. Either way the key goes in
// after the snippet, and in the keymap editor through its own handler.
for (const [where, editor] of [
  ['an editor that handles Enter at keydown', '#keymapEditor'],
  ['an editor that leaves Enter to the browser', '#pasteEditor'],
]) {
  for (const [key, html] of [
    ['Enter', 'Editor: Tea time<div>!</div>'],
    ['Shift+Enter', 'Editor: Tea time<br>!'],
  ]) {
    test(`in ${where}, ${key} typed while the selection settles goes in after the snippet`, async ({ page, serviceWorker }) => {
      await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
      await ready(page, () => caretAtEndOf(page, editor));
      await typeDuringExpansion(page, editor, ';tt', [key, '!']);
      await page.keyboard.type(' ;tt');
      const content = () => page.locator(editor).evaluate((el) => el.innerHTML.replace(/&nbsp;/g, ' '));
      await expect.poll(content).toBe(html);
      await page.waitForTimeout(100);
      expect(await content()).toBe(html);
      expect(await page.evaluate(() => window.keymapKeys)).toEqual(editor === '#keymapEditor' ? [key] : []);
    });
  }
}

test('keys typed before a rich-editor expansion gives up go in after the abbreviation, in order', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await ready(page, () => caretAtEndOf(page, '#pasteEditor'));
  await typeDuringExpansion(page, '#pasteEditor', ';tt', '!?', { collapse: true });
  await page.keyboard.type(' ;tt');
  await expect(page.locator('#pasteEditor')).toHaveText('Editor: ;tt!?');
  await page.waitForTimeout(100);
  await expect(page.locator('#pasteEditor')).toHaveText('Editor: ;tt!?');
});

test('a snippet with fill-in fields opens its fill-in form', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type('\n;sig');
  const panel = page.frameLocator(PANEL);
  await expect(panel.locator('.caption')).toHaveText('Signature');
  await expect(panel.locator('#back')).toBeHidden();
  await expect(panel.locator('.fill-input')).toBeFocused();
  await page.keyboard.type('Ana');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world\nBest,\nAna');
});

test('Escape in that form keeps the typed abbreviation and the caret after it', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;sig');
  await expect(page.frameLocator(PANEL).locator('.fill-input')).toBeFocused();
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await page.keyboard.type('!');
  await expect(page.locator('#plain')).toHaveValue('Hello world ;sig!');
});

// The insert replaces the abbreviation only if it is still where the form found it. Otherwise a
// notice says that nothing was inserted, because what the user typed in the form is lost.
test('the fill-in form inserts nothing, and says so, if the page changed the abbreviation while it was open', async ({ page, serviceWorker }) => {
  const notice = page.getByRole('status');
  await seedSnippets(serviceWorker, SNIPPETS);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;sig');
  await expect(page.frameLocator(PANEL).locator('.fill-input')).toBeFocused();
  await page.locator('#plain').evaluate((el) => {
    el.value = 'Hello world ;sog';
  });
  await page.keyboard.type('Ana');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(notice).toHaveText('The text in the field changed, so the snippet was not inserted.');
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world ;sog');
  // The notice stays for a few seconds, so it is removed before the second case.
  await notice.evaluate((box) => box.getRootNode().host.remove());

  await caretAtEndOf(page, '#pasteEditor');
  await page.keyboard.type(' ;sig');
  await expect(page.frameLocator(PANEL).locator('.fill-input')).toBeFocused();
  await page.locator('#pasteEditor').evaluate((el) => {
    el.textContent = 'Editor: ;sog';
  });
  await page.keyboard.type('Ana');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(notice).toHaveText('The text in the field changed, so the snippet was not inserted.');
  await page.waitForTimeout(300);
  await expect(page.locator('#pasteEditor')).toHaveText('Editor: ;sog');
});

test('the setting turns expansion off', async ({ context, extensionId, page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  const manager = await openManager(context, extensionId, 'settings');
  await expect(manager.locator('#abbreviations')).toHaveValue('immediate');
  await manager.locator('#abbreviations').selectOption('off');
  // The write may still be pending, so the manager closes only once storage shows the change.
  await expect
    .poll(() => serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings))
    .toEqual({ abbreviations: false });
  await manager.close();

  await page.bringToFront();
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr');
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr');
});

test('does not expand inside a frame the user cannot see', async ({ page, pagesUrl, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await page.goto(`${pagesUrl}/hidden-frame.html`);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  const box = page.frameLocator('#hidden').locator('#box');
  await box.focus();
  await page.keyboard.type('a ;tt');
  await page.waitForTimeout(300);
  await expect(box).toHaveText('a ;tt');
});

test('the panel form checks abbreviations, and saves one', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);
  await page.keyboard.press('Control+1');
  await panel.locator('textarea.input-content').fill('Thanks!');
  const abbreviation = panel.locator('input.input-abbreviation');
  const message = panel.locator('.feedback:not([hidden])');

  await abbreviation.fill(';addr');
  await page.keyboard.press('Control+Enter');
  await expect(message).toHaveText('Another snippet already uses ;addr.');
  await abbreviation.fill(';ad');
  await page.keyboard.press('Control+Enter');
  await expect(message).toHaveText("Another snippet's abbreviation, ;addr, starts with this one.");
  await abbreviation.fill('has space');
  await page.keyboard.press('Control+Enter');
  await expect(message).toHaveText('Use 2 to 32 characters without spaces.');

  await abbreviation.fill(';thx');
  await page.keyboard.press('Control+Enter');
  await expect(panel.locator('.list .item-abbreviation')).toHaveText([';addr', ';sig', ';thx']);
  const stored = await readSnippets(serviceWorker);
  expect(stored[2]).toMatchObject({ content: 'Thanks!', abbreviation: ';thx' });
  const index = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('snippet_manager.abbreviations'))['snippet_manager.abbreviations']);
  expect(Object.keys(index)).toEqual([';addr', ';sig', ';thx']);

  // The new abbreviation works right away in the open page.
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await selectInTextarea(page, '#plain', 11);
  await page.keyboard.type(' ;thx');
  await expect(page.locator('#plain')).toHaveValue('Hello world Thanks!');
});

test('the manager edits an abbreviation and checks it', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  const manager = await openManager(context, extensionId);
  await manager.locator('#snippetList .row', { hasText: 'Signature' }).click();
  await expect(manager.locator('#abbreviation')).toHaveValue(';sig');
  await manager.locator('#abbreviation').fill(';addr');
  await manager.locator('#save').click();
  await expect(manager.locator('#abbreviationError')).toHaveText('Another snippet already uses ;addr.');
  await manager.locator('#abbreviation').fill(';sign');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  expect((await readSnippets(serviceWorker))[1].abbreviation).toBe(';sign');
});

test('a double tap still works with abbreviations active', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await selectInTextarea(page, '#plain', 11);
  await doubleTap(page);
  await openPanel(page);
});

test('a clashing abbreviation set in the manager is refused by a panel that is still open', async ({ context, extensionId, page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Signature', content: 'Best' }]);
  await selectInTextarea(page, '#plain', 11);
  const panel = await openPanel(page);

  const manager = await openManager(context, extensionId);
  await manager.locator('#snippetList .row', { hasText: 'Signature' }).click();
  await manager.locator('#abbreviation').fill(';sig');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toHaveText('Saved.');
  await page.bringToFront();

  await panel.locator('.list .item', { hasText: 'Create new snippet' }).click();
  await expect(panel.locator('.caption')).toHaveText('Create a new snippet');
  await waitForPanelFit(page, panel);
  await panel.locator('textarea.input-content').fill('More');
  await panel.locator('input.input-abbreviation').fill(';sigs');
  await waitForPanelFit(page, panel);
  await panel.locator('#primary').click();
  await expect(panel.locator('#error')).toHaveText("This starts with another snippet's abbreviation, ;sig.");

  const stored = await readSnippets(serviceWorker);
  expect(stored).toHaveLength(1);
  expect(stored.filter((s) => s.abbreviation === ';sig')).toHaveLength(1);
});

// Abbreviations that wait for Space, Tab, or Enter.

const DELIMITER = { abbreviations: true, abbreviationTiming: 'delimiter' };

test('with the delimiter timing, Space expands, keeps a space, and one Ctrl+Z undoes both', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, DELIMITER);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr');
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr');
  await page.keyboard.type(' ');
  await expect(page.locator('#plain')).toHaveValue('Hello world 14 Elm Street\nSpringfield ');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr ');
});

test('with the delimiter timing, other characters do not expand', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, DELIMITER);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr.');
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr.');
});

test('with the delimiter timing, Tab expands without a tab character and keeps the focus', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, DELIMITER);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr');
  await page.keyboard.press('Tab');
  await expect(page.locator('#plain')).toHaveValue('Hello world 14 Elm Street\nSpringfield');
  await expect(page.locator('#plain')).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr');
});

test('with the delimiter timing, Tab with no abbreviation behaves as usual', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, DELIMITER);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.press('Tab');
  await expect(page.locator('#plain')).not.toBeFocused();
});

test('with the delimiter timing, Enter expands in a textarea without a line break', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, DELIMITER);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr');
  await page.keyboard.press('Enter');
  await expect(page.locator('#plain')).toHaveValue('Hello world 14 Elm Street\nSpringfield');
});

test('with the delimiter timing, Enter expands in a single-line field without submitting the form', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, DELIMITER);
  await ready(page, () => selectInTextarea(page, '#formField', 5));
  await page.keyboard.type(' ;addr');
  await page.keyboard.press('Enter');
  await expect(page.locator('#formField')).toHaveValue('Note: 14 Elm Street Springfield');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.submits)).toBe(0);
  // Enter with nothing to expand still submits.
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.submits)).toBe(1);
});

test('with the delimiter timing, Space expands in rich-text editors', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await seedSettings(serviceWorker, DELIMITER);
  const text = (selector) => page.locator(selector).evaluate((el) => el.textContent.replace(/ /g, ' '));
  await ready(page, () => caretAtEndOf(page, '#rich', 'p:last-child'));
  await page.keyboard.type(' ;tt ');
  await expect.poll(() => text('#rich p:last-child')).toBe('Thanks Tea time ');

  await caretAtEndOf(page, '#pasteEditor');
  await page.keyboard.type(' ;tt ');
  await expect.poll(() => text('#pasteEditor')).toBe('Editor: Tea time ');
});

test('with the delimiter timing, Space expands in an editor that reads the selection from selectionchange', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Tea time', abbreviation: ';tt' }]);
  await seedSettings(serviceWorker, DELIMITER);
  const text = () => page.locator('#trackingEditor').evaluate((el) => el.textContent.replace(/\u00a0/g, ' '));
  await ready(page, () => caretAtEndOf(page, '#trackingEditor'));
  await page.keyboard.type(' ;tt ');
  await expect.poll(text).toBe('Editor: Tea time ');
});

test('with the delimiter timing, a snippet with a fill-in field ends with the space', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  await seedSettings(serviceWorker, DELIMITER);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type('\n;sig ');
  await expect(page.frameLocator(PANEL).locator('.fill-input')).toBeFocused();
  await page.keyboard.type('Ana');
  await pressInPanel(page, 'Enter');
  await expectPanelClosed(page);
  await expect(page.locator('#plain')).toHaveValue('Hello world\nBest,\nAna ');

  // Escape leaves the abbreviation and its space, with the caret after them.
  await selectInTextarea(page, '#plain', 0, 100);
  await page.keyboard.type(';sig ');
  await expect(page.frameLocator(PANEL).locator('.fill-input')).toBeFocused();
  await pressInPanel(page, 'Escape');
  await expectPanelClosed(page);
  await page.keyboard.type('!');
  await expect(page.locator('#plain')).toHaveValue(';sig !');
});

test('with the delimiter timing, the caret goes to {cursor}, not after the added space', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Dear {cursor},', abbreviation: ';dear' }]);
  await seedSettings(serviceWorker, DELIMITER);
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;dear ');
  await expect(page.locator('#plain')).toHaveValue('Hello world Dear , ');
  await page.keyboard.type('Ana');
  await expect(page.locator('#plain')).toHaveValue('Hello world Dear Ana, ');
});

test('the manager select stores off and delimiter, open pages follow, and Off never stores a timing', async ({ context, extensionId, page, serviceWorker }) => {
  await seedSnippets(serviceWorker, SNIPPETS);
  const stored = () => serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  const manager = await openManager(context, extensionId, 'settings');
  const select = manager.locator('#abbreviations');
  await expect(select).toHaveValue('immediate');
  await expect(select.locator('option')).toHaveText(['As soon as I type them', 'After I press Space, Tab, or Enter', 'Off']);

  await select.selectOption('off');
  await expect.poll(stored).toEqual({ abbreviations: false });
  await select.selectOption('immediate');
  await expect.poll(stored).toEqual({ abbreviations: true });

  await select.selectOption('delimiter');
  await expect.poll(stored).toEqual({ abbreviations: true, abbreviationTiming: 'delimiter' });
  await page.bringToFront();
  await ready(page, () => selectInTextarea(page, '#plain', 11));
  await page.keyboard.type(' ;addr');
  await page.waitForTimeout(300);
  await expect(page.locator('#plain')).toHaveValue('Hello world ;addr');

  // A change made while the page is open applies without a reload.
  await manager.bringToFront();
  await select.selectOption('immediate');
  await expect.poll(stored).toEqual({ abbreviations: true, abbreviationTiming: 'immediate' });
  await page.bringToFront();
  await selectInTextarea(page, '#plain', 0, 100);
  await page.keyboard.type('x ;addr');
  await expect(page.locator('#plain')).toHaveValue('x 14 Elm Street\nSpringfield');
});
