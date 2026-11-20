/*
 * Snippet panel.
 *
 * This page runs inside the iframe that content.js places next to the caret. It shows the
 * snippet list with search, the create and edit forms, the "new" and "edited" labels, the Undo
 * bar after a delete, and the keyboard controls. Snippet content has no length limit.
 *
 * Storage goes through lib/snippets.js (the SnippetInserter global), which the manager page
 * shares.
 */
'use strict';

const lib = window.SnippetInserter;

const SEARCH_DEBOUNCE_MS = 100;
const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const IS_MAC = navigator.userAgent.includes('Mac OS');
const MESSAGE_FLAG = '__snippetInserter';
// Non-ASCII symbols are built from code points so the source stays plain ASCII.
const ELLIPSIS = String.fromCharCode(0x2026);
const RETURN_KEY = String.fromCharCode(0x21b5);
const COMMAND_KEY = String.fromCharCode(0x2318);

// Interface text.
const TEXT = {
  captionInsert: 'Insert snippet',
  captionCreate: 'Create a new snippet',
  captionEdit: 'Edit snippet',
  createNew: 'Create new snippet',
  createFromSelection: 'Create snippet from selection',
  emptyApply: 'Create',
  emptyHint: 'Click below to start creating your first snippet.',
  emptyHeading: 'You have no snippets yet',
  emptyText:
    'Snippets are small, reusable pieces of text designed for repetitive use to save time (e.g. address, email).',
  formApply: 'Save snippet',
  createError: 'Failed to create the snippet.',
  editDelete: 'Delete snippet',
  editDuplicate: 'Duplicate snippet',
  editError: 'Failed to save the snippet.',
  deleteError: 'Failed to delete the snippet.',
  duplicateError: 'Failed to duplicate the snippet.',
  moveError: 'Failed to move the snippet.',
  restoreError: 'Failed to restore the snippet.',
  notFound: 'Could not find the snippet.',
  placeholderContent: `Enter some text ${ELLIPSIS}`,
  placeholderTitle: `Enter name (optional) ${ELLIPSIS}`,
  validationEmpty: 'This field must not be empty.',
  validationTooLong: (max) => `The input must not be longer than ${max} characters.`,
  labelEdited: 'edited',
  labelNew: 'new',
  searchPlaceholder: `Search snippets ${ELLIPSIS}`,
  undoDeleted: 'Snippet deleted.',
  undo: 'Undo',
  edit: 'Edit',
  back: 'Back (Esc)',
  close: 'Close (Esc)',
};

const ICONS = {
  insert:
    '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/><path d="M6 8.5h4M6 11h3"/>',
  create: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/><path d="M8 7.5v4M6 9.5h4"/>',
  duplicate: '<path d="M5.5 5.5h7v7h-7z"/><path d="M3.5 10.5v-7h7"/>',
  edit: '<path d="M10.5 3.5l2 2L6 12H4v-2z"/><path d="M9.25 4.75l2 2"/>',
  trash:
    '<path d="M3.5 4.5h9"/><path d="M6.5 4.5V3h3v1.5"/><path d="M5 4.5l.5 8.5h5l.5-8.5"/><path d="M7 7v4M9 7v4"/>',
  search: '<circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/>',
  back: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
};

const els = {
  app: document.getElementById('app'),
  back: document.getElementById('back'),
  caption: document.getElementById('caption'),
  close: document.getElementById('close'),
  searchBar: document.getElementById('searchBar'),
  searchIcon: document.getElementById('searchIcon'),
  search: document.getElementById('search'),
  error: document.getElementById('error'),
  body: document.getElementById('body'),
  undoBar: document.getElementById('undoBar'),
  undoText: document.getElementById('undoText'),
  undoButton: document.getElementById('undoButton'),
  footer: document.getElementById('footer'),
  primary: document.getElementById('primary'),
  primaryLabel: document.getElementById('primaryLabel'),
  primaryKey: document.getElementById('primaryKey'),
};

