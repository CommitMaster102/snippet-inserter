// Unit tests for scripts/check-locales.js, the check that every language folder in
// extension/_locales is complete and sound. Run with: npm run test:unit
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const check = require('../../scripts/check-locales.js');
const { messages: english } = require('../shared/locale-files.js');

const copy = (value) => JSON.parse(JSON.stringify(value));

// A German catalog that is complete: every English message, with the plural forms German needs.
function german() {
  const catalog = copy(english);
  catalog.localeCode.message = 'de';
  catalog.languageName.message = 'Deutsch';
  delete catalog.extName;
  return catalog;
}

const problems = (code, catalog) => check.checkCatalog(code, catalog, english, check.readBudgets());

test('the English catalog passes the check, so the rules and the English text agree', () => {
  assert.deepEqual(problems('en', english), []);
});

test('a complete catalog passes', () => {
  assert.deepEqual(problems('de', german()), []);
});

test('a code that Chrome does not support is reported', () => {
  assert.match(problems('xx', german()).join('\n'), /not a language Chrome supports/);
  assert.match(problems('pt-BR', german()).join('\n'), /not a language Chrome supports/);
  assert.deepEqual(problems('en_GB', Object.assign(german(), { localeCode: { message: 'en_GB' } })), []);
});

test('the supported list has the 55 codes of the Chrome Web Store', () => {
  assert.equal(check.SUPPORTED.size, 55);
});

test('a missing message and an extra message are reported by key', () => {
  const catalog = german();
  delete catalog.undo;
  catalog.madeUp = { message: 'x' };
  const text = problems('de', catalog).join('\n');
  assert.match(text, /undo: missing/);
  assert.match(text, /madeUp: not in the English catalog/);
});

test('extName may be left out and may not be changed', () => {
  const catalog = german();
  catalog.extName = { message: 'Textbausteine' };
  assert.match(problems('de', catalog).join('\n'), /extName/);
  catalog.extName = copy(english.extName);
  assert.deepEqual(problems('de', catalog), []);
});

test('a changed or dropped $placeholder$ is reported', () => {
  const dropped = german();
  dropped.exportNote_other.message = 'Speichert die Bausteine.';
  assert.match(problems('de', dropped).join('\n'), /exportNote_other: .*placeholder/);

  const renamed = german();
  renamed.exportNote_other.message = 'Speichert $N$ Bausteine in $FILE$.';
  renamed.exportNote_other.placeholders = { n: { content: '$1' }, file: { content: '$2' } };
  assert.match(problems('de', renamed).join('\n'), /exportNote_other: .*placeholder/);

  const content = german();
  content.exportNote_other.placeholders.count.content = '$2';
  assert.match(problems('de', content).join('\n'), /exportNote_other: .*placeholder/);
});

test('a key name may be translated, the same way in every message, and nothing else may', () => {
  // German keyboards print Strg for Ctrl.
  const strg = (catalog) => {
    catalog.keyCtrl.message = 'Strg';
    for (const entry of Object.values(catalog)) {
      for (const definition of Object.values(entry.placeholders || {})) {
        definition.content = definition.content.replace(/^Ctrl\b/, 'Strg');
      }
    }
    return catalog;
  };
  assert.deepEqual(problems('de', strg(german())), []);

  const mixed = strg(german());
  mixed.toolBold.placeholders.shortcut.content = 'Ctrl+B';
  assert.match(problems('de', mixed).join('\n'), /Ctrl is written as both/);

  const letter = strg(german());
  letter.toolBold.placeholders.shortcut.content = 'Strg+F';
  assert.match(problems('de', letter).join('\n'), /toolBold: .*placeholder/);

  const name = german();
  name.formatHint.placeholders.google_docs.content = 'Google Dokumente';
  assert.match(problems('de', name).join('\n'), /formatHint: .*placeholder/);
});

test('a key name is written without spaces around the plus sign, as the code joins it', () => {
  // The manager turns Strg+B into Cmd+B on a Mac by replacing the keyCtrl text and a plus sign,
  // which does not find Strg + B.
  const spaced = german();
  spaced.keyCtrl.message = 'Strg';
  for (const entry of Object.values(spaced)) {
    for (const definition of Object.values(entry.placeholders || {})) {
      definition.content = definition.content.replace(/^Ctrl\+/, 'Strg + ').replace(/^Ctrl$/, 'Strg');
    }
  }
  const text = problems('de', spaced).join('\n');
  assert.match(text, /toolBold: .*placeholder/);
  assert.match(text, /toolLink: .*placeholder/);

  const padded = german();
  padded.keyCtrl.message = 'Ctrl ';
  assert.match(problems('de', padded).join('\n'), /keyCtrl: does not name the key Ctrl/);
});

