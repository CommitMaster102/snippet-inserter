/*
 * Snippet manager: the extension's options page, which the toolbar icon opens.
 *
 * The address hash picks one of three views: #snippets (the list and an editor), #deleted (the
 * recently deleted snippets), and #settings (the trigger key and backup files). All storage goes
 * through lib/snippets.js, which the snippet panel shares. The page follows
 * chrome.storage.onChanged, so a change made from a panel in another tab shows up here without a
 * reload.
 */
'use strict';

const lib = window.SnippetInserter;
const i18n = lib.i18n;
const t = i18n.t;
// A count that can pass 999, in the digits and with the thousands separator of the catalog's
// language.
const countText = (n) => i18n.number(n, { grouping: true });
// The static text, language, and direction of the page come from the message catalog before
// anything below reads the page.
i18n.apply();
// Every language except English names its language in Settings and links to the form for a wrong
// translation. English is the source text, so it has nothing to report. Only the English catalog
// names its language "English", which is also why a stretched or mirrored test catalog shows it.
if (t('languageName') !== 'English') {
  document.getElementById('languageNoteText').textContent = t('languageNote', t('languageName'));
  document.getElementById('languageNote').hidden = false;
}
const richText = lib.richText;
const IS_MAC = navigator.userAgent.includes('Mac OS');
const VIEWS = ['snippets', 'deleted', 'settings'];
// While the rich editor has the focus, the count and the lists under it follow the typing after
// this pause, because each update reads the whole editor.
const RICH_UPDATE_MS = 150;
// background.js leaves selected text here before opening the page at #new.
const PENDING_KEY = 'pendingSnippet';
// A second click on "Delete forever" within this time deletes the snippet for good.
const PURGE_CONFIRM_MS = 4000;
const HANDLE_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<circle cx="6" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="6" cy="8" r="1.2"/>' +
  '<circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg>';

const FOLDER_ICON =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" ' +
  'stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5h4l1.5 1.5H14v6.5H2z"/></svg>';

const $ = (id) => document.getElementById(id);
const els = {
  newSnippet: $('newSnippet'),
  nav: document.querySelectorAll('.nav a'),
  snippetCount: $('snippetCount'),
  deletedCount: $('deletedCount'),
  search: $('search'),
  folderBar: $('folderBar'),
  folderActions: $('folderActions'),
  folderButtons: $('folderButtons'),
  renameFolder: $('renameFolder'),
  removeFolder: $('removeFolder'),
  renameForm: $('renameForm'),
  renameInput: $('renameInput'),
  renameCancel: $('renameCancel'),
  renameHint: $('renameHint'),
  renameError: $('renameError'),
  folder: $('folder'),
  folderError: $('folderError'),
  folderOptions: $('folderOptions'),
  snippetList: $('snippetList'),
  listEmpty: $('listEmpty'),
  moveStatus: $('moveStatus'),
  undoBar: $('undoBar'),
  undoButton: $('undoButton'),
  editorEmpty: $('editorEmpty'),
  editor: $('editor'),
  editorHeading: $('editorHeading'),
  editorNotice: $('editorNotice'),
  editorNoticeText: $('editorNoticeText'),
  noticePrimary: $('noticePrimary'),
  noticeSecondary: $('noticeSecondary'),
  title: $('title'),
  titleError: $('titleError'),
  abbreviation: $('abbreviation'),
  abbreviationError: $('abbreviationError'),
  abbreviations: $('abbreviations'),
  offSiteForm: $('offSiteForm'),
  offSiteInput: $('offSiteInput'),
  offSiteError: $('offSiteError'),
  offSiteList: $('offSiteList'),
  offSitesEmpty: $('offSitesEmpty'),
  content: $('content'),
  formatted: $('formatted'),
  formatJson: $('formatJson'),
  codeLanguage: $('codeLanguage'),
  toolbar: $('toolbar'),
  linkBar: $('linkBar'),
  linkUrl: $('linkUrl'),
  linkApply: $('linkApply'),
  linkRemove: $('linkRemove'),
  linkCancel: $('linkCancel'),
  linkError: $('linkError'),
  richContent: $('richContent'),
  formatHint: $('formatHint'),
  contentError: $('contentError'),
  placeholderList: $('placeholderList'),
  unrecognizedList: $('unrecognizedList'),
  referenceList: $('referenceList'),
  referenceProblems: $('referenceProblems'),
  count: $('count'),
  duplicate: $('duplicate'),
  delete: $('delete'),
  save: $('save'),
  editorStatus: $('editorStatus'),
  pageError: $('pageError'),
  deletedList: $('deletedList'),
  deletedEmpty: $('deletedEmpty'),
  hotkey: $('hotkey'),
  status: $('status'),
  shortcut: $('shortcut'),
  shortcutButton: $('shortcutButton'),
  exportButton: $('export'),
  exportNote: $('exportNote'),
  importButton: $('import'),
  importFile: $('importFile'),
  importResult: $('importResult'),
};

