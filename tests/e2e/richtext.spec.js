// Unit tests for extension/lib/richtext.js, the cleaner for formatted snippets. They run in
// Chromium because the cleaner parses HTML with the browser's own DOMParser. The file is loaded
// into a test page, so the extension's own pages are not involved.
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

/**
 * The elements and attributes in `html`, read with the browser's parser: each entry is a tag name
 * followed by its attribute names.
 */
function inventory(page, html) {
  return page.evaluate((source) => {
    const body = new DOMParser().parseFromString(source, 'text/html').body;
    return [...body.querySelectorAll('*')].map((el) => [el.localName, ...el.getAttributeNames()].join(' '));
  }, html);
}

const ALLOWED = /^(b|i|u|br|ul|ol|li|pre|a href|code|code class)$/;

// Hostile input, and the HTML the cleaner keeps from it.
const HOSTILE = [
  ['<p>Hi<script>alert(1)</script> there</p>', 'Hi there'],
  ['<style>b { color: red }</style><b>x</b>', '<b>x</b>'],
  ['<template><b>t</b></template>ok', 'ok'],
  ['ok<noscript><b>n</b></noscript>', 'ok'],
  ['<iframe srcdoc="<script>parent.ran = true</script>"></iframe>ok', 'ok'],
  ['<object data="x.swf"><b>fallback</b></object><embed src="x.swf">ok', 'ok'],
  ['<svg><a href="https://example.com/"><text>svg</text></a><script>alert(1)</script></svg>ok', 'ok'],
  ['<svg><foreignObject><b>inside</b></foreignObject></svg>ok', 'ok'],
  ['<math><mtext><b>m</b></mtext><mglyph><style><img src=x onerror="window.ran = true"></style></mglyph></math>ok', 'ok'],
  ['<img src=x onerror="window.ran = true">ok', 'ok'],
  ['<video><source src=x></video><audio src=x></audio><canvas></canvas><picture></picture>ok', 'ok'],
  ['<form><input value="secret"><button>Go</button><select><option>o</option></select><textarea>t</textarea></form>ok', 'ok'],
  // The parser ignores the inner form, so its end tag closes the outer one.
  ['<form id="a"><form id="b"><input name="x"></form>text</form>after', 'textafter'],
  [
    '<b onclick="window.ran = true" onmouseover="x">bold</b> <a href="https://example.com/" onclick="window.ran = true" style="color:red" id="x" class="y" target="_blank" rel="opener">link</a>',
    '<b>bold</b> <a href="https://example.com/">link</a>',
  ],
  ['<a href="javascript:alert(1)">a</a>', 'a'],
  ['<a href=" JAVASCRIPT:alert(1)">b</a>', 'b'],
  ['<a href="jav&#x09;ascript:alert(1)">c</a>', 'c'],
  ['<a href="java\nscript:alert(1)">d</a>', 'd'],
  ['<a href="&#106;avascript&colon;alert(1)">e</a>', 'e'],
  ['<a href="data:text/html,<script>alert(1)</script>">f</a>', 'f'],
  ['<a href="vbscript:msgbox(1)">g</a><a href="blob:https://example.com/0f">h</a><a href="file:///etc/passwd">i</a>', 'ghi'],
  ['<a href="chrome-extension://abcdefgh/options.html">j</a><a href="//example.com/x">k</a><a href="/relative">l</a>', 'jkl'],
  [
    '<span style="background:url(https://example.com/x.png);font-weight:700">s</span><span style="width:expression(alert(1))">e</span><b style="font-weight:normal">n</b>',
    '<b>s</b>en',
  ],
  ['a<!-- <script>alert(1)</script> -->b<!--><img src=x onerror="window.ran = true">-->c', 'ab--&gt;c'],
  ['<!--[if gte mso 9]><xml><o:p>x</o:p></xml><![endif]-->d<![if !supportLists]>*<![endif]>e', 'd*e'],
  ['&lt;script&gt;alert(1)&lt;/script&gt;', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['&amp;lt;b&amp;gt; &#60;img src=x onerror=alert(1)&#62;', '&amp;lt;b&amp;gt; &lt;img src=x onerror=alert(1)&gt;'],
  // </p> leaves the SVG, so the style element that follows is HTML and holds the start of the
  // attribute, and the image is an HTML image.
  ['<svg></p><style><a id="</style><img src=1 onerror="window.ran = true">">', '&quot;&gt;'],
  ['<math><mtext><table><mglyph><style><img src=x onerror="window.ran = true">', ''],
  ['<noscript><p title="</noscript><img src=x onerror=window.ran=true>">', ''],
  ['<div hidden>hidden</div><span style="display:none">gone</span>seen', 'seen'],
];

test('drops scripts, styles, embedded content, form controls, foreign content, and comments', async ({ page }) => {
  await loadCleaner(page);
  for (const [input, expected] of HOSTILE) {
    expect(await call(page, 'sanitize', input), input).toBe(expected);
  }
});

test('keeps no attribute but a checked href and a code language, and is idempotent', async ({ page }) => {
  await loadCleaner(page);
  const extra = [
    '<pre class="x" style="color:red"><code class="language-js hljs" data-x="1">let a;</code></pre>',
    '<ul type="disc" onclick="x"><li value="3">a</li></ul><ol start="5"><li>b</li></ol>',
  ];
  for (const input of [...HOSTILE.map(([html]) => html), ...extra]) {
    for (const pasted of [false, true]) {
      const once = await call(page, 'sanitize', input, { pasted });
      for (const entry of await inventory(page, once)) expect(entry, input).toMatch(ALLOWED);
      expect(await call(page, 'sanitize', once), input).toBe(once);
    }
  }
  expect(await call(page, 'sanitize', extra[0])).toBe('<pre><code class="language-javascript">let a;</code></pre>');
});

test('runs no script and loads nothing while it reads hostile input', async ({ page }) => {
  await loadCleaner(page);
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('/ping')) requests.push(request.url());
  });
  await page.evaluate((inputs) => {
    window.ran = false;
    for (const input of inputs) window.SnippetInserter.richText.sanitize(input, { pasted: true });
  }, [...HOSTILE.map(([html]) => html), '<img src="/ping.png"><video poster="/ping-video.png"></video><link rel=stylesheet href="/ping.css">']);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.ran)).toBe(false);
  expect(requests).toEqual([]);
});

