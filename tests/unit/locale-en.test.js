// Unit tests for the English message catalog, extension/_locales/en/messages.json, and for the
// places that use it. A translation is checked against this file later, so it has to be sound.
// Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read, messages, usedKeys, PLURAL_SUFFIX } = require('../shared/locale-files.js');
// Keys that describe the language itself and are read by lib/i18n.js, not shown anywhere.
const META_KEYS = ['localeCode', 'textDirection', 'languageName'];

test('every message has a note for translators and a text', () => {
  for (const [key, entry] of Object.entries(messages)) {
    assert.match(key, /^[A-Za-z0-9_]+$/, key);
    assert.equal(typeof entry.message, 'string', key);
    assert.ok(entry.message.length > 0, key);
    assert.ok(typeof entry.description === 'string' && entry.description.length >= 10, `${key} needs a description`);
  }
});

test('every $placeholder$ is defined, every definition is used, and substituted ones are numbered from 1', () => {
  for (const [key, entry] of Object.entries(messages)) {
    const text = entry.message.replace(/\$\$/g, '');
    const used = new Set([...text.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((m) => m[1].toLowerCase()));
    const defined = Object.keys(entry.placeholders || {});
    assert.deepEqual([...used].sort(), defined.map((name) => name.toLowerCase()).sort(), key);
    assert.equal(text.replace(/\$([A-Za-z0-9_@]+)\$/g, '').includes('$'), false, `${key} has a stray $`);
    const numbers = defined
      .map((name) => /^\$([1-9])$/.exec(entry.placeholders[name].content))
      .filter(Boolean)
      .map((m) => Number(m[1]))
      .sort();
    assert.deepEqual(numbers, numbers.map((_, i) => i + 1), `${key} numbers its substitutions from 1`);
  }
});

test('a plural message has an _other form', () => {
  for (const key of Object.keys(messages)) {
    if (PLURAL_SUFFIX.test(key)) assert.ok(messages[key.replace(PLURAL_SUFFIX, '_other')], `${key} needs an _other form`);
  }
});

test('a message that counts a number it is given is a plural family', () => {
  // A position needs no plural, and these messages are only ever given one fixed number.
  const exceptions = new Set(['jsonPosition', 'moved', 'abbreviationLength', 'jsonTooDeep']);
  for (const [key, entry] of Object.entries(messages)) {
    if (PLURAL_SUFFIX.test(key) || exceptions.has(key)) continue;
    for (const [name, definition] of Object.entries(entry.placeholders || {})) {
      const counted = /^\$[1-9]$/.test(definition.content) && /^\d[\d,]*$/.test(definition.example || '');
      assert.ok(!counted, `${key} is given the number $${name.toUpperCase()}$, so it needs plural forms`);
    }
  }
});

test('key names and the name JSON are placeholders in every message', () => {
  // In these messages Enter is the verb, not the key, and keyCtrl is the key name itself.
  const exceptions = new Set(['placeholderContent', 'placeholderTitle', 'folderNameRequired', 'siteEnter', 'keyCtrl']);
  for (const [key, entry] of Object.entries(messages)) {
    if (exceptions.has(key)) continue;
    const text = entry.message.replace(/\$[A-Za-z0-9_@]+\$/g, '');
    assert.doesNotMatch(text, /\b(Ctrl|Cmd|Shift|Alt|Enter|Esc|Tab|Space|JSON)\b/, `${key} names a key or JSON outside a placeholder`);
  }
});

test('the scripts take the name of the Ctrl key from the catalog', () => {
  for (const file of ['panel.js', 'options.js', 'content-main.js']) {
    const code = read(file).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/['"`]Ctrl\b/.test(code), `${file} writes Ctrl itself`);
  }
});

test('the language keys exist', () => {
  assert.equal(messages.localeCode.message, 'en');
  assert.equal(messages.textDirection.message, 'ltr');
  assert.equal(messages.languageName.message, 'English');
});

test('every key the code and the pages use is in the catalog, and every message is used', () => {
  const used = usedKeys();
  for (const key of used) assert.ok(messages[key], `${key} is used but not in the catalog`);
  for (const key of Object.keys(messages)) {
    if (!META_KEYS.includes(key)) assert.ok(used.has(key), `${key} is in the catalog but not used`);
  }
});

test('the pages hold no English text of their own', () => {
  // Names that stay as they are: the letters on the bold, italic, and underline buttons, and the
  // names of the code languages.
  const allowed = new Set(['B', 'I', 'U', 'JSON', 'JavaScript', 'TypeScript', 'Python', 'HTML', 'CSS', 'SQL', 'Shell']);
  for (const file of ['panel.html', 'options.html']) {
    let html = read(file);
    html = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
    html = html.replace(/<(\w+)\b[^>]*\bdata-i18n(?:-rich)?="[^"]*"[^>]*>[\s\S]*?<\/\1>/g, '');
    const left = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1].trim()).filter((text) => /\p{L}/u.test(text));
    for (const text of left) assert.ok(allowed.has(text), `${file} still has the text "${text}"`);
  }
});
