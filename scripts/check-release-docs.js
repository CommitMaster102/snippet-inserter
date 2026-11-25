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

// Measures the spaces and tabs at the start of text in columns, with a tab stop every 4 columns
// counted from the column where the text starts. Returns the width and the text after them.
function leading(text, start = 0) {
  let column = start;
  let i = 0;
  for (; text[i] === ' ' || text[i] === '\t'; i++) {
    column = text[i] === '\t' ? column + 4 - (column % 4) : column + 1;
  }
  return { width: column - start, rest: text.slice(i) };
}

// Names the block that a line starts, or returns null for a line of paragraph text. rel is the
// line's indent past the list item that holds it. When the line would interrupt a paragraph, a
// list item must be a bullet or start at 1, and it must have text.
function blockStart(rest, rel, interrupting) {
  if (rel > 3) return null;
  if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(rest)) return 'break';
  const item = /^(?:[-+*]|(\d{1,9})[.)])(?=[ \t]|$)/.exec(rest);
  if (item && !(interrupting && ((item[1] && Number(item[1]) !== 1) || !rest.slice(item[0].length).trim()))) {
    return 'item';
  }
  if (/^(?:`{3,}(?!.*`)|~{3,})/.test(rest)) return 'fence';
  if (rest.startsWith('<!--')) return 'comment';
  if (/^#{1,6}(?:[ \t]|$)/.test(rest)) return 'heading';
  return null;
}

