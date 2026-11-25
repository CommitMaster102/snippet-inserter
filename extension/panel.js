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
const i18n = lib.i18n;
const t = i18n.t;
const placeholders = lib.placeholders;

const SEARCH_DEBOUNCE_MS = 100;
const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const IS_MAC = navigator.userAgent.includes('Mac OS');
const MESSAGE_FLAG = '__snippetInserter';
// Focus moves without scrolling. The panel's frame is resized to fit after each render, and a
// scroll made while it was still smaller would shift the content when it grows.
const NO_SCROLL = { preventScroll: true };
// Non-ASCII symbols are built from code points so the source stays plain ASCII.
const RETURN_KEY = String.fromCharCode(0x21b5);
const COMMAND_KEY = String.fromCharCode(0x2318);

// Interface text, read from the message catalog in _locales. The catalog holds the English wording and
// a note for translators on each message.
const TEXT = {
  captionInsert: t('captionInsert'),
  captionCreate: t('captionCreate'),
  captionEdit: t('editSnippet'),
  createNew: t('createNew'),
  createFromSelection: t('createFromSelection'),
  emptyApply: t('emptyApply'),
  emptyHint: t('emptyHint'),
  emptyHeading: t('emptyHeading'),
  loadError: t('loadError'),
  loadErrorHeading: t('loadErrorHeading'),
  emptyText: t('emptyText'),
  formApply: t('formApply'),
  createError: t('createError'),
  editDelete: t('editDelete'),
  editDuplicate: t('editDuplicate'),
  editError: t('editError'),
  deleteError: t('deleteError'),
  duplicateError: t('duplicateError'),
  moveError: t('moveError'),
  restoreError: t('restoreError'),
  notFound: t('notFound'),
  placeholderContent: t('placeholderContent'),
  placeholderTitle: t('placeholderTitle'),
  placeholderAbbreviation: t('placeholderAbbreviation'),
  placeholderFolder: t('placeholderFolder'),
  folderAll: t('folderAll'),
  folderNone: t('folderNone'),
  foldersLabel: t('foldersLabel'),
  validationEmpty: t('validationEmpty'),
  validationTooLong: (max) => i18n.plural('validationTooLong', max, [i18n.number(max)]),
  labelEdited: t('labelEdited'),
  labelNew: t('labelNew'),
  searchPlaceholder: t('searchPlaceholder'),
  undoDeleted: t('undoDeleted'),
  undo: t('undo'),
  placeholders: t('placeholders'),
  placeholdersUnrecognized: t('placeholdersUnrecognized'),
  includes: t('includes'),
  referenceNotFound: t('referenceNotFound'),
  referenceMissing: (abbreviation, token) => t('referenceMissing', [abbreviation, token]),
  referenceLoop: (token) => t('referenceLoop', [token]),
  referenceLimit: t('referenceLimit'),
  fillCount: (n) => i18n.plural('fillCount', n, [i18n.number(n)]),
  preview: t('preview'),
  insertApply: t('insertApply'),
  edit: t('edit'),
  back: t('back'),
  close: t('close'),
  siteOff: (host) => t('siteOff', [host]),
  siteOn: (entry) => t('siteOn', [entry]),
  siteError: t('siteError'),
  formattedView: t('formattedView'),
  formattedNote: t('formattedNote'),
  openManager: t('openManager'),
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
  siteOff: '<circle cx="8" cy="8" r="5.5"/><path d="M4.1 11.9l7.8-7.8"/>',
  siteOn: '<path d="M8 2.5v5"/><path d="M5 4.5a5 5 0 1 0 6 0"/>',
};

const els = {
  app: document.getElementById('app'),
  back: document.getElementById('back'),
  caption: document.getElementById('caption'),
  site: document.getElementById('site'),
  close: document.getElementById('close'),
  searchBar: document.getElementById('searchBar'),
  searchIcon: document.getElementById('searchIcon'),
  folderBar: document.getElementById('folderBar'),
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
  view: 'insert', // 'insert', 'create', 'edit', or 'fill'
  editId: null,
  // The snippet whose fill-in fields the 'fill' view asks for.
  fillId: null,
  snippets: [],
  // True when the first read of the stored snippets failed.
  loadFailed: false,
  search: '',
  // The folder the list shows: null for all snippets, '' for the ones without a folder, or a
  // folder name. The panel always opens on all snippets.
  folder: null,
  isNewId: undefined,
  isEditedId: undefined,
  // The deleted snippet that the Undo bar can restore, until the next change.
  undoEntry: null,
  selectedText: '',
  // The language of the field the panel opened from, which the date and time values follow.
  locale: undefined,
  mode: 'insert',
  focusIndex: 0,
  busy: false,
  initialized: false,
  // The page's host, and the entry of the list of turned-off sites that covers it, or null.
  site: { host: '', entry: null },
};

