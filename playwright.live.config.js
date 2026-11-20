// Playwright configuration for the live Google Docs check, run with `npm run test:docs-live`.
//
// It runs tests/live one test at a time and never retries: the check edits one shared document,
// and a retry would hide a failure that comes from a change on Google's side.
'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/live',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
