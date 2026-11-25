// Code colors in extension/lib/richtext.js. A span inside a code block may carry a color from the
// fixed palette, and nothing else survives of the span. Like richtext.spec.js, these tests load the
// file into a test page, because the cleaner parses HTML with the browser's own DOMParser.
'use strict';

const path = require('path');
const { test, expect } = require('./fixtures');

const EXTENSION_PATH = path.resolve(process.env.EXTENSION_PATH || path.join(__dirname, '..', '..', 'extension'));

async function loadCleaner(page) {
  await page.addScriptTag({ path: path.join(EXTENSION_PATH, 'lib', 'placeholders.js') });
  await page.addScriptTag({ path: path.join(EXTENSION_PATH, 'lib', 'richtext.js') });
}

/** Calls SnippetInserter.richText[name] in the page with JSON arguments. */
function call(page, name, ...args) {
  return page.evaluate(([fn, list]) => window.SnippetInserter.richText[fn](...list), [name, args]);
}

/** The elements and attributes in `html`: each entry is a tag name followed by its attribute names. */
function inventory(page, html) {
  return page.evaluate((source) => {
    const body = new DOMParser().parseFromString(source, 'text/html').body;
    return [...body.querySelectorAll('*')].map((el) => [el.localName, ...el.getAttributeNames()].join(' '));
  }, html);
}

const PALETTE = { keyword: '#2f7fc0', string: '#2f8f4e', number: '#c0602a', comment: '#7a7f87' };

function codeBlockOf(inner, language = '') {
  return `<pre><code${language ? ` class="language-${language}"` : ''}>${inner}</code></pre>`;
}

test('the palette is fixed', async ({ page }) => {
  await loadCleaner(page);
  expect(await page.evaluate(() => window.SnippetInserter.richText.COLORS)).toEqual(PALETTE);
});

test('keeps a palette color on a span in a code block, and writes the span itself', async ({ page }) => {
  await loadCleaner(page);
  const spellings = [
    'color:#2f7fc0',
    'color: #2F7FC0',
    'COLOR:#2f7fc0;',
    'color:rgb(47,127,192)',
    'color:rgba(47, 127, 192, 1)',
    'color:#2f7fc0 !important',
    'color:#2f7fc0;background:url(https://example.com/ping.png);position:fixed;font-size:90px',
  ];
  for (const style of spellings) {
    const input = codeBlockOf(`<span class="hljs-keyword" id="x" onclick="window.ran = true" style="${style}">let</span> a`, 'javascript');
    expect(await call(page, 'sanitize', input), style).toBe(codeBlockOf('<span style="color:#2f7fc0">let</span> a', 'javascript'));
  }
  for (const [name, hex] of Object.entries(PALETTE)) {
    expect(await call(page, 'sanitize', codeBlockOf(`<span style="color:${hex}">x</span>`)), name).toBe(
      codeBlockOf(`<span style="color:${hex}">x</span>`)
    );
  }
});

test('drops every color that is not in the palette and keeps the text', async ({ page }) => {
  await loadCleaner(page);
  const others = [
    'red',
    '#ff0000',
    '#2f7fc1',
    'rgb(47,127,193)',
    'rgba(47, 127, 192, 0.5)',
    'hsl(207, 61%, 46%)',
    'var(--keyword)',
    'inherit',
    'currentcolor',
    'transparent',
    'expression(alert(1))',
    'url(https://example.com/ping.png)',
    '#2f7fc0x',
    '#2f7fc',
    'rgb(47 127 192 / 50%)',
    '\\#2f7fc0',
    '',
  ];
  for (const value of others) {
    for (const style of [`color:${value}`, `background:${value};color:${value}`, `--color:#2f7fc0;color:${value}`, `background-color:${value}`]) {
      expect(await call(page, 'sanitize', codeBlockOf(`<span style="${style}">a</span>`)), style).toBe(codeBlockOf('a'));
    }
  }
  // Attributes and elements other than a span's style name no color.
  for (const input of [
    codeBlockOf('<span color="#2f7fc0">a</span>'),
    codeBlockOf('<font color="#2f7fc0">a</font>'),
    codeBlockOf('<span class="token keyword">a</span>'),
    codeBlockOf('<code style="color:#2f7fc0">a</code>'),
    '<pre style="color:#2f7fc0"><code>a</code></pre>',
    codeBlockOf('<b style="color:#2f7fc0">a</b>'),
  ]) {
    expect(await call(page, 'sanitize', input), input).toBe(codeBlockOf('a'));
  }
});