// Items reachable with the arrow keys and Enter, in display order. A snippet item also carries
// the snippet, so Alt+Up and Alt+Down know which one to move.
let items = [];
// The folder each button in the folder row selects, in the order of the buttons.
let folderChoices = [];
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
  if (!message || message[MESSAGE_FLAG] !== true) return;
  // The page reports how tall the panel may be. The body scrolls when the content is taller.
  if (message.type === 'limit') {
    els.app.style.maxHeight = `${Math.max(1, Number(message.maxHeight) || 1)}px`;
    return;
  }
  if (message.type !== 'init') return;
  if (state.initialized) return;
  state.initialized = true;
  state.selectedText = typeof message.selectedText === 'string' ? message.selectedText : '';
  state.locale = typeof message.locale === 'string' && message.locale ? message.locale : undefined;
  // 'create-only' comes from "Save selection as snippet": the panel shows only the create form
  // and closes after saving. 'fill-only' comes from a typed abbreviation whose snippet has
  // fill-in fields: the panel shows only that snippet's fill-in form.
  state.mode = ['create-only', 'fill-only'].includes(message.mode) ? message.mode : 'insert';
  if (state.mode === 'create-only') state.view = 'create';
  if (state.mode === 'fill-only') {
    state.view = 'fill';
    state.fillId = typeof message.snippetId === 'string' ? message.snippetId : null;
  }
  start();
});