const state = {
  snippets: [],
  deleted: [],
  // The snippet shown in the editor, or null while the editor holds a new snippet or nothing.
  selectedId: null,
  creating: false,
  // The field values as last loaded or saved; the editor has unsaved changes when they differ.
  snapshot: null,
  // The deleted snippet that the Undo bar restores.
  undoId: null,
  // The folder the list shows: null for all snippets, '' for the ones without a folder, or a
  // folder name. The manager opens on all snippets.
  folder: null,
  // The snippet being dragged, which a folder button can accept.
  draggingId: null,
  busy: false,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Like el(), for text the user wrote: the browser picks the direction from its first strong
// character, so Hebrew and Arabic names read and truncate from the right.
function autoDirEl(tag, className, text) {
  const node = el(tag, className, text);
  node.dir = 'auto';
  return node;
}

// Views.

function currentView() {
  const name = location.hash.replace(/^#/, '');
  return VIEWS.includes(name) ? name : 'snippets';
}

function showView(name) {
  for (const view of VIEWS) $(`view-${view}`).hidden = view !== name;
  for (const link of els.nav) {
    if (link.dataset.view === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

// #new opens the editor with a new snippet, holding any text that background.js left in session
// storage, and then shows as #snippets. #edit=<id>, which the panel opens for a formatted snippet,
// selects that snippet and also shows as #snippets.
async function route() {
  const edit = /^#edit=(.*)$/.exec(location.hash);
  if (edit) {
    history.replaceState(null, '', '#snippets');
    showView('snippets');
    let id = '';
    try {
      id = decodeURIComponent(edit[1]);
    } catch {
      // A malformed address names no snippet.
    }
    if (state.snippets.some((s) => s.id === id)) requestSelect(id);
    else reportError(t('notFound'));
    return;
  }
  if (location.hash !== '#new') {
    showView(currentView());
    return;
  }
  history.replaceState(null, '', '#snippets');
  showView('snippets');
  let text = '';
  try {
    const stored = await chrome.storage.session.get(PENDING_KEY);
    text = stored[PENDING_KEY] || '';
    await chrome.storage.session.remove(PENDING_KEY);
  } catch {
    // Session storage is unavailable; start with an empty snippet.
  }
  startNew(text);
}

function renderCounts() {
  els.snippetCount.textContent = countText(state.snippets.length);
  els.deletedCount.textContent = state.deleted.length ? countText(state.deleted.length) : '';
  const n = state.snippets.length;
  els.exportNote.textContent = i18n.plural('exportNote', n, [countText(n), lib.exportFileName()]);
}

function renderAll() {
  renderCounts();
  renderFolders();
  renderList();
  renderDeleted();
}

// The folder buttons under the search box, each with the number of snippets in it. The row
// appears once a snippet has a folder, and is a tab list with one Tab stop: the selected button.
// If the chosen folder no longer exists, the list falls back to all snippets.

// The folder each button selects, in the order of the buttons.
let folderChoices = [];

function renderFolders() {
  const names = lib.folderNames(state.snippets);
  const counts = new Map();
  for (const { folder } of state.snippets) if (folder) counts.set(folder, (counts.get(folder) || 0) + 1);
  const loose = state.snippets.length - [...counts.values()].reduce((sum, n) => sum + n, 0);
  const gone = state.folder === '' ? !names.length || !loose : state.folder !== null && !counts.has(state.folder);
  if (gone) {
    state.folder = null;
    closeRename();
  }

  const hadFocus = els.folderBar.contains(document.activeElement);
  els.folderBar.hidden = !names.length;
  els.folderBar.replaceChildren();
  els.folderOptions.replaceChildren(...names.map((name) => new Option(name)));
  folderChoices = [];
  const actionsShown = Boolean(names.length) && typeof state.folder === 'string' && state.folder !== '';
  els.folderActions.hidden = !actionsShown;
  if (!actionsShown) closeRename();
  if (!names.length) return;

  const choices = [[t('folderAll'), null, state.snippets.length], ...names.map((name) => [name, name, counts.get(name)])];
  if (loose) choices.push([t('folderNone'), '', loose]);
  let selected = null;
  for (const [label, folder, count] of choices) {
    const chip = el('button', 'folder-chip');
    chip.type = 'button';
    chip.dir = 'auto';
    chip.title = label;
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-controls', 'snippetList');
    const isSelected = folder === state.folder;
    chip.setAttribute('aria-selected', String(isSelected));
    chip.tabIndex = isSelected ? 0 : -1;
    // The button takes its direction from the name, so the name has no direction of its own.
    chip.append(el('span', 'folder-name', label), ' ', el('span', 'folder-count', countText(count)));
    chip.addEventListener('click', () => selectFolder(folder));
    chip.addEventListener('keydown', onFolderKey);
    chip.addEventListener('dragover', (event) => {
      if (!canDropOn(folder)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      chip.classList.add('drop-target');
    });
    chip.addEventListener('dragleave', () => chip.classList.remove('drop-target'));
    chip.addEventListener('drop', (event) => {
      event.preventDefault();
      chip.classList.remove('drop-target');
      const id = state.draggingId;
      state.draggingId = null;
      if (id && canDropOn(folder, id)) moveToFolder(id, folder);
    });
    if (isSelected) selected = chip;
    folderChoices.push(folder);
    els.folderBar.append(chip);
  }
  if (hadFocus && selected) selected.focus();
}

function selectFolder(folder) {
  if (folder === state.folder) return;
  state.folder = folder;
  disarmRemove();
  closeRename();
  renderFolders();
  renderList();
}

// Left and Right select the previous or next folder (the other way in a right-to-left row), Home
// and End the first and last, and Enter, Space, and Down go to the search box.
function onFolderKey(event) {
  const last = folderChoices.length - 1;
  const at = [...els.folderBar.children].indexOf(event.currentTarget);
  const rtl = getComputedStyle(els.folderBar).direction === 'rtl';
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  let to;
  if (event.key === forward) to = Math.min(at + 1, last);
  else if (event.key === backward) to = Math.max(at - 1, 0);
  else if (event.key === 'Home') to = 0;
  else if (event.key === 'End') to = last;
  else if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    els.search.focus();
    return;
  } else return;
  event.preventDefault();
  selectFolder(folderChoices[to]);
}

// A folder button accepts the dragged snippet when it names a folder, or No folder, other than
// the one the snippet is already in.
function canDropOn(folder, id = state.draggingId) {
  const dragged = state.snippets.find((s) => s.id === id);
  return folder !== null && Boolean(dragged) && (dragged.folder || '') !== folder;
}

// Puts the editor's Folder field, and the copy of it that tells unsaved changes apart, on `folder`
// before a change made from this page lands in storage, so the editor does not report the change
// as one made in another tab. Returns a function that puts both back if the change fails.
function followEditorFolder(folder) {
  const before = { field: els.folder.value, saved: state.snapshot.folder };
  els.folder.value = folder;
  state.snapshot = { ...state.snapshot, folder };
  return () => {
    els.folder.value = before.field;
    state.snapshot = { ...state.snapshot, folder: before.saved };
  };
}

// True when the editor shows a stored snippet that `inside` accepts.
function editorHolds(inside) {
  const stored = state.snippets.find((s) => s.id === state.selectedId);
  return !state.creating && !els.editor.hidden && Boolean(stored) && inside(stored);
}

async function moveToFolder(id, folder) {
  const revert = editorHolds((s) => s.id === id) ? followEditorFolder(folder) : () => {};
  const result = await run(() => lib.updateSnippet(id, { folder }));
  if (!result) {
    revert();
    return;
  }
  state.snippets = result.snippets;
  renderAll();
}

function openRename() {
  els.folderButtons.hidden = true;
  els.renameForm.hidden = false;
  els.renameHint.hidden = true;
  showFieldError(els.renameInput, els.renameError, '');
  els.renameInput.value = state.folder;
  els.renameInput.focus();
  els.renameInput.select();
}

function closeRename() {
  els.renameForm.hidden = true;
  els.folderButtons.hidden = false;
}

// The name a rename to `typed` would give, and whether it joins another folder.
function renameTarget(typed) {
  const others = state.snippets.filter((s) => s.folder !== state.folder);
  const target = lib.matchFolder(typed, others);
  return { target, joins: Boolean(target) && others.some((s) => s.folder === target) };
}

els.renameFolder.addEventListener('click', openRename);
els.renameCancel.addEventListener('click', () => {
  closeRename();
  els.renameFolder.focus();
});
els.renameInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  closeRename();
  els.renameFolder.focus();
});
els.renameInput.addEventListener('input', () => {
  showFieldError(els.renameInput, els.renameError, '');
  const { target, joins } = renameTarget(els.renameInput.value);
  els.renameHint.hidden = !joins;
  els.renameHint.textContent = t('renameJoins', [target]);
});
els.renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const from = state.folder;
  const typed = els.renameInput.value;
  const problem = !lib.cleanFolder(typed)
    ? t('folderNameRequired')
    : lib.folderLength(typed) > lib.FOLDER_MAX_LENGTH
      ? tooLong(lib.FOLDER_MAX_LENGTH)
      : '';
  showFieldError(els.renameInput, els.renameError, problem);
  if (!from || problem) return;
  const { target } = renameTarget(typed);
  if (target === from) {
    closeRename();
    return;
  }
  const revert = editorHolds((s) => s.folder === from) ? followEditorFolder(target) : () => {};
  const list = await run(() => lib.renameFolder(from, typed));
  if (!list) {
    revert();
    return;
  }
  state.snippets = list;
  state.folder = target;
  closeRename();
  renderAll();
});

// Remove folder asks for a second click within PURGE_CONFIRM_MS, as Delete forever does.
let removeArmed = { folder: null, until: 0 };

function disarmRemove() {
  removeArmed = { folder: null, until: 0 };
  els.removeFolder.textContent = t('removeFolder');
}

els.removeFolder.addEventListener('click', async () => {
  const from = state.folder;
  if (!from) return;
  if (removeArmed.folder !== from || Date.now() > removeArmed.until) {
    removeArmed = { folder: from, until: Date.now() + PURGE_CONFIRM_MS };
    els.removeFolder.textContent = t('removeFolderConfirm');
    setTimeout(() => {
      if (removeArmed.folder === from && Date.now() > removeArmed.until) disarmRemove();
    }, PURGE_CONFIRM_MS + 50);
    return;
  }
  disarmRemove();
  const revert = editorHolds((s) => s.folder === from) ? followEditorFolder('') : () => {};
  const list = await run(() => lib.removeFolder(from));
  if (!list) {
    revert();
    return;
  }
  state.snippets = list;
  state.folder = '';
  renderAll();
});

// The snippet list. Rows can be dragged, or moved with Alt+Up and Alt+Down, while the search box
// is empty; a filtered list hides the neighbours a move would pass.

function filtering() {
  return Boolean(els.search.value.trim());
}

// Redraws the list. Keyboard focus stays on the same snippet's row, or moves to `focusId`.
function renderList(focusId) {
  const active = document.activeElement;
  const focusedRow = active && els.snippetList.contains(active) ? active.closest('.row') : null;
  focusId = focusId || (focusedRow && focusedRow.dataset.id);
  const shown = lib.filterSnippets(lib.inFolder(state.snippets, state.folder), els.search.value);
  els.snippetList.replaceChildren(...shown.map(snippetRow));
  els.listEmpty.hidden = state.snippets.length > 0;
  const byId = (id) => els.snippetList.querySelector(`[data-id="${CSS.escape(id)}"]`);
  setTabStop((focusId && byId(focusId)) || (state.selectedId && byId(state.selectedId)) || els.snippetList.firstElementChild);
  if (focusId) {
    const row = byId(focusId);
    if (row) row.focus();
  }
}

// The list is a single Tab stop: only one row can be tabbed to, and the arrow keys move between
// rows. The stop follows the row that has focus.
function setTabStop(stop) {
  for (const row of els.snippetList.children) row.tabIndex = row === stop ? 0 : -1;
}

function snippetRow(snippet) {
  const row = el('li', 'row');
  row.dataset.id = snippet.id;
  row.setAttribute('role', 'option');
  row.tabIndex = -1;
  row.addEventListener('focus', () => setTabStop(row));
  // A row can always be dragged onto a folder button. Dropping on another row to reorder needs an
  // empty search box, which the dragover handler checks.
  row.draggable = true;
  if (snippet.id === state.selectedId) row.setAttribute('aria-selected', 'true');

  const handle = el('span', 'handle');
  handle.innerHTML = HANDLE_ICON;
  handle.title = lib.folderNames(state.snippets).length
    ? t('dragReorderFolder')
    : t('dragReorder');

  const main = el('div', 'row-main');
  main.append(autoDirEl('span', 'row-name', lib.displayTitle(snippet)));
  const preview = lib.previewLine(snippet);
  if (snippet.folder && state.folder === null) {
    // Under All, the second line starts with the folder the snippet is in.
    const detail = el('div', 'row-detail');
    const tag = el('span', 'row-folder');
    tag.innerHTML = FOLDER_ICON;
    tag.append(autoDirEl('span', 'row-folder-name', snippet.folder));
    detail.append(tag);
    if (preview) detail.append(autoDirEl('span', 'row-preview', preview));
    main.append(detail);
  } else if (preview) {
    main.append(autoDirEl('span', 'row-preview', preview));
  }

  row.append(handle, main);
  if (snippet.abbreviation) {
    // Left to right, as the abbreviation input is, so ;addr keeps its semicolon in front in a
    // right-to-left language.
    const abbreviation = el('span', 'pill', snippet.abbreviation);
    abbreviation.dir = 'ltr';
    row.append(abbreviation);
  }

  row.addEventListener('click', () => requestSelect(snippet.id));
  row.addEventListener('keydown', (event) => onRowKey(event, snippet));
  row.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', snippet.id);
    event.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
    state.draggingId = snippet.id;
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    state.draggingId = null;
    clearDropMarks();
  });
  row.addEventListener('dragover', (event) => {
    if (filtering()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    row.classList.add(dropAfter(event, row) ? 'drop-after' : 'drop-before');
  });
  row.addEventListener('drop', (event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const after = dropAfter(event, row);
    clearDropMarks();
    dropOnto(id, snippet.id, after);
  });
  return row;
}

