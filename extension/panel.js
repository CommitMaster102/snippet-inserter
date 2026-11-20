/*
 * Snippet panel.
 *
 * This page runs inside the iframe that content.js places next to the caret. It shows the
 * snippet list with search, the create and edit forms, delete, the "new" and "edited" labels,
 * and the keyboard controls. Snippet content has no length limit.
 *
 * Snippets live in chrome.storage.local under STORAGE_KEY as an array of records shaped
 * { createdAt, content, title, id }.
 */
'use strict';

const STORAGE_KEY = 'snippet_manager.snippets';
const TITLE_MAX_LENGTH = 128;
const SEARCH_DEBOUNCE_MS = 500;
const SEARCH_MIN_LENGTH = 3;
const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const IS_MAC = navigator.userAgent.includes('Mac OS');
const ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
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
  editError: 'Failed to save the snippet.',
  notFound: 'Could not find the snippet.',
  placeholderContent: `Enter some text ${ELLIPSIS}`,
  placeholderTitle: `Enter name (optional) ${ELLIPSIS}`,
  validationEmpty: 'This field must not be empty.',
  validationTooLong: (max) => `The input must not be longer than ${max} characters.`,
  labelEdited: 'edited',
  labelNew: 'new',
  searchPlaceholder: `Search snippets ${ELLIPSIS}`,
  edit: 'Edit',
  back: 'Back (Esc)',
  close: 'Close (Esc)',
};

const ICONS = {
  insert:
    '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/><path d="M6 8.5h4M6 11h3"/>',
  create: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/><path d="M8 7.5v4M6 9.5h4"/>',
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
  selectedText: '',
  focusIndex: 0,
  busy: false,
  initialized: false,
};

// Items reachable with the arrow keys and Enter, in display order.
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

// Storage.

async function readSnippets() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

async function writeSnippets(list) {
  await chrome.storage.local.set({ [STORAGE_KEY]: list });
}

// Each snippet gets a 12-character random id. ID_ALPHABET is the 64-character URL-safe alphabet
// of the nanoid library (MIT), so a byte masked to 6 bits picks one character.
function makeId() {
  let id = '';
  let n = 12;
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  while (n--) id += ID_ALPHABET[63 & bytes[n]];
  return id;
}

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

function registerItem(node, activate) {
  items.push({ node, activate });
}

function setFocus(index) {
  if (!items.length) return;
  const count = items.length;
  state.focusIndex = ((index % count) + count) % count;
  items.forEach((item, i) => item.node.toggleAttribute('data-focused', i === state.focusIndex));
  items[state.focusIndex].node.scrollIntoView({ block: 'nearest' });
}

// Searching. A query shorter than three characters shows every snippet, and a longer one keeps
// snippets whose title or content has a word starting with the query.

function escapeRegExp(text) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function filterSnippets(list, query) {
  if (query.length < SEARCH_MIN_LENGTH) return list;
  const pattern = new RegExp(`\\b${escapeRegExp(query)}`, 'i');
  return list.filter(({ title, content }) => (!!title && pattern.test(title)) || pattern.test(content));
}

