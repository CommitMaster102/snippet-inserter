/*
 * Snippet Inserter content script.
 *
 * It watches text fields for a double tap of the configured modifier key (Control by default),
 * opens the snippet panel next to the caret, and writes the chosen snippet into the field. The
 * panel runs in an extension iframe (panel.html), so the page's scripts and styles cannot reach
 * it or its keystrokes. Google Docs takes its own path, described under "Google Docs" below.
 */
(() => {
  'use strict';

  const DEFAULT_SETTINGS = { hotkey: 'Control' };
  // A key press counts as a tap when it is released within 250 ms, and two taps count as a
  // double tap when the second release comes within 400 ms of the first.
  const TAP_MAX_MS = 250;
  const DOUBLE_TAP_GAP_MS = 400;
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
  // Google Docs internals this script relies on. Each one is a hint with a fallback, so a rename
  // on Google's side degrades the Docs path instead of breaking it; see "Google Docs" below.
  const DOCS = {
    host: 'docs.google.com',
    pathPrefix: '/document/',
    inputFrameClass: 'docs-texteventtarget-iframe',
    ownCaretSelector: '#kix-current-user-cursor-caret',
    caretSelectors: ['.kix-cursor-caret', '[class*="cursor-caret"]'],
    cursorSelector: '.kix-cursor',
    cursorNameSelector: '.kix-cursor-name',
    editorSelectors: ['.kix-appview-editor', '.kix-appview-editor-container'],
  };
  const DOCS_OPEN_EVENT = 'snippet-inserter:docs-open';
  // A frame narrower or shorter than this counts as hidden from the user.
  const HIDDEN_FRAME_MAX_PX = 4;
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

  let settings = { ...DEFAULT_SETTINGS };
  let lastKeyDown = null;
  let lastKeyUp = null;
  let lastPointer = null;
  let panel = null;
  let notice = null;
  let positionQueued = false;

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  chrome.storage.local.get('settings').then(
    (stored) => {
      settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
    },
    () => {}
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    }
  });

  // Double-tap detection. Any other key resets the sequence, both taps must use the same
  // physical key (left or right), and the second release opens the panel.

  function isShortcutKey(event) {
    switch (settings.hotkey) {
      case 'Shift':
        return event.key === 'Shift' && !event.metaKey && !event.altKey && !event.ctrlKey;
      case 'Control':
        return event.key === 'Control' && !event.shiftKey && !event.altKey && !event.metaKey;
      case 'Alt':
        return event.key === 'Alt' && !event.shiftKey && !event.ctrlKey && !event.metaKey;
      default:
        return false;
    }
  }

  window.addEventListener(
    'keydown',
    (event) => {
      if (panel && event.target === panel.frame) return;
      lastKeyDown = {
        timestamp: event.timeStamp,
        key: event.key,
        location: event.location,
        repeat: event.repeat,
      };
      if (!isShortcutKey(event) || event.repeat) lastKeyUp = null;
    },
    true
  );

  window.addEventListener(
    'keyup',
    (event) => {
      if (panel && event.target === panel.frame) return;
      const sameKey =
        lastKeyDown &&
        !lastKeyDown.repeat &&
        lastKeyDown.key === event.key &&
        lastKeyDown.location === event.location;
      const quick = lastKeyDown && event.timeStamp - lastKeyDown.timestamp < TAP_MAX_MS;
      if (!(isShortcutKey(event) && sameKey && quick)) {
        lastKeyUp = null;
        return;
      }
      if (
        lastKeyUp &&
        event.timeStamp - lastKeyUp.timestamp < DOUBLE_TAP_GAP_MS &&
        lastKeyUp.location === event.location
      ) {
        lastKeyUp = null;
        const target = editableFrom(deepActiveElement(document));
        if (!target || panel || !extensionAlive()) return;
        // A field inside a frame the user cannot see never gets the panel in that frame. In
        // Google Docs the top frame opens it instead. The key release is not stopped here, so
        // Docs does not take Ctrl as still held.
        const hiddenFrame = hiddenFrameElement();
        if (hiddenFrame) {
          if (isDocsDocument(hiddenFrame.ownerDocument)) {
            hiddenFrame.dispatchEvent(new CustomEvent(DOCS_OPEN_EVENT));
          }
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        openPanel(target);
        return;
      }
      lastKeyUp = { timestamp: event.timeStamp, location: event.location };
    },
    true
  );

  // Finding the text field. The panel opens only for textareas and rich-text (contenteditable)
  // editors, not for single-line inputs.

  function deepActiveElement(doc) {
    let element = doc.activeElement;
    while (element && element.shadowRoot && element.shadowRoot.activeElement) {
      element = element.shadowRoot.activeElement;
    }
    return element;
  }

  function editableFrom(element) {
    if (!element) return null;
    if (element.tagName === 'TEXTAREA') {
      return element.readOnly || element.disabled ? null : { kind: 'textarea', el: element };
    }
    if (element.isContentEditable) {
      let host = element;
      while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
      return { kind: 'rich', el: host };
    }
    return null;
  }

  // Google Docs. Docs draws the document on a canvas, so the page holds no text to edit, and it
  // takes keyboard input and pastes through a hidden, same-origin iframe whose document holds a
  // contenteditable textbox. A copy of this script runs in that frame, because the manifest
  // injects it into about:blank frames. When it sees the double tap, it dispatches
  // DOCS_OPEN_EVENT on its own <iframe> element, which lives in the top document, so the top
  // frame's copy receives it. The top frame shows the panel at the caret Docs draws and inserts
  // the snippet by dispatching a paste at the hidden textbox.
  //
  // None of this is a documented interface, so each step relies on behavior first and treats
  // the names in DOCS as hints. If the input frame is renamed, it is still found by holding the
  // focus while being invisible. If the caret element is renamed, the panel opens at the last
  // click or at the top of the editor. If the caret does not move after a paste, the insert
  // counts as failed: the snippet is copied to the clipboard and a notice says so.

  function isDocsDocument(doc) {
    try {
      return (
        doc.location.hostname === DOCS.host && doc.location.pathname.startsWith(DOCS.pathPrefix)
      );
    } catch {
      return false;
    }
  }

  // The <iframe> element of this window when the user cannot see the frame, else null. A frame
  // counts as hidden when its element has the Docs input frame class, lies outside the parent's
  // viewport, is smaller than HIDDEN_FRAME_MAX_PX on a side, or is hidden by CSS.
  function hiddenFrameElement() {
    try {
      const frame = window.frameElement;
      if (!frame || frame.tagName !== 'IFRAME') return null;
      if (frame.classList.contains(DOCS.inputFrameClass)) return frame;
      const view = frame.ownerDocument.defaultView;
      const rect = frame.getBoundingClientRect();
      const style = view.getComputedStyle(frame);
      const offscreen =
        rect.bottom <= 0 || rect.right <= 0 || rect.top >= view.innerHeight || rect.left >= view.innerWidth;
      const tiny = rect.width < HIDDEN_FRAME_MAX_PX || rect.height < HIDDEN_FRAME_MAX_PX;
      const invisible = style.visibility === 'hidden' || Number(style.opacity) === 0;
      return offscreen || tiny || invisible ? frame : null;
    } catch {
      return null;
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

  if (window === window.top && isDocsDocument(document)) {
    window.addEventListener(
      'pointerdown',
      (event) => {
        lastPointer = { x: event.clientX, y: event.clientY, time: Date.now() };
      },
      true
    );
  }

  document.addEventListener(
    DOCS_OPEN_EVENT,
    (event) => {
      const frame = event.target;
      if (panel || !extensionAlive() || !isDocsDocument(document)) return;
      if (!frame || frame.tagName !== 'IFRAME' || frame.ownerDocument !== document) return;
      const textbox = docsTextbox(frame);
      if (textbox) openPanel({ kind: 'docs', el: textbox, frame });
    },
    true
  );

  function selectionFor(host) {
    const root = host.getRootNode();
    if (root !== host.ownerDocument && typeof root.getSelection === 'function') {
      return root.getSelection();
    }
    return host.ownerDocument.getSelection();
  }

  // Capturing the caret context. The panel takes focus, so everything the insert needs is
  // recorded before it opens: where the selection was, what it contained, and the characters on
  // each side of it, which decide whether the snippet gets a leading or trailing space.

  function captureContext(target) {
    if (target.kind === 'docs') {
      const caret = docsCaretRect();
      return {
        ...target,
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

    if (target.kind === 'textarea') {
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
  // except in French text).
  function addSpaces(content, ctx) {
    if (ctx.blank) return content;
    const before = ctx.before;
    const after = ctx.after;
    const punctuation = new RegExp(`[.,${ctx.locale.startsWith('fr') ? '' : ';:!?'}]`);
    const left = Boolean(before) && !SPACE_CHARS.test(before) && before !== '\n';
    const right =
      Boolean(after) && !SPACE_CHARS.test(after) && !punctuation.test(after) && after !== '\n';
    return (left ? ' ' : '') + content + (right ? ' ' : '');
  }

  // Inserting the snippet.

  function restoreSelection(ctx) {
    if (!ctx.el.isConnected) return false;
    if (ctx.kind === 'docs') {
      // Docs keeps its own caret and selection, so focusing the textbox is enough.
      if (!ctx.frame.isConnected) return false;
      ctx.frame.focus();
      ctx.el.focus({ preventScroll: true });
      return true;
    }
    if (ctx.kind === 'textarea') {
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

  async function insertSnippet(ctx, content) {
    if (!restoreSelection(ctx)) return;
    if (ctx.kind === 'docs') {
      await wait(SELECTION_SETTLE_MS);
      // Without any caret the insert cannot be confirmed, and counts as failed.
      const before = docsCaretRect() || (ctx.caretFound ? ctx.caret : null);
      pasteIntoDocs(ctx, content);
      if (!(await docsCaretMoved(before))) await docsInsertFallback(content);
      return;
    }
    const text = addSpaces(content, ctx);
    if (ctx.kind === 'textarea') {
      insertIntoTextarea(ctx.el, ctx.start, ctx.end, text);
      return;
    }
    await wait(SELECTION_SETTLE_MS);
    pasteIntoRichEditor(ctx, text);
  }

  // A textarea gets the text through execCommand("insertText"), which keeps undo working and
  // fires the input events that frameworks listen for. If the command is refused, the value is
  // set directly and an input event is sent by hand.
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

  // A textarea does not expose caret coordinates, so a hidden copy of it with the same styles
  // is laid out up to the caret and measured.
  function textareaCaretRect(el, position) {
    const doc = el.ownerDocument;
    const style = getComputedStyle(el);
    const mirror = doc.createElement('div');
    for (const property of MIRROR_PROPERTIES) mirror.style[property] = style[property];
    Object.assign(mirror.style, {
      position: 'absolute',
      visibility: 'hidden',
      top: '0',
      left: '-9999px',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
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
    return ctx.kind === 'textarea' ? textareaCaretRect(ctx.el, ctx.end) : rangeRect(ctx.range, ctx.el);
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

  function openPanel(target) {
    const ctx = captureContext(target);
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
    panel = { frame, ctx, height: 1 };
    positionPanel();

    window.addEventListener('message', onPanelMessage);
    window.addEventListener('mousedown', onOutsidePointer, true);
    window.addEventListener('scroll', queuePosition, true);
    window.addEventListener('resize', queuePosition);
    window.addEventListener('pagehide', onPageHide);
  }

  function closePanel(returnToField) {
    if (!panel) return;
    const { frame, ctx } = panel;
    panel = null;
    window.removeEventListener('message', onPanelMessage);
    window.removeEventListener('mousedown', onOutsidePointer, true);
    window.removeEventListener('scroll', queuePosition, true);
    window.removeEventListener('resize', queuePosition);
    window.removeEventListener('pagehide', onPageHide);
    frame.remove();
    if (returnToField) restoreSelection(ctx);
  }

  function onOutsidePointer(event) {
    if (panel && event.target !== panel.frame) closePanel(false);
  }

  function onPageHide() {
    closePanel(false);
  }

  function onPanelMessage(event) {
    if (!panel || event.source !== panel.frame.contentWindow) return;
    const message = event.data;
    if (!message || message[MESSAGE_FLAG] !== true) return;
    switch (message.type) {
      case 'ready':
        panel.frame.contentWindow.postMessage(
          { [MESSAGE_FLAG]: true, type: 'init', selectedText: panel.ctx.selectedText },
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
        insertSnippet(ctx, String(message.content));
        break;
      }
      case 'close':
        closePanel(true);
        break;
      default:
        break;
    }
  }
})();
