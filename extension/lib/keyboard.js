/*
 * Names the key of a shortcut the same way on every keyboard layout.
 *
 * The shortcuts Ctrl+1 to Ctrl+9, Ctrl+Z, Ctrl+S and Ctrl+K are written with Latin letters and
 * digits. A browser reports event.key as what the layout prints on the key, so on a Russian layout
 * the key labelled Z reports "я", and on a French AZERTY layout the key labelled 2 reports "é".
 * Reading event.code, the physical key, fixes both. It is used only when event.key is not already a
 * Latin letter or a digit, so a Dvorak layout, where the same physical key holds another letter,
 * still gets the letter on the key.
 */
(function (root) {
  'use strict';

  // The lower-case Latin letter or the digit 1 to 9 for a shortcut key, and otherwise event.key as it is.
  function shortcutKey(event) {
    const key = typeof event.key === 'string' ? event.key : '';
    const code = typeof event.code === 'string' ? event.code : '';
    if (/^[a-z]$/i.test(key)) return key.toLowerCase();
    if (/^[0-9]$/.test(key)) return key;
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return letter[1].toLowerCase();
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (digit) return digit[1];
    return key;
  }

  const api = { shortcutKey };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, { keyboard: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
