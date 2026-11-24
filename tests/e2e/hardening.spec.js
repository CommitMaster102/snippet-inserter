// Gaps found in the audit: the panel in modal dialogs, short windows and frames, and the manager in narrow windows.
'use strict';

const { test, expect } = require('./fixtures');
const { seedSnippets, readSnippets, selectInTextarea, openPanel, openManager, expectPanelClosed, doubleTap, longText } = require('./helpers');

test('the panel opens above a modal dialog and inserts on a click', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/dialog.html`);
  await seedSnippets(serviceWorker, [{ title: 'Tea time', content: 'Tea time' }]);
  await selectInTextarea(page, '#t', 5);
  const panel = await openPanel(page);

  // The panel must be the topmost element at its own centre, not hidden under the dialog.
  const frame = page.locator('iframe[title="Snippets"]');
  const box = await frame.boundingBox();
  const topmost = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.tagName,
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  expect(topmost).toBe('IFRAME');

  // The panel sits near the caret, inside the dialog's box.
  const field = await page.locator('#t').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(field.x - 1);
  expect(box.y).toBeGreaterThanOrEqual(field.y);

  await panel.locator('.list .item', { hasText: 'Tea time' }).click();
  await expectPanelClosed(page);
  await expect(page.locator('#t')).toHaveValue('Hello Tea time');
});

test('the edit form stays inside a short window with Save visible', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/editors.html`);
  await page.setViewportSize({ width: 1000, height: 420 });
  await seedSnippets(serviceWorker, [{ title: 'Long', content: longText(20) }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'Long' });
  await item.hover();
  await item.locator('.edit-button').click();
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');

  const frame = await page.locator('iframe[title="Snippets"]').boundingBox();
  expect(frame.y).toBeGreaterThanOrEqual(8);
  expect(frame.y + frame.height).toBeLessThanOrEqual(420 - 8 + 1);
  const save = await panel.locator('#primary').boundingBox();
  expect(save.y + save.height).toBeLessThanOrEqual(420 - 8 + 1);
});

test('the list scrolls inside a small frame and the panel keeps to its size', async ({ context, page, serviceWorker }) => {
  const inner = "<!doctype html><html lang='en'><body><textarea id='inner' rows='2' cols='20'>Inside</textarea></body></html>";
  await context.route('https://short-frame.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><body><iframe id="editor" style="width: 300px; height: 200px" srcdoc="${inner}"></iframe></body></html>`,
    })
  );
  await seedSnippets(
    serviceWorker,
    Array.from({ length: 8 }, (_, i) => ({ title: `Snippet ${i + 1}`, content: `Body ${i + 1}` }))
  );
  await page.goto('https://short-frame.test/');
  const frame = page.frameLocator('#editor');
  await frame.locator('#inner').evaluate((element) => {
    element.focus();
    element.setSelectionRange(6, 6);
  });
  const panelFrame = frame.locator('iframe[title="Snippets"]');
  await expect(async () => {
    if ((await panelFrame.count()) === 0) await doubleTap(page);
    await expect(panelFrame).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(panelFrame).toHaveCSS('opacity', '1');

  // The editor frame has a 2 px border on each side.
  const editor = await page.locator('#editor').boundingBox();
  await expect(async () => {
    const box = await panelFrame.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(editor.y + editor.height - 2 - 8 + 1);
    expect(box.x + box.width).toBeLessThanOrEqual(editor.x + editor.width - 2 - 8 + 1);
  }).toPass({ timeout: 5000 });

  // The last snippet can be scrolled into view inside the panel.
  const last = panelFrame.contentFrame().locator('.list .item', { hasText: 'Snippet 8' });
  await last.scrollIntoViewIfNeeded();
  const box = await last.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(editor.y + editor.height - 2);
});