test('keeps links to http, https, mailto, and tel, with braces written as escapes', async ({ page }) => {
  await loadCleaner(page);
  expect(await call(page, 'normalizeUrl', 'https://example.com/a?b={c}')).toBe('https://example.com/a?b=%7Bc%7D');
  expect(await call(page, 'normalizeUrl', 'http://example.com')).toBe('http://example.com/');
  expect(await call(page, 'normalizeUrl', 'mailto:me@example.com')).toBe('mailto:me@example.com');
  expect(await call(page, 'normalizeUrl', 'tel:+15551234')).toBe('tel:+15551234');
  for (const bad of ['javascript:alert(1)', 'mailto:', 'example.com', 'ftp://example.com/', `https://example.com/${'a'.repeat(2100)}`]) {
    expect(await call(page, 'normalizeUrl', bad), bad).toBeNull();
  }
});

test('reads formatting from pasted HTML', async ({ page }) => {
  await loadCleaner(page);
  const cases = [
    // Google Docs wraps a copy in a bold element that is not bold, and marks bold text by its style.
    [
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><span style="font-weight:700;">Bold</span><span style="font-weight:400;"> plain</span></b>',
      '<b>Bold</b> plain',
    ],
    ['<p>  Hello\n   <strong>world</strong>  </p>\n<p>again</p>', 'Hello <b>world</b><br>again'],
    ['<em>i</em><ins>u</ins><kbd>k</kbd><span style="font-style:italic;text-decoration:underline">iu</span>', '<i>i</i><u>u</u><code>k</code><i><u>iu</u></i>'],
    ['<h1>Title</h1><table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>', 'Title<br>a b<br>c'],
    ['<ul><li>a</li><ul><li>b</li></ul></ul>', '<ul><li>a<ul><li>b</li></ul></li></ul>'],
    [`${'<ul><li>'.repeat(6)}deep${'</li></ul>'.repeat(6)}`, '<ul><li><ul><li><ul><li>deep</li></ul></li></ul></li></ul>'],
    ['<pre><code class="language-js">function f() {\n\treturn  1;\n}\n</code></pre>', '<pre><code class="language-javascript">function f() {<br>\treturn  1;<br>}</code></pre>'],
    ['<div style="white-space:pre">  two  spaces</div>', '  two  spaces'],
    ['a&nbsp;&nbsp; b', 'a   b'],
  ];
  for (const [input, expected] of cases) {
    expect(await call(page, 'sanitize', input, { pasted: true }), input).toBe(expected);
  }
});

test('survives deep nesting', async ({ page }) => {
  await loadCleaner(page);
  const result = await page.evaluate(() => {
    const richText = window.SnippetInserter.richText;
    return [
      richText.sanitize(`${'<div>'.repeat(20000)}text${'</div>'.repeat(20000)}`),
      richText.sanitize(`${'<b>'.repeat(20000)}bold${'</b>'.repeat(20000)}`),
      richText.sanitize(`${'<span>'.repeat(20000)}<script>window.ran = true</script>end`),
    ];
  });
  expect(result).toEqual(['text', '<b>bold</b>', 'end']);
});

