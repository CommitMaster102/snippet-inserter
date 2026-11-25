// Unit tests for scripts/check-release-docs.js. Each test builds a throwaway git repository in a
// temp folder, bumps the version, and runs the script on the range between the two commits.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../scripts/check-release-docs.js');
const CONTENT = 'console.log("content");\n';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(cwd, file, text) {
  const full = path.join(cwd, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

function commit(cwd, message) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function reviewJson(version, files) {
  return JSON.stringify({ files: Object.fromEntries(files.map((file) => [file, version])) });
}

const DOCS = ['CHANGELOG.md', 'README.md', 'docs/guide.md'];

// Writes the files of a release that passes every check.
function writeRelease(cwd, version, overrides = {}) {
  const files = {
    'package.json': JSON.stringify({ name: 'x', version }),
    'extension/manifest.json': JSON.stringify({ version }),
    'extension/content.js': CONTENT,
    'extension/_locales/en/messages.json': '{}',
    'extension/_locales/de/messages.json': '{}',
    'extension/_locales/fr/messages.json': '{}',
    'CHANGELOG.md': `# Changelog\n\n## ${version}\n\nA change.\n\n## 1.0.0\n\nFirst.\n`,
    'README.md': [
      '# Readme',
      'The extension has 2 languages besides English.',
      '[guide](docs/guide.md#set-up) and [top](#readme) and [outside](https://example.com/x#y).',
      '`content.js`, ' + CONTENT.length + ' bytes.',
      '```',
      '[ignored](missing.md)',
      '```',
    ].join('\n'),
    'docs/guide.md': '# Guide\n\n## Set up\n\nBack to the [readme](../README.md#readme).\n',
    'docs/doc-review.json': reviewJson(version, DOCS),
    ...overrides,
  };
  for (const [file, text] of Object.entries(files)) {
    if (text === null) fs.rmSync(path.join(cwd, file), { force: true });
    else write(cwd, file, text);
  }
}

// Returns { cwd, base, release } with the 1.0.0 commit and a 1.1.0 commit built from the
// overrides. A test that needs more commits uses cwd and the helpers directly.
function makeRepo(overrides = {}, { bumpFirst = false } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-docs-'));
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'commit.gpgsign', 'false');
  writeRelease(cwd, '1.0.0');
  const base = commit(cwd, 'Version 1.0.0');
  if (bumpFirst) return { cwd, base };
  writeRelease(cwd, '1.1.0', overrides);
  const release = commit(cwd, 'Release 1.1.0');
  return { cwd, base, release };
}

function run(cwd, local, remote, remoteName) {
  const args = [SCRIPT, local];
  if (remote !== undefined) args.push(remote);
  if (remoteName !== undefined) args.push(remoteName);
  const result = spawnSync('node', args, { cwd, encoding: 'utf8' });
  return { code: result.status, text: result.stderr };
}

function expectFailure({ cwd, base, release }, pattern) {
  const { code, text } = run(cwd, release, base);
  assert.equal(code, 1, text);
  assert.match(text, pattern);
  fs.rmSync(cwd, { recursive: true, force: true });
}

test('passes when the release docs are ready', () => {
  const repo = makeRepo();
  const { code, text } = run(repo.cwd, repo.release, repo.base);
  assert.equal(code, 0, text);
  fs.rmSync(repo.cwd, { recursive: true, force: true });
});

test('does nothing when the version is unchanged, even with stale docs', () => {
  const { cwd, base } = makeRepo({}, { bumpFirst: true });
  write(cwd, 'extension/content.js', 'changed();\n');
  write(cwd, 'README.md', '# Readme\n[broken](nowhere.md)\n');
  const head = commit(cwd, 'Change without a bump');
  const { code, text } = run(cwd, head, base);
  assert.equal(code, 0, text);
  fs.rmSync(cwd, { recursive: true, force: true });
});

test('does nothing when a ref is being deleted', () => {
  const { cwd, base } = makeRepo({}, { bumpFirst: true });
  assert.equal(run(cwd, '0'.repeat(40), base).code, 0);
  fs.rmSync(cwd, { recursive: true, force: true });
});

test('refuses a CHANGELOG.md with no heading for the version', () => {
  expectFailure(makeRepo({ 'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\nFirst.\n' }),
    /CHANGELOG\.md has no heading for version 1\.1\.0/);
});

test('refuses a manifest with another version', () => {
  expectFailure(makeRepo({ 'extension/manifest.json': JSON.stringify({ version: '1.0.0' }) }),
    /manifest\.json has version 1\.0\.0, but package\.json has 1\.1\.0/);
});

test('refuses a review record that leaves out a tracked file', () => {
  expectFailure(makeRepo({ 'docs/doc-review.json': reviewJson('1.1.0', ['README.md', 'CHANGELOG.md']) }),
    /does not list docs\/guide\.md/);
});

test('refuses a review record at an older version', () => {
  const files = { 'README.md': '1.1.0', 'CHANGELOG.md': '1.1.0', 'docs/guide.md': '1.0.0' };
  expectFailure(makeRepo({ 'docs/doc-review.json': JSON.stringify({ files }) }),
    /lists docs\/guide\.md at version 1\.0\.0, not 1\.1\.0/);
});

test('refuses a review record that lists a file that no longer exists', () => {
  expectFailure(makeRepo({ 'docs/doc-review.json': reviewJson('1.1.0', [...DOCS, 'docs/gone.md']) }),
    /lists docs\/gone\.md, which is not a tracked Markdown file/);
});

test('ignores Markdown files under node_modules', () => {
  const repo = makeRepo({ 'node_modules/pkg/README.md': '# Pkg\n[x](missing.md)\n' });
  const { code, text } = run(repo.cwd, repo.release, repo.base);
  assert.equal(code, 0, text);
  fs.rmSync(repo.cwd, { recursive: true, force: true });
});

test('refuses a review record older than the last change under extension/', () => {
  const { cwd, base } = makeRepo({}, { bumpFirst: true });
  writeRelease(cwd, '1.1.0');
  commit(cwd, 'Release 1.1.0 with its review');
  write(cwd, 'extension/content.js', 'changed();\n');
  write(cwd, 'README.md', fs.readFileSync(path.join(cwd, 'README.md'), 'utf8')
    .replace(/`content\.js`, \d+/, '`content.js`, 11'));
  const release = commit(cwd, 'Late code change');
  expectFailure({ cwd, base, release }, /last changed before the last change under extension\//);
});

test('passes when the review record is updated after the last code change', () => {
  const { cwd, base } = makeRepo({}, { bumpFirst: true });
  write(cwd, 'extension/content.js', 'changed();\n');
  commit(cwd, 'Code change');
  writeRelease(cwd, '1.1.0', { 'extension/content.js': 'changed();\n', 'README.md': fs.readFileSync(path.join(cwd, 'README.md'), 'utf8')
    .replace(/`content\.js`, \d+/, '`content.js`, 11') });
  const release = commit(cwd, 'Release 1.1.0');
  const { code, text } = run(cwd, release, base);
  assert.equal(code, 0, text);
  fs.rmSync(cwd, { recursive: true, force: true });
});

test('refuses a link to a file that does not exist', () => {
  expectFailure(makeRepo({ 'docs/guide.md': '# Guide\n\n## Set up\n\n[x](missing.md)\n' }),
    /docs\/guide\.md links to missing\.md, but docs\/missing\.md does not exist/);
});

test('refuses a link to a heading that does not exist', () => {
  expectFailure(makeRepo({ 'docs/guide.md': '# Guide\n\n## Set up\n\n[x](../README.md#nothing)\n' }),
    /links to \.\.\/README\.md#nothing, but README\.md has no heading #nothing/);
});

test('refuses an anchor in the same file that does not exist', () => {
  expectFailure(makeRepo({ 'docs/guide.md': '# Guide\n\n## Set up\n\n[x](#nope)\n' }),
    /links to #nope, but docs\/guide\.md has no heading #nope/);
});

test('refuses a stated file size that is wrong', () => {
  expectFailure(makeRepo({ 'README.md': '# Readme\n`content.js`, 9,999 bytes.\n2 languages besides English.\n' }),
    /says content\.js is 9,999 bytes, but it is 24 bytes/);
});

test('reads a stated size that wraps over two lines', () => {
  const readme = '# Readme\n`content.js`,\n  24 bytes.\n2 languages besides English.\n';
  const repo = makeRepo({ 'README.md': readme });
  const { code, text } = run(repo.cwd, repo.release, repo.base);
  assert.equal(code, 0, text);
  fs.rmSync(repo.cwd, { recursive: true, force: true });
});

test('refuses a language count that does not match extension/_locales', () => {
  expectFailure(makeRepo({ 'README.md': '# Readme\nThe extension has 5 languages besides English.\n' }),
    /says 5 languages besides English, but extension\/_locales has 2/);
});

test('reports every failure at once', () => {
  const repo = makeRepo({
    'CHANGELOG.md': '# Changelog\n',
    'extension/manifest.json': JSON.stringify({ version: '0' }),
  });
  const { code, text } = run(repo.cwd, repo.release, repo.base);
  assert.equal(code, 1);
  assert.match(text, /CHANGELOG\.md has no heading/);
  assert.match(text, /manifest\.json has version 0/);
  fs.rmSync(repo.cwd, { recursive: true, force: true });
});

test('checks a push that changes only the manifest version', () => {
  expectFailure(makeRepo({ 'package.json': JSON.stringify({ name: 'x', version: '1.0.0' }) }),
    /manifest\.json has version 1\.1\.0, but package\.json has 1\.0\.0/);
});

test('refuses a code change after the review that the remote already has', () => {
  const { cwd } = makeRepo({}, { bumpFirst: true });
  writeRelease(cwd, '1.1.0', { 'package.json': JSON.stringify({ name: 'x', version: '1.0.0' }) });
  commit(cwd, 'Review the docs for 1.1.0');
  write(cwd, 'extension/other.js', 'other();\n');
  const pushed = commit(cwd, 'Code change after review');
  write(cwd, 'package.json', JSON.stringify({ name: 'x', version: '1.1.0' }));
  const release = commit(cwd, 'Raise package.json to 1.1.0');
  expectFailure({ cwd, base: pushed, release },
    /last change under extension\/ \([0-9a-f]+ Code change after review\)/);
});

const ZERO_SHA = '0'.repeat(40);

// Builds main with version 1.0.0, a reviewed release of 1.1.0, and a code change after the
// review, which is the usual state between releases. A push that raises the version to 1.1.0
// from 1.0.0 would fail, because the code change is newer than the review.
function makeReleasedRepo() {
  const { cwd, base } = makeRepo({}, { bumpFirst: true });
  writeRelease(cwd, '1.1.0');
  commit(cwd, 'Release 1.1.0');
  write(cwd, 'extension/other.js', 'other();\n');
  const main = commit(cwd, 'Code change after the release');
  return { cwd, base, main };
}

test('does nothing for a new branch at the commit of the remote default branch', () => {
  const { cwd, main } = makeReleasedRepo();
  git(cwd, 'update-ref', 'refs/remotes/origin/main', main);
  git(cwd, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const { code, text } = run(cwd, main, ZERO_SHA, 'origin');
  assert.equal(code, 0, text);
  fs.rmSync(cwd, { recursive: true, force: true });
});

test('compares a new branch with the remote branches when the remote has no HEAD', () => {
  const { cwd, main } = makeReleasedRepo();
  git(cwd, 'update-ref', 'refs/remotes/origin/main', main);
  write(cwd, 'extension/feature.js', 'feature();\n');
  const head = commit(cwd, 'A change on a new branch');
  const { code, text } = run(cwd, head, ZERO_SHA, 'origin');
  assert.equal(code, 0, text);
  fs.rmSync(cwd, { recursive: true, force: true });
});

test('compares a new branch with the default branch of the remote it is pushed to', () => {
  const { cwd, base, main } = makeReleasedRepo();
  git(cwd, 'update-ref', 'refs/remotes/origin/main', base);
  git(cwd, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  git(cwd, 'update-ref', 'refs/remotes/upstream/main', main);
  git(cwd, 'symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/main');
  const upstream = run(cwd, main, ZERO_SHA, 'upstream');
  assert.equal(upstream.code, 0, upstream.text);
  const origin = run(cwd, main, ZERO_SHA, 'origin');
  assert.equal(origin.code, 1, origin.text);
  assert.match(origin.text, /changes the version to 1\.1\.0/);
  fs.rmSync(cwd, { recursive: true, force: true });
});

test('compares a new branch with the root commit when there is no remote-tracking branch', () => {
  const repo = makeRepo({ 'CHANGELOG.md': '# Changelog\n' });
  const { code, text } = run(repo.cwd, repo.release, ZERO_SHA);
  assert.equal(code, 1);
  assert.match(text, /CHANGELOG\.md has no heading/);
  fs.rmSync(repo.cwd, { recursive: true, force: true });
});