const state = {
  view: 'insert', // 'insert', 'create', or 'edit'
  editId: null,
  snippets: [],
  search: '',
  isNewId: undefined,
  isEditedId: undefined,
  // The deleted snippet that the Undo bar can restore, until the next change.
  undoEntry: null,
  selectedText: '',
  mode: 'insert',
  focusIndex: 0,
  busy: false,
  initialized: false,
};

// Items reachable with the arrow keys and Enter, in display order. A snippet item also carries
// the snippet, so Alt+Up and Alt+Down know which one to move.
let items = [];
let primaryAction = null;
let currentForm = null;
let searchTimer = null;

// Messaging with content.js.

function post(message) {
  parent.postMessage({ [MESSAGE_FLAG]: true, ...message }, '*');
}

window.addEventListener('message', (event) => {
  if (event.source !== parent) return;
  const message = event.data;
  if (!message || message[MESSAGE_FLAG] !== true || message.type !== 'init') return;
  if (state.initialized) return;
  state.initialized = true;
  state.selectedText = typeof message.selectedText === 'string' ? message.selectedText : '';
  // 'create-only' comes from "Save selection as snippet": the panel shows only the create form
  // and closes after saving.
  state.mode = message.mode === 'create-only' ? 'create-only' : 'insert';
  if (state.mode === 'create-only') state.view = 'create';
  start();
});

// The panel tells content.js its height after every render and whenever the layout changes, so
// the iframe can be sized to fit. The direct calls matter because Chromium may delay
// ResizeObserver callbacks in a frame that is not yet visible.
let lastReportedHeight = 0;
function reportSize() {
  const height = Math.ceil(els.app.getBoundingClientRect().height);
  if (height === lastReportedHeight) return;
  lastReportedHeight = height;
  post({ type: 'resize', height });
}

new ResizeObserver(reportSize).observe(els.app);

// Small DOM helpers.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const wrapper = document.createElement('span');
  wrapper.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    ICONS[name] +
    '</svg>';
  return wrapper.firstChild;
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
  reportSize();
}

function setPrimary(label, action, keyHint) {
  primaryAction = action || null;
  els.footer.hidden = !label;
  els.primaryLabel.textContent = label || '';
  els.primaryKey.textContent = keyHint || '';
  els.primaryKey.hidden = !keyHint;
}

function setBusy(busy) {
  state.busy = busy;
  els.primary.disabled = busy;
}

function registerItem(node, activate, snippet) {
  items.push({ node, activate, snippet });
}

function setFocus(index) {
  if (!items.length) return;
  const count = items.length;
  state.focusIndex = ((index % count) + count) % count;
  items.forEach((item, i) => item.node.toggleAttribute('data-focused', i === state.focusIndex));
  items[state.focusIndex].node.scrollIntoView({ block: 'nearest' });
}

// Searching filters as soon as the query has a character, after a short pause; see
// filterSnippets() in lib/snippets.js for what matches.

els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = els.search.value;
    state.focusIndex = 0;
    if (state.view === 'insert') renderInsert();
    reportSize();
  }, SEARCH_DEBOUNCE_MS);
});

// Views.

async function start() {
  els.search.placeholder = TEXT.searchPlaceholder;
  els.searchIcon.replaceWith(icon('search'));
  els.back.append(icon('back'));
  els.back.title = TEXT.back;
  els.close.append(icon('close'));
  els.close.title = TEXT.close;
  els.undoText.textContent = TEXT.undoDeleted;
  els.undoButton.textContent = TEXT.undo;
  try {
    state.snippets = await lib.readSnippets();
  } catch {
    state.snippets = [];
  }
  render();
}

function render() {
  els.error.hidden = true;
  if (state.view === 'insert') renderInsert();
  else renderForm();
  reportSize();
}

function renderUndoBar() {
  els.undoBar.hidden = !(state.view === 'insert' && state.undoEntry);
}