function dropAfter(event, row) {
  const box = row.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2;
}

function clearDropMarks() {
  for (const row of els.snippetList.querySelectorAll('.drop-before, .drop-after')) {
    row.classList.remove('drop-before', 'drop-after');
  }
}

async function dropOnto(id, targetId, after) {
  if (!id || id === targetId) return;
  const from = state.snippets.findIndex((s) => s.id === id);
  let to = state.snippets.findIndex((s) => s.id === targetId) + (after ? 1 : 0);
  if (from === -1 || to < 0) return;
  // moveSnippet counts positions in the list without the moved snippet.
  if (from < to) to -= 1;
  await move(id, to);
}

async function move(id, to) {
  const list = await run(() => lib.moveSnippet(id, to));
  if (!list) return;
  state.snippets = list;
  renderList(id);
  const moved = list.find((s) => s.id === id);
  const shown = lib.inFolder(list, state.folder);
  els.moveStatus.textContent = t('moved', [lib.displayTitle(moved), countText(shown.indexOf(moved) + 1), countText(shown.length)]);
}

function onRowKey(event, snippet) {
  const rows = [...els.snippetList.children];
  const index = rows.indexOf(event.currentTarget);
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    requestSelect(snippet.id);
  } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.altKey) {
    event.preventDefault();
    if (filtering()) return;
    // Under a folder, the row moves past the next row of that folder.
    const shown = lib.inFolder(state.snippets, state.folder);
    const to = lib.moveTarget(state.snippets, shown, snippet.id, event.key === 'ArrowDown' ? 1 : -1);
    if (to !== -1) move(snippet.id, to);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
  }
}

els.search.addEventListener('input', () => renderList());

// The editor.

// The text as it would be saved: the text box, or the rich editor read through the cleaner, with
// `html` only when the text has formatting.
function textFields() {
  if (!els.formatted.checked) return { content: els.content.value, html: '' };
  const clean = richText.clean(els.richContent);
  return { content: clean.text, html: clean.formatted ? lib.highlight.colorBlocks(clean.html) : '' };
}

function fields() {
  return {
    title: els.title.value,
    ...textFields(),
    abbreviation: els.abbreviation.value.trim(),
    folder: lib.cleanFolder(els.folder.value),
  };
}

// The fields of `snippet` in the shape fields() returns.
function snippetFields(snippet) {
  return {
    title: snippet.title || '',
    content: snippet.content,
    html: snippet.html || '',
    abbreviation: snippet.abbreviation || '',
    folder: snippet.folder || '',
  };
}

function sameFields(a, b) {
  return (
    Boolean(a && b) &&
    a.title === (b.title || '') &&
    a.content === b.content &&
    (a.html || '') === (b.html || '') &&
    (a.abbreviation || '') === (b.abbreviation || '') &&
    (a.folder || '') === (b.folder || '')
  );
}

function isDirty() {
  return !els.editor.hidden && !sameFields(fields(), state.snapshot);
}

// Text that looks like a date or time placeholder but is not one, so a typo is seen before the
// snippet is used.
function renderUnrecognized(found) {
  els.unrecognizedList.hidden = !found.length;
  els.unrecognizedList.replaceChildren();
  if (!found.length) return;
  els.unrecognizedList.append(el('span', 'muted', t('placeholdersUnrecognized')));
  for (const token of found) {
    const pill = el('span', 'placeholder-pill placeholder-pill-literal', token);
    pill.dir = 'ltr';
    els.unrecognizedList.append(pill);
  }
}

