#!/usr/bin/env node
// Refuses a push that changes the version while the release docs are stale.
//
// Usage: node scripts/check-release-docs.js <local-sha> [<remote-sha> [<remote-name>]]
//
// The pre-push hook calls this once for each ref being pushed, with the name of the remote. The
// version is "version" in package.json and in extension/manifest.json. When both are the same at
// both ends of the range, the script does nothing and exits 0. When either changed, the script
// checks the release docs as they are at the local commit and exits 1 with one message per
// failure. It has no dependencies and reads the repository through git, not the working tree.
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ZERO = /^0+$/;

function git(args, { fail = false } = {}) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    if (fail) throw error;
    return null;
  }
}

function commitExists(sha) {
  return git(['cat-file', '-e', `${sha}^{commit}`]) !== null;
}

function mergeBase(a, b) {
  const base = git(['merge-base', a, b]);
  return base ? base.trim() : null;
}

// Finds the commit to compare a new branch with, one that the remote already has. That is the
// commit where the branch leaves the remote's default branch, <remote>/HEAD. Without that ref, it
// is the nearest commit that the branch shares with one of the remote's branches, or else with any
// remote-tracking branch. Only when no remote-tracking branch shares a commit is it the root commit.
function defaultBase(local, remoteName) {
  const head = git(['symbolic-ref', '--quiet', `refs/remotes/${remoteName}/HEAD`]);
  const base = head && mergeBase(local, head.trim());
  if (base) return base;
  for (const prefix of [`refs/remotes/${remoteName}/`, 'refs/remotes/']) {
    const refs = (git(['for-each-ref', '--format=%(objectname)', prefix]) || '').split('\n').filter(Boolean);
    let nearest = null;
    let nearestCount = Infinity;
    for (const ref of new Set(refs)) {
      const shared = mergeBase(local, ref);
      if (!shared) continue;
      const count = Number((git(['rev-list', '--count', `${shared}..${local}`]) || '').trim());
      if (count < nearestCount) {
        nearest = shared;
        nearestCount = count;
      }
    }
    if (nearest) return nearest;
  }
  const roots = git(['rev-list', '--max-parents=0', local]);
  return roots ? roots.trim().split('\n')[0] : null;
}

function showAt(sha, file) {
  return git(['show', `${sha}:${file}`]);
}

