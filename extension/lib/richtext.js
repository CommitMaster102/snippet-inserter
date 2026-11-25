/*
 * Formatted snippet text: the cleaner that keeps only the formatting a snippet may hold, and the
 * conversions between that HTML and plain text.
 *
 * A formatted snippet keeps HTML that this file wrote. It holds text, line breaks, bold, italic,
 * underline, inline code, links to http, https, mailto, and tel addresses, bulleted and numbered
 * lists nested up to 3 levels, and code blocks, which keep every space, tab, and line break and may
 * name a language. Nothing else survives. The cleaner reads its input into its own model of lines
 * of marked text and writes every element and attribute of the output itself, so no element or
 * attribute of the input is ever copied. Strings are parsed with DOMParser, whose documents run no
 * scripts and load nothing.
 *
 * The cleaner runs when a snippet is saved, when a backup is imported, and again before each
 * insert. The manager page and the panel load this file. content-main.js imports it the first time
 * a frame inserts a formatted snippet into a rich editor or Google Docs, or an abbreviation is typed
 * into a rich editor for a snippet that includes others while any stored snippet is formatted. The
 * placeholder functions come from placeholders.js.
 */
(function (root) {
  'use strict';

  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const MAX_LIST_DEPTH = 3;
  const URL_MAX_LENGTH = 2048;
  const SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
  const BULLET = `${String.fromCharCode(0x2022)} `;
  const NBSP = String.fromCharCode(0x00a0);
  // Marks the {cursor} position while placeholders are filled in; snippet text does not contain it.
  const CURSOR_MARK = String.fromCharCode(0xe000);

  // The languages a code block can name, under the names the HTML of a pasted code block uses.
  const LANGUAGES = ['json', 'javascript', 'typescript', 'python', 'html', 'css', 'sql', 'shell'];
  const LANGUAGE_NAMES = new Map([
    ...LANGUAGES.map((name) => [name, name]),
    ['js', 'javascript'],
    ['jsx', 'javascript'],
    ['ts', 'typescript'],
    ['tsx', 'typescript'],
    ['py', 'python'],
    ['xml', 'html'],
    ['markup', 'html'],
    ['sh', 'shell'],
    ['bash', 'shell'],
    ['zsh', 'shell'],
    ['console', 'shell'],
  ]);

  // Elements dropped together with everything inside them: scripts, styles, embedded content,
  // media, form controls, and the parts of a document that are not its text.
  const DROPPED = new Set(
    ('script style template noscript iframe frame frameset object embed applet param img image picture ' +
      'video audio source track canvas map area input button select option optgroup textarea datalist ' +
      'output progress meter head title meta link base xmp noembed noframes plaintext slot dialog')
      .split(' ')
  );
  // Elements that start and end a line, as they do on screen.
  const BLOCKS = new Set(
    ('address article aside blockquote center dd details div dl dt fieldset figcaption figure footer form ' +
      'h1 h2 h3 h4 h5 h6 header hgroup hr legend main nav p section summary table thead tbody tfoot tr caption')
      .split(' ')
  );

  // The colors a span in a code block may carry. The cleaner writes each one itself, and no other
  // color survives. Each is at least 4:1 against both #ffffff and #111213, so code reads on a light
  // and on a dark background; lib/highlight.js picks one for each kind of token.
  const COLORS = Object.freeze({ keyword: '#2f7fc0', string: '#2f8f4e', number: '#c0602a', comment: '#7a7f87' });
  // How the browser writes a color of the palette in a style, to tell it from every other color.
  const COLOR_NAMES = new Map(
    Object.entries(COLORS).map(([name, hex]) => {
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
      return [`rgb(${r}, ${g}, ${b})`, name];
    })
  );

  const NO_MARKS = Object.freeze({ b: false, i: false, u: false, code: false, href: '', color: '' });

  function placeholders() {
    return root.SnippetInserter.placeholders;
  }

  function run(text, marks) {
    return { text, b: marks.b, i: marks.i, u: marks.u, code: marks.code, href: marks.href, color: marks.color || '' };
  }

  function sameMarks(a, b) {
    return a.b === b.b && a.i === b.i && a.u === b.u && a.code === b.code && a.href === b.href && a.color === b.color;
  }

  function hasText(line) {
    return line.some((part) => part.text);
  }

  function lineString(line) {
    return line.map((part) => part.text).join('');
  }

  // The model. A tree is { segments }, and a segment is one of
  //   { type: 'lines', lines }                 lines of text, each an array of runs
  //   { type: 'list', ordered, items }         a list, each item { segments }
  //   { type: 'pre', language, lines }         a code block, whose runs carry no marks
  // A run is { text, b, i, u, code, href, color }, where color is a name in COLORS or ''. Its text
  // holds no line break, and only a run in a code block has a color.
  //
  // The builder below turns a stream of text, line breaks, and blocks into a tree, with the line
  // rules a browser uses on screen: a block starts and ends a line, and a line break at the end of a
  // block, which the browser does not draw, adds no line. Each open* method returns the function
  // that closes what it opened.

  function builder() {
    const tree = { segments: [] };
    const stack = [{ kind: 'box', box: tree, line: null, space: false }];
    // Lists past MAX_LIST_DEPTH, whose items become plain lines.
    let flat = 0;
    const top = () => stack[stack.length - 1];
    const inPre = () => stack.some((frame) => frame.kind === 'pre');

    function store(frame, line) {
      if (frame.kind === 'pre') {
        frame.seg.lines.push(line);
        return;
      }
      const segments = frame.box.segments;
      let last = segments[segments.length - 1];
      if (!last || last.type !== 'lines') segments.push((last = { type: 'lines', lines: [] }));
      last.lines.push(line);
    }

    // A space that collapsing white space left at the end of a line is not drawn, so it goes.
    function dropSpace(frame) {
      if (frame.space && frame.line && frame.line.length) {
        const last = frame.line[frame.line.length - 1];
        last.text = last.text.slice(0, -1);
        if (!last.text) frame.line.pop();
      }
      frame.space = false;
    }

    function finish(frame) {
      if (frame.kind === 'list') return;
      dropSpace(frame);
      if (frame.line && hasText(frame.line)) store(frame, frame.line);
      frame.line = null;
    }

    function popTo(depth) {
      while (stack.length > depth) finish(stack.pop());
    }

    // An item for text or a block that sits directly in a list, outside any item.
    function looseItem() {
      const item = { segments: [] };
      top().seg.items.push(item);
      stack.push({ kind: 'box', box: item, line: null, space: false, loose: true });
      return top();
    }

    function textFrame() {
      return top().kind === 'list' ? looseItem() : top();
    }

    function append(frame, text, marks) {
      if (!text) return;
      if (frame.line === null) frame.line = [];
      const line = frame.line;
      // A code block keeps only a color. Everywhere else a color is dropped.
      let plainMarks = marks;
      if (frame.kind === 'pre') plainMarks = marks.color ? { ...NO_MARKS, color: marks.color } : NO_MARKS;
      else if (marks.color) plainMarks = { ...marks, color: '' };
      const last = line[line.length - 1];
      if (last && sameMarks(last, plainMarks)) last.text += text;
      else line.push(run(text, plainMarks));
    }

    function br() {
      const frame = textFrame();
      dropSpace(frame);
      store(frame, frame.line || []);
      frame.line = [];
    }

    function boundary() {
      const frame = top();
      if (frame.kind !== 'list') finish(frame);
    }

    // `whiteSpace` is 'pre' to keep every character, with line breaks starting new lines,
    // 'pre-line' to keep line breaks and collapse spaces, or 'normal' to collapse both, as a
    // browser draws the text.
    function text(value, marks, whiteSpace = 'pre') {
      if (!value) return;
      // White space between the items of a list is layout, not text.
      if (top().kind === 'list' && !/\S/.test(value)) return;
      const pieces = whiteSpace === 'normal' ? [value] : value.split(/\r\n?|\n/);
      pieces.forEach((piece, n) => {
        if (n) br();
        if (whiteSpace === 'pre') {
          const frame = textFrame();
          frame.space = false;
          append(frame, piece, marks);
          return;
        }
        let collapsed = piece.replace(/[ \t\n\r\f]+/g, ' ');
        const frame = textFrame();
        if (frame.space || !frame.line || !hasText(frame.line)) collapsed = collapsed.replace(/^ /, '');
        if (!collapsed) return;
        frame.space = collapsed.endsWith(' ');
        append(frame, collapsed.split(NBSP).join(' '), marks);
      });
    }

    // A table cell is set off from the one before it by a space.
    function cell() {
      const frame = top();
      if (frame.kind !== 'list' && frame.line && hasText(frame.line) && !frame.space) text(' ', NO_MARKS, 'normal');
    }

    function openList(ordered) {
      boundary();
      const depth = stack.filter((frame) => frame.kind === 'list').length;
      if (flat || inPre() || depth >= MAX_LIST_DEPTH) {
        flat += 1;
        return () => {
          boundary();
          flat -= 1;
        };
      }
      const base = stack.length;
      // A list directly inside a list, as the browser's indent command writes it, belongs to the
      // item before it.
      if (top().kind === 'list') {
        const items = top().seg.items;
        if (!items.length) items.push({ segments: [] });
        stack.push({ kind: 'box', box: items[items.length - 1], line: null, space: false });
      }
      const seg = { type: 'list', ordered, items: [] };
      top().box.segments.push(seg);
      stack.push({ kind: 'list', seg });
      return () => {
        popTo(base);
        boundary();
      };
    }

    function openItem() {
      if (top().loose) popTo(stack.length - 1);
      if (flat || top().kind !== 'list') {
        boundary();
        return boundary;
      }
      const item = { segments: [] };
      top().seg.items.push(item);
      const base = stack.length;
      stack.push({ kind: 'box', box: item, line: null, space: false });
      return () => popTo(base);
    }

    function openPre(language) {
      boundary();
      if (inPre()) return boundary;
      const parent = textFrame();
      const seg = { type: 'pre', language: language || '', lines: [] };
      parent.box.segments.push(seg);
      const base = stack.length;
      stack.push({ kind: 'pre', seg, line: null, space: false });
      return () => {
        popTo(base);
        boundary();
      };
    }

    // The language of the code block being read, when it has none yet.
    function setLanguage(language) {
      const frame = stack.find((f) => f.kind === 'pre');
      if (frame && !frame.seg.language && language) frame.seg.language = language;
    }

    function result() {
      popTo(1);
      finish(stack[0]);
      return prune(tree);
    }

    return { text, br, boundary, cell, openList, openItem, openPre, setLanguage, inPre, result };
  }

  // Drops empty lists and code blocks, gives an empty list item one empty line, and joins lines
  // that a dropped block had kept apart.
  function prune(tree) {
    const segments = [];
    for (const seg of tree.segments) {
      if (seg.type === 'list') {
        for (const item of seg.items) {
          prune(item);
          if (!item.segments.length) item.segments.push({ type: 'lines', lines: [[]] });
        }
        if (!seg.items.length) continue;
      } else if (!seg.lines.length) {
        continue;
      }
      const last = segments[segments.length - 1];
      if (seg.type === 'lines' && last && last.type === 'lines') last.lines.push(...seg.lines);
      else segments.push(seg);
    }
    tree.segments = segments;
    return tree;
  }

  // Reading HTML.

  // A link address the cleaner keeps: an absolute http, https, mailto, or tel address of at most
  // URL_MAX_LENGTH characters, as the URL parser writes it, or null. Braces are written as escapes,
  // so an address never holds a placeholder.
  function normalizeUrl(input) {
    if (typeof input !== 'string') return null;
    const text = input.trim();
    if (!text || text.length > URL_MAX_LENGTH) return null;
    let url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (!SCHEMES.has(url.protocol) || url.href === url.protocol) return null;
    const href = url.href.replace(/[{}]/g, (c) => (c === '{' ? '%7B' : '%7D'));
    return href.length > URL_MAX_LENGTH ? null : href;
  }

  // The language a code block's element names in a data-language attribute or a class such as
  // "language-json" or "lang-js", or ''.
  function languageOf(element) {
    const named = (element.getAttribute('data-language') || '').trim().toLowerCase();
    if (LANGUAGE_NAMES.has(named)) return LANGUAGE_NAMES.get(named);
    for (const word of (element.getAttribute('class') || '').toLowerCase().split(/\s+/)) {
      const match = /^(?:language|lang)-(.+)$/.exec(word);
      if (match && LANGUAGE_NAMES.has(match[1])) return LANGUAGE_NAMES.get(match[1]);
    }
    return '';
  }

  // The marks of an element's text: those of its parent, changed by what the element is and by
  // its inline style. Google Docs wraps a copy in <b style="font-weight:normal"> and marks bold
  // text with font-weight:700, so the style decides over the element name.
  function marksOf(name, style, parent) {
    const marks = { ...parent };
    if (name === 'b' || name === 'strong') marks.b = true;
    if (name === 'i' || name === 'em') marks.i = true;
    if (name === 'u' || name === 'ins') marks.u = true;
    if (!style) return marks;
    const weight = style.fontWeight;
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) marks.b = true;
    else if (weight === 'normal' || weight === 'lighter' || Number(weight) > 0) marks.b = false;
    if (style.fontStyle === 'italic' || style.fontStyle === 'oblique') marks.i = true;
    else if (style.fontStyle === 'normal') marks.i = false;
    const decoration = style.textDecorationLine || style.textDecoration || '';
    if (decoration.includes('underline')) marks.u = true;
    else if (decoration === 'none' && (name === 'u' || name === 'ins')) marks.u = false;
    return marks;
  }

  // Walks the children of `start` with a stack of its own instead of recursion, so a document
  // nested many thousands of levels deep cannot overflow the call stack. With `pasted`, white space
  // collapses as the browser draws it, except where the element keeps it; without, the input is
  // text a person typed in the manager, and every space and line break counts.
  function walk(start, b, pasted) {
    const work = [];
    const pushChildren = (node, context) => {
      for (let child = node.lastChild; child; child = child.previousSibling) work.push({ node: child, context });
    };
    pushChildren(start, { marks: NO_MARKS, whiteSpace: pasted ? 'normal' : 'pre' });
    while (work.length) {
      const item = work.pop();
      if (item.close) {
        item.close();
        continue;
      }
      const { node, context } = item;
      if (node.nodeType === 3) {
        b.text(node.data, context.marks, b.inPre() ? 'pre' : context.whiteSpace);
        continue;
      }
      // Comments, processing instructions, and elements outside HTML, such as SVG and MathML,
      // go with everything inside them.
      if (node.nodeType !== 1 || node.namespaceURI !== HTML_NS) continue;
      const name = node.localName;
      const style = node.style;
      if (DROPPED.has(name) || node.hasAttribute('hidden') || (style && style.display === 'none')) continue;
      let close = null;
      let { marks, whiteSpace } = context;
      if (pasted && style && style.whiteSpace) {
        const value = style.whiteSpace;
        whiteSpace = /^(pre|pre-wrap|break-spaces)$/.test(value) ? 'pre' : value === 'pre-line' ? 'pre-line' : 'normal';
      }
      if (name === 'br') {
        b.br();
        continue;
      } else if (name === 'ul' || name === 'ol' || name === 'menu') {
        close = b.openList(name === 'ol');
      } else if (name === 'li') {
        close = b.openItem();
      } else if (name === 'pre' || name === 'listing') {
        close = b.openPre(languageOf(node));
      } else if (name === 'td' || name === 'th') {
        b.cell();
      } else if (name === 'a') {
        const href = normalizeUrl(node.getAttribute('href'));
        if (href) marks = { ...marks, href };
      } else if (name === 'code' || name === 'kbd' || name === 'samp' || name === 'tt') {
        if (b.inPre()) b.setLanguage(languageOf(node));
        else marks = { ...marks, code: true };
      } else if (BLOCKS.has(name)) {
        b.boundary();
        close = b.boundary;
      }
      // A span in a code block may name a color of the palette, and no other element or color counts.
      if (name === 'span' && style && b.inPre()) {
        const color = COLOR_NAMES.get(style.color);
        if (color) marks = { ...marks, color };
      }
      marks = marksOf(name, style, marks);
      if (close) work.push({ close });
      pushChildren(node, { marks, whiteSpace });
    }
  }

  // The tree of `input`, an HTML string or a DOM node whose children are read.
  function parse(input, { pasted = false } = {}) {
    const b = builder();
    if (typeof input === 'string') {
      // The parser drops white space that comes before the body of a document, and in a snippet
      // that white space is text, so a body tag goes first unless the input is a whole document.
      const source = /^\s/.test(input) && !/^\s*<(!doctype|html|head|body)\b/i.test(input) ? `<body>${input}` : input;
      const body = source && new DOMParser().parseFromString(source, 'text/html').body;
      if (body) walk(body, b, pasted);
    } else if (input) {
      walk(input, b, pasted);
    }
    return b.result();
  }

  // The tree of plain text: one line per line of the text, without formatting.
  function textTree(text) {
    const value = String(text);
    if (!value) return { segments: [] };
    const lines = value.split(/\r\n?|\n/).map((line) => (line ? [run(line, NO_MARKS)] : []));
    return { segments: [{ type: 'lines', lines }] };
  }

  // Writing a tree.
  //
  // In 'store' mode the output is a whole document: a line that ends a group of lines with nothing
  // on it gets one more <br>, because the browser does not draw a line break at the end of a block.
  // 'fragment' mode leaves that <br> out, for HTML that goes into the middle of other text. 'paste'
  // mode is a fragment for another editor: outside code blocks, spaces that HTML would collapse
  // become no-break spaces, and each tab goes in a span that keeps it, as for plain snippets.

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ESCAPES[c]);

  // `whole` is true where the lines end a block: in 'store' mode, and always inside a list item or a
  // code block. `paste` is true in 'paste' mode.
  function render(segments, sink, { paste, whole }) {
    for (const seg of segments) {
      if (seg.type === 'lines') {
        renderLines(seg.lines, sink, paste, whole);
      } else if (seg.type === 'list') {
        sink.open(seg.ordered ? 'ol' : 'ul');
        for (const item of seg.items) {
          sink.open('li');
          render(item.segments, sink, { paste, whole: true });
          sink.close();
        }
        sink.close();
      } else {
        sink.open('pre');
        sink.open('code', seg.language ? { class: `language-${seg.language}` } : null);
        renderLines(seg.lines, sink, false, true);
        sink.close();
        sink.close();
      }
    }
  }

  function renderLines(lines, sink, paste, whole) {
    lines.forEach((line, n) => {
      if (n) sink.br();
      renderRuns(paste ? hardSpaces(line) : line, sink);
    });
    if (whole && lines.length && !hasText(lines[lines.length - 1])) sink.br();
  }

  // Writes the runs of one line, nesting their elements in one fixed order (the link outside, then
  // bold, italic, underline, and code), so the same text always gives the same HTML.
  function renderRuns(line, sink) {
    let open = [];
    for (const part of line) {
      if (!part.text) continue;
      const want = [];
      if (part.href) want.push(`a ${part.href}`);
      for (const key of ['b', 'i', 'u', 'code']) if (part[key]) want.push(key);
      if (part.color) want.push(`span ${part.color}`);
      let keep = 0;
      while (keep < open.length && keep < want.length && open[keep] === want[keep]) keep++;
      for (let n = open.length; n > keep; n--) sink.close();
      for (const mark of want.slice(keep)) {
        if (mark.startsWith('a ')) sink.open('a', { href: mark.slice(2) });
        else if (mark.startsWith('span ')) sink.open('span', { style: `color:${COLORS[mark.slice(5)]}` });
        else sink.open(mark);
      }
      open = want;
      sink.text(part.text);
    }
    for (let n = open.length; n > 0; n--) sink.close();
  }

  // The runs of a line with the spaces HTML would collapse turned into no-break spaces: the second
  // of each pair of spaces, and a space at the start or end of the line.
  function hardSpaces(line) {
    const text = lineString(line);
    const hard = new Set();
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ' && text[i + 1] === ' ') hard.add(++i);
    }
    if (text[0] === ' ') hard.add(0);
    if (text[text.length - 1] === ' ') hard.add(text.length - 1);
    if (!hard.size) return line;
    let at = 0;
    return line.map((part) => {
      let changed = '';
      for (let k = 0; k < part.text.length; k++) changed += hard.has(at++) ? NBSP : part.text[k];
      return { ...part, text: changed };
    });
  }

  // With `codeNewlines`, a line break inside a code block is written as a newline character.
  function stringSink(paste, codeNewlines = false) {
    let out = '';
    const open = [];
    return {
      open(tag, attributes) {
        let attrs = '';
        for (const [name, value] of Object.entries(attributes || {})) attrs += ` ${name}="${escapeHtml(value)}"`;
        out += `<${tag}${attrs}>`;
        open.push(tag);
      },
      close() {
        out += `</${open.pop()}>`;
      },
      br() {
        out += codeNewlines && open.includes('pre') ? '\n' : '<br>';
      },
      text(value) {
        let html = escapeHtml(value);
        if (paste) {
          html = html.split(NBSP).join('&nbsp;');
          if (!open.includes('pre')) html = html.replace(/\t/g, '<span style="white-space:pre">\t</span>');
        }
        out += html;
      },
      result: () => out,
    };
  }

  function serialize(tree, mode = 'store', { codeNewlines = false } = {}) {
    const sink = stringSink(mode === 'paste', codeNewlines);
    render(tree.segments, sink, { paste: mode === 'paste', whole: mode === 'store' });
    return sink.result();
  }

  // DOM nodes for the HTML, made with createElement and createTextNode. With `titles`, each link
  // shows its address as a tooltip.
  function toFragment(html, doc, { titles = false } = {}) {
    const fragment = doc.createDocumentFragment();
    const open = [fragment];
    const add = (node) => open[open.length - 1].append(node);
    render(parse(html).segments, {
      open(tag, attributes) {
        const element = doc.createElement(tag);
        if (attributes && attributes.style) element.setAttribute('style', attributes.style);
        if (attributes && attributes.href) {
          element.setAttribute('href', attributes.href);
          if (titles) element.title = attributes.href;
        }
        if (attributes && attributes.class) {
          element.className = attributes.class;
          // The manager reads a code block's language from its pre element.
          const parent = open[open.length - 1];
          if (tag === 'code' && parent.localName === 'pre') parent.setAttribute('data-language', attributes.class.replace(/^language-/, ''));
        }
        add(element);
        open.push(element);
      },
      close() {
        open.pop();
      },
      br() {
        add(doc.createElement('br'));
      },
      text(value) {
        add(doc.createTextNode(value));
      },
    }, { paste: false, whole: true });
    return fragment;
  }

  // Plain text.

  // The address a link shows in plain text: the URL, or the email address or phone number alone.
  function shownAddress(href) {
    const match = /^(mailto|tel):(.*)$/i.exec(href);
    if (!match) return href;
    try {
      return decodeURIComponent(match[2]);
    } catch {
      return match[2];
    }
  }

  // A line's text, with each link's address in parentheses after it, unless the link's text
  // already is that address.
  function lineText(line) {
    let text = '';
    for (let i = 0; i < line.length; ) {
      const href = line[i].href;
      let label = '';
      while (i < line.length && line[i].href === href) label += line[i++].text;
      text += label;
      if (!href) continue;
      const shown = shownAddress(href);
      const typed = label.trim();
      if (typed !== href && typed !== shown && `${typed}/` !== href && typed.replace(/^(mailto|tel):/i, '') !== shown) {
        text += ` (${shown})`;
      }
    }
    return text;
  }

  // The lines of plain text for `segments`. A bulleted item starts with a bullet and a space, a
  // numbered item with its number, and each level of a nested list adds 2 spaces. A code block
  // keeps its lines exactly. `own` is false for the lines of a nested list, which carry their
  // marker already.
  function textLines(segments, level) {
    const out = [];
    for (const seg of segments) {
      if (seg.type === 'lines') {
        for (const line of seg.lines) out.push({ text: lineText(line), own: true });
      } else if (seg.type === 'pre') {
        for (const line of seg.lines) out.push({ text: lineString(line), own: true, code: true });
      } else {
        const indent = '  '.repeat(level);
        seg.items.forEach((item, n) => {
          const marker = seg.ordered ? `${n + 1}. ` : BULLET;
          const inner = textLines(item.segments, level + 1);
          if (!inner.length || !inner[0].own) out.push({ text: (indent + marker).trimEnd(), own: false });
          let first = true;
          for (const line of inner) {
            let text = line.text;
            if (line.own && first) text = line.text ? indent + marker + line.text : (indent + marker).trimEnd();
            else if (line.own && !line.code) text = indent + ' '.repeat(marker.length) + line.text;
            if (line.own) first = false;
            out.push({ text, own: false });
          }
        });
      }
    }
    return out;
  }

  function treeText(tree) {
    return textLines(tree.segments, 0)
      .map((line) => line.text)
      .join('\n');
  }

  function hasFormat(segments) {
    return segments.some(
      (seg) => seg.type !== 'lines' || seg.lines.some((line) => line.some((part) => part.b || part.i || part.u || part.code || part.href))
    );
  }

  // Re-emitting a tree into a builder, with an optional search and replace on the text of each line.
  // A match may cross formatting: the replacement takes the marks of the run where the match starts,
  // and the rest of the match is removed from the runs after it. `extra` adds marks to every run, for
  // a snippet included inside formatted text. With `fragment`, the last line of a group is not a
  // whole line of a document; see render().

  function emit(segments, b, options) {
    for (const seg of segments) {
      if (seg.type === 'lines') {
        emitLines(seg.lines, b, options);
      } else if (seg.type === 'list') {
        const closeList = b.openList(seg.ordered);
        for (const item of seg.items) {
          const closeItem = b.openItem();
          emit(item.segments, b, { ...options, fragment: false });
          closeItem();
        }
        closeList();
      } else {
        const closePre = b.openPre(seg.language);
        emitLines(seg.lines, b, { ...options, fragment: false });
        closePre();
      }
    }
  }

  function emitLines(lines, b, options) {
    lines.forEach((line, n) => {
      if (n) b.br();
      emitLine(line, b, options);
    });
    if (!options.fragment && lines.length && !hasText(lines[lines.length - 1])) b.br();
  }

  function withMarks(part, extra) {
    if (!extra) return part;
    return {
      b: part.b || extra.b,
      i: part.i || extra.i,
      u: part.u || extra.u,
      code: part.code || extra.code,
      href: part.href || extra.href,
      color: part.color || extra.color || '',
    };
  }

  function emitLine(line, b, { find, replace, extra }) {
    const matches = find ? find(lineString(line)) : [];
    let position = 0;
    let next = 0;
    let skipTo = 0;
    for (const part of line) {
      const marks = withMarks(part, extra);
      const end = position + part.text.length;
      let at = position;
      while (at < end) {
        if (at < skipTo) {
          at = Math.min(end, skipTo);
          continue;
        }
        const match = matches[next];
        if (match && match.index === at) {
          replace(match, marks, b);
          skipTo = at + match[0].length;
          next += 1;
          continue;
        }
        const stop = match && match.index < end ? match.index : end;
        b.text(part.text.slice(at - position, stop - position), marks);
        at = stop;
      }
      position = end;
    }
  }

  function transform(tree, find, replace) {
    const b = builder();
    emit(tree.segments, b, { find, replace, fragment: false });
    return b.result();
  }

  function finder(pattern) {
    const global = new RegExp(pattern.source, 'g');
    return (text) => [...text.matchAll(global)];
  }

  // Colors for code blocks. `colorize(language, text)` returns [start, end, color name] ranges over
  // the text of a block, whose lines are joined with one line break each. A range that is not a pair
  // of whole numbers inside the text with a name in COLORS is ignored, so the colorizer cannot
  // write anything but the palette. A block with no language, or one the colorizer gives no
  // ranges, loses its colors.
  function recolor(seg, colorize) {
    const text = seg.lines.map(lineString).join('\n');
    const names = new Array(text.length).fill('');
    const ranges = seg.language ? colorize(seg.language, text) : [];
    for (const range of Array.isArray(ranges) ? ranges : []) {
      if (!Array.isArray(range)) continue;
      const [start, end, name] = range;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;
      if (typeof name !== 'string' || !Object.hasOwn(COLORS, name)) continue;
      names.fill(name, start, Math.min(end, text.length));
    }
    let at = 0;
    seg.lines = seg.lines.map((line) => {
      const runs = [];
      for (const char of lineString(line)) {
        const color = names[at];
        const last = runs[runs.length - 1];
        if (last && last.color === color) last.text += char;
        else runs.push({ ...run(char, NO_MARKS), color });
        at += char.length;
      }
      at += 1;
      return runs;
    });
  }

  function colorSegments(segments, colorize) {
    for (const seg of segments) {
      if (seg.type === 'list') for (const item of seg.items) colorSegments(item.segments, colorize);
      else if (seg.type === 'pre') recolor(seg, colorize);
    }
  }

  // The HTML of `input` with each code block colored by `colorize`; see recolor().
  function colorCode(input, colorize) {
    const tree = parse(input);
    colorSegments(tree.segments, colorize);
    return serialize(tree);
  }

  // The public functions. Each one reads its HTML through the cleaner first.

  // The cleaned HTML of `input` (an HTML string or a DOM node), its plain text, and whether it has
  // any formatting. `pasted` treats the input as HTML from the clipboard; see walk().
  function clean(input, options) {
    const tree = parse(input, options);
    return { html: serialize(tree), text: treeText(tree), formatted: hasFormat(tree.segments) };
  }

  function sanitize(input, options) {
    return serialize(parse(input, options));
  }

  // The cleaned HTML for inserting into the middle of other text, such as a paste into the manager's
  // editor.
  function fragment(input, options) {
    return serialize(parse(input, options), 'fragment');
  }

  // The HTML of one code block holding `text`, which keeps every space, tab, and line break. The
  // language is kept when it is one of LANGUAGES.
  function codeBlock(text, language = '') {
    const lines = String(text)
      .split(/\r\n?|\n/)
      .map((line) => (line ? [run(line, NO_MARKS)] : []));
    const named = LANGUAGES.includes(language) ? language : '';
    return serialize({ segments: [{ type: 'pre', language: named, lines }] });
  }

  function toText(html) {
    return treeText(parse(html));
  }

  function fromText(text) {
    return serialize(textTree(text));
  }

  function hasFormatting(html) {
    return hasFormat(parse(html).segments);
  }

  // Replaces each `from` in the text with `to`, also where formatting splits `from`.
  function renameText(html, from, to) {
    const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return serialize(transform(parse(html), finder(pattern), (_match, marks, b) => b.text(to, marks)));
  }

  // The formatted text of `snippet` with every {snippet:...} reference replaced, as
  // placeholders.resolveReferences does for plain text. An included snippet with formatting keeps
  // it, and one without goes in as its lines. Either takes on the formatting around the reference,
  // such as bold. A reference with no target, one that would include a snippet in itself, and any
  // after 100 included snippets stay as written. When the snippet has its own {cursor}, the cursors
  // of included snippets are dropped. A snippet with no formatting of its own is taken as its text,
  // and the result is null when no snippet it includes has formatting either, because then the
  // plain text is all there is to send.
  function resolve(snippet, snippets) {
    const P = placeholders();
    const own = Boolean(snippet.html);
    const referenced = String(snippet.content).includes('{snippet:');
    if (!own && !referenced) return null;
    const tree = own ? parse(snippet.html) : textTree(String(snippet.content));
    if (!referenced) return serialize(tree);
    let formatted = own;
    const byAbbreviation = new Map();
    for (const other of snippets) if (other.abbreviation) byAbbreviation.set(other.abbreviation, other);
    const pattern = new RegExp(P.REFERENCE.source, 'g');
    const ownCursor = String(snippet.content).includes('{cursor}');
    let included = 0;
    const target = (abbreviation, stack) => {
      const found = byAbbreviation.get(abbreviation);
      if (!found || stack.includes(found.id) || included >= P.REFERENCE_MAX) return null;
      included += 1;
      return found;
    };
    const plainWalk = (text, stack) =>
      text.replace(pattern, (token, abbreviation) => {
        const found = target(abbreviation, stack);
        return found ? plainWalk(String(found.content), [...stack, found.id]) : token;
      });
    const htmlWalk = (current, stack) =>
      transform(current, finder(pattern), (match, marks, b) => {
        const found = target(match[1], stack);
        if (!found) {
          b.text(match[0], marks);
          return;
        }
        if (found.html) formatted = true;
        const inner = [...stack, found.id];
        let child = found.html ? htmlWalk(parse(found.html), inner) : textTree(plainWalk(String(found.content), inner));
        if (ownCursor) child = transform(child, finder(/\{cursor\}/), () => {});
        emit(child.segments, b, { extra: marks, fragment: true });
      });
    const html = serialize(htmlWalk(tree, [snippet.id]));
    return formatted ? html : null;
  }

  // The text of all lines in order, one line break between them, without list markers or link
  // addresses: what the caret passes over in an editor.
  function caretText(segments, out = []) {
    for (const seg of segments) {
      if (seg.type === 'list') for (const item of seg.items) caretText(item.segments, out);
      else for (const line of seg.lines) out.push(lineString(line));
    }
    return out;
  }

  // The HTML with its placeholders filled in, as placeholders.expand does for plain text. Values go
  // in as text with the formatting of the place they fill, never as HTML. `cursorFromEnd` counts the
  // characters from the first {cursor} to the end, with one for each line break, or is null.
  function expand(html, { values = {}, locale, now = new Date() } = {}) {
    const P = placeholders();
    let cursor = false;
    const tree = transform(parse(html), P.scan, (match, marks, b) => {
      if (match[0] === '{cursor}') {
        if (!cursor) b.text(CURSOR_MARK, marks);
        cursor = true;
        return;
      }
      b.text(P.valueFor(match, values, locale, now), marks);
    });
    let cursorFromEnd = null;
    if (cursor) {
      const text = caretText(tree.segments).join('\n');
      cursorFromEnd = text.length - text.indexOf(CURSOR_MARK) - 1;
      const strip = (segments) => {
        for (const seg of segments) {
          if (seg.type === 'list') for (const item of seg.items) strip(item.segments);
          else for (const line of seg.lines) for (const part of line) part.text = part.text.split(CURSOR_MARK).join('');
        }
      };
      strip(tree.segments);
    }
    return { html: serialize(tree), cursorFromEnd };
  }

  // The HTML that goes to a rich editor or Google Docs as a paste. `left` and `right` add the spaces
  // of the spacing rule, and `suffix` is the text typed after an abbreviation. They are added only
  // next to text, not next to a list or a code block, which start and end a line of their own.
  // `codeNewlines` breaks the lines of a code block with newline characters instead of <br>, for
  // Google Docs, which drops the first space after each <br> in a code block.
  function forPaste(html, { left = false, right = false, suffix = '', codeNewlines = false } = {}) {
    const tree = parse(html);
    const segments = tree.segments;
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (left && first && first.type === 'lines') first.lines[0].unshift(run(' ', NO_MARKS));
    if (last && last.type === 'lines') {
      const pieces = `${right ? ' ' : ''}${suffix}`.split(/\r\n?|\n/);
      last.lines[last.lines.length - 1].push(run(pieces[0], NO_MARKS));
      for (const piece of pieces.slice(1)) last.lines.push(piece ? [run(piece, NO_MARKS)] : []);
    }
    return serialize(tree, 'paste', { codeNewlines });
  }

  const api = {
    LANGUAGES,
    COLORS,
    languageOf,
    normalizeUrl,
    colorCode,
    clean,
    sanitize,
    fragment,
    toText,
    fromText,
    codeBlock,
    hasFormatting,
    toFragment,
    renameText,
    resolve,
    expand,
    forPaste,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, { richText: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