// The snippets the text includes, and a line for each reference that is inserted as written. The
// text and abbreviation as typed stand in for the stored snippet, so a snippet that includes
// itself shows before it is saved.
function renderReferences() {
  const own = {
    id: state.creating ? '' : state.selectedId || '',
    title: els.title.value,
    content: textFields().content,
    abbreviation: els.abbreviation.value.trim(),
  };
  const all = [...state.snippets.filter((s) => s.id !== own.id), own];
  const found = lib.placeholders.references(own.content);
  els.referenceList.hidden = !found.length;
  els.referenceList.replaceChildren();
  if (found.length) els.referenceList.append(el('span', 'muted', t('includes')));
  for (const abbreviation of found) {
    const target = all.find((s) => s.abbreviation === abbreviation);
    const pill = el('span', 'placeholder-pill reference-pill', target ? `${lib.displayTitle(target)} (${abbreviation})` : abbreviation);
    pill.dir = 'auto';
    if (!target) {
      pill.classList.add('reference-missing');
      pill.title = t('referenceNotFound');
    }
    els.referenceList.append(pill);
  }
  const problems = lib.placeholders.resolveReferences(own, all).problems;
  els.referenceProblems.hidden = !problems.length;
  els.referenceProblems.replaceChildren();
  for (const { kind, abbreviation, token } of problems) {
    const text =
      kind === 'missing'
        ? t('referenceMissing', [abbreviation, token])
        : kind === 'loop'
          ? t('referenceLoop', [token])
          : t('referenceLimit');
    const line = el('p', 'field-error', text);
    line.dir = 'auto';
    els.referenceProblems.append(line);
  }
}

// The character count, and the placeholders the text contains, which are replaced on insert.
function updateCount() {
  const text = textFields().content;
  els.count.textContent = lib.characterCount(text);
  renderReferences();
  renderUnrecognized(lib.placeholders.unrecognized(text));
  const found = lib.placeholders.listPlaceholders(text);
  els.placeholderList.hidden = !found.length;
  els.placeholderList.replaceChildren();
  if (!found.length) return;
  els.placeholderList.append(el('span', 'muted', t('placeholders')));
  const now = new Date();
  for (const token of found) {
    const pill = el('span', 'placeholder-pill');
    const tokenSpan = el('span', 'placeholder-token', token);
    tokenSpan.dir = 'ltr';
    pill.append(tokenSpan);
    // The manager has no target field, so values use the browser's language.
    const value = lib.placeholders.currentValue(token, { now });
    if (value) {
      const valueSpan = el('span', 'placeholder-value', value);
      valueSpan.dir = 'auto';
      pill.append(valueSpan);
    }
    els.placeholderList.append(pill);
  }
}

// Shows `snippet` in the editor, or an empty new snippet when it is null. A new snippet starts
// with `initialContent` and `initialFolder`, which count as saved, so leaving the editor before
// typing raises no notice.
function loadEditor(snippet, initialContent = '', initialFolder = '') {
  els.editorEmpty.hidden = true;
  els.editor.hidden = false;
  els.editorHeading.textContent = snippet ? t('editSnippet') : t('newSnippet');
  els.title.value = snippet ? snippet.title || '' : '';
  els.content.value = snippet ? snippet.content : initialContent;
  const html = snippet && snippet.html ? snippet.html : '';
  showFormatted(Boolean(html), html);
  els.abbreviation.value = snippet ? snippet.abbreviation || '' : '';
  els.folder.value = snippet ? snippet.folder || '' : initialFolder;
  // A formatted snippet's text is compared as the editor reads it back, so opening one leaves
  // nothing unsaved.
  state.snapshot = snippet
    ? { ...snippetFields(snippet), ...(html ? textFields() : {}) }
    : { title: '', content: '', html: '', abbreviation: '', folder: initialFolder };
  els.duplicate.hidden = !snippet;
  els.delete.hidden = !snippet;
  showFieldError(els.title, els.titleError, '');
  showFieldError(els.abbreviation, els.abbreviationError, '');
  showFieldError(els.folder, els.folderError, '');
  showContentError('');
  els.editorStatus.textContent = '';
  hideNotice();
  updateCount();
}

function closeEditor() {
  state.selectedId = null;
  state.creating = false;
  state.snapshot = null;
  els.editor.hidden = true;
  els.editorEmpty.hidden = false;
  hideNotice();
}

function showNotice(text, primary, secondary) {
  els.editorNoticeText.textContent = text;
  for (const [button, action] of [
    [els.noticePrimary, primary],
    [els.noticeSecondary, secondary],
  ]) {
    button.hidden = !action;
    if (!action) continue;
    button.textContent = action.label;
    button.onclick = () => {
      hideNotice();
      action.run();
    };
  }
  els.editorNotice.hidden = false;
}

function hideNotice() {
  els.editorNotice.hidden = true;
}

// Runs `next` at once, or after the user saves or discards the editor's unsaved changes.
function whenSaved(next) {
  if (!isDirty()) {
    next();
    return;
  }
  showNotice(
    t('unsavedChanges'),
    {
      label: t('save'),
      run: async () => {
        if (await save()) next();
      },
    },
    {
      label: t('discard'),
      run: () => {
        state.snapshot = fields();
        next();
      },
    }
  );
}

function requestSelect(id) {
  if (id === state.selectedId && !state.creating) return;
  whenSaved(() => select(id));
}

// Brings the editor into the window, which matters when it sits under the list in a narrow window.
function showEditor() {
  els.editor.scrollIntoView({ block: 'nearest' });
}

function select(id) {
  const snippet = state.snippets.find((s) => s.id === id);
  if (!snippet) return;
  state.selectedId = id;
  state.creating = false;
  loadEditor(snippet);
  renderList();
  showEditor();
}

function startNew(initialContent = '') {
  whenSaved(() => {
    state.selectedId = null;
    state.creating = true;
    loadEditor(null, initialContent, state.folder || '');
    renderList();
    showEditor();
    els.content.focus();
  });
}

// Shows a failure in the message area at the top of the page, which is visible in every view and
// stays at the top of the window while the page is scrolled. Passing an empty message clears it.
function reportError(message) {
  els.pageError.textContent = message;
  els.pageError.hidden = !message;
}

// Runs one storage change, one at a time. Returns its result, or null when it failed, after
// showing the error at the top of the page.
async function run(work, { fromEditor = false } = {}) {
  if (state.busy) return null;
  state.busy = true;
  reportError('');
  try {
    return await work();
  } catch (error) {
    const message = t('saveChangeFailed', [error.message]);
    // A failure of the editor's own Save, Duplicate, or Delete shows next to Save, where the
    // user was looking. Every other failure shows in the message area at the top. Each failure
    // goes to one place only, so a screen reader announces it once.
    if (fromEditor && !els.editor.hidden) {
      els.editorStatus.textContent = message;
    } else {
      reportError(message);
    }
    return null;
  } finally {
    state.busy = false;
  }
}

// Shows the error under a field, or hides it when the message is empty. The field names the error
// as its description, and a hidden element named that way still describes it, so hiding the error
// also clears its text. The field is marked invalid while the error shows.
function showFieldError(field, error, message) {
  error.textContent = message;
  error.hidden = !message;
  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
}

// Shows the error line under the text, or hides it when the message is empty. The line describes
// the Format JSON button only while it holds an error of that button, which showJsonError sets, and
// the text box only while it holds the empty-text error of Save, which validate sets. Any other
// message, or none, removes both descriptions.
function showContentError(message) {
  els.contentError.textContent = message;
  els.contentError.hidden = !message;
  els.formatJson.removeAttribute('aria-describedby');
  for (const box of [els.content, els.richContent]) {
    box.removeAttribute('aria-describedby');
    box.removeAttribute('aria-invalid');
  }
}

