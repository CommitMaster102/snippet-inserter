/*
 * The Format JSON button of the snippet manager: checks that text is valid JSON and indents it with
 * 2 spaces. The text is read by a small parser of its own instead of JSON.parse, for three reasons.
 * It can name the line and column of the first error, which the browser's messages do not always
 * give. It writes every number and string as it was typed, so a long number loses no digits. And it
 * keeps the order of the keys, which JSON.parse changes for keys such as "2" and "1".
 *
 * A placeholder such as {input:Count} outside quotes is not valid JSON, and the message says so.
 * Inside quotes it is ordinary text.
 */
(function (root) {
  'use strict';

  const INDENT = '  ';
  // Arrays and objects nested deeper than this are reported instead of read, so the recursion
  // below cannot run out of stack.
  const MAX_DEPTH = 100;
  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const ESCAPES = new Set('"\\/bfnrt');
  const LITERALS = ['true', 'false', 'null'];

  function placeholders() {
    return typeof module === 'object' && module.exports ? require('./placeholders.js') : root.SnippetInserter.placeholders;
  }

  // The messages of lib/i18n.js, which the manager page loads before this file.
  function i18n() {
    return typeof module === 'object' && module.exports ? require('./i18n.js') : root.SnippetInserter.i18n;
  }

  class JsonError extends Error {
    constructor(index, message) {
      super(message);
      this.index = index;
    }
  }

  // Reads `text` with a cursor that only moves forward and writes the formatted copy as it goes.
  function parser(text) {
    let i = 0;

    const fail = (at, message) => {
      throw new JsonError(at, message);
    };
    const skip = () => {
      while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
    };
    const describe = (at) => (at >= text.length ? i18n().t('jsonEndOfText') : `"${[...text.slice(at, at + 2)][0]}"`);

    function string() {
      const start = i++;
      for (;;) {
        if (i >= text.length) fail(start, i18n().t('jsonStringNotClosed'));
        const c = text[i];
        if (c === '"') return text.slice(start, ++i);
        if (c === '\n' || c === '\r') fail(i, i18n().t('jsonLineBreak'));
        if (c < ' ') fail(i, i18n().t('jsonControlChar'));
        if (c === '\\') {
          const next = text[i + 1];
          if (next === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail(i, i18n().t('jsonHexDigits'));
            i += 6;
          } else if (next !== undefined && ESCAPES.has(next)) {
            i += 2;
          } else {
            fail(i, i18n().t('jsonUnknownEscape'));
          }
        } else {
          i++;
        }
      }
    }

    function number() {
      NUMBER.lastIndex = i;
      const match = NUMBER.exec(text);
      // A minus sign needs digits after it, and so do a decimal point and an exponent.
      if (!match) fail(text[i] === '-' ? i + 1 : i, i18n().t('jsonExpectedDigit'));
      const end = i + match[0].length;
      if (/^(?:\.|[eE][+-]?)(?!\d)/.test(text.slice(end, end + 3))) fail(end + 1, i18n().t('jsonExpectedDigit'));
      i = end;
      return match[0];
    }

    function value(depth, level) {
      skip();
      const c = text[i];
      if (c === undefined) fail(i, i18n().t('jsonEndWhereValue'));
      if (c === '{' || c === '[') {
        if (depth >= MAX_DEPTH) fail(i, i18n().t('jsonTooDeep', [i18n().number(MAX_DEPTH)]));
        return c === '{' ? object(depth, level) : array(depth, level);
      }
      if (c === '"') return string();
      if (c === '-' || (c >= '0' && c <= '9')) return number();
      for (const word of LITERALS) {
        if (text.startsWith(word, i)) {
          i += word.length;
          return word;
        }
      }
      if (/[a-z]/i.test(c)) {
        const guess = LITERALS.find((word) => word[0] === c);
        fail(i, guess ? i18n().t('jsonExpected', [guess]) : i18n().t('jsonUnexpected', [describe(i)]));
      }
      if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) fail(i, i18n().t('jsonComments'));
      fail(i, i18n().t('jsonUnexpectedValue', [describe(i)]));
    }

    function array(depth, level) {
      i++;
      skip();
      if (text[i] === ']') {
        i++;
        return '[]';
      }
      const pad = INDENT.repeat(level + 1);
      const items = [];
      for (;;) {
        items.push(pad + value(depth + 1, level + 1));
        skip();
        if (text[i] === ',') {
          i++;
        } else if (text[i] === ']') {
          i++;
          return `[\n${items.join(',\n')}\n${INDENT.repeat(level)}]`;
        } else {
          fail(i, i18n().t('jsonExpectedClose', [']', describe(i)]));
        }
      }
    }

    function object(depth, level) {
      i++;
      skip();
      if (text[i] === '}') {
        i++;
        return '{}';
      }
      const pad = INDENT.repeat(level + 1);
      const members = [];
      for (;;) {
        skip();
        if (text[i] !== '"') fail(i, i18n().t('jsonExpectedName', [describe(i)]));
        const key = string();
        skip();
        if (text[i] !== ':') fail(i, i18n().t('jsonExpectedColon', [describe(i)]));
        i++;
        members.push(`${pad}${key}: ${value(depth + 1, level + 1)}`);
        skip();
        if (text[i] === ',') {
          i++;
        } else if (text[i] === '}') {
          i++;
          return `{\n${members.join(',\n')}\n${INDENT.repeat(level)}}`;
        } else {
          fail(i, i18n().t('jsonExpectedClose', ['}', describe(i)]));
        }
      }
    }

    return {
      run() {
        const out = value(0, 0);
        skip();
        if (i < text.length) fail(i, i18n().t('jsonExpectedEnd', [describe(i)]));
        return out;
      },
    };
  }

  // The 1-based line and column of a character index. A column counts characters, not UTF-16 units.
  function position(text, index) {
    const before = text.slice(0, index);
    const start = before.lastIndexOf('\n') + 1;
    return { line: before.split('\n').length, column: [...before.slice(start)].length + 1 };
  }

  // The placeholder that the error at `index` falls inside, or null. The parser stops inside a
  // placeholder it met outside quotes, since its opening brace starts an object.
  function placeholderAt(text, index) {
    for (const match of placeholders().scan(text)) {
      if (index >= match.index && index < match.index + match[0].length) return match;
    }
    return null;
  }

  // { ok: true, text } with the text indented, or { ok: false, line, column, message } for the first
  // error. A text with only white space has no position.
  function format(input) {
    const text = String(input);
    if (!text.trim()) return { ok: false, message: i18n().t('jsonEmpty') };
    try {
      return { ok: true, text: parser(text).run() };
    } catch (error) {
      if (!(error instanceof JsonError)) throw error;
      const found = placeholderAt(text, error.index);
      const at = position(text, found ? found.index : error.index);
      const message = found
        ? i18n().t('jsonPlaceholder', [found[0]])
        : error.message;
      const where = [i18n().number(at.line), i18n().number(at.column)];
      return { ok: false, line: at.line, column: at.column, message: i18n().t('jsonPosition', [...where, message]) };
    }
  }

  const api = { format, MAX_DEPTH };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, { jsonFormat: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
