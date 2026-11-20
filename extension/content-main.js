/*
 * Snippet Inserter, the part of the content script that loads on demand.
 *
 * content.js runs in every frame and stays small: it watches for the double tap, the keyboard
 * shortcut, the menu items, and typed abbreviations. The first time one of them needs the panel
 * or an insert, it imports this module and calls create() once for its frame. Everything here
 * then runs in that frame's content script world, like content.js itself.
 *
 * This module opens the snippet panel next to the caret and writes the chosen snippet into the
 * field. The panel runs in an extension iframe (panel.html), so the page's scripts and styles
 * cannot reach it or its keystrokes. Google Docs takes its own path; content.js describes it.
 */

// lib/placeholders.js defines globalThis.SnippetInserter.placeholders.
import './lib/placeholders.js';

// `shared` holds what content.js already has: the DOCS hints, the field helpers, and getters for
// the last click in Google Docs and the abbreviation index.
export function create(shared) {
  const { DOCS, extensionAlive, deepActiveElement, editableFrom, selectionFor, isValueField } = shared;
  const placeholders = globalThis.SnippetInserter.placeholders;
  const STORAGE_KEY = 'snippet_manager.snippets';
  const PANEL_WIDTH = 360;
  const PANEL_GAP = 6;
  const VIEWPORT_MARGIN = 8;
  // Editors read the selection on "selectionchange", which fires after a task, so the insert
  // waits briefly after restoring the selection.
  const SELECTION_SETTLE_MS = 20;
  // The characters that count as an existing space when deciding whether to pad a snippet:
  // the no-break space, the ordinary space, the thin space, and the narrow no-break space. They
  // are built from code points so the source contains no invisible characters.
  const SPACE_CHARS = new RegExp(`[${String.fromCharCode(0x00a0, 0x0020, 0x2009, 0x202f)}]`);
  const MESSAGE_FLAG = '__snippetInserter';
  const BLOCK_DISPLAY = /^(block|list-item|table|table-cell|table-row|table-caption|flex|grid|flow-root)$/;
  // An element wider than this is not a text caret.
  const CARET_MAX_WIDTH = 8;
  // After a paste, Docs moves its caret within tens of milliseconds; an insert counts as
  // unconfirmed when the caret has not moved after DOCS_CONFIRM_MS.
  const DOCS_CONFIRM_MS = 1000;
  const DOCS_CONFIRM_POLL_MS = 25;
  // A click older than this is not used to place the panel.
  const LAST_POINTER_MAX_AGE_MS = 60_000;
  const NOTICE_MS = 6000;
  const PASTE_KEYS = navigator.userAgent.includes('Mac OS') ? 'Cmd+V' : 'Ctrl+V';

  let panel = null;
  let notice = null;
  let positionQueued = false;

  // Selects `text` just before the caret, after checking that it is still there.
  function selectTypedText(target, text) {
    const el = target.el;
    const active = deepActiveElement(el.ownerDocument);
    if (active !== el && !el.contains(active)) return false;
    if (isValueField(target)) {
      const caret = el.selectionStart;
      if (caret === null || caret !== el.selectionEnd || caret < text.length) return false;
      if (el.value.slice(caret - text.length, caret) !== text) return false;
      el.setSelectionRange(caret - text.length, caret);
      return true;
    }
    const selection = selectionFor(el);
    if (!selection || !selection.isCollapsed || !selection.focusNode) return false;
    const node = selection.focusNode;
    const offset = selection.focusOffset;
    if (node.nodeType !== Node.TEXT_NODE || offset < text.length) return false;
    if (node.data.slice(offset - text.length, offset) !== text) return false;
    const range = el.ownerDocument.createRange();
    range.setStart(node, offset - text.length);
    range.setEnd(node, offset);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  // Replaces the typed abbreviation with its snippet. This is the only time the content script
  // reads the snippet list. A snippet with fill-in fields opens the panel's fill-in form instead; the
  // abbreviation stays selected, so the insert replaces it.
  async function expandAbbreviation(target, abbreviation) {
    let snippet = null;
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const list = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
      const id = shared.abbreviationIndex()[abbreviation];
      snippet = list.find((s) => s.id === id && s.abbreviation === abbreviation);
    } catch {
      return;
    }
    if (!snippet || panel || !extensionAlive() || !selectTypedText(target, abbreviation)) return;
    // The user typed the abbreviation where the text belongs, so no spaces are added.
    const ctx = { ...captureContext(target), noSpacing: true };
    if (placeholders.inputLabels(snippet.content).length) {
      openPanel(null, { ctx, mode: 'fill-only', snippetId: snippet.id });
    } else {
      insertSnippet(ctx, snippet.content);
    }
  }

  // The element with focus in the Docs input frame, or the frame's first editable element if the
  // focus has already moved.
  function docsTextbox(frame) {
    let doc = null;
    try {
      doc = frame.contentDocument;
    } catch {
      return null;
    }
    if (!doc) return null;
    const active = deepActiveElement(doc);
    if (active && (active.isContentEditable || active.tagName === 'TEXTAREA')) return active;
    return doc.querySelector('[contenteditable]:not([contenteditable="false"]), textarea');
  }

  // Docs answers a copy event by writing the selected text into the event's DataTransfer. The
  // event here is synthetic, so the browser does not run its own copy.
  function docsSelectedText(textbox) {
    try {
      const win = textbox.ownerDocument.defaultView;
      const data = new win.DataTransfer();
      textbox.dispatchEvent(
        new win.ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })
      );
      return data.getData('text/plain');
    } catch {
      return '';
    }
  }

  // The element's box, measured even while it or an ancestor has display: none. Docs hides its
  // caret that way while text is selected and while the panel has the focus, but keeps moving it,
  // so showing it for the length of one synchronous measurement gives its current position.
  function rectEvenIfHidden(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
    const hidden = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).display === 'none') {
        hidden.push([node, node.style.getPropertyValue('display'), node.style.getPropertyPriority('display')]);
      }
    }
    if (!hidden.length) return rect;
    for (const [node] of hidden) node.style.setProperty('display', 'block', 'important');
    const shown = element.getBoundingClientRect();
    for (const [node, value, priority] of hidden) {
      if (value) node.style.setProperty('display', value, priority);
      else node.style.removeProperty('display');
    }
    return shown;
  }

  // A caret is an element taller than zero and narrower than CARET_MAX_WIDTH.
  function caretShape(element) {
    const rect = rectEvenIfHidden(element);
    return rect.height > 0 && rect.width < CARET_MAX_WIDTH ? rect : null;
  }

  // A collaborator's cursor carries the person's name; the local user's has an empty label.
  function isCollaboratorCaret(caret) {
    const cursor = caret.closest(DOCS.cursorSelector) || caret.parentElement;
    const label = cursor && cursor.querySelector(DOCS.cursorNameSelector);
    return Boolean(label && label.textContent.trim());
  }

  // The local user's caret, or null if none is found. Docs marks it with an id; without that, it
  // is the first caret-shaped element that is not a collaborator's. A collaborator's caret is
  // never used: the panel would open at another person's cursor.
  function docsCaretRect() {
    const own = document.querySelector(DOCS.ownCaretSelector);
    const ownRect = own && caretShape(own);
    if (ownRect) return ownRect;
    const carets = new Set();
    for (const selector of DOCS.caretSelectors) {
      for (const element of document.querySelectorAll(selector)) carets.add(element);
    }
    for (const caret of carets) {
      const rect = caretShape(caret);
      if (rect && !isCollaboratorCaret(caret)) return rect;
    }
    return null;
  }

  // Where the panel goes when no caret is found: the last click in the page if it is recent,
  // otherwise centred at the top of the visible part of the editor.
  function docsFallbackRect() {
    const lastPointer = shared.lastPointer();
    if (lastPointer && Date.now() - lastPointer.time < LAST_POINTER_MAX_AGE_MS) {
      return { left: lastPointer.x, top: lastPointer.y, bottom: lastPointer.y };
    }
    const editor =
      DOCS.editorSelectors.map((selector) => document.querySelector(selector)).find(Boolean) ||
      document.documentElement;
    const box = editor.getBoundingClientRect();
    const visibleLeft = Math.max(box.left, 0);
    const visibleRight = Math.min(box.right, document.documentElement.clientWidth || window.innerWidth);
    const left = visibleLeft + Math.max(0, (visibleRight - visibleLeft - PANEL_WIDTH) / 2);
    const top = Math.max(box.top, 0) + VIEWPORT_MARGIN;
    return { left, top, bottom: top };
  }

  // Resolves to true once the Docs caret has moved away from `before`.
  async function docsCaretMoved(before) {
    if (!before) return false;
    const deadline = Date.now() + DOCS_CONFIRM_MS;
    while (Date.now() < deadline) {
      await wait(DOCS_CONFIRM_POLL_MS);
      const now = docsCaretRect();
      if (now && (Math.abs(now.left - before.left) >= 1 || Math.abs(now.top - before.top) >= 1)) {
        return true;
      }
    }
    return false;
  }

  // The last resort when Docs did not take the paste: the snippet goes to the clipboard, and a
  // notice tells the user to paste it. The clipboard is written only in this case.
  async function docsInsertFallback(content) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
    } catch {
      // The page did not allow the clipboard write; the notice says where to copy it from.
    }
    showNotice(
      copied
        ? `Snippet copied. If it did not appear in the document, press ${PASTE_KEYS}.`
        : 'The snippet could not be inserted. Open it with the pencil in the snippet panel and copy its text.'
    );
  }

  // A short message at the top of the page. It sits in a shadow root, so the page's styles do
  // not reach it, and it removes itself after NOTICE_MS.
  function showNotice(message) {
    if (notice) notice.remove();
    const host = document.createElement('div');
    setStyle(host, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      'z-index': '2147483647',
      display: 'block',
      margin: '0',
      padding: '0',
      border: '0',
    });
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.textContent = message;
    setStyle(box, {
      font: '14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
      color: '#ffffff',
      background: '#202124',
      padding: '10px 14px',
      'border-radius': '8px',
      'box-shadow': '0 4px 16px rgba(0, 0, 0, 0.25)',
      'max-width': '420px',
    });
    host.attachShadow({ mode: 'open' }).append(box);
    document.documentElement.appendChild(host);
    notice = host;
    setTimeout(() => {
      host.remove();
      if (notice === host) notice = null;
    }, NOTICE_MS);
  }

  // The top frame of a Google Docs document opens the panel for the hidden input frame `frame`;
  // see "Google Docs" in content.js.
  function openDocsPanel(frame) {
    if (panel) return;
    const textbox = docsTextbox(frame);
    if (textbox) openPanel({ kind: 'docs', el: textbox, frame });
  }

  // Capturing the caret context. The panel takes focus, so everything the insert needs is
  // recorded before it opens: where the selection was, what it contained, and the characters on
  // each side of it, which decide whether the snippet gets a leading or trailing space.

  function captureContext(target) {
    if (target.kind === 'docs') {
      const caret = docsCaretRect();
      return {
        ...target,
        // The document's language, for {date} and {time}.
        locale: (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase(),
        selectedText: docsSelectedText(target.el),
        caret: caret || docsFallbackRect(),
        caretFound: Boolean(caret),
      };
    }

    const langHolder = target.el.closest('[lang]');
    const locale = (
      (langHolder && langHolder.getAttribute('lang')) ||
      navigator.language ||
      ''
    ).toLowerCase();

    if (isValueField(target)) {
      const el = target.el;
      const value = el.value;
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? start;
      return {
        ...target,
        locale,
        start,
        end,
        selectedText: value.slice(start, end),
        before: value[start - 1] || '',
        after: value[end] || '',
        blank: !/\S/.test(value),
      };
    }

    const host = target.el;
    const selection = selectionFor(host);
    let range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !host.contains(range.commonAncestorContainer)) {
      range = host.ownerDocument.createRange();
      range.selectNodeContents(host);
      range.collapse(false);
    }
    range = range.cloneRange();
    return {
      ...target,
      locale,
      range,
      selectedText: range.toString(),
      before: charBefore(host, range),
      after: charAfter(host, range),
      blank: !/\S/.test(host.textContent || ''),
    };
  }



  // A single-line field cannot hold line breaks, so a multi-line snippet goes in as one line:
  // line breaks at the start and end are dropped, and each run of line breaks inside, with the
  // white space around it, becomes one space.
  function joinLines(text) {
    return text.replace(/^\s*[\r\n]+\s*|\s*[\r\n]+\s*$/g, '').replace(/\s*[\r\n]+\s*/g, ' ');
  }

  function blockAncestor(node, host) {
    let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (element && element !== host) {
      if (BLOCK_DISPLAY.test(getComputedStyle(element).display)) return element;
      element = element.parentElement;
    }
    return host;
  }

  function nodeBefore(container, offset) {
    if (container.nodeType === Node.TEXT_NODE) return offset === 0 ? container.previousSibling : null;
    return offset > 0 ? container.childNodes[offset - 1] : container.previousSibling;
  }

  function nodeAfter(container, offset) {
    if (container.nodeType === Node.TEXT_NODE) {
      return offset >= container.length ? container.nextSibling : null;
    }
    return container.childNodes[offset] || container.nextSibling;
  }

  // The spacing rule treats a paragraph boundary as a line break, but a DOM range has no such
  // breaks. A caret at the start or end of a block, or next to a <br>, is therefore reported
  // here as "\n".
  function charBefore(host, range) {
    const doc = host.ownerDocument;
    const { startContainer, startOffset } = range;
    const toCaret = doc.createRange();
    try {
      toCaret.setStart(host, 0);
      toCaret.setEnd(startContainer, startOffset);
    } catch {
      return '';
    }
    const text = toCaret.toString();
    if (!text) return '';
    const previous = nodeBefore(startContainer, startOffset);
    if (previous && previous.nodeName === 'BR') return '\n';
    const block = blockAncestor(startContainer, host);
    if (block !== host) {
      const inBlock = doc.createRange();
      inBlock.setStart(block, 0);
      inBlock.setEnd(startContainer, startOffset);
      if (inBlock.toString() === '') return '\n';
    }
    return text[text.length - 1];
  }

  function charAfter(host, range) {
    const doc = host.ownerDocument;
    const { endContainer, endOffset } = range;
    const fromCaret = doc.createRange();
    try {
      fromCaret.setStart(endContainer, endOffset);
      fromCaret.setEnd(host, host.childNodes.length);
    } catch {
      return '';
    }
    const text = fromCaret.toString();
    if (!text) return '';
    const next = nodeAfter(endContainer, endOffset);
    if (next && next.nodeName === 'BR') return '\n';
    const block = blockAncestor(endContainer, host);
    if (block !== host) {
      const inBlock = doc.createRange();
      inBlock.setStart(endContainer, endOffset);
      inBlock.setEnd(block, block.childNodes.length);
      if (inBlock.toString() === '') return '\n';
    }
    return text[0];
  }

  // The spacing rule. When the field holds more than whitespace, the snippet gets a leading space
  // if the character before it is not a space or line break, and a trailing space if the
  // character after it is not a space, a line break, or punctuation (. and , always, plus ; : ! ?
  // except in French text). Returns which of the two spaces to add.
  function spacing(ctx) {
    if (ctx.blank || ctx.noSpacing) return { left: false, right: false };
    const before = ctx.before;
    const after = ctx.after;
    const punctuation = new RegExp(`[.,${ctx.locale.startsWith('fr') ? '' : ';:!?'}]`);
    return {
      left: Boolean(before) && !SPACE_CHARS.test(before) && before !== '\n',
      right: Boolean(after) && !SPACE_CHARS.test(after) && !punctuation.test(after) && after !== '\n',
    };
  }

  // joinLines() for a text with a {cursor} position. A private-use character marks the position
  // while the lines are joined; snippet text does not contain it.
  const CURSOR_MARK = String.fromCharCode(0xe000);
  function joinLinesKeepingCursor(text, cursor) {
    if (cursor === null) return { text: joinLines(text), cursor: null };
    const marked = text.slice(0, cursor) + CURSOR_MARK + text.slice(cursor);
    const joined = joinLines(marked).replace(` ${CURSOR_MARK} `, ` ${CURSOR_MARK}`);
    const at = joined.indexOf(CURSOR_MARK);
    return { text: joined.slice(0, at) + joined.slice(at + 1), cursor: at };
  }

  // Moves the caret back by `count` characters after a paste into a rich-text editor. A line
  // break in the snippet counts as one character, as it does for the Left key.
  function moveCaretBack(ctx, count) {
    const selection = selectionFor(ctx.el);
    if (!selection || typeof selection.modify !== 'function') return;
    for (let i = 0; i < count; i++) selection.modify('move', 'backward', 'character');
  }

  // Inserting the snippet.

  function restoreSelection(ctx) {
    // A selection outside any supported field has nothing to return to.
    if (ctx.kind === 'none' || !ctx.el.isConnected) return false;
    if (ctx.kind === 'docs') {
      // Docs keeps its own caret and selection, so focusing the textbox is enough.
      if (!ctx.frame.isConnected) return false;
      ctx.frame.focus();
      ctx.el.focus({ preventScroll: true });
      return true;
    }
    if (isValueField(ctx)) {
      ctx.el.focus({ preventScroll: true });
      ctx.el.setSelectionRange(ctx.start, ctx.end);
      return true;
    }
    ctx.el.focus({ preventScroll: true });
    const selection = selectionFor(ctx.el);
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(ctx.range);
    }
    return true;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Placeholders are filled in first, with `values` from the panel's fill-in form. In a
  // single-line field the lines are joined next, and the spacing rule runs last. `caret`, the
  // {cursor} position inside the text, is carried through each step.
  async function insertSnippet(ctx, content, values = {}) {
    if (!restoreSelection(ctx)) return;
    const expanded = placeholders.expand(content, { values, locale: ctx.locale, now: new Date() });
    if (ctx.kind === 'docs') {
      // The extension cannot move the Docs caret, so {cursor} has no effect in Docs.
      const text = expanded.text;
      await wait(SELECTION_SETTLE_MS);
      // Without any caret the insert cannot be confirmed, and counts as failed.
      const before = docsCaretRect() || (ctx.caretFound ? ctx.caret : null);
      pasteIntoDocs(ctx, text);
      if (!(await docsCaretMoved(before))) await docsInsertFallback(text);
      return;
    }
    const body = ctx.kind === 'input' ? joinLinesKeepingCursor(expanded.text, expanded.cursor) : expanded;
    const { left, right } = spacing(ctx);
    const text = (left ? ' ' : '') + body.text + (right ? ' ' : '');
    const caret = body.cursor === null ? null : body.cursor + (left ? 1 : 0);
    if (isValueField(ctx)) {
      if (!fitsMaxLength(ctx, text)) return;
      insertIntoTextarea(ctx.el, ctx.start, ctx.end, text);
      if (caret !== null) ctx.el.setSelectionRange(ctx.start + caret, ctx.start + caret);
      return;
    }
    await wait(SELECTION_SETTLE_MS);
    pasteIntoRichEditor(ctx, text);
    if (caret !== null) {
      // Editors that handle the paste themselves may update the page a moment later.
      await wait(SELECTION_SETTLE_MS);
      moveCaretBack(ctx, text.length - caret);
    }
  }

  // A field with a maxlength attribute would cut the snippet short, so nothing is inserted and a
  // notice gives the numbers instead.
  function fitsMaxLength(ctx, text) {
    const max = ctx.el.maxLength;
    if (max < 0) return true;
    const room = max - (ctx.el.value.length - (ctx.end - ctx.start));
    if (text.length <= room) return true;
    const free = Math.max(room, 0);
    showNotice(
      `This field takes ${free} more ${free === 1 ? 'character' : 'characters'}, and the snippet has ${text.length}. Nothing was inserted.`
    );
    return false;
  }

  // A textarea or input gets the text through execCommand("insertText"), which keeps undo
  // working and fires the input events that frameworks listen for. If the command is refused,
  // the value is set directly and an input event is sent by hand.
  function insertIntoTextarea(el, start, end, text) {
    el.setSelectionRange(start, end);
    if (el.ownerDocument.execCommand('insertText', false, text)) return;
    const value = el.value;
    el.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  // A rich editor gets the text as a simulated paste. The editor first sees a "paste" event and
  // then a "beforeinput" event of type "insertFromPaste". Editors that handle paste themselves
  // (Gmail, Slack, ProseMirror, Lexical and others) cancel one of them and insert the text on
  // their own. When neither is cancelled, the browser inserts the HTML directly.
  function pasteIntoRichEditor(ctx, text) {
    const doc = ctx.el.ownerDocument;
    const win = doc.defaultView;
    const target = deepActiveElement(doc) || ctx.el;
    const html = textToHtml(text);
    const transfer = () => {
      const data = new win.DataTransfer();
      data.setData('text/plain', text);
      data.setData('text/html', html);
      return data;
    };

    let proceed = target.dispatchEvent(
      new win.ClipboardEvent('paste', { clipboardData: transfer(), bubbles: true, cancelable: true })
    );
    if (proceed) {
      const selection = selectionFor(ctx.el);
      const range = selection && selection.rangeCount ? selection.getRangeAt(0) : ctx.range;
      const init = {
        inputType: 'insertFromPaste',
        data: html,
        dataTransfer: transfer(),
        bubbles: true,
        cancelable: true,
      };
      try {
        init.targetRanges = [new win.StaticRange(range)];
      } catch {
        // Older engines lack StaticRange; the event is still useful without target ranges.
      }
      proceed = target.dispatchEvent(new win.InputEvent('beforeinput', init));
    }
    if (proceed && !doc.execCommand('insertHTML', false, html)) {
      doc.execCommand('insertText', false, text);
    }
  }

  // Docs inserts the plain text of a paste at its caret, replacing any selection, and turns each
  // line break into a new paragraph. It drops spaces at the very start and end of the pasted
  // text. The spacing rule is not applied, because Docs exposes no text next to the caret.
  function pasteIntoDocs(ctx, text) {
    const win = ctx.el.ownerDocument.defaultView;
    const data = new win.DataTransfer();
    data.setData('text/plain', text.replace(/\r\n?/g, '\n'));
    ctx.el.dispatchEvent(
      new win.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
  }

  // The HTML version of the snippet is the escaped text with each line break turned into <br>,
  // so multi-line snippets keep their lines in rich editors. Spaces that HTML would collapse
  // become non-breaking spaces.
  function textToHtml(text) {
    return text
      .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
      .replace(/\r\n?/g, '\n')
      .replace(/ {2}/g, ' &nbsp;')
      .replace(/^ | $/gm, '&nbsp;')
      .replace(/\n/g, '<br>');
  }

  // Panel placement.

  const MIRROR_PROPERTIES = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
    'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration',
    'letterSpacing', 'wordSpacing', 'tabSize',
  ];

  // A textarea or input does not expose caret coordinates, so a hidden copy of it with the same
  // styles is laid out up to the caret and measured. A single-line input does not wrap, and the
  // panel goes below the whole field, so only the horizontal position comes from the copy.
  function textareaCaretRect(el, position) {
    const singleLine = el.tagName === 'INPUT';
    const doc = el.ownerDocument;
    const style = getComputedStyle(el);
    const mirror = doc.createElement('div');
    for (const property of MIRROR_PROPERTIES) mirror.style[property] = style[property];
    Object.assign(mirror.style, {
      position: 'absolute',
      visibility: 'hidden',
      top: '0',
      left: '-9999px',
      whiteSpace: singleLine ? 'pre' : 'pre-wrap',
      overflowWrap: singleLine ? 'normal' : 'break-word',
      overflow: 'hidden',
    });
    mirror.textContent = el.value.slice(0, position);
    const marker = doc.createElement('span');
    marker.textContent = el.value.slice(position) || '.';
    mirror.appendChild(marker);
    doc.documentElement.appendChild(mirror);
    const top = marker.offsetTop + parseFloat(style.borderTopWidth) - el.scrollTop;
    const left = marker.offsetLeft + parseFloat(style.borderLeftWidth) - el.scrollLeft;
    mirror.remove();

    const box = el.getBoundingClientRect();
    if (singleLine) {
      return { left: Math.min(Math.max(box.left + left, box.left), box.right), top: box.top, bottom: box.bottom };
    }
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    const caretTop = Math.min(Math.max(box.top + top, box.top), box.bottom - lineHeight);
    const caretLeft = Math.min(Math.max(box.left + left, box.left), box.right);
    return { left: caretLeft, top: caretTop, bottom: caretTop + lineHeight };
  }

  function rangeRect(range, host) {
    const rects = range.getClientRects();
    if (rects.length) return rects[rects.length - 1];
    const box = range.getBoundingClientRect();
    if (box.width || box.height || box.top || box.left) return box;
    const node =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
    return (node || host).getBoundingClientRect();
  }

  function caretRect(ctx) {
    if (ctx.kind === 'docs') return docsCaretRect() || ctx.caret;
    if (ctx.kind === 'none') return ctx.range ? rangeRect(ctx.range, document.body) : ctx.anchor.getBoundingClientRect();
    return isValueField(ctx) ? textareaCaretRect(ctx.el, ctx.end) : rangeRect(ctx.range, ctx.el);
  }

  function positionPanel() {
    positionQueued = false;
    if (!panel) return;
    const rect = caretRect(panel.ctx);
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = window.innerHeight;
    const height = panel.height;
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, viewportWidth - PANEL_WIDTH - VIEWPORT_MARGIN)
    );
    let top = rect.bottom + PANEL_GAP;
    if (top + height > viewportHeight - VIEWPORT_MARGIN && rect.top - PANEL_GAP - height >= VIEWPORT_MARGIN) {
      top = rect.top - PANEL_GAP - height;
    }
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewportHeight - height - VIEWPORT_MARGIN));
    setStyle(panel.frame, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
  }

  function queuePosition() {
    if (positionQueued) return;
    positionQueued = true;
    requestAnimationFrame(positionPanel);
  }

  function setStyle(element, styles) {
    for (const [name, value] of Object.entries(styles)) {
      element.style.setProperty(name, value, 'important');
    }
  }

  // The panel iframe.

  function extensionOrigin() {
    return new URL(chrome.runtime.getURL('')).origin;
  }

  // "Save selection as snippet" from the right-click menu. The panel opens at the selection in a
  // create-only mode, with the selected text and its line breaks; the menu's own copy of the
  // text has them collapsed. When the selection is in a supported field, the field gets its
  // focus and selection back when the panel closes.
  function openPanelForPageSelection() {
    if (!extensionAlive()) return;
    const active = deepActiveElement(document);
    const target = editableFrom(active);
    let ctx;
    if (target) {
      ctx = captureContext(target);
    } else if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      // A read-only or unsupported field: its selection is in its value, not in the page.
      let text = '';
      try {
        if (active.type !== 'password') text = active.value.slice(active.selectionStart, active.selectionEnd);
      } catch {
        // Some input types have no selection.
      }
      ctx = { kind: 'none', selectedText: text, anchor: active };
    } else {
      const selection = document.getSelection();
      if (!selection || !selection.rangeCount) return;
      ctx = { kind: 'none', selectedText: selection.toString(), range: selection.getRangeAt(0).cloneRange() };
    }
    if (!ctx.selectedText.trim()) return;
    openPanel(null, { ctx, mode: 'create-only' });
  }

  // Opens the panel for `target`. `options.ctx` replaces the captured context, and
  // `options.mode` is passed to the panel: 'insert' (the default), 'create-only', or 'fill-only'
  // with `options.snippetId`.
  function openPanel(target, options = {}) {
    const ctx = options.ctx || captureContext(target);
    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('panel.html');
    frame.setAttribute('title', 'Snippets');
    frame.setAttribute('aria-label', 'Snippets');
    setStyle(frame, {
      position: 'fixed',
      'z-index': '2147483647',
      left: '0px',
      top: '0px',
      width: `${PANEL_WIDTH}px`,
      // The frame starts 1 px tall and transparent rather than hidden or 0 px tall: Chromium
      // pauses layout callbacks in hidden cross-origin frames and refuses to focus them, which
      // would leave the panel unable to report its size or take keystrokes.
      height: '1px',
      'max-width': 'none',
      'max-height': 'none',
      'min-width': '0',
      'min-height': '0',
      margin: '0',
      padding: '0',
      border: '0',
      'border-radius': '12px',
      'box-shadow': '0 6px 24px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.06)',
      background: 'transparent',
      'color-scheme': 'normal',
      display: 'block',
      visibility: 'visible',
      opacity: '0',
      transform: 'none',
    });
    document.documentElement.appendChild(frame);
    panel = { frame, ctx, height: 1, mode: options.mode || 'insert', snippetId: options.snippetId || null };
    positionPanel();

    window.addEventListener('message', onPanelMessage);
    window.addEventListener('mousedown', onOutsidePointer, true);
    window.addEventListener('scroll', queuePosition, true);
    window.addEventListener('resize', queuePosition);
    window.addEventListener('pagehide', onPageHide);
  }

  function closePanel(returnToField) {
    if (!panel) return;
    const { frame, ctx, mode } = panel;
    panel = null;
    window.removeEventListener('message', onPanelMessage);
    window.removeEventListener('mousedown', onOutsidePointer, true);
    window.removeEventListener('scroll', queuePosition, true);
    window.removeEventListener('resize', queuePosition);
    window.removeEventListener('pagehide', onPageHide);
    frame.remove();
    // A fill-in form opened by an abbreviation leaves the typed abbreviation in place, with the
    // caret after it.
    if (returnToField && restoreSelection(ctx) && mode === 'fill-only') collapseToEnd(ctx);
  }

  function collapseToEnd(ctx) {
    if (isValueField(ctx)) {
      ctx.el.setSelectionRange(ctx.end, ctx.end);
      return;
    }
    const selection = selectionFor(ctx.el);
    if (selection && selection.rangeCount) selection.collapseToEnd();
  }

  function onOutsidePointer(event) {
    if (panel && event.target !== panel.frame) closePanel(false);
  }

  function onPageHide() {
    closePanel(false);
  }

  // The fill-in values sent by the panel, keeping only string entries.
  function fillInValues(values) {
    const result = {};
    if (values && typeof values === 'object') {
      for (const [label, value] of Object.entries(values)) {
        if (typeof value === 'string') result[label] = value;
      }
    }
    return result;
  }

  function onPanelMessage(event) {
    if (!panel || event.source !== panel.frame.contentWindow) return;
    const message = event.data;
    if (!message || message[MESSAGE_FLAG] !== true) return;
    switch (message.type) {
      case 'ready':
        panel.frame.contentWindow.postMessage(
          {
            [MESSAGE_FLAG]: true,
            type: 'init',
            selectedText: panel.ctx.selectedText,
            mode: panel.mode,
            snippetId: panel.snippetId,
          },
          extensionOrigin()
        );
        panel.frame.focus();
        break;
      case 'resize':
        panel.height = Math.max(1, Math.ceil(Number(message.height) || 0));
        setStyle(panel.frame, { height: `${panel.height}px`, opacity: '1' });
        positionPanel();
        if (deepActiveElement(document) !== panel.frame) panel.frame.focus();
        break;
      case 'insert': {
        const ctx = panel.ctx;
        closePanel(false);
        insertSnippet(ctx, String(message.content), fillInValues(message.values));
        break;
      }
      case 'close':
        closePanel(true);
        break;
      case 'saved':
        closePanel(true);
        showNotice('Snippet saved.');
        break;
      default:
        break;
    }
  }

  return {
    panelOpen: () => Boolean(panel),
    panelFrame: () => (panel ? panel.frame : null),
    openPanel,
    openDocsPanel,
    openPanelForPageSelection,
    expandAbbreviation,
    showNotice,
  };
}