test('turns formatting into plain text and plain text into HTML', async ({ page }) => {
  await loadCleaner(page);
  const html =
    '<ul><li>One</li><li>Two<br>more<ul><li>Sub</li></ul></li></ul><ol><li>First</li><li>Second</li></ol>' +
    'Visit <a href="https://example.com/">our site</a>, <a href="https://example.com/">https://example.com</a>, ' +
    'or <a href="mailto:me@example.com">me@example.com</a>, call <a href="tel:+15551234">us</a>.' +
    '<pre><code>  indented\tcode\n\nend</code></pre>';
  expect(await call(page, 'toText', html)).toBe(
    '• One\n• Two\n  more\n  • Sub\n1. First\n2. Second\n' +
      'Visit our site (https://example.com/), https://example.com, or me@example.com, call us (+15551234).\n' +
      '  indented\tcode\n\nend'
  );
  for (const text of ['a\tb  c\n\n  d', 'trailing line\n', '\n\nlead', '   ', 'x']) {
    const formatted = await call(page, 'fromText', text);
    expect(await call(page, 'toText', formatted), JSON.stringify(text)).toBe(text);
    expect(await call(page, 'hasFormatting', formatted)).toBe(false);
    expect(await call(page, 'sanitize', formatted)).toBe(formatted);
  }
  expect(await call(page, 'fromText', 'a < b & c\nnext')).toBe('a &lt; b &amp; c<br>next');
  expect(await call(page, 'hasFormatting', '<b>x</b>')).toBe(true);
  expect(await call(page, 'hasFormatting', '<pre>x</pre>')).toBe(true);
  // The DOM version matches the HTML.
  expect(
    await page.evaluate((source) => {
      const box = document.createElement('div');
      box.append(window.SnippetInserter.richText.toFragment(source, document, { titles: true }));
      return box.innerHTML;
    }, '<b>a</b><a href="https://example.com/">b</a><br><br>')
  ).toBe('<b>a</b><a href="https://example.com/" title="https://example.com/">b</a><br><br>');
});

test('fills placeholders in formatted text with values as text', async ({ page }) => {
  await loadCleaner(page);
  const expanded = await page.evaluate(() =>
    window.SnippetInserter.richText.expand('<b>Dear {input:Name}</b>, on {da<i>te:iso}</i> we<br>{cursor}<u>end</u>', {
      values: { Name: '<i>x</i>' },
      now: new Date(2026, 10, 24, 9, 30),
    })
  );
  expect(expanded).toEqual({
    html: '<b>Dear &lt;i&gt;x&lt;/i&gt;</b>, on 2026-11-24 we<br><u>end</u>',
    cursorFromEnd: 3,
  });
  const cursorInList = await call(page, 'expand', '<b>ab{cursor}c</b><ul><li>d</li></ul>');
  expect(cursorInList.cursorFromEnd).toBe(3);
});

test('prepares HTML for a paste into another editor', async ({ page }) => {
  await loadCleaner(page);
  expect(await call(page, 'forPaste', 'a  <b>b</b>', { left: true, right: true })).toBe('&nbsp;a &nbsp;<b>b</b>&nbsp;');
  expect(await call(page, 'forPaste', 'a\tb<pre><code>  x\ty</code></pre>')).toBe(
    'a<span style="white-space:pre">\t</span>b<pre><code>  x\ty</code></pre>'
  );
  expect(await call(page, 'forPaste', '<ul><li>a</li></ul>', { left: true, right: true, suffix: ' ' })).toBe('<ul><li>a</li></ul>');
  expect(await call(page, 'forPaste', 'a<br><br>', { suffix: '\n' })).toBe('a<br><br>');
  expect(await call(page, 'fragment', 'a<br><br>')).toBe('a<br>');
});

test('includes other snippets in formatted text and renames references across formatting', async ({ page }) => {
  await loadCleaner(page);
  const snippets = [
    { id: 'p', content: 'Hi {snippet:;s}! {snippet:;t} end {snippet:;p}', html: '<b>Hi {snippet:;s}</b>! <i>{snippet:;t}</i> end {snippet:;p}' },
    { id: 's', abbreviation: ';s', content: 'Sam', html: '<u>Sam</u>' },
    { id: 't', abbreviation: ';t', content: 'line1\nline2 {snippet:;s}' },
  ];
  expect(await call(page, 'resolve', snippets[0], snippets)).toBe(
    '<b>Hi <u>Sam</u></b>! <i>line1</i><br><i>line2 Sam</i> end {snippet:;p}'
  );
  expect(await call(page, 'renameText', '<b>{snippet:;s</b>ig} and {snippet:;sig}', '{snippet:;sig}', '{snippet:;sign}')).toBe(
    '<b>{snippet:;sign}</b> and {snippet:;sign}'
  );
});
