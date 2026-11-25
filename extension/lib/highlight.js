/*
 * Syntax colors for code blocks in formatted snippets. The manager page loads this file after the
 * bundled Prism 1.30.0 (see vendor/prism) and calls colorBlocks() when a snippet is read for
 * saving. Prism only finds the tokens. The colors come from the fixed palette in lib/richtext.js,
 * and richText.colorCode() writes them, so nothing Prism produces is ever stored. No other page
 * loads Prism.
 */
(function (root) {
  'use strict';

  // The Prism grammar for each language a code block can name.
  const GRAMMARS = {
    json: 'json',
    javascript: 'javascript',
    typescript: 'typescript',
    python: 'python',
    html: 'markup',
    css: 'css',
    sql: 'sql',
    shell: 'bash',
  };

  // The palette color for each Prism token type. A type that is not here keeps the text color.
  const COLOR_OF_TYPE = {
    keyword: 'keyword',
    boolean: 'keyword',
    builtin: 'keyword',
    property: 'keyword',
    rule: 'keyword',
    important: 'keyword',
    tag: 'keyword',
    string: 'string',
    char: 'string',
    'attr-value': 'string',
    'template-string': 'string',
    regex: 'string',
    number: 'number',
    hexcode: 'number',
    comment: 'comment',
    prolog: 'comment',
    doctype: 'comment',
    cdata: 'comment',
  };

  // A block longer than this stays plain, so a very long paste cannot stall the manager.
  const MAX_CODE_LENGTH = 20000;
  const CACHE_LIMIT = 50;
  const cache = new Map();

  function typesOf(token) {
    return [token.type, ...[].concat(token.alias || [])];
  }

  // Collects [start, end, color] ranges from Prism's tokens. An outer HTML tag and an at-rule are
  // read through to the tokens inside them, so the attribute values of a tag keep their own color.
  function collect(tokens, offset, out) {
    let at = offset;
    for (const token of tokens) {
      if (typeof token === 'string') {
        at += token.length;
        continue;
      }
      const types = typesOf(token);
      const children = Array.isArray(token.content) ? token.content : null;
      const outerTag =
        types.includes('tag') && children && children.some((child) => typeof child !== 'string' && child.type === 'tag');
      if (outerTag || types.includes('atrule')) {
        collect(children, at, out);
      } else {
        const type = types.find((name) => Object.hasOwn(COLOR_OF_TYPE, name));
        if (type) out.push([at, at + token.length, COLOR_OF_TYPE[type]]);
        else if (children) collect(children, at, out);
      }
      at += token.length;
    }
    return out;
  }

  // The colored ranges of `text` in `language`, as [start, end, color name] lists, or an empty list
  // for a language Prism has no grammar for.
  function colorize(language, text) {
    const Prism = root.Prism;
    const grammar = Object.hasOwn(GRAMMARS, language) && Prism && Prism.languages[GRAMMARS[language]];
    if (!grammar || text.length > MAX_CODE_LENGTH) return [];
    const key = `${language}\0${text}`;
    if (cache.has(key)) return cache.get(key);
    const ranges = collect(Prism.tokenize(text, grammar), 0, []);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, ranges);
    return ranges;
  }

  // The cleaned HTML with every code block that names a language colored, and every other code
  // block without color.
  function colorBlocks(html) {
    return root.SnippetInserter.richText.colorCode(html, colorize);
  }

  const api = { colorize, colorBlocks, MAX_CODE_LENGTH };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, { highlight: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
