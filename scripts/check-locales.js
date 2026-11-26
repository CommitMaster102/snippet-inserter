/*
 * Checks every language folder in extension/_locales, with: npm run test:locales
 *
 * A language is a folder named with one of the 55 codes that Chrome supports, holding a
 * messages.json. The check reports, per message, what a translator got wrong: a missing or extra
 * message, a changed $placeholder$, a different number of <kbd> pairs, a plural form the language
 * does not use or lacks, a wrong localeCode or textDirection, and a text longer than its width
 * budget. The budgets for the spots with little room are in i18n/width-budgets.json. Any other
 * message may be up to 3 times as long as the English plus 20 characters. With only the English
 * folder present the check passes.
 *
 * A placeholder keeps its English content, with two exceptions. A key name, such as Ctrl, may be
 * written as keyboards in the language print it, the same way in every message of the catalog and
 * with no space around a plus sign. A fixed number may be written in the digits of the language.
 *
 * The pseudo-languages for the layout tests are not checked here, because they are never put in
 * _locales.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LOCALES = path.join(ROOT, 'extension', '_locales');

// The locales the Chrome Web Store and Chrome accept as the name of a folder in _locales.
const SUPPORTED = new Set(
  ('ar am bg bn ca cs da de el en en_AU en_GB en_US es es_419 et fa fi fil fr gu he hi hr hu id it ja kn ko ' +
    'lt lv ml mr ms nl no pl pt_BR pt_PT ro ru sk sl sr sv sw ta te th tr uk vi zh_CN zh_TW').split(' ')
);
// The languages written from right to left, by the first part of the code.
const RIGHT_TO_LEFT = new Set(['ar', 'fa', 'he', 'ur']);
const META_KEYS = new Set(['localeCode', 'textDirection', 'languageName']);
// The keys whose names a translation may write as keyboards in its language print them.
const KEY_NAMES = new Set(['Ctrl', 'Cmd', 'Shift', 'Alt', 'Enter', 'Esc', 'Tab', 'Space']);
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
// A form for a count that may leave out the number, as in "One snippet".
const NUMBER_OPTIONAL = new Set(['zero', 'one', 'two']);
const EXTRA_LENGTH = 20;
const LENGTH_FACTOR = 3;

function readBudgets() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'width-budgets.json'), 'utf8'));
}

// The names of the placeholders that a message text refers to, in lower case.
function references(message) {
  const text = message.replace(/\$\$/g, '');
  return new Set([...text.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((match) => match[1].toLowerCase()));
}

function definitions(entry) {
  const result = {};
  for (const [name, definition] of Object.entries(entry.placeholders || {})) result[name.toLowerCase()] = definition.content;
  return result;
}

// The length in characters of a message as a person sees it. A value filled in at run time, such
// as "$1", counts as nothing, and a fixed value, such as ";addr", counts in full.
function renderedLength(entry) {
  const content = definitions(entry);
  const text = entry.message
    .replace(/\$\$|\$([A-Za-z0-9_@]+)\$/g, (match, name) => (name ? String(content[name.toLowerCase()] ?? match) : '$'))
    .replace(/\$[1-9]/g, '');
  return [...text].length;
}

function count(text, part) {
  return text.split(part).length - 1;
}

// The parts of a key name between plus signs, such as Ctrl and B for Ctrl+B, or null when the text
// is not a key name. A translation may write a named key the way keyboards in its language print
// it, such as Strg for Ctrl in German, and keeps a letter or a digit as it is.
function keyParts(text) {
  const parts = String(text).split('+');
  const named = parts.some((part) => KEY_NAMES.has(part));
  return named && parts.every((part) => KEY_NAMES.has(part) || /^[A-Z0-9]$/.test(part)) ? parts : null;
}

// Whether `translated` names the keys of the English key name `parts`. Each named key it writes is
// added to `names`, so that a key written two ways in one catalog can be reported. A space before or
// after a key is reported, because the code joins the keyCtrl text and a letter with a bare plus
// sign, as in Ctrl+V, and looks for that text with a plus sign to put Cmd in its place on a Mac.
function sameKeys(parts, translated, names) {
  const written = String(translated ?? '').split('+');
  if (written.length !== parts.length) return false;
  for (const [index, part] of parts.entries()) {
    const own = written[index];
    if (!KEY_NAMES.has(part)) {
      if (own !== part) return false;
    } else {
      if (!own || own !== own.trim() || own.includes('$')) return false;
      if (!names.has(part)) names.set(part, new Set());
      names.get(part).add(own);
    }
  }
  return true;
}

// Whether a translated placeholder holds what the English one holds. A key name may be translated,
// and a fixed number, such as the 20 of deletedNote, may be written in the digits of the language,
// as the pages write every number.
function sameContent(english, translated, code, names) {
  const parts = keyParts(english);
  if (parts) return sameKeys(parts, translated, names);
  if (translated === english) return true;
  if (!/^\d+$/.test(english)) return false;
  try {
    return new Intl.NumberFormat(code.replace('_', '-'), { useGrouping: false }).format(Number(english)) === translated;
  } catch {
    return false;
  }
}

function pluralCategories(code) {
  return new Intl.PluralRules(code.replace('_', '-')).resolvedOptions().pluralCategories;
}

// The problems of one catalog, as a list of sentences that each start with the message name.
function checkCatalog(code, catalog, english, budgets) {
  const problems = [];
  if (!SUPPORTED.has(code)) problems.push(`${code}: not a language Chrome supports as a folder name`);

  let categories;
  try {
    categories = pluralCategories(code);
  } catch {
    categories = ['other'];
  }
  const families = new Set();
  const required = new Set();
  for (const key of Object.keys(english)) {
    const match = PLURAL_SUFFIX.exec(key);
    if (match) {
      const base = key.slice(0, match.index);
      if (!families.has(base)) {
        families.add(base);
        for (const category of categories) required.add(`${base}_${category}`);
      }
    } else {
      required.add(key);
    }
  }

  for (const key of required) if (!catalog[key]) problems.push(`${key}: missing`);
  // Every catalog needs extName, because the Chrome Web Store refuses a package when a language
  // folder has no name for the extension. The name itself stays in English.
  if (catalog.extName && catalog.extName.message !== english.extName.message) {
    problems.push('extName: the name of the extension is not translated');
  }
  // Each named key, such as Ctrl, with every way the catalog writes it.
  const names = new Map();
  for (const key of Object.keys(catalog)) {
    if (required.has(key)) continue;
    const match = PLURAL_SUFFIX.exec(key);
    if (match && families.has(key.slice(0, match.index))) {
      problems.push(`${key}: the language rules of ${code} do not use the form ${match[1]} (they use ${categories.join(', ')})`);
    } else {
      problems.push(`${key}: not in the English catalog`);
    }
  }

  for (const key of Object.keys(catalog)) {
    const entry = catalog[key];
    const match = PLURAL_SUFFIX.exec(key);
    const reference = english[key] || (match && english[`${key.slice(0, match.index)}_other`]);
    if (!reference) continue;
    if (!entry || typeof entry.message !== 'string' || entry.message.trim() === '') {
      problems.push(`${key}: has no text`);
      continue;
    }

    if (key === 'localeCode' && entry.message !== code) problems.push(`localeCode: is "${entry.message}", but the folder is ${code}`);
    if (key === 'textDirection') {
      const direction = RIGHT_TO_LEFT.has(code.split('_')[0]) ? 'rtl' : 'ltr';
      if (entry.message !== direction) problems.push(`textDirection: is "${entry.message}", but ${code} is written ${direction}`);
    }
    if (META_KEYS.has(key) || key === 'extName') continue;

    // A message that is only a key name, such as keyCtrl, follows the rule of a key placeholder.
    const keys = keyParts(reference.message);
    if (keys && !sameKeys(keys, entry.message, names)) problems.push(`${key}: does not name the key ${reference.message}`);

    const expected = definitions(reference);
    const actual = definitions(entry);
    const same =
      Object.keys(expected).length === Object.keys(actual).length &&
      Object.entries(expected).every(([name, content]) => sameContent(content, actual[name], code, names));
    if (!same) {
      problems.push(`${key}: the placeholders differ from English (${Object.keys(expected).join(', ') || 'none'} expected)`);
    } else {
      const used = references(entry.message);
      const optional = match && NUMBER_OPTIONAL.has(match[1]);
      for (const name of used) if (!(name in actual)) problems.push(`${key}: $${name.toUpperCase()}$ has no placeholder`);
      if (!optional) {
        for (const name of Object.keys(actual)) if (!used.has(name)) problems.push(`${key}: does not use placeholder $${name.toUpperCase()}$`);
      }
    }

    for (const part of ['<kbd>', '</kbd>']) {
      if (count(entry.message, part) !== count(reference.message, part)) {
        problems.push(`${key}: has ${count(entry.message, part)} ${part} where English has ${count(reference.message, part)}`);
      }
    }

    const length = renderedLength(entry);
    const limit = budgets[key] ?? (code === 'en' ? Infinity : LENGTH_FACTOR * renderedLength(reference) + EXTRA_LENGTH);
    if (length > limit) problems.push(`${key}: ${length} characters, longer than ${limit}`);
  }

  for (const [key, written] of names) {
    if (written.size > 1) problems.push(`key names: ${key} is written as both ${[...written].join(' and ')}`);
  }
  return problems;
}

// Reads every folder of _locales and returns the problems of all of them.
function checkAll(directory = LOCALES) {
  const problems = [];
  const englishFile = path.join(directory, 'en', 'messages.json');
  if (!fs.existsSync(englishFile)) return ['en: the English catalog is missing'];
  const english = JSON.parse(fs.readFileSync(englishFile, 'utf8'));
  const budgets = readBudgets();
  const folders = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of folders) {
    let text;
    try {
      text = fs.readFileSync(path.join(directory, name, 'messages.json'), 'utf8');
    } catch {
      problems.push(`${name}: has no messages.json`);
      continue;
    }
    if (text.charCodeAt(0) === 0xfeff) problems.push(`${name}: messages.json starts with a byte order mark`);
    let catalog;
    try {
      catalog = JSON.parse(text.replace(/^﻿/, ''));
    } catch (error) {
      problems.push(`${name}: messages.json is not valid JSON (${error.message})`);
      continue;
    }
    for (const problem of checkCatalog(name, catalog, english, budgets)) problems.push(`${name}: ${problem}`);
  }
  return problems;
}

module.exports = { SUPPORTED, checkCatalog, checkAll, readBudgets, renderedLength, keyParts };

if (require.main === module) {
  const problems = checkAll();
  const folders = fs.readdirSync(LOCALES).length;
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\n${problems.length} problem(s) in ${folders} language folder(s).`);
    process.exit(1);
  }
  console.log(`${folders} language folder(s) checked, no problems.`);
}