// The error for a field longer than `max` characters, in the plural form that `max` takes.
function tooLong(max) {
  return i18n.plural('validationTooLong', max, [i18n.number(max)]);
}

// Form rules, the same as in the panel: the text must not be blank, the name must not be longer
// than 128 characters, the abbreviation must pass lib.abbreviationProblem(), and the folder must
// not be longer than 64. Returns whether the form passes them all.
function validate() {
  const empty = textFields().content.trim() === '';
  showContentError(empty ? t('validationEmpty') : '');
  if (empty) {
    for (const box of [els.content, els.richContent]) {
      box.setAttribute('aria-describedby', 'contentError');
      box.setAttribute('aria-invalid', 'true');
    }
  }
  const titleProblem = lib.titleLength(els.title.value) > lib.TITLE_MAX_LENGTH ? tooLong(lib.TITLE_MAX_LENGTH) : '';
  showFieldError(els.title, els.titleError, titleProblem);
  const folderProblem = lib.folderLength(els.folder.value) > lib.FOLDER_MAX_LENGTH ? tooLong(lib.FOLDER_MAX_LENGTH) : '';
  showFieldError(els.folder, els.folderError, folderProblem);
  const ownId = state.creating ? null : state.selectedId;
  const problem = lib.abbreviationProblem(els.abbreviation.value.trim(), state.snippets, ownId) || '';
  showFieldError(els.abbreviation, els.abbreviationError, problem);
  return !empty && !titleProblem && !folderProblem && !problem;
}

// The status line after a save: it also says when other snippets' references were rewritten for a
// new abbreviation, or are left as written because the abbreviation was cleared or can no longer
// be referenced.
function savedSentence(existing, result, cleared) {
  const n = result.referencesRenamed || 0;
  if (n > 0) {
    return i18n.plural('savedRenamed', n, [countText(n), existing.abbreviation, result.snippet.abbreviation]);
  }
  if (cleared > 0) {
    return i18n.plural('savedCleared', cleared, [existing.abbreviation, countText(cleared), `{snippet:${existing.abbreviation}}`]);
  }
  return t('saved');
}

// Saves the editor. Returns true when the snippet was saved.
async function save() {
  if (els.editor.hidden || !validate()) return false;
  const values = fields();
  const existing = state.snippets.find((s) => s.id === state.selectedId);
  // Counted before the save, while the old abbreviation is still in the references. A rename to an
  // abbreviation that no reference can name leaves them as written, as clearing it does.
  const cleared =
    existing && existing.abbreviation && !(values.abbreviation && lib.isReferenceable(values.abbreviation))
      ? lib.countUsers(state.snippets, existing.abbreviation, existing.id)
      : 0;
  const result = await run(
    () => (state.creating || !existing ? lib.createSnippet(values) : lib.updateSnippet(existing.id, values)),
    { fromEditor: true }
  );
  if (!result) return false;
  state.snippets = result.snippets;
  state.selectedId = result.snippet.id;
  state.creating = false;
  // The folder is shown as stored, which may spell it with other capitals than the user typed.
  els.folder.value = result.snippet.folder || '';
  state.snapshot = { ...values, folder: result.snippet.folder || '' };
  // The saved colors show in the editor. A snippet with no formatting is left as typed.
  if (els.formatted.checked && values.html && richText.clean(els.richContent).html !== values.html) showFormatted(true, values.html);
  els.editorHeading.textContent = t('editSnippet');
  els.duplicate.hidden = false;
  els.delete.hidden = false;
  els.editorStatus.textContent = savedSentence(existing, result, cleared);
  renderCounts();
  renderFolders();
  renderList();
  return true;
}

els.editor.addEventListener('submit', (event) => {
  event.preventDefault();
  save();
});
els.content.addEventListener('input', () => {
  showContentError('');
  els.editorStatus.textContent = '';
  updateCount();
});
els.title.addEventListener('input', () => {
  showFieldError(els.title, els.titleError, '');
  els.editorStatus.textContent = '';
  renderReferences();
});
els.abbreviation.addEventListener('input', () => {
  showFieldError(els.abbreviation, els.abbreviationError, '');
  els.editorStatus.textContent = '';
  renderReferences();
});
els.folder.addEventListener('input', () => {
  showFieldError(els.folder, els.folderError, '');
  els.editorStatus.textContent = '';
});

// Formatted text. The "Formatted text" box swaps the text box for a rich editor with a toolbar.
// Whatever the editor holds is read through lib/richtext.js, so what is counted, compared with the
// saved snippet, and saved is always the cleaned HTML and its plain text.

// Shows the rich editor holding `html`, or the text box.
function showFormatted(on, html = '') {
  if (on) {
    els.richContent.replaceChildren(richText.toFragment(html, document, { titles: true }));
    labelBlocks();
  }
  els.formatted.checked = on;
  els.content.hidden = on;
  for (const node of [els.richContent, els.toolbar, els.formatHint]) node.hidden = !on;
  closeLinkBar(false);
}

// Turning the box on brings the text along with its lines. Turning it off asks nothing: the text
// box gets the plain text, with bullets and link addresses, and saving then drops the formatting.
els.formatted.addEventListener('change', () => {
  if (els.formatted.checked) {
    showFormatted(true, richText.fromText(els.content.value));
    els.richContent.focus();
  } else {
    els.content.value = richText.clean(els.richContent).text;
    showFormatted(false);
    els.content.focus();
  }
  els.editorStatus.textContent = '';
  updateCount();
});

// Code blocks and their language. The editor keeps a block's language in data-language on its pre
// element, and shows it above the block from data-label. The cleaner reads data-language, so a
// block pasted with a language class is labelled too.
const LANGUAGE_LABELS = {
  json: 'JSON',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  shell: 'Shell',
};

function blockLanguage(pre) {
  const code = pre.querySelector('code');
  const found = richText.languageOf(pre) || (code ? richText.languageOf(code) : '');
  return richText.LANGUAGES.includes(found) ? found : '';
}

function labelBlocks() {
  for (const pre of els.richContent.querySelectorAll('pre')) {
    const language = blockLanguage(pre);
    if (language) pre.setAttribute('data-language', language);
    else pre.removeAttribute('data-language');
    pre.setAttribute('data-label', LANGUAGE_LABELS[language] || t('languagePlain'));
  }
}

els.codeLanguage.addEventListener('change', () => {
  restoreEditorRange();
  const pre = enclosing('PRE');
  if (!pre) return;
  const language = els.codeLanguage.value;
  for (const code of pre.querySelectorAll('code')) code.removeAttribute('class');
  if (language) pre.setAttribute('data-language', language);
  else pre.removeAttribute('data-language');
  labelBlocks();
  showContentError('');
  els.editorStatus.textContent = '';
  updateCount();
});

let richTimer = null;
els.richContent.addEventListener('input', () => {
  labelBlocks();
  showContentError('');
  els.editorStatus.textContent = '';
  refreshTools();
  clearTimeout(richTimer);
  richTimer = setTimeout(updateCount, RICH_UPDATE_MS);
});

// The editor's selection, kept while the focus is in the toolbar or the link bar.
let editorRange = null;

// Remembers the selection when it is in the editor now, and returns whether it is.
function captureEditorRange() {
  const selection = getSelection();
  if (els.richContent.hidden || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!els.richContent.contains(range.commonAncestorContainer)) return false;
  editorRange = range.cloneRange();
  return true;
}