// The panel tells content.js its height after every render and whenever the layout changes, so
// the iframe can be sized to fit. The direct calls matter because Chromium may delay
// ResizeObserver callbacks in a frame that is not yet visible.
// The first size goes out after the first render, so content.js does not show a panel that
// holds only its header. While render() builds a view, the view is not all in the panel yet, so
// the size goes out when render() has finished. A size measured earlier would shrink the frame
// to the header for a moment, and a click on the lower part of the form would then reach the page.
let lastReportedHeight = 0;
let firstRenderDone = false;
let rendering = false;
function reportSize() {
  if (!firstRenderDone || rendering) return;
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

// The message under a form field, with the id `id`: an alert, so a screen reader announces it when
// it appears, and the description of `field` when there is one. The panel holds one form at a
// time, so the ids stay unique.
function fieldMessage(field, id) {
  const message = el('div', 'feedback');
  message.id = id;
  message.setAttribute('role', 'alert');
  message.hidden = true;
  if (field) field.setAttribute('aria-describedby', id);
  return message;
}

// Shows the message under a field, or hides it when `text` is empty, and marks the field invalid
// while it shows. A hidden element named as a description still describes the field, so hiding
// the message also clears its text.
function showFieldMessage(field, message, text) {
  message.textContent = text;
  message.hidden = !text;
  if (!field) return;
  if (text) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
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
  // A key name such as "Ctrl ↵" reads left to right in every language.
  els.primaryKey.dir = 'ltr';
  els.primaryKey.hidden = !keyHint;
}

function setBusy(busy) {
  state.busy = busy;
  els.primary.disabled = busy;
}

// The items of the list are options of a listbox. Focus stays in the search box, which points at
// the highlighted option through aria-activedescendant, so a screen reader announces it.
function registerItem(node, activate, snippet) {
  if (node !== els.body) {
    node.id = `item-${items.length}`;
    node.setAttribute('role', 'option');
    // A screen reader tells the user that F2 opens the edit form of this snippet.
    if (snippet) node.setAttribute('aria-keyshortcuts', 'F2');
  }
  items.push({ node, activate, snippet });
}

function setFocus(index) {
  if (!items.length) return;
  const count = items.length;
  state.focusIndex = ((index % count) + count) % count;
  items.forEach((item, i) => {
    item.node.toggleAttribute('data-focused', i === state.focusIndex);
    if (item.node.id) item.node.setAttribute('aria-selected', String(i === state.focusIndex));
  });
  const current = items[state.focusIndex].node;
  if (current.id) els.search.setAttribute('aria-activedescendant', current.id);
  else els.search.removeAttribute('aria-activedescendant');
  scrollIntoList(items[state.focusIndex].node);
}

// Scrolls the snippet list so `node` is visible. scrollIntoView() is not used, because it can
// also scroll the page the panel sits on, which moves the panel and the user's text.
function scrollIntoList(node) {
  const list = node.closest('.list');
  if (!list) return;
  const listBox = list.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  if (box.top < listBox.top) list.scrollTop -= listBox.top - box.top;
  else if (box.bottom > listBox.bottom) list.scrollTop += box.bottom - listBox.bottom;
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

// The host name of the page the panel is in: the top page, which is the last origin the browser
// lists for this frame's ancestors. The browser fills that list, so the page cannot forge it. It
// is empty when the browser hides the origin, and then the site button stays hidden.
function pageHost() {
  try {
    const origins = location.ancestorOrigins;
    return new URL(origins[origins.length - 1]).hostname;
  } catch {
    return '';
  }
}

async function start() {
  i18n.apply();
  els.search.placeholder = TEXT.searchPlaceholder;
  els.searchIcon.replaceWith(icon('search'));
  els.back.append(icon('back'));
  els.back.title = TEXT.back;
  els.close.append(icon('close'));
  els.close.title = TEXT.close;
  els.undoText.textContent = TEXT.undoDeleted;
  els.undoButton.textContent = TEXT.undo;
  els.folderBar.setAttribute('aria-label', TEXT.foldersLabel);
  try {
    state.snippets = await lib.readSnippets();
  } catch {
    state.loadFailed = true;
  }
  try {
    const host = pageHost();
    state.site = { host, entry: lib.offSiteEntry(host, (await lib.readSettings()).offSites) };
  } catch {
    // Without the list, the site button stays hidden.
  }
  render();
}

// The button next to Close: it turns the double tap and abbreviations off on this site, or back
// on when the site is already off.
function renderSiteButton() {
  const { host, entry } = state.site;
  els.site.hidden = !host;
  if (!host) return;
  const text = entry ? TEXT.siteOn(entry) : TEXT.siteOff(host);
  els.site.replaceChildren(icon(entry ? 'siteOn' : 'siteOff'));
  els.site.title = text;
  els.site.setAttribute('aria-label', text);
  els.site.classList.toggle('icon-button-active', Boolean(entry));
}

async function toggleSite() {
  const { host, entry } = state.site;
  if (!host) return;
  const result = await change(() => (entry ? lib.removeOffSite(entry) : lib.addOffSite(host)), TEXT.siteError);
  if (result) post({ type: 'site', off: !entry, host: entry || host });
}

function render() {
  rendering = true;
  try {
    els.error.hidden = true;
    if (state.view === 'insert') renderInsert();
    else if (state.view === 'fill') renderFill();
    else renderForm();
  } finally {
    rendering = false;
  }
  firstRenderDone = true;
  reportSize();
}

function renderUndoBar() {
  els.undoBar.hidden = !(state.view === 'insert' && state.undoEntry);
}

// The snippets the list shows: the chosen folder, narrowed by the search text.
function shownSnippets() {
  return lib.filterSnippets(lib.inFolder(state.snippets, state.folder), state.search);
}

// The row of folder buttons under the search box. It appears once a snippet has a folder, and
// is a tab list with one Tab stop: the selected button. If the chosen folder no longer exists,
// the list falls back to all snippets.
function renderFolders() {
  const names = lib.folderNames(state.snippets);
  const hasLoose = state.snippets.some((s) => !s.folder);
  if (state.folder && !names.includes(state.folder)) state.folder = null;
  if (state.folder === '' && (!hasLoose || !names.length)) state.folder = null;
  const hadFocus = els.folderBar.contains(document.activeElement);
  els.folderBar.hidden = !names.length;
  els.folderBar.replaceChildren();
  folderChoices = [];
  if (!names.length) return;

  const choices = [[TEXT.folderAll, null], ...names.map((name) => [name, name])];
  if (hasLoose) choices.push([TEXT.folderNone, '']);
  let selected = null;
  for (const [label, folder] of choices) {
    const chip = el('button', 'folder-chip', label);
    chip.type = 'button';
    chip.dir = 'auto';
    chip.title = label;
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-controls', 'snippetList');
    const isSelected = folder === state.folder;
    chip.setAttribute('aria-selected', String(isSelected));
    chip.tabIndex = isSelected ? 0 : -1;
    chip.addEventListener('click', () => {
      selectFolder(folder);
      els.search.focus(NO_SCROLL);
    });
    if (isSelected) selected = chip;
    folderChoices.push(folder);
    els.folderBar.append(chip);
  }
  if (hadFocus && selected) selected.focus(NO_SCROLL);
  // Scrolls the row, not the page, so the selected button is in view.
  if (selected) {
    const bar = els.folderBar.getBoundingClientRect();
    const box = selected.getBoundingClientRect();
    if (box.left < bar.left) els.folderBar.scrollLeft -= bar.left - box.left;
    else if (box.right > bar.right) els.folderBar.scrollLeft += box.right - bar.right;
  }
}

function selectFolder(folder) {
  state.folder = folder;
  state.focusIndex = 0;
  renderInsert();
  reportSize();
}

// Keys on a folder button: Left and Right select the previous or next folder (the other way in a
// right-to-left row), Home and End the first and last, and Enter, Space, and Down go back to the
// search box. Returns true when the key was used.
function onFolderKey(event) {
  const last = folderChoices.length - 1;
  const at = [...els.folderBar.children].indexOf(event.target.closest('.folder-chip'));
  const rtl = getComputedStyle(els.folderBar).direction === 'rtl';
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  let to = -1;
  if (event.key === forward) to = Math.min(at + 1, last);
  else if (event.key === backward) to = Math.max(at - 1, 0);
  else if (event.key === 'Home') to = 0;
  else if (event.key === 'End') to = last;
  else if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    els.search.focus(NO_SCROLL);
    return true;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    return true;
  } else return false;
  event.preventDefault();
  if (to !== at) selectFolder(folderChoices[to]);
  return true;
}

// After a save or an Undo, the folder of `snippet` when the chosen folder would hide it, so the
// snippet and its label stay in view.
function showFolderOf(snippet) {
  const folder = snippet.folder || '';
  return state.folder !== null && state.folder !== folder ? { folder } : {};
}

function renderInsert() {
  currentForm = null;
  renderSiteButton();
  els.caption.textContent = TEXT.captionInsert;
  els.back.hidden = true;
  els.folderBar.hidden = true;
  els.body.replaceChildren();
  items = [];
  renderUndoBar();

  if (state.loadFailed) {
    // An empty library would be wrong here, and Create would start over beside the real snippets.
    els.searchBar.hidden = true;
    const view = el('div', 'empty');
    const content = el('div', 'empty-content');
    content.append(el('div', 'empty-heading', TEXT.loadErrorHeading));
    view.append(content);
    els.body.append(view);
    setPrimary(null);
    showError(TEXT.loadError);
    els.app.focus(NO_SCROLL);
    return;
  }

  if (!state.snippets.length) {
    els.searchBar.hidden = true;
    els.body.append(emptyView());
    // The panel body is registered as the only item, so Enter opens the create form.
    registerItem(els.body, openCreate);
    setPrimary(TEXT.emptyApply, openCreate, RETURN_KEY);
    els.app.focus(NO_SCROLL);
    return;
  }

  els.searchBar.hidden = false;
  setPrimary(null);
  const list = el('div', 'list');
  list.id = 'snippetList';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('snippets'));
  const createLabel = state.selectedText.length > 1 ? TEXT.createFromSelection : TEXT.createNew;
  list.append(actionItem({ iconName: 'create', label: createLabel, hotkey: 1, onActivate: openCreate }));
  renderFolders();
  shownSnippets().forEach((snippet, index) => {
    list.append(snippetItem(snippet, index + 1));
  });
  els.body.append(list);
  setFocus(Math.min(state.focusIndex, items.length - 1));
  // Focus stays on a folder button while the arrow keys step through the folders.
  if (!els.folderBar.contains(document.activeElement)) els.search.focus(NO_SCROLL);
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
  caption.dir = 'auto';
  caption.append(document.createTextNode(lib.displayTitle(snippet)));
  const label =
    snippet.id === state.isEditedId ? TEXT.labelEdited : snippet.id === state.isNewId ? TEXT.labelNew : '';
  if (label) caption.append(el('span', 'item-label', label));

  const heading = el('div', 'item-heading');
  heading.append(caption);
  if (snippet.abbreviation) {
    // Left to right, as the abbreviation input is, so ;addr keeps its semicolon in front in a
    // right-to-left language.
    const abbreviation = el('span', 'item-abbreviation', snippet.abbreviation);
    abbreviation.dir = 'ltr';
    heading.append(abbreviation);
  }

  const main = el('div', 'item-main');
  main.append(heading);
  const preview = lib.previewLine(snippet);
  if (preview) {
    const previewNode = el('div', 'item-preview', preview);
    previewNode.dir = 'auto';
    main.append(previewNode);
  }

  const editButton = el('button', 'edit-button');
  editButton.type = 'button';
  editButton.tabIndex = -1;
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
  els.site.hidden = true;
  clearTimeout(searchTimer);
  state.search = '';
  els.search.value = '';
  els.searchBar.hidden = true;
  els.folderBar.hidden = true;
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

  // A formatted snippet's text is shown with its formatting and changed only in the manager, so
  // the panel never saves formatting it cannot edit. Snippets made here are plain.
  const formatted = Boolean(isEdit && snippet.html);
  let content = null;
  let contentField;
  let formattedNote = null;
  if (formatted) {
    contentField = formattedView(snippet.html);
    formattedNote = el('div', 'formatted-note', `${TEXT.formattedNote} `);
    const open = el('button', 'link-button', TEXT.openManager);
    open.type = 'button';
    open.addEventListener('click', () => openInManager(snippet.id));
    formattedNote.append(open);
  } else {
    contentField = el('div', 'field field-multiline');
    content = el('textarea', 'input input-content');
    content.placeholder = TEXT.placeholderContent;
    content.value = isEdit ? snippet.content : state.selectedText;
    content.rows = 6;
    content.dir = 'auto';
    contentField.append(content);
  }
  const contentText = () => (content ? content.value : snippet.content);
  const contentMessage = fieldMessage(content, 'contentMessage');
  const count = el('div', 'count');
  const placeholderList = el('div', 'placeholder-list');
  const unrecognizedList = el('div', 'placeholder-list unrecognized-list');
  const referenceList = el('div', 'placeholder-list reference-list');
  const referenceProblems = el('div', 'reference-problems');
  // The title and abbreviation fields are made below; they are read when this runs.
  const updateCount = () => {
    const text = contentText();
    count.textContent = lib.characterCount(text);
    renderPlaceholderList(placeholderList, text);
    renderUnrecognized(unrecognizedList, text);
    const own = { id: isEdit ? snippet.id : '', title: title.value, content: text, abbreviation: abbreviation.value.trim() };
    renderReferences(referenceList, referenceProblems, own, state.snippets.filter((s) => s.id !== own.id));
  };

  const titleField = el('div', 'field');
  const title = el('input', 'input input-title');
  title.type = 'text';
  title.dir = 'auto';
  title.placeholder = TEXT.placeholderTitle;
  title.value = isEdit ? snippet.title || '' : '';
  titleField.append(title);
  const titleMessage = fieldMessage(title, 'titleMessage');

  // Typing the abbreviation in a text field replaces it with the snippet.
  const abbreviationField = el('div', 'field');
  const abbreviation = el('input', 'input input-abbreviation');
  abbreviation.type = 'text';
  abbreviation.dir = 'ltr';
  abbreviation.placeholder = TEXT.placeholderAbbreviation;
  abbreviation.spellcheck = false;
  abbreviation.autocomplete = 'off';
  abbreviation.value = isEdit ? snippet.abbreviation || '' : '';
  abbreviationField.append(abbreviation);
  const abbreviationMessage = fieldMessage(abbreviation, 'abbreviationMessage');
  abbreviation.addEventListener('input', () => {
    showFieldMessage(abbreviation, abbreviationMessage, '');
    updateCount();
  });

  // The folder, with the existing folder names offered as suggestions. A new snippet made under
  // a folder button starts in that folder.
  const folderField = el('div', 'field');
  const folder = el('input', 'input input-folder');
  folder.type = 'text';
  folder.dir = 'auto';
  folder.placeholder = TEXT.placeholderFolder;
  folder.autocomplete = 'off';
  folder.setAttribute('list', 'folderOptions');
  folder.value = isEdit ? snippet.folder || '' : state.folder || '';
  const folderOptions = el('datalist');
  folderOptions.id = 'folderOptions';
  for (const name of lib.folderNames(state.snippets)) folderOptions.append(new Option(name));
  folderField.append(folder, folderOptions);
  const folderMessage = fieldMessage(folder, 'folderMessage');
  folder.addEventListener('input', () => {
    showFieldMessage(folder, folderMessage, '');
  });

  if (content) {
    content.addEventListener('input', () => {
      showFieldMessage(content, contentMessage, '');
      updateCount();
      autosize(content);
    });
  }
  title.addEventListener('input', () => {
    showFieldMessage(title, titleMessage, '');
    updateCount();
  });

  updateCount();

  form.append(contentField);
  if (formattedNote) form.append(formattedNote);
  form.append(
    contentMessage,
    placeholderList,
    unrecognizedList,
    referenceList,
    referenceProblems,
    count,
    titleField,
    titleMessage,
    abbreviationField,
    abbreviationMessage,
    folderField,
    folderMessage
  );
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
    abbreviation,
    folder,
    contentMessage,
    titleMessage,
    abbreviationMessage,
    folderMessage,
    ownId: isEdit ? snippet.id : null,
    submit: () => (isEdit ? saveEdit(snippet.id) : saveCreate()),
  };
  setPrimary(TEXT.formApply, currentForm.submit, IS_MAC ? COMMAND_KEY + RETURN_KEY : `${t('keyCtrl')} ${RETURN_KEY}`);

  if (!content) {
    title.focus(NO_SCROLL);
    return;
  }
  autosize(content);
  content.focus(NO_SCROLL);
  content.setSelectionRange(content.value.length, content.value.length);
}

