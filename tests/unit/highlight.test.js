// Unit tests for extension/lib/highlight.js, which finds the syntax colors of a code block with the
// bundled Prism 1.30.0, and for the fixed palette in extension/lib/richtext.js.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The manager loads these files in this order.
globalThis.Prism = { manual: true, disableWorkerMessageHandler: true };
const VENDOR = path.join(__dirname, '..', '..', 'extension', 'vendor', 'prism');
const ORDER = ['core', 'markup', 'css', 'css-extras', 'clike', 'javascript', 'typescript', 'json', 'python', 'sql', 'bash'];
for (const name of ORDER) require(path.join(VENDOR, `prism-${name}.js`));

const highlight = require('../../extension/lib/highlight.js');
const richText = require('../../extension/lib/richtext.js');

/** The colored pieces of `code`, as { text: color name }, in order. */
function colored(language, code) {
  return highlight.colorize(language, code).map(([start, end, name]) => [code.slice(start, end), name]);
}

function expectColors(language, code, expected) {
  const found = colored(language, code);
  for (const [text, name] of expected) {
    assert.ok(
      found.some(([piece, color]) => piece === text && color === name),
      `${language}: expected ${JSON.stringify(text)} to be ${name}; found ${JSON.stringify(found)}`
    );
  }
}

test('JSON: keys and literals, strings, numbers, and comments', () => {
  expectColors('json', '{"name": "Ana", "n": -12.5e3, "ok": true, "x": null} // note\n/* more */', [
    ['"name"', 'keyword'],
    ['"Ana"', 'string'],
    ['-12.5e3', 'number'],
    ['true', 'keyword'],
    ['null', 'keyword'],
    ['// note', 'comment'],
    ['/* more */', 'comment'],
  ]);
});

test('JavaScript', () => {
  expectColors('javascript', '// hi\nconst a = "x" + 42; /* c */ function f() { return `t`; }', [
    ['// hi', 'comment'],
    ['const', 'keyword'],
    ['"x"', 'string'],
    ['42', 'number'],
    ['/* c */', 'comment'],
    ['function', 'keyword'],
    ['return', 'keyword'],
    ['`t`', 'string'],
  ]);
});

test('TypeScript', () => {
  expectColors('typescript', "interface A { n: number } // c\nlet s: string = 'x'; const n = 0x1F;", [
    ['interface', 'keyword'],
    ['// c', 'comment'],
    ['let', 'keyword'],
    ["'x'", 'string'],
    ['const', 'keyword'],
    ['0x1F', 'number'],
  ]);
});

test('Python', () => {
  expectColors('python', '# c\ndef f(x):\n    return "s" + \'u\' if x else 7.5', [
    ['# c', 'comment'],
    ['def', 'keyword'],
    ['return', 'keyword'],
    ['"s"', 'string'],
    ["'u'", 'string'],
    ['if', 'keyword'],
    ['else', 'keyword'],
    ['7.5', 'number'],
  ]);
});

test('HTML', () => {
  expectColors('html', '<!-- c -->\n<a href="x" class=\'y\'>t</a>', [
    ['<!-- c -->', 'comment'],
    ['<a', 'keyword'],
    ['="x"', 'string'],
    ["='y'", 'string'],
    ['</a', 'keyword'],
  ]);
});

test('CSS', () => {
  expectColors('css', '/* c */\n@media screen { a { color: #fff; margin: 10px; content: "x" } }', [
    ['/* c */', 'comment'],
    ['@media', 'keyword'],
    ['color', 'keyword'],
    ['#fff', 'number'],
    ['10', 'number'],
    ['"x"', 'string'],
  ]);
});

test('SQL', () => {
  expectColors('sql', "-- c\nSELECT name, 42 FROM t WHERE x = 'y' /* z */;", [
    ['-- c', 'comment'],
    ['SELECT', 'keyword'],
    ['42', 'number'],
    ['FROM', 'keyword'],
    ['WHERE', 'keyword'],
    ["'y'", 'string'],
    ['/* z */', 'comment'],
  ]);
});

test('Shell', () => {
  expectColors('shell', '# c\nif [ -f "$x" ]; then echo \'hi\' 3; fi', [
    ['# c', 'comment'],
    ['if', 'keyword'],
    ['"$x"', 'string'],
    ['then', 'keyword'],
    ["'hi'", 'string'],
    ['3', 'number'],
    ['fi', 'keyword'],
  ]);
});

test('every color is a name in the palette, and ranges stay inside the text and do not overlap', () => {
  const samples = {
    json: '{"a": [1, 2, {"b": null}]}',
    javascript: 'let a = `x ${1 + 2} y`; // c',
    typescript: 'type T = { a: string }; const x = <T>{};',
    python: 'x = f"{1}"  # c',
    html: '<p class="a">&amp; <!-- c --></p>',
    css: 'a { b: calc(1px + 2%) !important }',
    sql: "SELECT 'a' FROM t",
    shell: 'echo "$(ls) 1"',
  };
  for (const [language, code] of Object.entries(samples)) {
    let last = 0;
    for (const [start, end, name] of highlight.colorize(language, code)) {
      assert.ok(Object.hasOwn(richText.COLORS, name), `${language}: ${name}`);
      assert.ok(start >= last && end > start && end <= code.length, `${language}: ${start}-${end}`);
      last = end;
    }
  }
});

test('a language with no grammar, a missing language, and a very long block get no colors', () => {
  assert.deepEqual(highlight.colorize('cobol', 'MOVE 1 TO X'), []);
  assert.deepEqual(highlight.colorize('', 'if (a) { b }'), []);
  assert.deepEqual(highlight.colorize('__proto__', 'if (a) { b }'), []);
  assert.deepEqual(highlight.colorize('constructor', 'x'), []);
  assert.deepEqual(highlight.colorize('javascript', `// ${'a'.repeat(highlight.MAX_CODE_LENGTH)}`), []);
  assert.ok(highlight.colorize('javascript', `// ${'a'.repeat(100)}`).length > 0);
});

test('a hostile block of code is colored in a short time', () => {
  const started = Date.now();
  for (const language of Object.keys({ json: 1, javascript: 1, typescript: 1, python: 1, html: 1, css: 1, sql: 1, shell: 1 })) {
    highlight.colorize(language, '"'.repeat(5000));
    highlight.colorize(language, '/*'.repeat(5000));
    highlight.colorize(language, '<a '.repeat(3000));
    highlight.colorize(language, "'\\".repeat(4000));
  }
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
});

// WCAG contrast ratio of two colors written as #rrggbb.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test('each palette color reads on a white and on a near-black background', () => {
  const ratios = {};
  for (const [name, hex] of Object.entries(richText.COLORS)) {
    assert.match(hex, /^#[0-9a-f]{6}$/);
    ratios[name] = [contrast(hex, '#ffffff'), contrast(hex, '#111213')];
    // No pair of colors can reach 4.5 on both backgrounds; 4.0 is within a few percent of the best
    // that any color can do on both.
    assert.ok(ratios[name][0] >= 4 && ratios[name][1] >= 4, `${name}: ${ratios[name]}`);
  }
  assert.equal(new Set(Object.values(richText.COLORS)).size, 4);
  console.log(Object.entries(ratios).map(([name, [light, dark]]) => `${name} ${richText.COLORS[name]} ${light.toFixed(2)}:1 on #ffffff, ${dark.toFixed(2)}:1 on #111213`).join('\n'));
});