document.addEventListener('selectionchange', () => {
  if (captureEditorRange()) refreshTools();
});

// Puts the focus back in the editor with its selection. A selection that is in the editor already
// is newer than the kept one, which typing has left behind, so it stays.
function restoreEditorRange() {
  if (document.activeElement === els.richContent && captureEditorRange()) return;
  els.richContent.focus({ preventScroll: true });
  if (editorRange && els.richContent.contains(editorRange.commonAncestorContainer)) {
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(editorRange);
  }
}

function selectContents(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// The element named `tag` (upper case) that holds the editor's selection, or null.
function enclosing(tag) {
  for (let node = editorRange && editorRange.commonAncestorContainer; node && node !== els.richContent; node = node.parentNode) {
    if (node.nodeName === tag) return node;
  }
  return null;
}

function unwrap(element) {
  element.replaceWith(...element.childNodes);
}

// The number of characters of editor text before a point.
function textOffset(node, offset) {
  const range = document.createRange();
  range.setStart(els.richContent, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

// The point `offset` characters into the editor text. Where it falls between two text nodes, it
// goes to the end of the first, or with `atStart` to the start of the second.
function pointAt(offset, atStart) {
  const walker = document.createTreeWalker(els.richContent, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (atStart ? offset < node.data.length : offset <= node.data.length) return [node, offset];
    offset -= node.data.length;
    last = node;
  }
  return last ? [last, last.data.length] : null;
}

// Runs a command that changes the lines but not the text, and puts the selection back at the same
// place in the text. Chromium's list and block commands leave the caret at the start of the line,
// where the next typed character would go.
function keepingSelection(command) {
  const selection = getSelection();
  const range = selection.rangeCount ? selection.getRangeAt(0) : null;
  const ends = range && [
    [textOffset(range.startContainer, range.startOffset), range.startOffset === 0],
    [textOffset(range.endContainer, range.endOffset), range.endOffset === 0],
  ];
  command();
  const start = ends && pointAt(...ends[0]);
  const end = ends && pointAt(...ends[1]);
  if (!start || !end) return;
  const restored = document.createRange();
  restored.setStart(...start);
  restored.setEnd(...end);
  selection.removeAllRanges();
  selection.addRange(restored);
}

const COMMANDS = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  bulleted: 'insertUnorderedList',
  numbered: 'insertOrderedList',
};

// The pressed state of the toolbar buttons follows the selection.
function refreshTools() {
  const state = (command) => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };
  const pre = enclosing('PRE');
  const inPre = Boolean(pre);
  els.codeLanguage.disabled = !inPre;
  els.codeLanguage.value = pre ? blockLanguage(pre) : '';
  const pressed = { code: !inPre && Boolean(enclosing('CODE')), codeBlock: inPre };
  for (const [tool, command] of Object.entries(COMMANDS)) pressed[tool] = state(command);
  for (const button of els.toolbar.querySelectorAll('[aria-pressed]')) {
    button.setAttribute('aria-pressed', String(Boolean(pressed[button.dataset.tool])));
  }
}

// Code marks the selected text, or removes the mark when the selection is in code. Inside a code
// block it does nothing.
function toggleCode() {
  if (enclosing('PRE')) return;
  const code = enclosing('CODE');
  if (code) {
    unwrap(code);
    updateCount();
    return;
  }
  const selection = getSelection();
  if (selection.isCollapsed) return;
  const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const lines = selection.toString().split(/\r\n?|\n/);
  document.execCommand('insertHTML', false, lines.map((line) => (line ? `<code>${escape(line)}</code>` : '')).join('<br>'));
}

// Code block turns the lines of the selection into a code block, or the whole code block back into
// lines. The browser's block command would keep the code element of a stored code block inside the
// lines it makes, where it would read as inline code, so that element is unwrapped first.
function toggleCodeBlock() {
  const pre = enclosing('PRE');
  if (!pre) {
    keepingSelection(() => document.execCommand('formatBlock', false, 'pre'));
    return;
  }
  for (const code of pre.querySelectorAll('code')) unwrap(code);
  keepingSelection(() => {
    selectContents(pre);
    document.execCommand('formatBlock', false, 'div');
  });
}

function runTool(tool) {
  if (tool === 'link') {
    openLinkBar();
    return;
  }
  restoreEditorRange();
  if (tool === 'code') toggleCode();
  else if (tool === 'codeBlock') toggleCodeBlock();
  else if (tool === 'clear') {
    // Clear formatting removes bold, italic, underline, code, and links, and keeps lists and code
    // blocks.
    document.execCommand('removeFormat');
    document.execCommand('unlink');
  } else if (tool === 'bulleted' || tool === 'numbered') {
    keepingSelection(() => document.execCommand(COMMANDS[tool]));
  } else document.execCommand(COMMANDS[tool]);
  refreshTools();
}

// The toolbar is one Tab stop. The arrow keys move between its buttons, and Home and End go to
// the first and last.
function toolButtons() {
  return [...els.toolbar.querySelectorAll('.tool')];
}

function setToolStop(stop) {
  for (const button of toolButtons()) button.tabIndex = button === stop ? 0 : -1;
}

// On a Mac the shortcuts use the Command key, so the tooltips and the notes in the settings name
// it, as the catalog writes it, in place of Ctrl. The notes name Ctrl only in shortcuts, and
// npm run test:locales makes a catalog write Ctrl the same way there as in keyCtrl.
if (IS_MAC) {
  for (const button of toolButtons()) {
    for (const name of ['aria-label', 'title']) button.setAttribute(name, button.getAttribute(name).replace(`${t('keyCtrl')}+`, `${t('keyCmd')}+`));
  }
  for (const key of document.querySelectorAll('[data-i18n-rich="usageNote"] kbd, [data-i18n-rich="abbreviationsNote"] kbd')) {
    if (key.textContent === t('keyCtrl')) key.textContent = t('keyCmd');
  }
}
setToolStop(toolButtons()[0]);

// A click keeps the focus and the selection in the editor.
els.toolbar.addEventListener('mousedown', (event) => {
  if (event.target.closest('.tool')) event.preventDefault();
});
els.toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('.tool');
  if (!button) return;
  setToolStop(button);
  runTool(button.dataset.tool);
});
els.toolbar.addEventListener('keydown', (event) => {
  const buttons = toolButtons();
  const at = buttons.indexOf(document.activeElement);
  if (at === -1) return;
  const rtl = getComputedStyle(els.toolbar).direction === 'rtl';
  let to = -1;
  if (event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) to = (at + 1) % buttons.length;
  else if (event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) to = (at - 1 + buttons.length) % buttons.length;
  else if (event.key === 'Home') to = 0;
  else if (event.key === 'End') to = buttons.length - 1;
  else return;
  event.preventDefault();
  setToolStop(buttons[to]);
  buttons[to].focus();
});

// Format JSON checks the text and indents it with 2 spaces. In the rich editor it works on the code
// block that holds the caret. When the text is not valid JSON, nothing changes and the message says
// where the first error is.

function showJsonError(message) {
  showContentError(message);
  els.formatJson.setAttribute('aria-describedby', 'contentError');
  els.editorStatus.textContent = '';
}