// The read-only box that shows a formatted snippet's text. It takes one Tab stop so it can be
// scrolled with the keyboard. A link shows its address as a tooltip and opens nothing.
function formattedView(html) {
  const view = el('div', 'field formatted-view');
  view.tabIndex = 0;
  view.dir = 'auto';
  view.setAttribute('role', 'document');
  view.setAttribute('aria-label', TEXT.formattedView);
  view.append(lib.richText.toFragment(html, document, { titles: true }));
  view.addEventListener('click', (event) => {
    if (event.target.closest('a')) event.preventDefault();
  });
  return view;
}

// Opens the manager at the snippet in a new tab, and closes the panel. Changes typed in the form
// are not saved.
async function openInManager(id) {
  const url = chrome.runtime.getURL(`options.html#edit=${encodeURIComponent(id)}`);
  try {
    await chrome.tabs.create({ url });
  } catch {
    window.open(url, '_blank');
  }
  post({ type: 'close' });
}

// The placeholders found in the text, shown under it so the user sees which parts will be
// replaced when the snippet is inserted.
function renderPlaceholderList(container, text) {
  const found = placeholders.listPlaceholders(text);
  container.hidden = !found.length;
  container.replaceChildren();
  if (!found.length) return;
  container.append(el('span', 'placeholder-label', TEXT.placeholders));
  const now = new Date();
  for (const token of found) {
    const pill = el('span', 'placeholder-pill');
    const tokenSpan = el('span', 'placeholder-token', token);
    tokenSpan.dir = 'ltr';
    pill.append(tokenSpan);
    const value = placeholders.currentValue(token, { locale: state.locale, now });
    if (value) {
      const valueSpan = el('span', 'placeholder-value', value);
      valueSpan.dir = 'auto';
      pill.append(valueSpan);
    }
    container.append(pill);
  }
}