function displayTitle({ title, content }) {
  return title || content.split(/\n/)[0];
}

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
  try {
    state.snippets = await readSnippets();
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

function renderInsert() {
  currentForm = null;
  els.caption.textContent = TEXT.captionInsert;
  els.back.hidden = true;
  els.body.replaceChildren();
  items = [];

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
  filterSnippets(state.snippets, state.search).forEach((snippet, index) => {
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

function actionItem({ iconName, label, hotkey, onActivate, danger }) {
  const node = el('div', danger ? 'item item-danger' : 'item');
  if (hotkey <= HOTKEYS.length) node.dataset.hotkey = String(hotkey);
  node.append(icon(iconName), el('span', 'item-text', label));
  node.addEventListener('click', onActivate);
  registerItem(node, onActivate);
  return node;
}

// The list is numbered from 1: the create entry is 1 and the snippets follow, so Ctrl+2 inserts
// the first snippet shown.
function snippetItem(snippet, index) {
  const node = el('div', 'item');
  const hotkey = index + 1;
  if (hotkey <= HOTKEYS.length) node.dataset.hotkey = String(hotkey);

  const caption = el('div', 'item-caption');
  caption.append(document.createTextNode(displayTitle(snippet)));
  const label =
    snippet.id === state.isEditedId ? TEXT.labelEdited : snippet.id === state.isNewId ? TEXT.labelNew : '';
  if (label) caption.append(el('span', 'item-label', label));

  const editButton = el('button', 'edit-button');
  editButton.type = 'button';
  editButton.title = TEXT.edit;
  editButton.append(icon('edit'));
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openEdit(snippet.id);
  });

  const inner = el('div', 'item-inner');
  inner.append(caption, editButton);
  node.append(icon('insert'), inner);

  const activate = () => insertSnippet(snippet);
  node.addEventListener('click', activate);
  registerItem(node, activate);
  return node;
}

function openCreate() {
  state.view = 'create';
  state.editId = null;
  render();
}

function openEdit(id) {
  state.view = 'edit';
  state.editId = id;
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
  els.back.hidden = false;
  els.body.replaceChildren();
  items = [];
  currentForm = null;

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
    autosize(content);
  });
  title.addEventListener('input', () => {
    titleMessage.hidden = true;
  });

  form.append(contentField, contentMessage, titleField, titleMessage);
  els.body.append(form);

  if (isEdit) {
    els.body.append(
      actionItem({
        iconName: 'trash',
        label: TEXT.editDelete,
        hotkey: 1,
        danger: true,
        onActivate: () => deleteSnippet(snippet.id),
      })
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
  if (form.title.value.length > TITLE_MAX_LENGTH) {
    form.titleMessage.textContent = TEXT.validationTooLong(TITLE_MAX_LENGTH);
    form.titleMessage.hidden = false;
    valid = false;
  }
  reportSize();
  return valid;
}

async function saveCreate() {
  const form = currentForm;
  if (!form || state.busy || !validate(form)) return;
  setBusy(true);
  try {
    const list = await readSnippets();
    const id = makeId();
    const next = [
      ...list,
      { createdAt: new Date().toISOString(), content: form.content.value, title: form.title.value, id },
    ];
    await writeSnippets(next);
    state.snippets = next;
    setBusy(false);
    backToList({ isNewId: id });
  } catch {
    setBusy(false);
    showError(TEXT.createError);
  }
}

async function saveEdit(id) {
  const form = currentForm;
  if (!form || state.busy || !validate(form)) return;
  setBusy(true);
  try {
    const list = await readSnippets();
    const index = list.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('not found');
    list.splice(index, 1, {
      content: form.content.value,
      title: form.title.value,
      createdAt: list[index].createdAt,
      id,
    });
    await writeSnippets(list);
    state.snippets = list;
    setBusy(false);
    backToList({ isEditedId: id });
  } catch {
    setBusy(false);
    showError(TEXT.editError);
  }
}

async function deleteSnippet(id) {
  if (state.busy) return;
  setBusy(true);
  try {
    const list = await readSnippets();
    const next = list.filter((s) => s.id !== id);
    await writeSnippets(next);
    state.snippets = next;
  } catch {
    // A failed delete returns to the list without a message.
  }
  setBusy(false);
  backToList({ isEditedId: undefined });
}

function insertSnippet(snippet) {
  post({ type: 'insert', content: snippet.content });
}

// Escape leaves a form for the list, and closes the panel from the list.
function goBack() {
  if (state.view !== 'insert') backToList();
  else post({ type: 'close' });
}

els.back.addEventListener('click', goBack);
els.close.addEventListener('click', () => post({ type: 'close' }));
els.primary.addEventListener('click', () => {
  if (primaryAction && !state.busy) primaryAction();
});

// Keyboard controls: arrows move through the list, Enter picks
// the highlighted entry, Ctrl+1 to Ctrl+9 (Cmd on a Mac) pick an entry by its position,
// Ctrl+Enter saves a form, Enter in the name field saves too, and Escape goes back or closes.
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

    if (modifier && !event.shiftKey && !event.altKey && HOTKEYS.includes(event.key)) {
      event.preventDefault();
      const target = els.body.querySelector(`[data-hotkey="${event.key}"]`);
      if (target && !state.busy) target.click();
      return;
    }

    if (state.view === 'insert') {
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length > 1) {
        event.preventDefault();
        setFocus(state.focusIndex + (event.key === 'ArrowDown' ? 1 : -1));
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
