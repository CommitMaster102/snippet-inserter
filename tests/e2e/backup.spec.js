// Export and import of snippets through backup files on the manager page.
'use strict';

const fs = require('fs');
const { test, expect, launchContext, extensionWorker } = require('./fixtures');
const { seedSnippets, readSnippets, openManager, longText } = require('./helpers');

async function exportFile(manager) {
  const [download] = await Promise.all([manager.waitForEvent('download'), manager.locator('#export').click()]);
  const text = fs.readFileSync(await download.path(), 'utf8');
  return { name: download.suggestedFilename(), text };
}

test('exports every snippet to a dated JSON file', async ({ context, extensionId, serviceWorker }) => {
  const seeded = await seedSnippets(serviceWorker, [{ title: 'Address', content: '14 Elm Street\nSpringfield', folder: 'Home' }, { content: 'Thanks' }]);
  const manager = await openManager(context, extensionId, 'settings');
  await expect(manager.locator('#exportNote')).toContainText('Saves all 2 snippets to snippets-');

  const { name, text } = await exportFile(manager);
  expect(name).toMatch(/^snippets-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(text);
  expect(data).toMatchObject({ format: 'snippet-inserter', version: 1 });
  expect(Date.parse(data.exportedAt)).not.toBeNaN();
  expect(data.snippets).toEqual(seeded);
  // A folder is written on the snippets that have one, and the others keep their 1.2.0 shape.
  expect(data.snippets[0].folder).toBe('Home');
  expect('folder' in data.snippets[1]).toBe(false);
  await expect(manager.locator('#importResult')).toHaveText(`Exported 2 snippets to ${name}.`);
});

test('a backup moves every snippet to another profile, and a second import skips them all', async ({ context, extensionId, serviceWorker }) => {
  // A 7,693-character multi-line snippet, the size of the largest one in real use.
  const big = longText(150).slice(0, 7693);
  expect(big.length).toBe(7693);
  await seedSnippets(serviceWorker, [
    { title: 'Big one', content: big },
    { title: 'Short', content: 'Hi', folder: 'Work' },
    { content: 'Untitled\nsecond line' },
  ]);
  const source = await openManager(context, extensionId);
  await source.locator('#snippetList .row').nth(2).focus();
  await source.keyboard.press('Alt+ArrowUp');
  await expect(source.locator('#snippetList .row-name')).toHaveText(['Big one', 'Untitled', 'Short']);
  await source.goto(`chrome-extension://${extensionId}/options.html#settings`);
  const { name, text } = await exportFile(source);
  const before = await readSnippets(serviceWorker);

  const other = await launchContext();
  try {
    const { worker, id } = await extensionWorker(other);
    const target = await openManager(other, id, 'settings');
    await target.locator('#importFile').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(target.locator('#importResult')).toHaveText('Imported 3 snippets.');
    expect(await readSnippets(worker)).toEqual(before);
    expect((await readSnippets(worker)).map((s) => s.folder)).toEqual([undefined, undefined, 'Work']);

    await target.locator('#importFile').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(target.locator('#importResult')).toHaveText('Imported 0 snippets. Skipped 3 snippets that were already here.');
    expect(await readSnippets(worker)).toEqual(before);
  } finally {
    await other.close();
  }
});

test('an unreadable file shows an error and changes nothing', async ({ context, extensionId, serviceWorker }) => {
  await seedSnippets(serviceWorker, [{ content: 'Keep' }]);
  const manager = await openManager(context, extensionId, 'settings');
  await manager.locator('#importFile').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{ not json') });
  await expect(manager.locator('#importResult')).toHaveText('This file is not a snippet backup: it is not valid JSON.');
  await expect(manager.locator('#importResult')).toHaveClass(/status-error/);
  expect(await readSnippets(serviceWorker)).toHaveLength(1);
});