// Text that looks like a date or time placeholder but is not one, so a typo is seen before the
// snippet is used.
function renderUnrecognized(container, text) {
  const found = placeholders.unrecognized(text);
  container.hidden = !found.length;
  container.replaceChildren();
  if (!found.length) return;
  container.append(el('span', 'placeholder-label', TEXT.placeholdersUnrecognized));
  for (const token of found) {
    const pill = el('span', 'placeholder-pill placeholder-pill-literal', token);
    pill.dir = 'ltr';
    container.append(pill);
  }
}

// The snippets the text includes, shown under it, and a line for each reference that is inserted
// as written. `own` is the form as typed, so a snippet that includes itself shows before it is saved.
function renderReferences(container, problemsBox, own, others) {
  const all = [...others, own];
  const found = placeholders.references(own.content);
  container.hidden = !found.length;
  container.replaceChildren();
  if (found.length) container.append(el('span', 'placeholder-label', TEXT.includes));
  for (const abbreviation of found) {
    const target = all.find((s) => s.abbreviation === abbreviation);
    const pill = el('span', 'placeholder-pill reference-pill', target ? `${lib.displayTitle(target)} (${abbreviation})` : abbreviation);
    pill.dir = 'auto';
    if (!target) {
      pill.classList.add('reference-missing');
      pill.title = TEXT.referenceNotFound;
    }
    container.append(pill);
  }
  problemsBox.replaceChildren();
  for (const problem of placeholders.resolveReferences(own, all).problems) {
    const text =
      problem.kind === 'missing'
        ? TEXT.referenceMissing(problem.abbreviation, problem.token)
        : problem.kind === 'loop'
          ? TEXT.referenceLoop(problem.token)
          : TEXT.referenceLimit;
    const line = el('div', 'feedback', text);
    line.dir = 'auto';
    problemsBox.append(line);
  }
  reportSize();
}