function renderInsert() {
  currentForm = null;
  els.caption.textContent = TEXT.captionInsert;
  els.back.hidden = true;
  els.body.replaceChildren();
  items = [];
  renderUndoBar();

  if (!state.snippets.length) {
    els.searchBar.hidden = true;
    els.body.append(emptyView());
    // The panel body is registered as the only item, so Enter opens the create form.
    registerItem(els.body, openCreate);
    setPrimary(TEXT.emptyApply, openCreate, RETURN_KEY);
    els.app.focus();
    return;
  }

  els.searchBar.hidden = false;
  setPrimary(null);
  const list = el('div', 'list');
  const createLabel = state.selectedText.length > 1 ? TEXT.createFromSelection : TEXT.createNew;
  list.append(actionItem({ iconName: 'create', label: createLabel, hotkey: 1, onActivate: openCreate }));
  lib.filterSnippets(state.snippets, state.search).forEach((snippet, index) => {
    list.append(snippetItem(snippet, index + 1));
  });
  els.body.append(list);
  setFocus(Math.min(state.focusIndex, items.length - 1));
  els.search.focus();
}

function emptyView() {
  const view = el('div', 'empty');
  const content = el('div', 'empty-content');
  content.append(el('div', 'empty-heading', TEXT.emptyHeading));
  const text = el('div', 'empty-text', `${TEXT.emptyText} `);
  text.append(el('span', 'empty-hint', TEXT.emptyHint));
  content.append(text);
  view.append(content);
  return view;
}

function actionItem({ iconName, label, hotkey, onActivate }) {
  const node = el('div', 'item');
  if (hotkey <= HOTKEYS.length) node.dataset.hotkey = String(hotkey);
  node.append(icon(iconName), el('span', 'item-text', label));
  node.addEventListener('click', onActivate);
  registerItem(node, onActivate);
  return node;
}

// A form action is a button, so Tab reaches it and Enter or Space activates it. None of them has
// a Ctrl+number shortcut: Ctrl+1 creates a snippet in the list, and a shortcut that deletes in
// the form would be easy to press out of habit.
function formAction({ iconName, label, onActivate, danger }) {
  const node = el('button', danger ? 'item item-action item-danger' : 'item item-action');
  node.type = 'button';
  node.append(icon(iconName), el('span', 'item-text', label));
  node.addEventListener('click', () => {
    if (!state.busy) onActivate();
  });
  return node;
}

// The list is numbered from 1: the create entry is 1 and the snippets follow, so Ctrl+2 inserts
// the first snippet shown.
function snippetItem(snippet, index) {
  const node = el('div', 'item');
  const hotkey = index + 1;
  if (hotkey <= HOTKEYS.length) node.dataset.hotkey = String(hotkey);

  const caption = el('div', 'item-caption');
  caption.append(document.createTextNode(lib.displayTitle(snippet)));
  const label =
    snippet.id === state.isEditedId ? TEXT.labelEdited : snippet.id === state.isNewId ? TEXT.labelNew : '';
  if (label) caption.append(el('span', 'item-label', label));

  const heading = el('div', 'item-heading');
  heading.append(caption);
  if (snippet.abbreviation) heading.append(el('span', 'item-abbreviation', snippet.abbreviation));

  const main = el('div', 'item-main');
  main.append(heading);
  const preview = lib.previewLine(snippet);
  if (preview) main.append(el('div', 'item-preview', preview));

  const editButton = el('button', 'edit-button');
  editButton.type = 'button';
  editButton.title = TEXT.edit;
  editButton.append(icon('edit'));
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openEdit(snippet.id);
  });

  const inner = el('div', 'item-inner');
  inner.append(main, editButton);
  node.append(icon('insert'), inner);

  const activate = () => insertSnippet(snippet);
  node.addEventListener('click', activate);
  registerItem(node, activate, snippet);
  return node;
}

function openCreate() {
  state.view = 'create';
  state.editId = null;
  state.undoEntry = null;
  render();
}

function openEdit(id) {
  state.view = 'edit';
  state.editId = id;
  state.undoEntry = null;
  render();
}

function backToList(changes = {}) {
  Object.assign(state, changes, { view: 'insert', editId: null, focusIndex: 0 });
  render();
}

