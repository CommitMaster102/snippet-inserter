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
  // The "beforeinput" types that an insert into a rich editor holds back until it is done: inserted
  // text, a new paragraph, and a line break. See holdTyping().
  const HELD_INPUT_TYPES = new Set(['insertText', 'insertParagraph', 'insertLineBreak']);
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

  // Text from the message catalog. The keys of a plural family end in the plural category.
  const msg = (key, ...substitutions) => chrome.i18n.getMessage(key, substitutions.map(String));
  const msgPlural = (key, count, ...substitutions) => {
    const category = new Intl.PluralRules(msg('localeCode').replace('_', '-')).select(count);
    return msg(`${key}_${category}`, ...substitutions) || msg(`${key}_other`, ...substitutions);
  };

  let panel = null;
  let notice = null;
  let positionQueued = false;
  let richTextLoading = null;

  // lib/richtext.js, the cleaner for formatted snippets. It is imported the first time this frame
  // inserts a formatted snippet into a rich editor, or an abbreviation is typed into a rich editor
  // for a snippet that includes others while any stored snippet is formatted. A frame that does
  // neither never loads it. A failed import can be tried again.
  function loadRichText() {
    if (!richTextLoading) {
      richTextLoading = import('./lib/richtext.js').then(() => globalThis.SnippetInserter.richText);
      richTextLoading.catch(() => {
        richTextLoading = null;
      });
    }
    return richTextLoading;
  }

  // Only a rich editor takes formatting. Text fields and Google Docs get the plain text.
  function takesFormatting(target) {
    return target.kind === 'rich';
  }

  // The characters an input method may insert after the text it commits, with the same keystroke:
  // a space, a no-break space, which is how a rich editor may store a space, or a line break.
  const COMMIT_FOLLOWERS = [' ', String.fromCharCode(0x00a0), '\n'];

  // What `before`, the text in front of the caret, has after `text`: '' when it ends with `text`,
  // the one character of COMMIT_FOLLOWERS after `text` when `followed` allows one, or else null.
  function textFollower(before, text, followed) {
    if (before.endsWith(text)) return '';
    const last = before.slice(-1);
    return followed && COMMIT_FOLLOWERS.includes(last) && before.slice(0, -1).endsWith(text) ? last : null;
  }

  // Selects `text` just before the caret, after checking that it is still there. With `followed`,
  // one character of COMMIT_FOLLOWERS may come after `text`, and it is selected too. Returns that
  // character, '' when there is none, or null when `text` is not in front of the caret.
  function selectTypedText(target, text, followed = false) {
    const el = target.el;
    const active = deepActiveElement(el.ownerDocument);
    if (active !== el && !el.contains(active)) return null;
    const reach = text.length + 1;
    if (isValueField(target)) {
      const caret = el.selectionStart;
      if (caret === null || caret !== el.selectionEnd) return null;
      const follower = textFollower(el.value.slice(Math.max(0, caret - reach), caret), text, followed);
      if (follower === null) return null;
      el.setSelectionRange(caret - text.length - follower.length, caret);
      return follower;
    }
    const selection = selectionFor(el);
    if (!selection || !selection.isCollapsed || !selection.focusNode) return null;
    const node = selection.focusNode;
    const offset = selection.focusOffset;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const follower = textFollower(node.data.slice(Math.max(0, offset - reach), offset), text, followed);
    if (follower === null) return null;
    const range = el.ownerDocument.createRange();
    range.setStart(node, offset - text.length - follower.length);
    range.setEnd(node, offset);
    selection.removeAllRanges();
    selection.addRange(range);
    return follower;
  }

  // Replaces the typed abbreviation with its snippet. This is the only time the content script
  // reads the snippet list. A snippet with fill-in fields opens the panel's fill-in form instead; the
  // abbreviation stays selected, so the insert replaces it. `delimiter` is the space the user
  // typed after the abbreviation. It is replaced too, and the insert puts back one plain space
  // after the snippet. With `committed`, an input method committed the abbreviation, and the field
  // is read only after the snippet is, because the space or line break of the committing keystroke
  // may have arrived since. That character is replaced too, and the insert puts it back as it was.
  async function expandAbbreviation(target, abbreviation, delimiter = '', committed = false) {
    let snippet = null;
    let list = [];
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      list = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
      const id = shared.abbreviationIndex()[abbreviation];
      snippet = list.find((s) => s.id === id && s.abbreviation === abbreviation);
    } catch {
      return;
    }
    if (!snippet || panel || !extensionAlive()) return;
    const { content } = placeholders.resolveReferences(snippet, list);
    const fillIn = placeholders.inputLabels(content).length > 0;
    // The formatted text is read here, before the abbreviation is selected, so no key typed while
    // the cleaner loads can replace the selection. The fill-in form reads its own.
    let html = null;
    const mayBeFormatted = snippet.html || (String(snippet.content).includes('{snippet:') && list.some((s) => s.html));
    if (mayBeFormatted && !fillIn && takesFormatting(target)) {
      try {
        html = (await loadRichText()).resolve(snippet, list);
      } catch {
        // Without the cleaner the snippet goes in as plain text.
      }
      if (panel || !extensionAlive()) return;
    }
    // A rich editor waits for the selection to settle before the paste, and a fill-in form keeps
    // the abbreviation selected while it is open. A space from an input method that arrives in
    // that time would replace the selected text, so committed text is selected only after one
    // settle wait, together with that space if it has come by then.
    if (committed && (fillIn || (!isValueField(target) && target.kind !== 'docs'))) {
      await wait(SELECTION_SETTLE_MS);
      if (panel || !extensionAlive()) return;
    }
    const typed = abbreviation + delimiter;
    const follower = selectTypedText(target, typed, committed);
    if (follower === null) return;
    // The user typed the abbreviation where the text belongs, so no spaces are added. The insert
    // checks that `replaces` is still selected before it replaces it.
    const suffix = committed ? follower : delimiter ? ' ' : '';
    const ctx = { ...captureContext(target), noSpacing: true, suffix, replaces: typed + follower };
    if (fillIn) {
      openPanel(null, { ctx, mode: 'fill-only', snippetId: snippet.id });
    } else {
      insertSnippet(ctx, content, {}, html);
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
        ? msg('noticeDocsCopied', PASTE_KEYS)
        : msg('noticeDocsNotInserted')
    );
  }

  // A short message at the top of the page. It sits in a shadow root, so the page's styles do
  // not reach it, and it removes itself after NOTICE_MS.
  function showNotice(message, ctx) {
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
    box.dir = msg('textDirection') === 'rtl' ? 'rtl' : 'ltr';
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
    attachOverlay(host, overlayHost(ctx));
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
  // {cursor} position inside the text, is carried through each step. `html` is the formatted text
  // of a formatted snippet, with its included snippets in place. A rich editor gets it, cleaned
  // again and with the same values and the same moment filled in, and every other field gets the
  // plain `content`.
  async function insertSnippet(ctx, content, values = {}, html = null) {
    let richText = null;
    if (html && takesFormatting(ctx)) {
      try {
        richText = await loadRichText();
      } catch {
        // Without the cleaner the snippet goes in as plain text.
      }
    }
    if (!restoreSelection(ctx)) {
      // Only a field that was in the page when the panel opened can have gone away.
      if (ctx.kind !== 'none') showNotice(msg('noticeFieldGone'), ctx);
      return;
    }
    const now = new Date();
    const expanded = placeholders.expand(content, { values, locale: ctx.locale, now });
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
    const text = (left ? ' ' : '') + body.text + (right ? ' ' : '') + (ctx.suffix || '');
    const caret = body.cursor === null ? null : body.cursor + (left ? 1 : 0);
    if (isValueField(ctx)) {
      if (!stillReplaces(ctx)) {
        noticeIfFilledIn(ctx, values);
        return;
      }
      if (!fitsMaxLength(ctx, text)) return;
      insertIntoTextarea(ctx.el, ctx.start, ctx.end, text);
      if (caret !== null) ctx.el.setSelectionRange(ctx.start + caret, ctx.start + caret);
      return;
    }
    // The characters from {cursor} to the end of what is pasted, or null without {cursor}.
    let back = caret === null ? null : text.length - caret;
    let markup = null;
    if (richText) {
      const formatted = richText.expand(html, { values, locale: ctx.locale, now });
      const suffix = ctx.suffix || '';
      markup = richText.forPaste(formatted.html, { left, right, suffix });
      back = formatted.cursorFromEnd === null ? null : formatted.cursorFromEnd + (right ? 1 : 0) + suffix.length;
    }
    const hold = holdTyping(ctx);
    try {
      await wait(SELECTION_SETTLE_MS);
      if (!stillReplaces(ctx)) {
        noticeIfFilledIn(ctx, values);
        return;
      }
      pasteIntoRichEditor(ctx, text, markup);
      // Editors that handle the paste themselves may update the page a moment later, so the caret
      // moves to {cursor}, and held keys are typed, only after that.
      if (back !== null || hold.typed()) await wait(SELECTION_SETTLE_MS);
      if (back !== null) moveCaretBack(ctx, back);
    } finally {
      hold.release();
    }
  }

  // Holds back what the user types into a rich editor while an insert runs. The insert selects the
  // text it replaces and waits for the editor to read the selection, and a key typed in that time
  // would replace the selected text. Until release(), two kinds of events aimed at the field are
  // cancelled and kept. One is a cancelable "beforeinput" of a type in HELD_INPUT_TYPES, which is
  // how typed text, Enter, and Shift+Enter reach an editor that leaves them to the browser. The
  // other is a keydown of Enter or Shift+Enter without Ctrl, Alt, or Meta and outside a
  // composition, because editors such as ProseMirror and Lexical act on Enter at keydown and
  // cancel it, so no "beforeinput" follows. Nothing else is held. Backspace, Delete, other keys an
  // editor handles at keydown, a paste, the text of a composition, and text inserted without a
  // cancelable "beforeinput" still reach the editor, and when they change the selected text the
  // insert gives up. release() replays what it kept at the caret, in order: after the snippet, at
  // its {cursor} if it has one, or, when the insert gave up, after the text it would have
  // replaced. See replayEnter() for Enter. If the selection has left the field by then, nothing is
  // replayed.
  function holdTyping(ctx) {
    const doc = ctx.el.ownerDocument;
    const win = doc.defaultView;
    const kept = [];
    const keep = (event, key) => {
      event.preventDefault();
      // The editor's own handler must not act on the key as well.
      event.stopImmediatePropagation();
      kept.push(key);
    };
    const onBeforeInput = (event) => {
      if (!HELD_INPUT_TYPES.has(event.inputType) || !event.cancelable) return;
      if (event.composedPath().includes(ctx.el)) keep(event, { type: event.inputType, data: event.data });
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Enter' || !event.cancelable || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.composedPath().includes(ctx.el)) keep(event, { type: 'keydown', shiftKey: event.shiftKey });
    };
    win.addEventListener('beforeinput', onBeforeInput, true);
    win.addEventListener('keydown', onKeyDown, true);
    return {
      typed: () => kept.length > 0,
      release() {
        win.removeEventListener('beforeinput', onBeforeInput, true);
        win.removeEventListener('keydown', onKeyDown, true);
        if (!kept.length) return;
        const selection = selectionFor(ctx.el);
        if (!selection || !selection.rangeCount || !ctx.el.contains(selection.focusNode)) return;
        // Text that is still selected stays, and the held keys go in after it.
        if (!selection.isCollapsed) selection.collapseToEnd();
        for (const { type, data, shiftKey } of kept) {
          if (type === 'keydown') replayEnter(ctx, shiftKey);
          else if (type !== 'insertText') doc.execCommand(type);
          else if (data) doc.execCommand('insertText', false, data);
        }
      },
    };
  }

  // Sends a held Enter or Shift+Enter to the field as a new keydown, so the editor's own handler
  // gives the key its meaning, such as sending the message in a chat app. ProseMirror and Lexical
  // act on such a keydown although the browser did not send it. When no handler cancels it, the
  // new paragraph or line break goes in with execCommand, as the browser would have inserted it.
  function replayEnter(ctx, shiftKey) {
    const doc = ctx.el.ownerDocument;
    const active = deepActiveElement(doc);
    const target = active && ctx.el.contains(active) ? active : ctx.el;
    const event = new doc.defaultView.KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      shiftKey,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    if (target.dispatchEvent(event)) doc.execCommand(shiftKey ? 'insertLineBreak' : 'insertParagraph');
  }

  // Whether the selection still covers exactly `ctx.replaces`, the typed text that an
  // abbreviation's insert replaces. The page may have changed that text while a fill-in form was
  // open or while the selection settled, for example with a late space from an input method.
  // Without `ctx.replaces` there is nothing to check.
  function stillReplaces(ctx) {
    if (ctx.replaces === undefined) return true;
    if (isValueField(ctx)) return ctx.el.value.slice(ctx.start, ctx.end) === ctx.replaces;
    const selection = selectionFor(ctx.el);
    if (!selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    return ctx.el.contains(range.commonAncestorContainer) && range.toString() === ctx.replaces;
  }

  // When an abbreviation's insert gives up after a fill-in form, a notice says that nothing was
  // inserted, because the values typed in the form are lost. Without a form no values are lost,
  // and the insert gives up without a notice.
  function noticeIfFilledIn(ctx, values) {
    if (Object.keys(values).length) {
      showNotice(msg('noticeFieldChanged'), ctx);
    }
  }

  // A field with a maxlength attribute would cut the snippet short, so nothing is inserted and a
  // notice gives the numbers instead.
  function fitsMaxLength(ctx, text) {
    const max = ctx.el.maxLength;
    if (max < 0) return true;
    const room = max - (ctx.el.value.length - (ctx.end - ctx.start));
    if (text.length <= room) return true;
    // The browser counts the limit in UTF-16 units, but the notice counts characters as the forms
    // do, with an emoji as one, even a flag or a family. The number that fits is the whole
    // characters of the snippet that fit in the room left.
    const characters = Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
      (part) => part.segment
    );
    let free = 0;
    let used = 0;
    for (const character of characters) {
      used += character.length;
      if (used > room) break;
      free++;
    }
    const total = characters.length;
    showNotice(
      msgPlural('noticeFieldRoom', free, free, total),
      ctx
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
  // their own. When neither is cancelled, the browser inserts the HTML directly. `markup` is the
  // HTML of a formatted snippet; a plain snippet's HTML is made from its text.
  function pasteIntoRichEditor(ctx, text, markup = null) {
    const doc = ctx.el.ownerDocument;
    const win = doc.defaultView;
    const target = deepActiveElement(doc) || ctx.el;
    const html = markup === null ? textToHtml(text) : markup;
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
  // become non-breaking spaces, and each tab goes in a span that keeps it as a tab.
  function textToHtml(text) {
    return text
      .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
      .replace(/\r\n?/g, '\n')
      .replace(/ {2}/g, ' &nbsp;')
      .replace(/^ | $/gm, '&nbsp;')
      .replace(/\t/g, '<span style="white-space:pre">\t</span>')
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
    // The panel never grows past the visible area. Its body scrolls instead, see limitPanel.
    const width = Math.max(1, Math.min(PANEL_WIDTH, viewportWidth - 2 * VIEWPORT_MARGIN));
    const maxHeight = Math.max(1, viewportHeight - 2 * VIEWPORT_MARGIN);
    const height = Math.min(panel.height, maxHeight);
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
    );
    let top = rect.bottom + PANEL_GAP;
    if (top + height > viewportHeight - VIEWPORT_MARGIN && rect.top - PANEL_GAP - height >= VIEWPORT_MARGIN) {
      top = rect.top - PANEL_GAP - height;
    }
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewportHeight - height - VIEWPORT_MARGIN));
    setStyle(panel.frame, {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    limitPanel(maxHeight);
  }

  // Tells the panel how tall it may be, so it can scroll its body and keep the header and footer.
  function limitPanel(maxHeight) {
    if (!panel.ready || panel.maxHeight === maxHeight) return;
    panel.maxHeight = maxHeight;
    panel.frame.contentWindow.postMessage({ [MESSAGE_FLAG]: true, type: 'limit', maxHeight }, extensionOrigin());
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

  // Where an overlay (the panel frame or a notice) is attached. The browser draws the top layer
  // (a modal dialog, a fullscreen element, an open popover) above everything else on the page,
  // and a modal dialog makes the rest of the page inert, so an overlay attached to the page root
  // would be hidden behind it and could not be clicked. The overlay goes inside the nearest
  // top-layer element that holds the field instead. The walk follows the flat tree, which is
  // what the browser draws: a slotted node continues in its slot, and a shadow root continues
  // in its host.
  function topLayerHost(field) {
    let node = field && field.nodeType === Node.TEXT_NODE ? field.parentNode : field;
    const fullscreen = document.fullscreenElement;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
        if (node === fullscreen) return node;
        // Each selector is checked on its own, because a browser that does not know one of them
        // would reject the combined list: ":popover-open" arrived in Chrome 114.
        if (matchesSafely(node, 'dialog:modal') || matchesSafely(node, '[popover]:popover-open')) return node;
      }
      node = node.assignedSlot || node.parentNode || node.host || null;
    }
    return document.documentElement;
  }

  function matchesSafely(element, selector) {
    try {
      return element.matches(selector);
    } catch {
      // A browser without this selector has no such top layer elements.
      return false;
    }
  }

  // The element a context's overlay should sit with: its field, or, when the field has left the
  // page, the focused element.
  function overlayHost(ctx) {
    const field = ctx && (ctx.el || ctx.anchor || (ctx.range && ctx.range.startContainer));
    const host = topLayerHost(field && field.isConnected ? field : null);
    return host !== document.documentElement ? host : topLayerHost(deepActiveElement(document));
  }

  // Attaches `element` to `host` and, where the browser has popovers, puts it in the top layer
  // itself. A top-layer element's containing block is the viewport, so a transform on a dialog
  // that holds the field cannot shift the element's fixed position. The user-agent popover
  // styles are neutralized so the element keeps its own size and position.
  function attachOverlay(element, host) {
    host.appendChild(element);
    // On an ordinary page the overlay stays out of the top layer, so the page's own rules for
    // popovers and ::backdrop never apply to it.
    if (host === document.documentElement) return;
    if (typeof HTMLElement.prototype.showPopover !== 'function') return;
    try {
      element.popover = 'manual';
      setStyle(element, {
        right: 'auto',
        bottom: 'auto',
        overflow: 'visible',
        background: element.style.background || 'transparent',
        color: 'inherit',
        translate: 'none',
        scale: 'none',
        rotate: 'none',
      });
      element.showPopover();
    } catch {
      // The element could not enter the top layer; it stays where it was attached.
    }
  }

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
    frame.setAttribute('title', msg('snippets'));
    frame.setAttribute('aria-label', msg('snippets'));
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
    attachOverlay(frame, overlayHost(ctx));
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
        panel.ready = true;
        panel.frame.contentWindow.postMessage(
          {
            [MESSAGE_FLAG]: true,
            type: 'init',
            selectedText: panel.ctx.selectedText,
            locale: panel.ctx.locale,
            mode: panel.mode,
            snippetId: panel.snippetId,
          },
          extensionOrigin()
        );
        panel.frame.focus();
        break;
      case 'resize':
        panel.height = Math.max(1, Math.ceil(Number(message.height) || 0));
        setStyle(panel.frame, { opacity: '1' });
        positionPanel();
        if (deepActiveElement(document) !== panel.frame) panel.frame.focus();
        break;
      case 'insert': {
        const ctx = panel.ctx;
        closePanel(false);
        insertSnippet(
          ctx,
          String(message.content),
          fillInValues(message.values),
          typeof message.html === 'string' ? message.html : null
        );
        break;
      }
      case 'close':
        closePanel(true);
        break;
      case 'site': {
        // The panel has already stored the change. The notice names the host it was for.
        const siteCtx = panel && panel.ctx;
        closePanel(true);
        if (typeof message.host === 'string' && message.host) {
          showNotice(
            message.off ? msg('noticeSiteOff', message.host) : msg('noticeSiteOn', message.host),
            siteCtx
          );
        }
        break;
      }
      case 'saved': {
        const savedCtx = panel && panel.ctx;
        closePanel(true);
        showNotice(msg('noticeSaved'), savedCtx);
        break;
      }
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