test('a color never leaves a code block, and never reaches text outside one', async ({ page }) => {
  await loadCleaner(page);
  const colored = 'style="color:#2f7fc0"';
  expect(await call(page, 'sanitize', `<span ${colored}>a</span><b ${colored}>b</b><code ${colored}>c</code><u ${colored}>d</u>`)).toBe(
    'a<b>b</b><code>c</code><u>d</u>'
  );
  expect(await call(page, 'sanitize', `<span ${colored}><pre>x</pre>y</span>`)).toBe(`${codeBlockOf('x')}y`);
  expect(await call(page, 'sanitize', `<ul><li><span ${colored}>a</span></li></ul>`)).toBe('<ul><li>a</li></ul>');
  expect(await call(page, 'sanitize', `${codeBlockOf(`<span ${colored}>a</span>`)}<span ${colored}>b</span>`)).toBe(
    `${codeBlockOf('<span style="color:#2f7fc0">a</span>')}b`
  );
});

test('nested spans take the color of the innermost one that has a palette color', async ({ page }) => {
  await loadCleaner(page);
  const input = codeBlockOf(
    '<span style="color:#2f7fc0">a<span style="color:#c0602a">b</span><span>c</span><span style="color:red">d</span></span>e'
  );
  expect(await call(page, 'sanitize', input)).toBe(
    codeBlockOf('<span style="color:#2f7fc0">a</span><span style="color:#c0602a">b</span><span style="color:#2f7fc0">cd</span>e')
  );
});

test('colors are idempotent, hold no text of their own, and leave the plain text alone', async ({ page }) => {
  await loadCleaner(page);
  const input = codeBlockOf('<span style="color:#2f8f4e">"a"</span>:<br><span style="color:#c0602a">1</span>', 'json');
  const once = await call(page, 'sanitize', input);
  expect(await call(page, 'sanitize', once)).toBe(once);
  expect(await call(page, 'toText', once)).toBe('"a":\n1');
  expect(await call(page, 'sanitize', once, { pasted: true })).toBe(once);
  const clean = await call(page, 'clean', once);
  expect(clean.formatted).toBe(true);
  expect(clean.text).toBe('"a":\n1');
  for (const entry of await inventory(page, once)) expect(entry).toMatch(/^(pre|code class|span style|br)$/);
});

test('a code block with colors goes to another editor as a paste, with its colors', async ({ page }) => {
  await loadCleaner(page);
  const html = codeBlockOf('<span style="color:#2f7fc0">let</span> a  = 1;', 'javascript');
  expect(await call(page, 'forPaste', html, { left: true })).toBe(html);
  const expanded = await page.evaluate(
    (source) => window.SnippetInserter.richText.expand(source, { now: new Date(2026, 10, 20, 10, 0) }),
    codeBlockOf('<span style="color:#c0602a">{date:iso}</span>', 'javascript')
  );
  expect(expanded.html).toMatch(/^<pre><code class="language-javascript"><span style="color:#c0602a">2026-11-20<\/span><\/code><\/pre>$/);
});

test('colorCode writes the colors a colorizer names, and ignores every bad range', async ({ page }) => {
  await loadCleaner(page);
  const out = await page.evaluate(() => {
    const seen = [];
    const colorize = (language, text) => {
      seen.push([language, text]);
      return [
        [0, 1, 'keyword'],
        [2, 3, '__proto__'],
        [3, 4, 'toString'],
        [-5, 0, 'number'],
        [1, 2, 'nope'],
        ['x', 'y', 'keyword'],
        [4, 4, 'string'],
        [6, 5, 'string'],
        [5, 6, 'comment'],
        [7, 9999, 'string'],
        [NaN, 3, 'string'],
        [1.5, 3, 'string'],
        null,
        'x',
      ];
    };
    const html = window.SnippetInserter.richText.colorCode(
      '<pre><code class="language-json">abc<br>def<br>gh</code></pre>between<pre>plain</pre><ul><li><pre><code class="language-css">ab</code></pre></li></ul>',
      colorize
    );
    return { html, seen };
  });
  expect(out.seen).toEqual([
    ['json', 'abc\ndef\ngh'],
    ['css', 'ab'],
  ]);
  expect(out.html).toBe(
    '<pre><code class="language-json"><span style="color:#2f7fc0">a</span>bc<br>d<span style="color:#7a7f87">e</span>f<br><span style="color:#2f8f4e">gh</span></code></pre>' +
      'between<pre><code>plain</code></pre><ul><li><pre><code class="language-css"><span style="color:#2f7fc0">a</span>b</code></pre></li></ul>'
  );
});

test('colorCode spans a color over a line break and removes old colors from blocks without a language', async ({ page }) => {
  await loadCleaner(page);
  const html = await page.evaluate(() =>
    window.SnippetInserter.richText.colorCode(
      '<pre><code class="language-javascript">/* a<br>b */ x</code></pre><pre><span style="color:#2f7fc0">old</span></pre>' +
        '<pre><code class="language-sql"><span style="color:#2f7fc0">old</span> text</code></pre>',
      (language) => (language === 'javascript' ? [[0, 9, 'comment']] : [])
    )
  );
  expect(html).toBe(
    '<pre><code class="language-javascript"><span style="color:#7a7f87">/* a</span><br><span style="color:#7a7f87">b */</span> x</code></pre>' +
      '<pre><code>old</code></pre><pre><code class="language-sql">old text</code></pre>'
  );
});
