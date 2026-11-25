/*
 * The interface text of the extension pages, read from the message catalog.
 *
 * Every string a person reads lives in _locales/<language>/messages.json, and the browser picks the
 * catalog that matches its language. This file wraps chrome.i18n for the pages and for the code in
 * lib/ that builds messages: it substitutes values, picks the plural form with Intl.PluralRules,
 * fills the static text of a page from data attributes, and sets the language and direction of the
 * document. Content scripts do not load it; they call chrome.i18n.getMessage directly.
 *
 * Outside the browser, as in the Node unit tests, it reads the English catalog and expands a
 * message the way chrome.i18n does, so the code that uses it behaves the same in both places.
 *
 * Data attributes that fill a page:
 *   data-i18n="key"              the text of the element
 *   data-i18n-rich="key"         the text, where <kbd>...</kbd> in the message makes a key element
 *   data-i18n-title="key"        the title attribute
 *   data-i18n-aria-label="key"   the aria-label attribute
 *   data-i18n-placeholder="key"  the placeholder attribute
 */
(function (root) {
  'use strict';

  const ATTRIBUTES = [
    ['title', 'data-i18n-title'],
    ['aria-label', 'data-i18n-aria-label'],
    ['placeholder', 'data-i18n-placeholder'],
  ];

  // The chrome.i18n API, or null where there is none.
  function browserApi() {
    try {
      const api = root.chrome && root.chrome.i18n;
      return api && typeof api.getMessage === 'function' ? api : null;
    } catch {
      return null;
    }
  }

  let english = null;
  // The English catalog, read only outside the browser.
  function englishCatalog() {
    if (!english) english = require('../_locales/en/messages.json');
    return english;
  }

  // Expands one catalog entry like chrome.i18n does: "$name$" becomes the content of the placeholder
  // of that name, "$1" to "$9" in that content become the substitutions, and "$$" is a dollar sign.
  function expand(entry, substitutions = []) {
    const subs = [].concat(substitutions).map(String);
    const placeholders = {};
    for (const [name, definition] of Object.entries(entry.placeholders || {})) {
      placeholders[name.toLowerCase()] = definition.content;
    }
    return entry.message.replace(/\$\$|\$([A-Za-z0-9_@]+)\$/g, (match, name) => {
      if (!name) return '$';
      const content = placeholders[name.toLowerCase()];
      if (content === undefined) return match;
      return content.replace(/\$([1-9])/g, (_, n) => (subs[n - 1] === undefined ? '' : subs[n - 1]));
    });
  }

  // The message for `key`, or '' when there is none.
  function lookup(key, substitutions) {
    const api = browserApi();
    if (api) return api.getMessage(key, [].concat(substitutions === undefined ? [] : substitutions).map(String));
    const entry = englishCatalog()[key];
    return entry ? expand(entry, substitutions) : '';
  }

  // The message for `key`. A key with no message reads as itself, so the gap shows.
  function t(key, substitutions) {
    return lookup(key, substitutions) || key;
  }

  let rules = null;
  let rulesFor = '';
  function pluralRules() {
    const tag = languageTag();
    if (!rules || rulesFor !== tag) {
      rules = new Intl.PluralRules(tag);
      rulesFor = tag;
    }
    return rules;
  }

  // The message for the plural category of `count` in the language of the catalog. The keys of a
  // family end in the category: fillCount_one and fillCount_other. A language that does not have
  // the category falls back to _other.
  function plural(key, count, substitutions) {
    const category = pluralRules().select(count);
    return lookup(`${key}_${category}`, substitutions) || lookup(`${key}_other`, substitutions) || `${key}_other`;
  }

  // A whole number as text, in the digits of the catalog's language. It has no thousands separator
  // unless `grouping` is true, which a count that can pass 999 asks for.
  function number(value, { grouping = false } = {}) {
    return new Intl.NumberFormat(languageTag(), { useGrouping: grouping }).format(value);
  }

  // The language of the catalog as a BCP 47 tag, from its localeCode message (en, pt_BR).
  function catalogTag() {
    return lookup('localeCode').replace('_', '-') || 'en';
  }

  // The tag for the lang attribute: the browser's own language when it is a variant of the catalog's
  // language, such as es-419 for the es catalog, and the catalog's language otherwise. A browser in
  // Hebrew that shows the English catalog gets en, because the text is English.
  function languageTag() {
    const api = browserApi();
    const catalog = catalogTag();
    if (!api || typeof api.getUILanguage !== 'function') return catalog;
    const ui = api.getUILanguage();
    return ui && ui.split('-')[0] === catalog.split('-')[0] ? ui : catalog;
  }

  // 'rtl' for a language written from right to left, otherwise 'ltr'. It follows the catalog.
  function direction() {
    return lookup('textDirection') === 'rtl' ? 'rtl' : 'ltr';
  }

  // Splits a message with <kbd>Key</kbd> parts into [{ text }, { key }, ...], so the page can build
  // its elements without parsing markup from a message.
  function richParts(message) {
    const parts = [];
    let last = 0;
    for (const match of message.matchAll(/<kbd>(.*?)<\/kbd>/g)) {
      if (match.index > last) parts.push({ text: message.slice(last, match.index) });
      parts.push({ key: match[1] });
      last = match.index + match[0].length;
    }
    if (last < message.length) parts.push({ text: message.slice(last) });
    return parts;
  }

  // Fills the elements of `doc` that carry the data attributes above.
  function fill(doc) {
    for (const element of doc.querySelectorAll('[data-i18n]')) {
      element.textContent = t(element.getAttribute('data-i18n'));
    }
    for (const element of doc.querySelectorAll('[data-i18n-rich]')) {
      const nodes = richParts(t(element.getAttribute('data-i18n-rich'))).map((part) => {
        if (part.key === undefined) return doc.createTextNode(part.text);
        const key = doc.createElement('kbd');
        key.textContent = part.key;
        return key;
      });
      element.replaceChildren(...nodes);
    }
    for (const [attribute, data] of ATTRIBUTES) {
      for (const element of doc.querySelectorAll(`[${data}]`)) {
        element.setAttribute(attribute, t(element.getAttribute(data)));
      }
    }
  }

  // Sets the language and the direction of `doc`. A snippet keeps its own direction, because the
  // text boxes and rows that show snippet text set dir="auto" themselves.
  function setLanguage(doc) {
    doc.documentElement.lang = languageTag();
    doc.documentElement.dir = direction();
  }

  // Sets up a page: its language and direction, then its static text.
  function apply(doc = root.document) {
    setLanguage(doc);
    fill(doc);
  }

  const api = { t, plural, number, expand, languageTag, direction, richParts, fill, setLanguage, apply };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, { i18n: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