// Splits Markdown into the headings and paragraphs that GitHub reads as Markdown text, as
// { level, text } with level 0 for a paragraph. It leaves out fenced code blocks, indented code
// blocks, and HTML comment blocks. It follows list items far enough to tell an indented paragraph
// in an item from indented code; block quotes and setext headings are read as paragraph text.
function blocksOf(markdown) {
  const blocks = [];
  let paragraph = [];
  let prev = 'blank'; // What the last line was: 'blank', 'paragraph', or 'other'.
  let fence = null; // The open fenced code block, as { base, close }.
  let comment = false; // Whether an HTML comment block is open.
  let indented = false; // Whether an indented code block is open.
  let items = []; // The content indent of each open list item, outermost first.
  const end = (next) => {
    if (paragraph.length) blocks.push({ level: 0, text: paragraph.join('\n') });
    paragraph = [];
    prev = next;
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) {
      end('blank');
      continue;
    }
    let { width: column, rest } = leading(line);
    if (fence && column < fence.base) {
      // The list item that holds the fence has ended, and so has the fence.
      fence = null;
      prev = 'other';
    }
    if (fence) {
      if (column - fence.base <= 3 && fence.close.test(rest)) {
        fence = null;
        prev = 'other';
      }
      continue;
    }
    if (comment) {
      if (line.includes('-->')) {
        comment = false;
        prev = 'other';
      }
      continue;
    }
    let open = items;
    while (open.length && open[open.length - 1] > column) open = open.slice(0, -1);
    let base = open.length ? open[open.length - 1] : 0;
    if (indented && column - base >= 4) {
      items = open;
      continue;
    }
    indented = false;
    let kind = blockStart(rest, column - base, prev === 'paragraph' && open.length === items.length);
    // A line that starts no other block continues the paragraph before it, even when it is
    // indented less than the list item that holds that paragraph.
    if (prev === 'paragraph' && !kind) {
      paragraph.push(rest);
      continue;
    }
    items = open;
    // A list item marker opens an item, and the rest of the line is read as the item's first line.
    while (kind === 'item') {
      const marker = /^(?:[-+*]|\d{1,9}[.)])/.exec(rest)[0];
      const after = leading(rest.slice(marker.length), column + marker.length);
      base = column + marker.length + (!after.rest || after.width > 4 ? 1 : after.width);
      items = [...items, base];
      end('blank');
      column += marker.length + after.width;
      rest = after.rest;
      kind = rest ? blockStart(rest, column - base, false) : null;
    }
    if (!rest) continue;
    if (column - base >= 4) {
      end('other');
      indented = true;
    } else if (kind === 'break') {
      end('other');
    } else if (kind === 'fence') {
      end('other');
      const run = /^(`+|~+)/.exec(rest)[1];
      fence = { base, close: new RegExp(`^${run[0]}{${run.length},}[ \\t]*$`) };
    } else if (kind === 'comment') {
      end('other');
      comment = !rest.includes('-->');
    } else if (kind === 'heading') {
      end('other');
      const [, hashes, text] = /^(#{1,6})(?:[ \t]+|$)(.*)$/.exec(rest);
      blocks.push({ level: hashes.length, text: text.replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim() });
    } else {
      paragraph.push(rest);
      prev = 'paragraph';
    }
  }
  end('blank');
  return blocks;
}

// Splits the text of one heading or paragraph into code spans and other text, as { code, text },
// and drops HTML comments. A code span ends at the next run of as many backticks; a run with no
// match, or a backtick after a backslash, is plain text. Like GitHub, it turns line breaks in a
// code span into spaces and strips one space from both ends.
function segmentsOf(text) {
  const segments = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && /[!-/:-@[-`{-~]/.test(text[i + 1] || '')) {
      plain += text.slice(i, i + 2);
      i += 2;
    } else if (text[i] === '`') {
      const run = /^`+/.exec(text.slice(i))[0];
      const close = new RegExp(`(?<!\`)\`{${run.length}}(?!\`)`, 'g');
      close.lastIndex = i + run.length;
      const match = close.exec(text);
      if (!match) {
        plain += run;
        i += run.length;
        continue;
      }
      let code = text.slice(i + run.length, match.index).replace(/\n/g, ' ');
      if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
      segments.push({ code: false, text: plain }, { code: true, text: code });
      plain = '';
      i = match.index + run.length;
    } else if (text.startsWith('<!--', i) && text.includes('-->', i + 2)) {
      i = text.indexOf('-->', i + 2) + 3;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  segments.push({ code: false, text: plain });
  return segments;
}

function plainText(segments) {
  return segments.filter((segment) => !segment.code).map((segment) => segment.text).join('');
}

// Returns the Markdown text that GitHub shows, without code blocks, inline code, or HTML
// comments, with a blank line between blocks.
function visibleText(markdown) {
  return blocksOf(markdown).map(({ text }) => plainText(segmentsOf(text))).join('\n\n');
}

// Builds the heading anchors that GitHub makes for a Markdown file. The text of inline code
// counts toward an anchor, but links and HTML tags count only by their text.
function anchorsOf(markdown) {
  const anchors = new Set();
  const seen = new Map();
  for (const { level, text } of blocksOf(markdown)) {
    const segments = segmentsOf(text);
    if (level) {
      // Inline code is held aside while links and tags are removed, so that code which looks like
      // a link or a tag stays as it is.
      const code = [];
      const words = segments
        .map((segment) => (segment.code ? `\uE000${code.push(segment.text) - 1}\uE001` : segment.text))
        .join('')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\uE000(\d+)\uE001/g, (_, index) => code[index]);
      const slug = words.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
      const count = seen.get(slug) || 0;
      seen.set(slug, count + 1);
      anchors.add(count ? `${slug}-${count}` : slug);
    }
    for (const explicit of plainText(segments).matchAll(/<a\s[^>]*?(?:name|id)=["']([^"']+)["']/gi)) {
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
  // A reference definition starts its own line in the source and holds nothing after its
  // destination except an optional title. A list item such as "- [Esc]: closes the panel" reads
  // "[Esc]: closes the panel" once visibleText drops the list marker, so the source line is
  // checked as well.
  const definitionLines = new Set(markdown.split(/\r?\n/)
    .filter((line) => /^ {0,3}\[[^\]]+\]:/.test(line))
    .map((line) => line.trim()));
  const definition = /^ {0,3}\[[^\]]+\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/gm;
  for (const match of body.matchAll(definition)) {
    if (definitionLines.has(match[0].trim())) found.push(match[1]);
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
  const headingPattern = new RegExp(`^\\[?v?${escapeRegExp(newVersion)}\\]?(?=[\\s(:]|$)`);
  const headings = changelog === null ? [] : blocksOf(changelog).filter(({ level }) => level);
  if (changelog === null) fail('CHANGELOG.md does not exist.');
  else if (!headings.some(({ text }) => headingPattern.test(plainText(segmentsOf(text))))) {
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