// The fill-in form for a snippet with {input:Label} placeholders: one field per label, a preview
// of the text as it will be inserted, and Insert. Enter moves to the next field and inserts from
// the last one; Ctrl+Enter inserts from any field.
function renderFill() {
  els.site.hidden = true;
  clearTimeout(searchTimer);
  els.searchBar.hidden = true;
  els.folderBar.hidden = true;
  els.back.hidden = state.mode === 'fill-only';
  els.body.replaceChildren();
  items = [];
  currentForm = null;
  renderUndoBar();

  const snippet = state.snippets.find((s) => s.id === state.fillId);
  if (!snippet) {
    showError(TEXT.notFound);
    setPrimary(null);
    return;
  }
  els.caption.textContent = lib.displayTitle(snippet);
  const content = placeholders.resolveReferences(snippet, state.snippets).content;
  const labels = placeholders.inputLabels(content);
  const form = el('div', 'form fill');
  form.append(el('div', 'fill-count', TEXT.fillCount(labels.length)));

  const inputs = labels.map((label) => {
    const field = el('label', 'fill-field');
    const input = el('input', 'input fill-input');
    input.type = 'text';
    input.dataset.label = label;
    field.append(el('span', 'fill-label', label), input);
    form.append(field);
    return input;
  });

  form.append(el('div', 'fill-label', TEXT.preview));
  const preview = el('div', 'fill-preview');
  preview.dir = 'auto';
  form.append(preview);
  const formatted = formattedText(snippet);
  const values = () => Object.fromEntries(inputs.map((input) => [input.dataset.label, input.value]));
  // A formatted snippet's preview shows the formatting, with the typed values as text.
  const updatePreview = () => {
    const options = { values: values(), locale: state.locale };
    if (formatted.html) {
      const html = lib.richText.expand(formatted.html, options).html;
      preview.replaceChildren(lib.richText.toFragment(html, document, { titles: true }));
    } else {
      preview.textContent = placeholders.expand(content, options).text;
    }
    reportSize();
  };
  preview.addEventListener('click', (event) => {
    if (event.target.closest('a')) event.preventDefault();
  });
  inputs.forEach((input) => input.addEventListener('input', updatePreview));
  updatePreview();
  els.body.append(form);

  currentForm = {
    inputs,
    submit: () => post({ type: 'insert', content, values: values(), ...formatted }),
  };
  setPrimary(TEXT.insertApply, currentForm.submit, IS_MAC ? COMMAND_KEY + RETURN_KEY : `${t('keyCtrl')} ${RETURN_KEY}`);
  if (inputs.length) inputs[0].focus(NO_SCROLL);
}

