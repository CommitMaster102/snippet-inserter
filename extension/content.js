/*
 * Snippet Inserter content script.
 *
 * This script runs in every frame of every page, so it holds only what must watch the page all
 * the time: the double tap of the configured modifier key (Control by default), the messages for
 * the keyboard shortcut and the right-click menu items, and typed abbreviations. Opening the
 * panel and inserting a snippet live in content-main.js, which this script imports the first
 * time a frame needs it. A frame where the user never opens the panel never loads that code.
 */
(() => {
  'use strict';

  const DEFAULT_SETTINGS = { hotkey: 'Control', abbreviations: true, abbreviationTiming: 'immediate' };
  // The small { abbreviation: id } index that lib/snippets.js writes beside the snippet list.
  // This script reads only the index; content-main.js reads the list when an abbreviation matches.
  const ABBREVIATIONS_KEY = 'snippet_manager.abbreviations';
  // A key press counts as a tap when it is released within 250 ms, and two taps count as a
  // double tap when the second release comes within 400 ms of the first.
  const TAP_MAX_MS = 250;
  const DOUBLE_TAP_GAP_MS = 400;
  // Google Docs internals the content script relies on. Each one is a hint with a fallback, so a
  // rename on Google's side degrades the Docs path instead of breaking it; see "Google Docs"
  // below.
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

  let settings = { ...DEFAULT_SETTINGS };
  // The stored { abbreviation: id } index, and the same abbreviations grouped by their last
  // character, so a typed character is compared only with the abbreviations it could complete.
  let abbreviationIndex = {};
  let abbreviationsByLastChar = new Map();
  let longestAbbreviation = 0;
  let listeningForAbbreviations = false;
  // Whether abbreviations wait for Space, Tab, or Enter instead of expanding as they are typed.
  let expandAfterKey = false;
  let lastKeyDown = null;
  let lastKeyUp = null;
  let lastPointer = null;
  // content-main.js once loaded, the promise of it while it loads, and whether a request to it
  // is under way.
  let main = null;
  let mainLoading = null;
  let busy = false;

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  // Loading content-main.js. It is a module listed in web_accessible_resources, and import()
  // runs it in this script's world, with access to the extension APIs.

  function loadMain() {
    if (!mainLoading) {
      mainLoading = import(chrome.runtime.getURL('content-main.js')).then((module) => {
        main = module.create({
          DOCS,
          extensionAlive,
          deepActiveElement,
          editableFrom,
          selectionFor,
          isValueField,
          lastPointer: () => lastPointer,
          abbreviationIndex: () => abbreviationIndex,
        });
        return main;
      });
      // A failed load, such as after the extension was updated, can be tried again later.
      mainLoading.catch(() => {
        mainLoading = null;
      });
    }
    return mainLoading;
  }

  // Runs `task` with content-main.js, loading it first if needed. Until the task has finished,
  // the panel counts as open, so a second request does not start a second panel.
  function withMain(task) {
    busy = true;
    loadMain()
      .then(task)
      .finally(() => {
        busy = false;
      });
  }

  function panelOpen() {
    return busy || Boolean(main && main.panelOpen());
  }

  function isPanelFrame(target) {
    return Boolean(main && target && target === main.panelFrame());
  }

  // The settings and the abbreviation index, read once per frame and then kept up to date. The
  // read waits for the first focus or key press in the frame, because setting up storage access
  // costs every frame time at load, and most frames, such as ads and embeds, never get either.
  // Until then the defaults apply; a person cannot complete a double tap or an abbreviation in
  // the few milliseconds the read takes. A field that already has the focus when this script
  // runs, through autofocus, gets the settings at its first key press. Checking for such a
  // field here would read document.activeElement, and touching page elements at load costs
  // each frame about 75 KB of memory.
  let settingsRequested = false;

  function requestSettings() {
    if (settingsRequested) return;
    settingsRequested = true;
    window.removeEventListener('focusin', requestSettings, true);
    chrome.storage.local.get(['settings', ABBREVIATIONS_KEY]).then(
      (stored) => {
        settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
        setAbbreviations(stored[ABBREVIATIONS_KEY]);
      },
      () => {}
    );
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.settings) settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
      if (changes[ABBREVIATIONS_KEY]) setAbbreviations(changes[ABBREVIATIONS_KEY].newValue);
      else if (changes.settings) setAbbreviations(abbreviationIndex);
    });
  }

  window.addEventListener('focusin', requestSettings, true);

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
      requestSettings();
      if (isPanelFrame(event.target)) return;
      lastKeyDown = {
        timestamp: event.timeStamp,
        key: event.key,
        location: event.location,
        repeat: event.repeat,
      };
      if (!isShortcutKey(event) || event.repeat) lastKeyUp = null;
      if (expandAfterKey && (event.key === 'Tab' || event.key === 'Enter')) expandBeforeKey(event);
    },
    true
  );

  window.addEventListener(
    'keyup',
    (event) => {
      if (isPanelFrame(event.target)) return;
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
        if (requestPanel() === 'opened') {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      lastKeyUp = { timestamp: event.timeStamp, location: event.location };
    },
    true
  );

  // The double tap, the keyboard shortcut, and the "Insert snippet..." menu item all end here.
  // Returns 'opened' when the panel opens in this frame, 'docs' when the Docs input frame handed
  // the request to the top frame, and null when there is no field to insert into.
  function requestPanel() {
    const target = editableFrom(deepActiveElement(document));
    if (!target || panelOpen() || !extensionAlive()) return null;
    // A field inside a frame the user cannot see never gets the panel in that frame. In Google
    // Docs the top frame opens it instead. The double tap's key release is not stopped then, so
    // Docs does not take Ctrl as still held.
    const hiddenFrame = hiddenFrameElement();
    if (hiddenFrame) {
      if (!isDocsDocument(hiddenFrame.ownerDocument)) return null;
      hiddenFrame.dispatchEvent(new CustomEvent(DOCS_OPEN_EVENT));
      return 'docs';
    }
    withMain((loaded) => loaded.openPanel(target));
    return 'opened';
  }

  // Messages from background.js. Every frame answers, so the service worker can tell a page with
  // a content script from one without. The shortcut reaches every frame of the tab, and only
  // the frame that has the focus acts on it; a menu item reaches only the frame that was
  // right-clicked.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'open-panel' && document.hasFocus() && !panelOpen()) {
      const active = deepActiveElement(document);
      // Focus inside a child frame belongs to that frame's own copy of this script.
      if (!(active && active.tagName === 'IFRAME') && !requestPanel() && message.source === 'menu') {
        withMain((loaded) => loaded.showNotice('Snippets cannot be inserted in this kind of field.'));
      }
    } else if (message && message.type === 'save-selection' && !panelOpen() && extensionAlive()) {
      withMain((loaded) => loaded.openPanelForPageSelection());
    }
    sendResponse({ received: true });
  });

  // Abbreviations. Typing a snippet's abbreviation, such as ";addr", replaces it with the
  // snippet. The input listener exists only while the setting is on and at least one snippet has
  // an abbreviation, so a profile without abbreviations runs no code per keystroke. For each
  // typed character the listener looks at no more than the last few characters before the caret,
  // so its cost does not grow with the size of the field. Google Docs is not covered, because
  // the text of a Docs document is not in the page.

  function setAbbreviations(index) {
    abbreviationIndex = index && typeof index === 'object' ? index : {};
    abbreviationsByLastChar = new Map();
    longestAbbreviation = 0;
    for (const abbreviation of Object.keys(abbreviationIndex)) {
      const last = abbreviation[abbreviation.length - 1];
      if (!abbreviationsByLastChar.has(last)) abbreviationsByLastChar.set(last, []);
      abbreviationsByLastChar.get(last).push(abbreviation);
      longestAbbreviation = Math.max(longestAbbreviation, abbreviation.length);
    }
    const listen = settings.abbreviations !== false && longestAbbreviation > 0;
    const change = listen ? 'addEventListener' : 'removeEventListener';
    if (listen !== listeningForAbbreviations) {
      window[change]('input', onTypedInput, true);
      window[change]('compositionend', onCompositionEnd, true);
    }
    listeningForAbbreviations = listen;
    expandAfterKey = listen && settings.abbreviationTiming === 'delimiter';
  }

  // What may come right before an abbreviation: the start of the field, white space,
  // punctuation, or a symbol. So ";addr" expands after a space but not inside "x;addr".
  const ABBREVIATION_BOUNDARY = /[\s\p{P}\p{S}]/u;

  // The abbreviation that `before`, the text in front of the caret, ends with, or null. The
  // longest one wins when two match.
  function typedAbbreviation(before) {
    const candidates = abbreviationsByLastChar.get(before[before.length - 1]);
    if (!candidates) return null;
    let found = null;
    for (const abbreviation of candidates) {
      if (!before.endsWith(abbreviation)) continue;
      const previous = before[before.length - abbreviation.length - 1];
      if (previous !== undefined && !ABBREVIATION_BOUNDARY.test(previous)) continue;
      if (!found || abbreviation.length > found.length) found = abbreviation;
    }
    return found;
  }

  // The text in front of the caret, cut to what an abbreviation and its boundary need plus
  // `extra` characters, or null when there is a selection instead of a caret.
  function textBeforeCaret(target, extra) {
    const reach = longestAbbreviation + 1 + extra;
    if (isValueField(target)) {
      const { selectionStart: caret, selectionEnd } = target.el;
      if (caret === null || caret !== selectionEnd) return null;
      return target.el.value.slice(Math.max(0, caret - reach), caret);
    }
    const selection = selectionFor(target.el);
    if (!selection || !selection.isCollapsed || !selection.focusNode) return null;
    if (selection.focusNode.nodeType !== Node.TEXT_NODE) return null;
    const offset = selection.focusOffset;
    return selection.focusNode.data.slice(Math.max(0, offset - reach), offset);
  }

  // Text typed with an input method (Japanese, Chinese, Korean) arrives as composition. It is
  // ignored while it is being composed and checked when the method commits it. While
  // abbreviations wait for a key, a commit does not expand, and the next Space, Tab, or Enter does.
  function onTypedInput(event) {
    if (event.isComposing || event.inputType !== 'insertText') return;
    // While abbreviations wait for a key, only a typed space can complete one.
    if (expandAfterKey && event.data !== ' ') return;
    expandTypedAbbreviation(expandAfterKey);
  }

  function onCompositionEnd() {
    if (!expandAfterKey) expandTypedAbbreviation(false);
  }

  // Expands the abbreviation in front of the caret, if there is one. With `afterSpace`, the
  // character just typed must be white space and the abbreviation ends right before it. A rich
  // editor may have stored the space as a no-break space, so it is read from the field, and
  // content-main.js replaces it together with the abbreviation.
  function expandTypedAbbreviation(afterSpace) {
    if (panelOpen()) return;
    const target = editableFrom(deepActiveElement(document));
    if (!target) return;
    const before = textBeforeCaret(target, afterSpace ? 1 : 0);
    const delimiter = afterSpace && before ? before.slice(-1) : '';
    const abbreviation = before && typedAbbreviation(afterSpace ? before.slice(0, -1) : before);
    if (!abbreviation || (afterSpace && !/\s/.test(delimiter))) return;
    if (hiddenFrameElement() || !extensionAlive()) return;
    // The editor finishes handling the keystroke first.
    setTimeout(() => withMain((loaded) => loaded.expandAbbreviation(target, abbreviation, delimiter)), 0);
  }

  // Tab or Enter right after an abbreviation expands it, and the key is used up. The snippet is
  // read from storage after the key arrives, and a script cannot replay a real Tab or Enter, so
  // letting the key through could move the focus, submit a form, or send a chat message before
  // the snippet arrived.
  function expandBeforeKey(event) {
    if (event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (panelOpen()) return;
    const target = editableFrom(deepActiveElement(document));
    const before = target && textBeforeCaret(target, 0);
    const abbreviation = before && typedAbbreviation(before);
    if (!abbreviation || hiddenFrameElement() || !extensionAlive()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    withMain((loaded) => loaded.expandAbbreviation(target, abbreviation, ''));
  }

  // Finding the text field. The panel opens for textareas, rich-text (contenteditable) editors,
  // and single-line inputs of the types in SINGLE_LINE_TYPES. An input's `type` property reads
  // "text" when the attribute is missing or unknown. Email and number inputs do not expose the
  // caret position, and password fields are not a place for snippets.

  const SINGLE_LINE_TYPES = new Set(['text', 'search', 'url', 'tel']);

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
    if (element.tagName === 'INPUT') {
      const usable = SINGLE_LINE_TYPES.has(element.type) && !element.readOnly && !element.disabled;
      return usable ? { kind: 'input', el: element } : null;
    }
    if (element.isContentEditable) {
      let host = element;
      while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
      return { kind: 'rich', el: host };
    }
    return null;
  }

  // Textareas and single-line inputs keep their text in `value` and share one insert path.
  function isValueField(target) {
    return target.kind === 'textarea' || target.kind === 'input';
  }

  function selectionFor(host) {
    const root = host.getRootNode();
    if (root !== host.ownerDocument && typeof root.getSelection === 'function') {
      return root.getSelection();
    }
    return host.ownerDocument.getSelection();
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
  // counts as failed: the snippet is copied to the clipboard and a notice says so. The code for
  // the caret, the paste, and the fallback is in content-main.js.

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
      if (panelOpen() || !extensionAlive() || !isDocsDocument(document)) return;
      if (!frame || frame.tagName !== 'IFRAME' || frame.ownerDocument !== document) return;
      withMain((loaded) => loaded.openDocsPanel(frame));
    },
    true
  );
})();