test('the manager has no sideways scroll and keeps Save in view at 768 px wide', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(
    serviceWorker,
    Array.from({ length: 15 }, (_, i) => ({ title: `Snippet ${i}`, content: `Text ${i}` }))
  );
  const manager = await openManager(context, extensionId);
  await manager.setViewportSize({ width: 768, height: 720 });
  await manager.locator('#snippetList .row').last().click();
  await expect(manager.locator('#save')).toBeVisible();

  const scrollWidth = await manager.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(768);
  const save = await manager.locator('#save').boundingBox();
  expect(save.x + save.width).toBeLessThanOrEqual(768);
  expect(save.y).toBeGreaterThanOrEqual(0);
  expect(save.y + save.height).toBeLessThanOrEqual(720);
  const text = await manager.locator('#content').boundingBox();
  expect(text.width).toBeGreaterThan(400);
});

test('the panel list is a listbox the search box points into, and Tab stays in the panel', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/editors.html`);
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'Alpha text' },
    { title: 'Beta', content: 'Beta text' },
  ]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(panel.locator('.list .item')).toHaveCount(3);

  await expect(panel.locator('.list')).toHaveAttribute('role', 'listbox');
  await panel.locator('#search').press('ArrowDown');
  const focused = panel.locator('.list [data-focused]');
  await expect(focused).toHaveAttribute('role', 'option');
  const id = await focused.getAttribute('id');
  expect(id).toBeTruthy();
  await expect(panel.locator('#search')).toHaveAttribute('aria-activedescendant', id);

  // The Edit buttons are out of the Tab order, and Tab from the search box wraps to the Close button.
  await expect(panel.locator('.edit-button').first()).toHaveAttribute('tabindex', '-1');
  await panel.locator('#search').press('Tab');
  await expect(panel.locator('#close')).toBeFocused();
  await panel.locator('#close').press('Shift+Tab');
  await expect(panel.locator('#search')).toBeFocused();
});

test('the manager list has one Tab stop, valid roles, and announces a move', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'One', content: 'a' },
    { title: 'Two', content: 'b' },
    { title: 'Three', content: 'c' },
  ]);
  const manager = await openManager(context, extensionId);
  const rows = manager.locator('#snippetList .row');
  await expect(rows).toHaveCount(3);
  await expect(manager.locator('#snippetList')).toHaveAttribute('role', 'listbox');
  await expect(manager.locator('#snippetList .row[tabindex="0"]')).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('role', 'option');

  // The Tab stop follows the focused row.
  await rows.nth(1).focus();
  await expect(manager.locator('#snippetList .row[tabindex="0"]')).toHaveCount(1);
  await expect(rows.nth(1)).toHaveAttribute('tabindex', '0');

  await rows.nth(1).press('Alt+ArrowDown');
  await expect(manager.locator('#moveStatus')).toHaveText('Two moved to position 3 of 3.');
  await expect(rows.nth(2)).toContainText('Two');
});

// Failures the user can see: the manager's message area, the panel's load error and the insert notice.

test('a failed Restore far down a scrolled list shows an error inside the window', async ({ context, extensionId, serviceWorker }) => {
  const entries = Array.from({ length: 20 }, (_, i) => ({
    id: `gone${String(i).padStart(8, '0')}`,
    title: `Gone ${i}`,
    content: 'x',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    deletedAt: new Date(Date.UTC(2026, 1, 1, 0, 20 - i)).toISOString(),
    index: 0,
  }));
  await serviceWorker.evaluate((list) => chrome.storage.local.set({ 'snippet_manager.deleted': list }), entries);
  const manager = await openManager(context, extensionId, 'deleted');
  await manager.setViewportSize({ width: 1100, height: 600 });
  const rows = manager.locator('#deletedList .deleted-row');
  await expect(rows).toHaveCount(20);

  await manager.evaluate(() => {
    chrome.storage.local.set = () => Promise.reject(new Error('disk full'));
  });
  const last = rows.last().getByRole('button', { name: 'Restore' });
  await last.scrollIntoViewIfNeeded();
  expect(await manager.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await last.click();

  const alert = manager.locator('[role="alert"]:visible');
  await expect(alert).toContainText('disk full');
  const box = await alert.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
});

test('a failed save keeps its error next to Save while the editor is open', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ title: 'Address', content: '14 Elm Street' }]);
  const manager = await openManager(context, extensionId);
  await manager.locator('#snippetList .row').first().click();
  await manager.evaluate(() => {
    chrome.storage.local.set = () => Promise.reject(new Error('disk full'));
  });
  await manager.locator('#content').fill('15 Elm Street');
  await manager.locator('#save').click();
  await expect(manager.locator('#editorStatus')).toContainText('disk full');
  await expect(manager.locator('#pageError')).toContainText('disk full');
});

test('a setting that cannot be saved goes back and shows an error', async ({ context, extensionId }) => {
  const manager = await openManager(context, extensionId, 'settings');
  await manager.evaluate(() => {
    chrome.storage.local.set = () => Promise.reject(new Error('disk full'));
  });
  await manager.locator('#hotkey').selectOption('Alt');
  await expect(manager.locator('[role="alert"]:visible')).toContainText('disk full');
  await expect(manager.locator('#hotkey')).toHaveValue('Control');
});

test('a failed first read shows a load error in the panel, not the empty state', async ({ context, page, pagesUrl, serviceWorker }) => {
  await context.addInitScript(() => {
    if (location.protocol !== 'chrome-extension:' || !location.pathname.endsWith('panel.html')) return;
    chrome.storage.local.get = () => Promise.reject(new Error('read failed'));
  });
  await page.goto(`${pagesUrl}/editors.html`);
  await seedSnippets(serviceWorker, [{ title: 'Tea time', content: 'Tea time' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  await expect(panel.locator('[role="alert"]')).toContainText('could not be loaded');
  await expect(panel.locator('.empty-heading')).not.toHaveText('You have no snippets yet');
  await expect(panel.locator('#primary')).toBeHidden();
});

test('a field replaced while the panel is open gets a notice instead of a silent insert', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/replaced-field.html`);
  await seedSnippets(serviceWorker, [{ title: 'Tea time', content: 'Tea time' }]);
  await selectInTextarea(page, '#t', 5);
  const panel = await openPanel(page);
  await panel.locator('#search').press('Control+2');
  await expectPanelClosed(page);
  await expect(page.locator('html > div').first()).toBeAttached();
  const text = await page.evaluate(() =>
    [...document.documentElement.children].map((n) => n.shadowRoot?.textContent || '').join('')
  );
  expect(text).toContain('field is gone');
});