function renderForm() {
  const isEdit = state.view === 'edit';
  clearTimeout(searchTimer);
  state.search = '';
  els.search.value = '';
  els.searchBar.hidden = true;
  els.caption.textContent = isEdit ? TEXT.captionEdit : TEXT.captionCreate;
  els.back.hidden = state.mode === 'create-only';
  els.body.replaceChildren();
  items = [];
  currentForm = null;
  renderUndoBar();

  const snippet = isEdit ? state.snippets.find((s) => s.id === state.editId) : null;
  if (isEdit && !snippet) {
    showError(TEXT.notFound);
    setPrimary(null);
    return;
  }

  const form = el('div', 'form');

  const contentField = el('div', 'field field-multiline');
  const content = el('textarea', 'input input-content');
  content.placeholder = TEXT.placeholderContent;
  content.value = isEdit ? snippet.content : state.selectedText;
  content.rows = 6;
  contentField.append(content);
  const contentMessage = el('div', 'feedback');
  contentMessage.hidden = true;
  const count = el('div', 'count');
  const updateCount = () => {
    count.textContent = lib.characterCount(content.value);
  };
  updateCount();

  const titleField = el('div', 'field');
  const title = el('input', 'input input-title');
  title.type = 'text';
  title.placeholder = TEXT.placeholderTitle;
  title.value = isEdit ? snippet.title || '' : '';
  titleField.append(title);
  const titleMessage = el('div', 'feedback');
  titleMessage.hidden = true;

  content.addEventListener('input', () => {
    contentMessage.hidden = true;
    updateCount();
    autosize(content);
  });
  title.addEventListener('input', () => {
    titleMessage.hidden = true;
  });

  form.append(contentField, contentMessage, count, titleField, titleMessage);
  els.body.append(form);

  if (isEdit) {
    els.body.append(
      formAction({ iconName: 'duplicate', label: TEXT.editDuplicate, onActivate: () => duplicate(snippet.id) }),
      formAction({ iconName: 'trash', label: TEXT.editDelete, danger: true, onActivate: () => remove(snippet.id) })
    );
  }

  currentForm = {
    content,
    title,
    contentMessage,
    titleMessage,
    submit: () => (isEdit ? saveEdit(snippet.id) : saveCreate()),
  };
  setPrimary(TEXT.formApply, currentForm.submit, IS_MAC ? COMMAND_KEY + RETURN_KEY : `Ctrl ${RETURN_KEY}`);

  autosize(content);
  content.focus();
  content.setSelectionRange(content.value.length, content.value.length);
}

function autosize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
  reportSize();
}

// Form rules: the content must not be blank, and the title must not exceed 128 characters. The
// content has no length limit.
function validate(form) {
  let valid = true;
  if (form.content.value.trim() === '') {
    form.contentMessage.textContent = TEXT.validationEmpty;
    form.contentMessage.hidden = false;
    valid = false;
  }
  if (form.title.value.length > lib.TITLE_MAX_LENGTH) {
    form.titleMessage.textContent = TEXT.validationTooLong(lib.TITLE_MAX_LENGTH);
    form.titleMessage.hidden = false;
    valid = false;
  }
  reportSize();
  return valid;
}

// Runs one storage change with the panel marked busy. On failure it shows `errorText` and
// returns null.
async function change(work, errorText) {
  if (state.busy) return null;
  setBusy(true);
  try {
    return await work();
  } catch {
    showError(errorText);
    return null;
  } finally {
    setBusy(false);
  }
}

async function saveCreate() {
  const form = currentForm;
  if (!form || state.busy || !validate(form)) return;
  const result = await change(
    () => lib.createSnippet({ content: form.content.value, title: form.title.value }),
    TEXT.createError
  );
  if (!result) return;
  state.snippets = result.snippets;
  if (state.mode === 'create-only') post({ type: 'saved' });
  else backToList({ isNewId: result.snippet.id });
}

async function saveEdit(id) {
  const form = currentForm;
  if (!form || state.busy || !validate(form)) return;
  const existing = state.snippets.find((s) => s.id === id);
  const result = await change(
    () =>
      lib.updateSnippet(id, {
        content: form.content.value,
        title: form.title.value,
        abbreviation: existing && existing.abbreviation,
      }),
    TEXT.editError
  );
  if (!result) return;
  state.snippets = result.snippets;
  backToList({ isEditedId: id });
}

