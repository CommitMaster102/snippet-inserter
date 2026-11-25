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

// The ports Chromium refuses to connect to (net/base/port_util.cc, kRestrictedPorts). The
// operating system can hand out one of these as a dynamic port, and a page served there never loads.
const RESTRICTED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104,
  109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515,
  526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
  3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

// Listens on a free local port that Chromium allows, and tries again when the system picks a
// restricted one.
async function listenOnAllowedPort(server) {
  for (;;) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    if (!RESTRICTED_PORTS.has(server.address().port)) return;
    await new Promise((resolve) => server.close(resolve));
  }
}

// A persistent context is required for extensions. An empty profile path makes Playwright use a
// new temporary profile, and the "chromium" channel runs the full browser, whose headless mode
// supports extensions.
// A test of a pseudo-language passes the folder of its copy of the extension and a language flag.
function launchContext(extensionPath = EXTENSION_PATH, extraArgs = []) {
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 1000, height: 720 },
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, ...extraArgs],
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
      await listenOnAllowedPort(server);
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
