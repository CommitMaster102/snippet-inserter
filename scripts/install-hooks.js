#!/usr/bin/env node
// Turns on the hooks in .githooks by setting core.hooksPath. npm runs this as the prepare script
// during npm install.
//
// It does nothing outside a git checkout of this repository, such as in an unpacked source archive,
// and it leaves a core.hooksPath that is already set, from this repository or from the global git
// configuration.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const top = git('rev-parse', '--show-toplevel');
if (!top || path.relative(fs.realpathSync(top), fs.realpathSync(root)) !== '') process.exit(0);

const current = git('config', '--get', 'core.hooksPath');
if (current === '.githooks') process.exit(0);
if (current) {
  console.log(`core.hooksPath is already ${current}, so the release docs check in .githooks/pre-push is off.`);
  console.log('To turn it on for this repository, run: git config core.hooksPath .githooks');
  process.exit(0);
}
git('config', 'core.hooksPath', '.githooks');