const hebrew = 'שלום עולם '.repeat(8) + 'סוף';

test('right-to-left names and text follow their own direction in the panel and the manager', async ({ context, page, pagesUrl, extensionId, serviceWorker }) => {
  await page.goto(`${pagesUrl}/editors.html`);
  await seedSnippets(serviceWorker, [{ title: hebrew, content: 'مرحبا بالعالم ' + hebrew, abbreviation: ';sh' }]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);
  const item = panel.locator('.list .item', { hasText: 'שלום' });
  for (const selector of ['.item-caption', '.item-preview']) {
    expect(await item.locator(selector).evaluate((e) => e.matches(':dir(rtl)')), `panel ${selector}`).toBe(true);
  }
  await item.hover();
  await item.locator('.edit-button').click();
  for (const selector of ['.input-title', '.input-content']) {
    expect(await panel.locator(selector).evaluate((e) => e.matches(':dir(rtl)')), `panel ${selector}`).toBe(true);
  }
  expect(await panel.locator('.input-abbreviation').evaluate((e) => e.matches(':dir(ltr)'))).toBe(true);

  const manager = await openManager(context, extensionId);
  for (const selector of ['.row-name', '.row-preview']) {
    expect(await manager.locator(selector).first().evaluate((e) => e.matches(':dir(rtl)')), `manager ${selector}`).toBe(true);
  }
  await manager.locator('.row-name').first().click();
  for (const selector of ['#title', '#content']) {
    expect(await manager.locator(selector).evaluate((e) => e.matches(':dir(rtl)')), `manager ${selector}`).toBe(true);
  }
  expect(await manager.locator('#abbreviation').evaluate((e) => e.matches(':dir(ltr)'))).toBe(true);
});