async function duplicate(id) {
  const result = await change(() => lib.duplicateSnippet(id), TEXT.duplicateError);
  if (!result) return;
  state.snippets = result.snippets;
  backToList({ isNewId: result.snippet.id, isEditedId: undefined });
}

// A deleted snippet goes to the recently deleted list, and the list view offers to undo it.
async function remove(id) {
  const result = await change(() => lib.deleteSnippet(id), TEXT.deleteError);
  if (!result) return;
  state.snippets = result.snippets;
  backToList({ undoEntry: result.entry, isEditedId: undefined });
}

async function undoDelete() {
  const entry = state.undoEntry;
  if (!entry || state.view !== 'insert') return;
  const result = await change(() => lib.restoreSnippet(entry.id), TEXT.restoreError);
  if (!result) return;
  state.snippets = result.snippets;
  backToList({ undoEntry: null, isNewId: undefined, isEditedId: undefined });
}

// Alt+Up and Alt+Down move the highlighted snippet one place. This works only while the search
// box is empty, because a filtered list does not show the neighbours a move would pass.
async function moveFocused(step) {
  const item = items[state.focusIndex];
  if (!item || !item.snippet || els.search.value.trim()) return;
  const from = state.snippets.findIndex((s) => s.id === item.snippet.id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= state.snippets.length) return;
  const list = await change(() => lib.moveSnippet(item.snippet.id, to), TEXT.moveError);
  if (!list) return;
  state.snippets = list;
  state.undoEntry = null;
  // Item 0 is the create entry, so the snippet at list position `to` is item `to + 1`.
  state.focusIndex = to + 1;
  renderInsert();
  reportSize();
}

function insertSnippet(snippet) {
  post({ type: 'insert', content: snippet.content });
}

// Escape leaves a form for the list, and closes the panel from the list. In create-only mode
// there is no list, so it closes the panel.
function goBack() {
  if (state.view !== 'insert' && state.mode !== 'create-only') backToList();
  else post({ type: 'close' });
}

els.back.addEventListener('click', goBack);
els.close.addEventListener('click', () => post({ type: 'close' }));
els.primary.addEventListener('click', () => {
  if (primaryAction && !state.busy) primaryAction();
});
els.undoButton.addEventListener('click', undoDelete);

// Keyboard controls: arrows move through the list, Alt+arrows move the highlighted snippet,
// Enter picks the highlighted entry, Ctrl+1 to Ctrl+9 (Cmd on a Mac) pick an entry in the list
// by its position, Ctrl+Z after a delete restores the snippet, Ctrl+Enter saves a form, Enter in
// the name field saves too, and Escape goes back or closes.
document.addEventListener(
  'keydown',
  (event) => {
    if (event.isComposing || !state.initialized) return;
    const modifier = IS_MAC ? event.metaKey : event.ctrlKey;

    if (event.key === 'Escape') {
      event.preventDefault();
      goBack();
      return;
    }

    // Ctrl+1 to Ctrl+9 are always kept from the browser, which would switch tabs, but they act
    // only in the list.
    if (modifier && !event.shiftKey && !event.altKey && HOTKEYS.includes(event.key)) {
      event.preventDefault();
      const target = state.view === 'insert' && els.body.querySelector(`[data-hotkey="${event.key}"]`);
      if (target && !state.busy) target.click();
      return;
    }

    if (state.view === 'insert') {
      if (event.altKey && !modifier && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        moveFocused(event.key === 'ArrowDown' ? 1 : -1);
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length > 1) {
        event.preventDefault();
        setFocus(state.focusIndex + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (
        modifier &&
        event.key.toLowerCase() === 'z' &&
        state.undoEntry &&
        !els.search.value
      ) {
        event.preventDefault();
        undoDelete();
      } else if (event.key === 'Enter' && !event.shiftKey && items.length && event.target.tagName !== 'BUTTON') {
        event.preventDefault();
        items[state.focusIndex].activate();
      }
      return;
    }

    if (
      event.key === 'Enter' &&
      currentForm &&
      (modifier || (event.target === currentForm.title && !event.shiftKey))
    ) {
      event.preventDefault();
      currentForm.submit();
    }
  },
  true
);

els.app.tabIndex = -1;
post({ type: 'ready' });
