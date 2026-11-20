/**
 * Playwright fixtures that load the unpacked extension.
 *
 * Every test gets a fresh Chromium profile with the extension installed, so stored snippets and
 * settings never leak from one test to another and the suite can run in parallel. Each worker
 * process serves tests/pages over a local HTTP server, because content scripts do not run on
 * file:// pages unless the user allows it.
 *
 * The tests load extension/ by default. Set the EXTENSION_PATH environment variable to test
 * another copy of the extension, such as an unzipped release package.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { test: base, chromium, expect } = require('@playwright/test');

const EXTENSION_PATH = path.resolve(process.env.EXTENSION_PATH || path.join(__dirname, '..', '..', 'extension'));
const PAGES_DIR = path.resolve(__dirname, '..', 'pages');

// A persistent context is required for extensions. An empty profile path makes Playwright use a
// new temporary profile, and the "chromium" channel runs the full browser, whose headless mode
// supports extensions.
function launchContext() {
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 1000, height: 720 },
    acceptDownloads: true,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
}

// The extension's service worker in `context`, and the extension id taken from its address.
async function extensionWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  return { worker, id: new URL(worker.url()).host };
}

const test = base.extend({
  // A static server for tests/pages, shared by all tests in one worker process.
  pagesUrl: [
    async ({}, use) => {
      const server = http.createServer((request, response) => {
        const name = path.basename(new URL(request.url, 'http://localhost').pathname) || 'editors.html';
        const file = path.join(PAGES_DIR, name);
        if (!fs.existsSync(file)) {
          response.writeHead(404);
          response.end();
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        fs.createReadStream(file).pipe(response);
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      await use(`http://127.0.0.1:${server.address().port}`);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
    { scope: 'worker' },
  ],

  context: async ({}, use) => {
    const context = await launchContext();
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    await use((await extensionWorker(context)).worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  page: async ({ context, pagesUrl }, use) => {
    const page = await context.newPage();
    await page.goto(`${pagesUrl}/editors.html`);
    await use(page);
  },
});

module.exports = { test, expect, launchContext, extensionWorker };
