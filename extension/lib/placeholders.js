/*
 * Placeholders in snippet text, filled in when a snippet is inserted.
 *
 *   {date}         the date in the field's language, such as "November 20, 2026"
 *   {date:short}   the short form, such as "11/20/26"
 *   {date:iso}     2026-11-20
 *   {time}         the time in the field's language, such as "9:14 AM"
 *   {time:iso}     09:14
 *   {date+3d}      a date counted from today: a + or - sign, a number from 0 to 999, and d
 *                  (days), w (weeks), m (months), or y (years), before any :short or :iso
 *   {time-2h}      a time counted from now: a + or - sign, a number from 0 to 999, and min or h
 *   {cursor}       nothing; the caret ends here after the insert
 *   {input:Label}  a value the user types in the panel's fill-in form before the insert
 *
 * Adding months or years keeps the day of the month, or takes the last day of a shorter month.
 * Days and weeks count calendar days, so a daylight-saving change never moves a date, while
 * minutes and hours count elapsed time.
 *
 * Only these exact forms are recognized, so other text in braces, such as JSON, is inserted as
 * written. Imported by content-main.js, loaded by the panel and the manager page, and exported
 * for the Node unit tests.
 */
(function (root) {
  'use strict';

  // The groups are named, so adding an alternative never renumbers the others.
  const PLACEHOLDER = new RegExp(
    '\\{date(?:(?<dateShift>[+-]\\d{1,3})(?<dateUnit>[dwmy]))?(?::(?<dateStyle>short|iso))?\\}' +
      '|\\{time(?:(?<timeShift>[+-]\\d{1,3})(?<timeUnit>min|h))?(?::(?<timeStyle>iso))?\\}' +
      '|\\{cursor\\}|\\{input:(?<label>[^{}\\n]{1,40})\\}',
    'g'
  );
  const CURSOR = '{cursor}';

  function matches(content) {
    return [...String(content).matchAll(PLACEHOLDER)];
  }

  // The fill-in labels in order of first appearance. A repeated label is asked once.
  function inputLabels(content) {
    const labels = [];
    for (const match of matches(content)) {
      const label = match.groups.label;
      if (label !== undefined && !labels.includes(label)) labels.push(label);
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

  // The date n days, weeks, months, or years from now, taken at noon so that a clock change near
  // midnight cannot move it to another day. Adding months keeps the day of the month, or takes
  // the last day of a shorter month.
  function shiftDate(now, shift, unit) {
    const n = Number(shift);
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    if (unit === 'd' || unit === 'w') return new Date(y, m, d + n * (unit === 'w' ? 7 : 1), 12);
    const months = m + n * (unit === 'y' ? 12 : 1);
    const last = new Date(y, months + 1, 0, 12).getDate();
    return new Date(y, months, Math.min(d, last), 12);
  }

  // The moment n minutes or hours from now, counted as elapsed time.
  function shiftTime(now, shift, unit) {
    return new Date(now.getTime() + Number(shift) * (unit === 'h' ? 3600000 : 60000));
  }

  function valueFor(match, values, locale, now) {
    const { dateShift, dateUnit, dateStyle, timeShift, timeUnit, timeStyle, label } = match.groups;
    if (label !== undefined) {
      const value = values[label];
      return typeof value === 'string' ? value : '';
    }
    if (match[0].startsWith('{date')) {
      const when = dateShift ? shiftDate(now, dateShift, dateUnit) : now;
      if (dateStyle === 'iso') return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
      return format(locale, { dateStyle: dateStyle === 'short' ? 'short' : 'long' }, when);
    }
    const when = timeShift ? shiftTime(now, timeShift, timeUnit) : now;
    if (timeStyle === 'iso') return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
    return format(locale, { timeStyle: 'short' }, when);
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