function openFill(id) {
  state.view = 'fill';
  state.fillId = id;
  state.undoEntry = null;
  render();
}

function autosize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
  reportSize();
}

// Form rules: the content must not be blank, the title must not exceed 128 characters, the
// abbreviation must pass lib.abbreviationProblem(), and the folder must not exceed 64 characters.
// The content has no length limit.
function validate(form) {
  let valid = true;
  if (form.content && form.content.value.trim() === '') {
    showFieldMessage(form.content, form.contentMessage, TEXT.validationEmpty);
    valid = false;
  }
  if (lib.titleLength(form.title.value) > lib.TITLE_MAX_LENGTH) {
    showFieldMessage(form.title, form.titleMessage, TEXT.validationTooLong(lib.TITLE_MAX_LENGTH));
    valid = false;
  }
  const problem = lib.abbreviationProblem(form.abbreviation.value.trim(), state.snippets, form.ownId);
  if (problem) {
    showFieldMessage(form.abbreviation, form.abbreviationMessage, problem);
    valid = false;
  }
  if (lib.folderLength(form.folder.value) > lib.FOLDER_MAX_LENGTH) {
    showFieldMessage(form.folder, form.folderMessage, TEXT.validationTooLong(lib.FOLDER_MAX_LENGTH));
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
  } catch (error) {
    showError(error.name === 'AbbreviationError' ? error.message : errorText);
    return null;
  } finally {
    setBusy(false);
  }
}

async function saveCreate() {
  const form = currentForm;
  if (!form || state.busy || !validate(form)) return;
  const result = await change(
    () =>
      lib.createSnippet({
        content: form.content.value,
        title: form.title.value,
        abbreviation: form.abbreviation.value.trim(),
        folder: form.folder.value,
      }),
    TEXT.createError
  );
  if (!result) return;
  state.snippets = result.snippets;
  if (state.mode === 'create-only') post({ type: 'saved' });
  else backToList({ isNewId: result.snippet.id, ...showFolderOf(result.snippet) });
}

async function saveEdit(id) {
  const form = currentForm;
  if (!form || state.busy || !validate(form)) return;
  const result = await change(
    () =>
      // A formatted snippet's form has no text field, and its text stays as stored.
      lib.updateSnippet(id, {
        content: form.content ? form.content.value : undefined,
        title: form.title.value,
        abbreviation: form.abbreviation.value.trim(),
        folder: form.folder.value,
      }),
    TEXT.editError
  );
  if (!result) return;
  state.snippets = result.snippets;
  backToList({ isEditedId: id, ...showFolderOf(result.snippet) });
}

async function duplicate(id) {
  const result = await change(() => lib.duplicateSnippet(id), TEXT.duplicateError);
  if (!result) return;
  state.snippets = result.snippets;
  backToList({ isNewId: result.snippet.id, isEditedId: undefined, ...showFolderOf(result.snippet) });
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
  backToList({ undoEntry: null, isNewId: undefined, isEditedId: undefined, ...showFolderOf(result.snippet) });
}

// Alt+Up and Alt+Down move the highlighted snippet one place. This works only while the search
// box is empty, because a filtered list does not show the neighbours a move would pass. Under a
// folder, the snippet moves past the next snippet of that folder.
async function moveFocused(step) {
  const item = items[state.focusIndex];
  if (!item || !item.snippet || els.search.value.trim()) return;
  const id = item.snippet.id;
  const to = lib.moveTarget(state.snippets, shownSnippets(), id, step);
  if (to === -1) return;
  const list = await change(() => lib.moveSnippet(id, to), TEXT.moveError);
  if (!list) return;
  state.snippets = list;
  state.undoEntry = null;
  // Item 0 is the create entry, so the snippet at position p of the list shown is item p + 1.
  state.focusIndex = shownSnippets().findIndex((s) => s.id === id) + 1;
  renderInsert();
  reportSize();
}

