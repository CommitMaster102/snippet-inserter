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
 *   {date+1fri}    the first Friday after today; mon to sun work the same way, -1fri is the last
 *                  Friday before today, and +0fri is today when today is a Friday
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
    '\\{date(?:(?<dateShift>[+-]\\d{1,3})(?<dateUnit>[dwmy]|mon|tue|wed|thu|fri|sat|sun))?(?::(?<dateStyle>short|iso))?\\}' +
      '|\\{time(?:(?<timeShift>[+-]\\d{1,3})(?<timeUnit>min|h))?(?::(?<timeStyle>iso))?\\}' +
      '|\\{cursor\\}|\\{input:(?<label>[^{}\\n]{1,40})\\}',
    'g'
  );
  const CURSOR = '{cursor}';
  // The whole text of one placeholder, without the g flag, so test() keeps no state between calls.
  const EXACT = new RegExp(`^(?:${PLACEHOLDER.source})$`);
  // Text that opens like a date or time placeholder, in any case and with spaces allowed, and goes
  // on with a closing brace, a sign, a colon, or a digit. The minus sign and the en dash are
  // written as escapes, because they are easy to type by mistake for a hyphen.
  const NEAR_MISS = /\{\s*(?:date|time)\s*(?:\}|[+\-\u2212\u2013:\d][^{}\n]{0,24}\})/gi;

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

  // Text that looks like a date or time placeholder but is not one, so it is inserted as written.
  // Each distinct piece is listed once, in order.
  function unrecognized(content) {
    const found = String(content).match(NEAR_MISS) || [];
    return [...new Set(found.filter((text) => !EXACT.test(text)))];
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

  const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  // The date n days, weeks, months, or years from now, taken at noon so that a clock change near
  // midnight cannot move it to another day. Adding months keeps the day of the month, or takes
  // the last day of a shorter month.
  function shiftDate(now, shift, unit) {
    const n = Number(shift);
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const weekday = WEEKDAYS.indexOf(unit);
    if (weekday >= 0) {
      // The Nth such day strictly after (or before) today, except that 0 means today when today is
      // that day, and otherwise the nearest one in that direction.
      const back = shift.startsWith('-');
      const count = Math.abs(n);
      const gap = (back ? now.getDay() - weekday + 7 : weekday - now.getDay() + 7) % 7;
      const days = count === 0 ? gap : (gap || 7) + 7 * (count - 1);
      return new Date(y, m, d + (back ? -days : days), 12);
    }
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

  // What a date or time placeholder gives now, for the list under the edit form's text box. It is
  // empty for {cursor} and {input:Label}, which have no value of their own.
  function currentValue(token, { locale, now = new Date() } = {}) {
    if (!token.startsWith('{date') && !token.startsWith('{time')) return '';
    return expand(token, { locale, now }).text;
  }

  const api = { inputLabels, listPlaceholders, expand, unrecognized, currentValue };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, { placeholders: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