test('the Mac Cmd key may be translated, and stays one key name', () => {
  const command = german();
  command.keyCmd.message = 'Befehl';
  assert.deepEqual(problems('de', command), []);
  command.keyCmd.message = 'Befehl+V';
  assert.match(problems('de', command).join('\n'), /keyCmd: does not name the key Cmd/);
});

test('a fixed number may be written in the digits of the language, but stays the same number', () => {
  const persian = copy(english);
  persian.localeCode.message = 'fa';
  persian.textDirection.message = 'rtl';
  delete persian.extName;
  persian.deletedNote.placeholders.count.content = '۲۰';
  persian.referenceLimit.placeholders.limit.content = '۱۰۰';
  assert.deepEqual(problems('fa', persian), []);
  persian.deletedNote.placeholders.count.content = '۲۱';
  assert.match(problems('fa', persian).join('\n'), /deletedNote: .*placeholder/);
});

test('the number of <kbd> pairs must match', () => {
  const key = Object.keys(english).find((name) => english[name].message.includes('<kbd>'));
  assert.ok(key, 'the English catalog has a message with <kbd>');
  const catalog = german();
  catalog[key].message = catalog[key].message.replace(/<\/?kbd>/g, '');
  assert.match(problems('de', catalog).join('\n'), new RegExp(`${key}: .*kbd`));
});

test('a language gets the plural forms of its own rules', () => {
  const russian = copy(english);
  russian.localeCode.message = 'ru';
  delete russian.extName;
  assert.match(problems('ru', russian).join('\n'), /exportNote_few: missing/);
  // A name may have 128 characters and a folder 64, which Russian counts with different forms.
  assert.match(problems('ru', russian).join('\n'), /validationTooLong_few: missing/);
  assert.match(problems('ru', russian).join('\n'), /validationTooLong_many: missing/);

  for (const key of Object.keys(english)) {
    const match = /^(.*)_other$/.exec(key);
    if (!match) continue;
    for (const form of ['one', 'few', 'many']) {
      russian[`${match[1]}_${form}`] = copy(english[key]);
    }
  }
  assert.deepEqual(problems('ru', russian), []);

  const japanese = copy(english);
  japanese.localeCode.message = 'ja';
  delete japanese.extName;
  assert.match(problems('ja', japanese).join('\n'), /exportNote_one: .*do not use/);
  for (const key of Object.keys(japanese)) if (/_one$/.test(key)) delete japanese[key];
  assert.deepEqual(problems('ja', japanese), []);
});

test('the language code and direction must match the folder', () => {
  const wrongCode = german();
  wrongCode.localeCode.message = 'en';
  assert.match(problems('de', wrongCode).join('\n'), /localeCode/);

  const wrongDirection = german();
  wrongDirection.textDirection.message = 'rtl';
  assert.match(problems('de', wrongDirection).join('\n'), /textDirection/);

  const arabic = copy(english);
  arabic.localeCode.message = 'ar';
  delete arabic.extName;
  for (const key of Object.keys(english)) {
    const match = /^(.*)_other$/.exec(key);
    if (match) for (const form of ['zero', 'one', 'two', 'few', 'many']) arabic[`${match[1]}_${form}`] = copy(english[key]);
  }
  assert.match(problems('ar', arabic).join('\n'), /textDirection/);
  arabic.textDirection.message = 'rtl';
  assert.deepEqual(problems('ar', arabic), []);
});

test('a message over its width budget is reported, and the general limit applies without a table entry', () => {
  const long = german();
  long.extDescription.message = 'x'.repeat(133);
  assert.match(problems('de', long).join('\n'), /extDescription: .*longer than 132/);

  const unbudgeted = german();
  unbudgeted.settings.message = 'x'.repeat(english.settings.message.length * 3 + 21);
  assert.match(problems('de', unbudgeted).join('\n'), /settings: .*longer than/);
});

test('every budget names a message and holds the English text', () => {
  const budgets = check.readBudgets();
  for (const [key, limit] of Object.entries(budgets)) {
    assert.ok(english[key], `${key} is not an English message`);
    assert.ok(Number.isInteger(limit) && limit > 0, key);
    assert.ok(check.renderedLength(english[key]) <= limit, `${key} is already over its budget in English`);
  }
});

test('an entry without a text is reported', () => {
  const catalog = german();
  catalog.undo.message = '';
  assert.match(problems('de', catalog).join('\n'), /undo: .*no text/);
});