// A snippet with fill-in fields opens the fill-in form first; any other is inserted at once.
function insertSnippet(snippet) {
  const { content } = placeholders.resolveReferences(snippet, state.snippets);
  if (placeholders.inputLabels(content).length) openFill(snippet.id);
  else post({ type: 'insert', content, values: {}, ...formattedText(snippet) });
}

// The formatted text of a snippet that has formatting or includes one that does, with its included
// snippets in place, to send along with the plain text of an insert. The page decides which of the
// two its field takes.
function formattedText(snippet) {
  const html = lib.richText.resolve(snippet, state.snippets);
  return html === null ? {} : { html };
}

// Escape leaves a form for the list, and closes the panel from the list. A panel opened for one
// form only (create-only or fill-only) has no list, so it closes.
function goBack() {
  if (state.view !== 'insert' && state.mode === 'insert') backToList();
  else post({ type: 'close' });
}

els.back.addEventListener('click', goBack);
els.close.addEventListener('click', () => post({ type: 'close' }));
els.site.addEventListener('click', toggleSite);
els.primary.addEventListener('click', () => {
  if (primaryAction && !state.busy) primaryAction();
});
els.undoButton.addEventListener('click', undoDelete);

// Tab and Shift+Tab wrap around the panel's own controls instead of leaving for the page, which
// would leave the panel open without a way to reach Escape.
function keepTabInside(event) {
  const stops = [...els.app.querySelectorAll('button, input, textarea, select, [tabindex]')].filter(
    (node) => node.tabIndex >= 0 && !node.disabled && node.getClientRects().length
  );
  if (!stops.length) return;
  const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
  if (document.activeElement === edge || !stops.includes(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? stops[stops.length - 1] : stops[0]).focus(NO_SCROLL);
  }
}

// Keyboard controls: arrows move through the list, F2 opens the edit form of the highlighted
// snippet, Alt+arrows move the highlighted snippet,
// Enter picks the highlighted entry, Ctrl+1 to Ctrl+9 (Cmd on a Mac) pick an entry in the list
// by its position, Ctrl+Z after a delete restores the snippet, Ctrl+Enter saves a form, Enter in
// the name or abbreviation field saves too, and Escape goes back or closes. Enter in the Folder
// field does not save, because it may be picking a suggestion from the field's list.
document.addEventListener(
  'keydown',
  (event) => {
    if (event.isComposing || !state.initialized) return;
    const modifier = IS_MAC ? event.metaKey : event.ctrlKey;
    const shortcut = lib.keyboard.shortcutKey(event);

    if (event.key === 'Escape') {
      event.preventDefault();
      goBack();
      return;
    }

    // Ctrl+1 to Ctrl+9 are always kept from the browser, which would switch tabs, but they act
    // only in the list.
    if (modifier && !event.shiftKey && !event.altKey && HOTKEYS.includes(shortcut)) {
      event.preventDefault();
      const target = state.view === 'insert' && els.body.querySelector(`[data-hotkey="${shortcut}"]`);
      if (target && !state.busy) target.click();
      return;
    }

    if (event.key === 'Tab') keepTabInside(event);

    if (state.view === 'insert') {
      if (event.target instanceof Element && event.target.closest('.folder-chip') && onFolderKey(event)) return;
      if (event.altKey && !modifier && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        moveFocused(event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'F2' && !modifier && !event.altKey && !event.shiftKey && items[state.focusIndex]?.snippet) {
        event.preventDefault();
        openEdit(items[state.focusIndex].snippet.id);
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length > 1) {
        event.preventDefault();
        setFocus(state.focusIndex + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (
        modifier &&
        shortcut === 'z' &&
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

    if (state.view === 'fill') {
      if (event.key === 'Enter' && currentForm && !event.shiftKey && event.target.tagName !== 'BUTTON') {
        event.preventDefault();
        const index = currentForm.inputs.indexOf(event.target);
        if (!modifier && index !== -1 && index < currentForm.inputs.length - 1) currentForm.inputs[index + 1].focus(NO_SCROLL);
        else currentForm.submit();
      }
      return;
    }

    if (
      event.key === 'Enter' &&
      currentForm &&
      (modifier ||
        ((event.target === currentForm.title || event.target === currentForm.abbreviation) &&
          !event.shiftKey))
    ) {
      event.preventDefault();
      currentForm.submit();
    }
  },
  true
);

els.app.tabIndex = -1;
post({ type: 'ready' });
