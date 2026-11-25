/*
 * Makes two pseudo-languages from the English message catalog, for the layout tests.
 *
 * The stretched language has every message about 40 percent longer, written with accented
 * letters, and wrapped in the marks "⟦" and "⟧", so a text that a layout cuts off loses its end
 * mark. The mirrored language writes every letter as an Arabic letter, declares itself right to
 * left, and has the six plural forms of Arabic. Both keep the $placeholders$, the <kbd> tags and
 * the {braces}, so the code that fills in a message works as it does in a real language.
 *
 * They are never put in extension/_locales. build() copies the extension into a new folder in the
 * temporary directory and replaces the English catalog there. The test browser runs in English,
 * so it shows the replaced catalog.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { keyParts } = require('./check-locales.js');

const EXTENSION = path.resolve(__dirname, '..', 'extension');
const META_KEYS = new Set(['localeCode', 'textDirection', 'languageName']);
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
// What the code puts in a message that must stay as it is: the placeholders, the key tags and
// the placeholder syntax of a snippet.
const PROTECTED = /(\$\$|\$[A-Za-z0-9_@]+\$|\$[1-9]|<\/?kbd>|\{[^}]*\})/;
const ACCENTS = { a: 'á', c: 'ç', e: 'é', i: 'í', n: 'ñ', o: 'ó', u: 'ú', y: 'ý', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' };
const FILLER = ['éñé', 'ñúó', 'áíç'];
const ARABIC = 'ابتثجحخدذرزسشصضطظعغفقكلمنه';
const START = '⟦';
const END = '⟧';

// The number of characters of a message as a person sees it; a fixed placeholder counts in full
// and a value filled in at run time counts as nothing.
function shownLength(message, placeholders = {}) {
  const content = {};
  for (const [name, definition] of Object.entries(placeholders)) content[name.toLowerCase()] = definition.content;
  const text = message
    .replace(/\$\$|\$([A-Za-z0-9_@]+)\$/g, (match, name) => (name ? String(content[name.toLowerCase()] ?? match) : '$'))
    .replace(/\$[1-9]/g, '');
  return [...text].length;
}

// Applies `change` to the text of a message between its protected parts.
function mapText(message, change) {
  return message
    .split(PROTECTED)
    .map((part, index) => (index % 2 === 1 ? part : change(part)))
    .join('');
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function stretchText(part) {
  return part.replace(/[A-Za-z]+/g, (word) => {
    const accented = [...word].map((letter) => ACCENTS[letter] || letter).join('');
    const vowels = accented.match(/[áéíóúý]/g) || ['é'];
    let extra = '';
    for (let i = 0; i < Math.floor(word.length * 0.4); i++) extra += vowels[i % vowels.length];
    return accented + extra;
  });
}

// The English catalog with every message about 40 percent longer and accented.
function stretched(english) {
  const catalog = copy(english);
  for (const [key, entry] of Object.entries(catalog)) {
    if (META_KEYS.has(key) || key === 'extName') continue;
    const target = Math.ceil(shownLength(entry.message, entry.placeholders) * 1.4);
    let message = mapText(entry.message, stretchText);
    let deficit = target - shownLength(message, entry.placeholders) - START.length - END.length;
    for (let i = 0; deficit > 0; i++) {
      const word = FILLER[i % FILLER.length].slice(0, deficit - 1 || 1);
      message += ` ${word}`;
      deficit -= word.length + 1;
    }
    entry.message = START + message + END;
    delete entry.description;
  }
  catalog.languageName.message = 'Stretched';
  return catalog;
}

function arabicText(part) {
  return part.replace(/[A-Za-z]/g, (letter) => ARABIC[letter.toLowerCase().charCodeAt(0) - 97]);
}

// The English catalog written in Arabic letters, right to left, with the plural forms of Arabic.
function mirrored(english) {
  const catalog = copy(english);
  for (const [key, entry] of Object.entries(catalog)) {
    // A message that is only a key name, such as keyCtrl, stays as the key placeholders do, so the
    // catalog writes each key one way.
    if (META_KEYS.has(key) || key === 'extName' || keyParts(entry.message)) continue;
    entry.message = mapText(entry.message, arabicText);
    delete entry.description;
  }
  for (const key of Object.keys(english)) {
    const match = /^(.*)_other$/.exec(key);
    if (!match) continue;
    for (const form of ['zero', 'two', 'few', 'many']) {
      if (!catalog[`${match[1]}_${form}`]) catalog[`${match[1]}_${form}`] = copy(catalog[key]);
    }
  }
  catalog.localeCode.message = 'ar';
  catalog.textDirection.message = 'rtl';
  catalog.languageName.message = 'Mirrored';
  return catalog;
}

const KINDS = { stretched, mirrored };

// Copies the extension into a new temporary folder, with the English catalog replaced by the
// pseudo-language `kind` ('stretched' or 'mirrored'), or by what `kind` returns when it is a
// function that takes the English catalog. Returns the folder. `localeCode` gives the language
// whose plural rules and digits the copy uses, such as fa for Persian digits.
function build(kind, { localeCode } = {}) {
  const custom = typeof kind === 'function';
  const make = custom ? kind : KINDS[kind];
  if (!make) throw new Error(`Unknown pseudo-language: ${kind}`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `snippet-inserter-${custom ? 'custom' : kind}-`));
  fs.cpSync(EXTENSION, directory, { recursive: true });
  const file = path.join(directory, '_locales', 'en', 'messages.json');
  const catalog = make(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (localeCode) catalog.localeCode.message = localeCode;
  fs.writeFileSync(file, JSON.stringify(catalog, null, 2));
  return directory;
}

// Removes a folder that build() made. It refuses a folder outside the temporary folder, or one whose
// name does not start with snippet-inserter-, as the name of every folder that build() makes does.
function remove(directory) {
  if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith('snippet-inserter-')) {
    throw new Error(`Not a folder that build() made: ${directory}`);
  }
  fs.rmSync(directory, { recursive: true, force: true });
}

module.exports = { stretched, mirrored, build, remove, PLURAL_SUFFIX };
