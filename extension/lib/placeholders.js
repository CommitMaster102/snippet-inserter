/*
 * Placeholders in snippet text, filled in when a snippet is inserted.
 *
 *   {date}         the date in the field's language, such as "November 20, 2026"
 *   {date:short}   the short form, such as "11/20/26"
 *   {date:iso}     2026-11-20
 *   {time}         the time in the field's language, such as "9:14 AM"
 *   {time:iso}     09:14
 *   {cursor}       nothing; the caret ends here after the insert
 *   {input:Label}  a value the user types in the panel's fill-in form before the insert
 *
 * Only these exact forms are recognized, so other text in braces, such as JSON, is inserted as
 * written. Imported by content-main.js, loaded by the panel and the manager page, and exported
 * for the Node unit tests.
 */
(function (root) {
  'use strict';

  // Groups: 1 is the date style, 2 is the time style, and 3 is a fill-in label.
  const PLACEHOLDER = /\{date(?::(short|iso))?\}|\{time(?::(iso))?\}|\{cursor\}|\{input:([^{}\n]{1,40})\}/g;
  const CURSOR = '{cursor}';

  function matches(content) {
    return [...String(content).matchAll(PLACEHOLDER)];
  }

  // The fill-in labels in order of first appearance. A repeated label is asked once.
  function inputLabels(content) {
    const labels = [];
    for (const match of matches(content)) {
      if (match[3] !== undefined && !labels.includes(match[3])) labels.push(match[3]);
    }
    return labels;
  }

  // Every distinct placeholder in the text, in order, for the list under the form's text box.
  function listPlaceholders(content) {
    return [...new Set(matches(content).map((match) => match[0]))];
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // Intl rejects a malformed language tag, which a page can put in its lang attribute.
  function format(locale, options, now) {
    try {
      return new Intl.DateTimeFormat(locale || undefined, options).format(now);
    } catch {
      return new Intl.DateTimeFormat(undefined, options).format(now);
    }
  }

  function valueFor(match, values, locale, now) {
    const [token, dateStyle, timeStyle, label] = match;
    if (label !== undefined) {
      const value = values[label];
      return typeof value === 'string' ? value : '';
    }
    if (token.startsWith('{date')) {
      if (dateStyle === 'iso') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return format(locale, { dateStyle: dateStyle === 'short' ? 'short' : 'long' }, now);
    }
    if (timeStyle === 'iso') return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return format(locale, { timeStyle: 'short' }, now);
  }

  // The text to insert, and the caret position inside it when the snippet has {cursor} (null
  // otherwise). Only the first {cursor} counts; later ones are dropped.
  function expand(content, { values = {}, locale, now = new Date() } = {}) {
    const source = String(content);
    let text = '';
    let cursor = null;
    let last = 0;
    for (const match of matches(source)) {
      text += source.slice(last, match.index);
      if (match[0] === CURSOR) {
        if (cursor === null) cursor = text.length;
      } else {
        text += valueFor(match, values, locale, now);
      }
      last = match.index + match[0].length;
    }
    text += source.slice(last);
    return { text, cursor };
  }

  const api = { inputLabels, listPlaceholders, expand };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, { placeholders: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
