// Playwright configuration for the extension's end-to-end tests.
//
// Tests run fully in parallel across several worker processes. Each test launches its own
// Chromium profile with the extension loaded (see tests/e2e/fixtures.js), so tests share no
// browser state and can run in any order. A test that fails is retried up to twice. Retries wait
// until the rest of the suite has finished and then run one at a time in a single worker, so a
// failure caused by load from the other workers is retried without that load. The first retry
// records a trace for debugging.
'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 2,
  retryStrategy: 'isolated',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 8_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