function formatJson() {
  showContentError('');
  if (!els.formatted.checked) {
    const result = lib.jsonFormat.format(els.content.value);
    if (!result.ok) {
      showJsonError(result.message);
      return;
    }
    els.content.value = result.text;
    els.content.dispatchEvent(new Event('input'));
    els.editorStatus.textContent = t('jsonFormatted');
    return;
  }
  captureEditorRange();
  const pre = enclosing('PRE');
  if (!pre) {
    showJsonError(t('jsonNoCodeBlock'));
    return;
  }
  const result = lib.jsonFormat.format(richText.toText(pre.outerHTML));
  if (!result.ok) {
    showJsonError(result.message);
    return;
  }
  const block = richText.toFragment(richText.codeBlock(result.text, pre.dataset.language || ''), document).firstChild;
  pre.replaceWith(block);
  selectContents(block);
  getSelection().collapseToStart();
  captureEditorRange();
  els.richContent.dispatchEvent(new Event('input'));
  els.editorStatus.textContent = t('jsonFormatted');
}

els.formatJson.addEventListener('click', formatJson);

// The link bar.

const LINK_ERROR = t('linkInvalid');

// The address for what the user typed: an address with a scheme as typed, an email address as a
// mailto: link, and a host name such as example.com as an https address. Null when the result is
// not an address the cleaner keeps.
function linkAddress(typed) {
  const text = typed.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return richText.normalizeUrl(text);
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(text)) return richText.normalizeUrl(`mailto:${text}`);
  return /^[^\s/]+\.[^\s/]+/.test(text) ? richText.normalizeUrl(`https://${text}`) : null;
}

function showLinkError(message) {
  showFieldError(els.linkUrl, els.linkError, message);
}

function openLinkBar() {
  if (els.richContent.hidden) return;
  captureEditorRange();
  const link = enclosing('A');
  els.linkUrl.value = link ? link.getAttribute('href') || '' : '';
  els.linkRemove.hidden = !link;
  showLinkError('');
  els.linkBar.hidden = false;
  els.linkUrl.focus();
  els.linkUrl.select();
}

function closeLinkBar(returnFocus) {
  els.linkBar.hidden = true;
  showLinkError('');
  if (returnFocus) restoreEditorRange();
}

// With text selected, the link goes on that text. Without, it goes on the link at the caret, or
// the address itself goes in as the link's text.
function applyLink() {
  const url = linkAddress(els.linkUrl.value);
  if (!url) {
    showLinkError(LINK_ERROR);
    return;
  }
  restoreEditorRange();
  const link = enclosing('A');
  if (link && getSelection().isCollapsed) selectContents(link);
  if (getSelection().isCollapsed) {
    const escaped = url.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    document.execCommand('insertHTML', false, `<a href="${escaped}">${escaped}</a>`);
  } else {
    document.execCommand('createLink', false, url);
  }
  closeLinkBar(false);
}

function removeLink() {
  restoreEditorRange();
  const link = enclosing('A');
  if (link && getSelection().isCollapsed) selectContents(link);
  document.execCommand('unlink');
  closeLinkBar(false);
}

els.linkApply.addEventListener('click', applyLink);
els.linkRemove.addEventListener('click', removeLink);
els.linkCancel.addEventListener('click', () => closeLinkBar(true));
// Enter applies the link instead of saving the form, and Escape goes back to the editor.
els.linkUrl.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    applyLink();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeLinkBar(true);
  }
});
els.linkUrl.addEventListener('input', () => {
  showLinkError('');
});

// A paste or a drop from elsewhere goes in through the cleaner, so the editor never holds an
// image, a script, or any other content a snippet cannot keep.
function insertTransfer(data) {
  const html = data.getData('text/html');
  if (html) {
    const clean = richText.fragment(html, { pasted: true });
    if (clean) document.execCommand('insertHTML', false, clean);
    return;
  }
  const text = data.getData('text/plain');
  if (text) document.execCommand('insertText', false, text);
}

els.richContent.addEventListener('paste', (event) => {
  if (!event.clipboardData) return;
  event.preventDefault();
  insertTransfer(event.clipboardData);
});

// Text dragged inside the editor holds only what the editor already had, so the browser moves it.
let draggingInEditor = false;
els.richContent.addEventListener('dragstart', () => {
  draggingInEditor = true;
});
els.richContent.addEventListener('dragend', () => {
  draggingInEditor = false;
});
els.richContent.addEventListener('drop', (event) => {
  if (draggingInEditor || !event.dataTransfer) return;
  event.preventDefault();
  const range = document.caretRangeFromPoint(event.clientX, event.clientY);
  if (range) {
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }
  insertTransfer(event.dataTransfer);
});

els.duplicate.addEventListener('click', () =>
  whenSaved(async () => {
    const result = await run(() => lib.duplicateSnippet(state.selectedId), { fromEditor: true });
    if (!result) return;
    state.snippets = result.snippets;
    renderCounts();
    select(result.snippet.id);
  })
);

els.delete.addEventListener('click', async () => {
  const id = state.selectedId;
  if (!id) return;
  const result = await run(() => lib.deleteSnippet(id), { fromEditor: true });
  if (!result) return;
  state.snippets = result.snippets;
  state.deleted = result.deleted;
  state.undoId = result.entry.id;
  closeEditor();
  els.undoBar.hidden = false;
  renderAll();
});

els.undoButton.addEventListener('click', async () => {
  const id = state.undoId;
  if (!id) return;
  const result = await run(() => lib.restoreSnippet(id));
  if (!result) return;
  state.undoId = null;
  els.undoBar.hidden = true;
  state.snippets = result.snippets;
  state.deleted = result.deleted;
  // A folder chosen in the meantime would hide the restored snippet, so show its folder instead.
  const folder = result.snippet.folder || '';
  if (state.folder !== null && state.folder !== folder) state.folder = folder;
  renderAll();
  select(result.snippet.id);
});

els.newSnippet.addEventListener('click', () => {
  if (currentView() !== 'snippets') location.hash = '#snippets';
  startNew();
});

// Enter in the Folder field may be picking a suggestion from the field's list, so it must not
// submit the form. Ctrl+S still saves.
els.folder.addEventListener('keydown', (event) => {
  const modifier = IS_MAC ? event.metaKey : event.ctrlKey;
  if (event.key === 'Enter' && !modifier && !event.isComposing) event.preventDefault();
});

