// Unit tests for scripts/install-hooks.js, the prepare script that npm install runs. Each test
// copies the script into a temp folder and runs it there, with an empty global git configuration
// and the system configuration turned off.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../scripts/install-hooks.js');

function setup() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-'));
  const globalConfig = path.join(temp, 'gitconfig');
  fs.writeFileSync(globalConfig, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
  return { temp, env };
}

// Puts a copy of the script into <folder>/scripts, as in the repository.
function placeScript(folder) {
  fs.mkdirSync(path.join(folder, 'scripts'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(folder, 'scripts', 'install-hooks.js'));
}

function runIn(folder, env) {
  const result = spawnSync('node', [path.join(folder, 'scripts', 'install-hooks.js')], { cwd: folder, env, encoding: 'utf8' });
  return { code: result.status, out: result.stdout };
}

function hooksPath(cwd, env) {
  const result = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd, env, encoding: 'utf8' });
  return result.stdout.trim();
}

function init(cwd, env) {
  assert.equal(spawnSync('git', ['init', '-q', cwd], { env }).status, 0);
}

test('sets core.hooksPath in a git checkout', () => {
  const { temp, env } = setup();
  const repo = path.join(temp, 'repo');
  init(repo, env);
  placeScript(repo);
  assert.equal(runIn(repo, env).code, 0);
  assert.equal(hooksPath(repo, env), '.githooks');
  fs.rmSync(temp, { recursive: true, force: true });
});

test('does nothing in a folder that is not a git checkout', () => {
  const { temp, env } = setup();
  const folder = path.join(temp, 'unpacked');
  placeScript(folder);
  const { code, out } = runIn(folder, env);
  assert.equal(code, 0);
  assert.equal(out, '');
  fs.rmSync(temp, { recursive: true, force: true });
});

test('does not change a git repository that only contains the folder', () => {
  const { temp, env } = setup();
  const outer = path.join(temp, 'outer');
  init(outer, env);
  const folder = path.join(outer, 'unpacked');
  placeScript(folder);
  assert.equal(runIn(folder, env).code, 0);
  assert.equal(hooksPath(outer, env), '');
  fs.rmSync(temp, { recursive: true, force: true });
});

test('leaves a core.hooksPath that is already set', () => {
  const { temp, env } = setup();
  const repo = path.join(temp, 'repo');
  init(repo, env);
  assert.equal(spawnSync('git', ['config', 'core.hooksPath', 'my-hooks'], { cwd: repo, env }).status, 0);
  placeScript(repo);
  const { code, out } = runIn(repo, env);
  assert.equal(code, 0);
  assert.match(out, /core\.hooksPath is already my-hooks/);
  assert.equal(hooksPath(repo, env), 'my-hooks');
  fs.rmSync(temp, { recursive: true, force: true });
});