function versionAt(sha, file) {
  if (!sha) return null;
  const text = showAt(sha, file);
  if (text === null) return null;
  try {
    return JSON.parse(text).version || null;
  } catch {
    return null;
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Removes what GitHub does not show as text: fenced code blocks, inline code, and HTML comments.
// A fence ends at a line with at least as many of its characters, or at the end of the file. An
// inline code span ends at the next run of as many backticks in the same paragraph.
function visibleText(markdown) {
  return markdown
    .replace(/^[ \t]*(([`~])\2{2,})[\s\S]*?(?:\n[ \t]*\1\2*[ \t]*$|(?![\s\S]))/gm, '')
    .replace(/(?<!`)(`+)[^`\n](?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

// Builds the heading anchors that GitHub makes for a Markdown file.
function anchorsOf(markdown) {
  const anchors = new Set();
  const seen = new Map();
  const body = visibleText(markdown);
  for (const line of body.split('\n')) {
    const heading = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      let text = heading[1]
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[`*~]/g, '');
      text = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
      const count = seen.get(text) || 0;
      seen.set(text, count + 1);
      anchors.add(count ? `${text}-${count}` : text);
    }
    for (const explicit of line.matchAll(/<a\s[^>]*?(?:name|id)=["']([^"']+)["']/gi)) {
      anchors.add(explicit[1].toLowerCase());
    }
  }
  return anchors;
}

// Lists the targets of inline links, reference definitions, and the href of <a> and src of <img>.
function linksOf(markdown) {
  const body = visibleText(markdown);
  const found = [];
  for (const match of body.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
    found.push(match[1]);
  }
  for (const match of body.matchAll(/^ {0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm)) {
    found.push(match[1]);
  }
  for (const match of body.matchAll(/<(?:a\b[^>]*?\shref|img\b[^>]*?\ssrc)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    found.push(match[1] ?? match[2]);
  }
  return found.filter(Boolean);
}

function check(local, remote, remoteName = 'origin') {
  const failures = [];
  const fail = (message) => failures.push(message);

  const packageVersion = versionAt(local, 'package.json');
  const manifestVersion = versionAt(local, 'extension/manifest.json');
  if (!packageVersion && !manifestVersion) return { changed: false, failures };
  if (!remote || ZERO.test(remote) || !commitExists(remote)) remote = defaultBase(local, remoteName);
  const packageChanged = versionAt(remote, 'package.json') !== packageVersion;
  const manifestChanged = versionAt(remote, 'extension/manifest.json') !== manifestVersion;
  if (!packageChanged && !manifestChanged) return { changed: false, failures };
  // The docs are checked against the version in package.json, or against the manifest's version
  // when only the manifest changed.
  const newVersion = packageChanged && packageVersion ? packageVersion : manifestVersion || packageVersion;

  const files = new Set((git(['ls-tree', '-r', '--name-only', '-z', local], { fail: true }) || '')
    .split('\0').filter(Boolean));
  const markdownFiles = [...files]
    .filter((file) => /\.md$/i.test(file) && !/(^|\/)node_modules\//.test(file))
    .sort();
  const content = new Map(markdownFiles.map((file) => [file, showAt(local, file) || '']));

  // The changelog has a heading for the new version.
  const changelog = showAt(local, 'CHANGELOG.md');
  // A heading inside code or a comment does not count, and neither does a pre-release such as
  // 1.3.0-rc.1.
  const headingPattern = new RegExp(`^#{1,6}[ \\t]+\\[?v?${escapeRegExp(newVersion)}\\]?(?=[\\s(:]|$)`, 'm');
  if (changelog === null) fail('CHANGELOG.md does not exist.');
  else if (!headingPattern.test(visibleText(changelog))) {
    fail(`CHANGELOG.md has no heading for version ${newVersion}.`);
  }

  // The manifest version matches package.json.
  if (manifestVersion !== packageVersion) {
    fail(`extension/manifest.json has version ${manifestVersion || '(none)'}, but package.json has ${packageVersion || '(none)'}.`);
  }

  // The review record lists every tracked Markdown file at the new version.
  const reviewText = showAt(local, 'docs/doc-review.json');
  let review = null;
  if (reviewText === null) fail('docs/doc-review.json does not exist.');
  else {
    try {
      review = JSON.parse(reviewText).files;
      if (!review || typeof review !== 'object') throw new Error('it has no "files" object');
    } catch (error) {
      review = null;
      fail(`docs/doc-review.json is not valid: ${error.message}.`);
    }
  }
  if (review) {
    for (const file of markdownFiles) {
      if (!(file in review)) fail(`docs/doc-review.json does not list ${file}.`);
      else if (review[file] !== newVersion) {
        fail(`docs/doc-review.json lists ${file} at version ${review[file]}, not ${newVersion}.`);
      }
    }
    for (const file of Object.keys(review)) {
      if (!markdownFiles.includes(file)) {
        fail(`docs/doc-review.json lists ${file}, which is not a tracked Markdown file.`);
      }
    }
  }

  // No change under extension/ comes after the last change to the review record, whether or not
  // the push carries that change.
  if (reviewText !== null) {
    const reviewed = (git(['log', '-1', '--format=%H', local, '--', 'docs/doc-review.json']) || '').trim();
    const later = reviewed && (git(['rev-list', '-1', `${reviewed}..${local}`, '--', 'extension/']) || '').trim();
    if (later) {
      const short = git(['log', '-1', '--format=%h %s', later]).trim();
      fail(`docs/doc-review.json was last changed before the last change under extension/ (${short}). Review the docs again and update it.`);
    }
  }

  // Every relative link and anchor resolves.
  const anchors = new Map(markdownFiles.map((file) => [file, anchorsOf(content.get(file))]));
  for (const file of markdownFiles) {
    for (const link of linksOf(content.get(file))) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('//')) continue;
      const [rawPath, ...rest] = link.split('#');
      const fragment = rest.join('#');
      let target = rawPath.split('?')[0];
      try { target = decodeURIComponent(target); } catch { /* keep the raw text */ }
      const resolved = !target ? file
        : path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join(path.posix.dirname(file), target));
      const directory = resolved.replace(/\/+$/, '');
      const isFile = files.has(resolved);
      const isDirectory = directory === '.' || directory === ''
        || [...files].some((name) => name.startsWith(`${directory}/`));
      if (resolved.startsWith('..') || (!isFile && !isDirectory)) {
        fail(`${file} links to ${link}, but ${resolved} does not exist.`);
      } else if (fragment && isFile && anchors.has(resolved)) {
        let wanted = fragment;
        try { wanted = decodeURIComponent(fragment); } catch { /* keep the raw text */ }
        if (!anchors.get(resolved).has(wanted.toLowerCase())) {
          fail(`${file} links to ${link}, but ${resolved} has no heading #${fragment}.`);
        }
      }
    }
  }

  // Stated facts match: file sizes in bytes and the number of languages.
  for (const file of markdownFiles) {
    for (const match of content.get(file).matchAll(/`([^`\n]+\.[a-z]+)`,?\s+([\d,]+)\s+bytes/g)) {
      const stated = Number(match[2].replace(/,/g, ''));
      const name = [`extension/${match[1]}`, match[1]].find((candidate) => files.has(candidate));
      if (!name) {
        fail(`${file} states a size for ${match[1]}, but no such file exists.`);
        continue;
      }
      const actual = Number((git(['cat-file', '-s', `${local}:${name}`]) || '').trim());
      if (actual !== stated) {
        fail(`${file} says ${match[1]} is ${match[2]} bytes, but it is ${actual.toLocaleString('en-US')} bytes.`);
      }
    }
  }
  const locales = new Set();
  for (const name of files) {
    const folder = /^extension\/_locales\/([^/]+)\//.exec(name);
    if (folder) locales.add(folder[1]);
  }
  const otherLanguages = locales.size - (locales.has('en') ? 1 : 0);
  for (const file of markdownFiles) {
    for (const match of content.get(file).matchAll(/\b(\d+)\s+languages\s+besides\s+English/gi)) {
      if (Number(match[1]) !== otherLanguages) {
        fail(`${file} says ${match[1]} languages besides English, but extension/_locales has ${otherLanguages}.`);
      }
    }
  }

  return { changed: true, version: newVersion, failures };
}

function main() {
  const [local, remote, remoteName] = process.argv.slice(2);
  if (!local) {
    console.error('Usage: node scripts/check-release-docs.js <local-sha> [<remote-sha> [<remote-name>]]');
    process.exit(2);
  }
  if (ZERO.test(local)) process.exit(0); // The ref is being deleted.
  if (!commitExists(local)) {
    console.error(`check-release-docs: ${local} is not a commit in this repository.`);
    process.exit(2);
  }
  const { changed, version, failures } = check(local, remote, remoteName || 'origin');
  if (!changed || failures.length === 0) process.exit(0);
  console.error(`The push changes the version to ${version}, but the release docs are not ready:`);
  for (const message of failures) console.error(`  - ${message}`);
  console.error('Fix these and push again, or skip this check with git push --no-verify.');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { check };