document.addEventListener('keydown', (event) => {
  const modifier = IS_MAC ? event.metaKey : event.ctrlKey;
  const shortcut = lib.keyboard.shortcutKey(event);
  if (modifier && shortcut === 's' && !els.editor.hidden && currentView() === 'snippets') {
    event.preventDefault();
    save();
  } else if (modifier && shortcut === 'k' && els.richContent.contains(document.activeElement)) {
    event.preventDefault();
    openLinkBar();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (isDirty()) event.preventDefault();
});

// Recently deleted.

function renderDeleted() {
  els.deletedEmpty.hidden = state.deleted.length > 0;
  els.deletedList.replaceChildren(...state.deleted.map(deletedRow));
}

function deletedRow(entry) {
  const row = el('li', 'deleted-row');
  row.dataset.id = entry.id;
  const main = el('div', 'row-main');
  main.append(autoDirEl('span', 'row-name', lib.displayTitle(entry)));
  const preview = lib.previewLine(entry);
  if (preview) main.append(autoDirEl('span', 'row-preview', preview));
  const when = new Date(entry.deletedAt);
  main.append(el('span', 'row-preview', t('deletedOn', [when.toLocaleString()])));

  const restore = el('button', 'secondary', t('restore'));
  restore.type = 'button';
  restore.addEventListener('click', async () => {
    const result = await run(() => lib.restoreSnippet(entry.id));
    if (!result) return;
    state.snippets = result.snippets;
    state.deleted = result.deleted;
    if (state.undoId === entry.id) {
      state.undoId = null;
      els.undoBar.hidden = true;
    }
    renderAll();
  });

  const purge = el('button', 'secondary danger', t('deleteForever'));
  purge.type = 'button';
  let armedUntil = 0;
  purge.addEventListener('click', async () => {
    if (Date.now() > armedUntil) {
      armedUntil = Date.now() + PURGE_CONFIRM_MS;
      purge.textContent = t('deleteForeverConfirm');
      setTimeout(() => {
        if (purge.isConnected) purge.textContent = t('deleteForever');
      }, PURGE_CONFIRM_MS);
      return;
    }
    const deleted = await run(() => lib.purgeDeleted(entry.id));
    if (!deleted) return;
    state.deleted = deleted;
    if (state.undoId === entry.id) {
      state.undoId = null;
      els.undoBar.hidden = true;
    }
    renderAll();
  });

  row.append(main, restore, purge);
  return row;
}

// Settings and backup.

// A setting that could not be saved goes back to its stored value, so the page never shows one
// that is not in effect.
async function saveSetting(patch, revert) {
  reportError('');
  try {
    await lib.writeSettings(patch);
    return true;
  } catch (error) {
    revert(await lib.readSettings().catch(() => lib.DEFAULT_SETTINGS));
    els.status.textContent = '';
    reportError(t('saveSettingFailed', [error.message]));
    return false;
  }
}

els.hotkey.addEventListener('change', async () => {
  const saved = await saveSetting({ hotkey: els.hotkey.value }, (settings) => {
    els.hotkey.value = settings.hotkey;
  });
  if (saved) els.status.textContent = t('settingSaved');
});

els.abbreviations.addEventListener('change', async () => {
  reportError('');
  try {
    await lib.writeAbbreviationMode(els.abbreviations.value);
  } catch (error) {
    els.abbreviations.value = lib.abbreviationMode(await lib.readSettings().catch(() => lib.DEFAULT_SETTINGS));
    els.status.textContent = '';
    reportError(t('saveSettingFailed', [error.message]));
  }
});

// Sites where the double tap and abbreviations are off.

function renderOffSites(entries) {
  els.offSitesEmpty.hidden = entries.length > 0;
  els.offSiteList.replaceChildren(...entries.map(offSiteRow));
}

function offSiteRow(entry) {
  const row = el('li', 'site-row');
  const name = el('span', 'site-name', entry);
  name.dir = 'ltr';
  const turnOn = el('button', 'secondary', t('turnOn'));
  turnOn.type = 'button';
  turnOn.setAttribute('aria-label', t('turnOnSite', [entry]));
  turnOn.addEventListener('click', async () => {
    // The row after this one moves up when the list is drawn again, so its place decides where
    // the focus goes.
    const next = row.nextElementSibling || row.previousElementSibling;
    const nextEntry = next && next.querySelector('.site-name').textContent;
    const entries = await run(() => lib.removeOffSite(entry));
    if (!entries) return;
    renderOffSites(entries);
    const button = nextEntry && [...els.offSiteList.querySelectorAll('.site-row')]
      .find((other) => other.querySelector('.site-name').textContent === nextEntry);
    (button ? button.querySelector('button') : els.offSiteInput).focus();
  });
  row.append(name, turnOn);
  return row;
}

els.offSiteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  reportError('');
  try {
    const { offSites } = await lib.addOffSite(els.offSiteInput.value);
    showFieldError(els.offSiteInput, els.offSiteError, '');
    els.offSiteInput.value = '';
    renderOffSites(offSites);
  } catch (error) {
    if (error.invalid) {
      showFieldError(els.offSiteInput, els.offSiteError, error.message);
    } else {
      reportError(t('saveChangeFailed', [error.message]));
    }
  }
  els.offSiteInput.focus();
});

els.offSiteInput.addEventListener('input', () => {
  showFieldError(els.offSiteInput, els.offSiteError, '');
});

// The key comes from the browser, which leaves it unset when another extension already uses
// Ctrl+Shift+Space. It is read again whenever the page gets the focus back, for example after
// the user changed it in the shortcuts page.
async function renderShortcut() {
  let shortcut = '';
  try {
    const command = (await chrome.commands.getAll()).find((c) => c.name === 'open-panel');
    shortcut = (command && command.shortcut) || '';
  } catch {
    // Leave it as not set.
  }
  els.shortcut.textContent = shortcut || t('shortcutNotSet');
}

els.shortcutButton.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
window.addEventListener('focus', renderShortcut);

// The file is built in the page and saved through a download link, which needs no permission.
els.exportButton.addEventListener('click', async () => {
  let snippets;
  try {
    snippets = await lib.readSnippets();
  } catch (error) {
    reportError(t('exportFailed', [error.message]));
    return;
  }
  reportError('');
  const name = lib.exportFileName();
  const url = URL.createObjectURL(new Blob([lib.buildExport(snippets)], { type: 'application/json' }));
  const link = el('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  els.importResult.className = 'status';
  els.importResult.textContent = i18n.plural('exported', snippets.length, [countText(snippets.length), name]);
});

els.importButton.addEventListener('click', () => els.importFile.click());

els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files[0];
  els.importFile.value = '';
  if (!file) return;
  try {
    const result = await lib.importSnippets(await file.text());
    els.importResult.className = 'status status-ok';
    els.importResult.textContent = lib.importReport(result);
  } catch (error) {
    els.importResult.className = 'status status-error';
    els.importResult.textContent = error.message;
  }
});

// Changes from other pages.

async function onStorageChanged() {
  const { snippets, deleted } = await lib.readState();
  state.snippets = snippets;
  state.deleted = deleted;
  renderAll();
  if (state.creating || !state.selectedId || els.editor.hidden) return;

  const stored = snippets.find((s) => s.id === state.selectedId);
  if (!stored) {
    if (isDirty()) {
      // Keep the edits as a new snippet, so saving brings the text back instead of failing.
      state.selectedId = null;
      state.creating = true;
      els.editorHeading.textContent = t('newSnippet');
      els.duplicate.hidden = true;
      els.delete.hidden = true;
      showNotice(t('deletedElsewhere'));
    } else {
      closeEditor();
      renderList();
    }
    return;
  }
  // The page's own save also lands here; then the stored text equals the fields.
  if (sameFields(fields(), stored) || sameFields(state.snapshot, stored)) {
    state.snapshot = snippetFields(stored);
    return;
  }
  if (!isDirty()) {
    loadEditor(stored);
    return;
  }
  showNotice(
    t('changedElsewhere'),
    { label: t('loadOther'), run: () => loadEditor(stored) },
    {
      label: t('keepMine'),
      run: () => {
        state.snapshot = snippetFields(stored);
      },
    }
  );
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[lib.STORAGE_KEY] || changes[lib.DELETED_KEY]) onStorageChanged();
  if (changes[lib.SETTINGS_KEY]) {
    const settings = { ...lib.DEFAULT_SETTINGS, ...(changes[lib.SETTINGS_KEY].newValue || {}) };
    els.hotkey.value = settings.hotkey;
    els.abbreviations.value = lib.abbreviationMode(settings);
    renderOffSites(settings.offSites);
  }
});

// Start.

async function start() {
  let loaded;
  try {
    loaded = await Promise.all([lib.readState(), lib.readSettings()]);
  } catch (error) {
    reportError(t('loadFailed', [error.message]));
    return;
  }
  const [{ snippets, deleted }, settings] = loaded;
  state.snippets = snippets;
  state.deleted = deleted;
  els.hotkey.value = settings.hotkey;
  els.abbreviations.value = lib.abbreviationMode(settings);
  renderOffSites(settings.offSites);
  renderAll();
  renderShortcut();
  route();
}

window.addEventListener('hashchange', route);
start();