async function expectPanelOnTop(page) {
  const frame = page.locator('iframe[title="Snippets"]');
  const box = await frame.boundingBox();
  const topmost = await page.evaluate(
    ([x, y]) => {
      let node = document.elementFromPoint(x, y);
      while (node && node.shadowRoot && node.shadowRoot.elementFromPoint(x, y)) node = node.shadowRoot.elementFromPoint(x, y);
      return node?.tagName;
    },
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  expect(topmost).toBe('IFRAME');
}

test('the panel stays in view and clickable when the modal dialog has a transform', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/dialog-transform.html`);
  await seedSnippets(serviceWorker, [{ title: 'Tea time', content: 'Tea time' }]);
  await selectInTextarea(page, '#t', 5);
  const panel = await openPanel(page);
  await expectPanelOnTop(page);

  // The frame sits next to the field, not shifted by the dialog's own offset.
  const field = await page.locator('#t').boundingBox();
  const box = await page.locator('iframe[title="Snippets"]').boundingBox();
  expect(Math.abs(box.x - field.x)).toBeLessThan(60);
  expect(box.y).toBeGreaterThanOrEqual(field.y);
  expect(box.y).toBeLessThan(field.y + field.height + 60);

  await panel.locator('.list .item', { hasText: 'Tea time' }).click();
  await expectPanelClosed(page);
  await expect(page.locator('#t')).toHaveValue('Hello Tea time');
});

test('a notice shown while the field is in a modal dialog is on top', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/dialog.html`);
  await seedSnippets(serviceWorker, [{ title: 'Long one', content: 'A snippet that is longer than the field allows' }]);
  await page.locator('#t').evaluate((e) => (e.maxLength = 8));
  await selectInTextarea(page, '#t', 5);
  const panel = await openPanel(page);
  await panel.locator('.list .item', { hasText: 'Long one' }).click();
  await expectPanelClosed(page);

  const result = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('div')].filter((d) => d.shadowRoot && d.shadowRoot.textContent.includes('more'));
    if (hosts.length !== 1) return { found: hosts.length };
    const box = hosts[0].getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { found: 1, topmost: hit === hosts[0] };
  });
  expect(result).toEqual({ found: 1, topmost: true });
});

test('the panel opens above a modal dialog inside a shadow root', async ({ page, pagesUrl, serviceWorker }) => {
  await page.goto(`${pagesUrl}/dialog-shadow.html`);
  await seedSnippets(serviceWorker, [{ title: 'Tea time', content: 'Tea time' }]);
  await selectInTextarea(page, '#t', 5);
  const panel = await openPanel(page);
  await expectPanelOnTop(page);
  await panel.locator('.list .item', { hasText: 'Tea time' }).click();
  await expectPanelClosed(page);
  await expect(page.locator('#t')).toHaveValue('Hello Tea time');
});

test('the edit form, Duplicate, and Delete can be reached with the keyboard alone', async ({ page, serviceWorker }) => {
  await seedSnippets(serviceWorker, [
    { title: 'Alpha', content: 'First' },
    { title: 'Beta', content: 'Second' },
  ]);
  await selectInTextarea(page, '#plain', 5);
  const panel = await openPanel(page);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('F2');
  await expect(panel.locator('.caption')).toHaveText('Edit snippet');
  await expect(panel.locator('textarea.input-content')).toHaveValue('First');

  // Tab reaches Duplicate, and Enter presses it.
  const duplicate = panel.locator('.item-action', { hasText: 'Duplicate snippet' });
  await expect(async () => {
    await page.keyboard.press('Tab');
    await expect(duplicate).toBeFocused({ timeout: 200 });
  }).toPass({ timeout: 5000 });
  await page.keyboard.press('Enter');
  await expect(panel.locator('.list .item', { hasText: 'Alpha' })).toHaveCount(2);
  expect(await readSnippets(serviceWorker)).toHaveLength(3);

  // Back in the list, highlight a snippet, open its edit form, and delete it with Tab and Enter.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('F2');
  const remove = panel.locator('.item-action', { hasText: 'Delete snippet' });
  await expect(async () => {
    await page.keyboard.press('Tab');
    await expect(remove).toBeFocused({ timeout: 200 });
  }).toPass({ timeout: 5000 });
  await page.keyboard.press('Enter');
  await expect(panel.getByText('Snippet deleted.')).toBeVisible();
  expect(await readSnippets(serviceWorker)).toHaveLength(2);
});
