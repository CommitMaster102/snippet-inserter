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
const VIEWS = ['snippets', 'deleted', 'settings'];
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
  content: $('content'),
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
// storage, and then shows as #snippets.
async function route() {
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
  els.snippetCount.textContent = String(state.snippets.length);
  els.deletedCount.textContent = state.deleted.length ? String(state.deleted.length) : '';
  const n = state.snippets.length;
  els.exportNote.textContent = `Saves ${n === 1 ? 'the 1 snippet' : `all ${n} snippets`} to ${lib.exportFileName()}.`;
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

  const choices = [['All', null, state.snippets.length], ...names.map((name) => [name, name, counts.get(name)])];
  if (loose) choices.push(['No folder', '', loose]);
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
    chip.append(el('span', 'folder-name', label), ' ', el('span', 'folder-count', count.toLocaleString()));
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
  els.renameError.hidden = true;
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
  els.renameError.hidden = true;
  const { target, joins } = renameTarget(els.renameInput.value);
  els.renameHint.hidden = !joins;
  els.renameHint.textContent = `${target} already exists. Renaming moves these snippets into it.`;
});
els.renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const from = state.folder;
  const typed = els.renameInput.value;
  const problem = !lib.cleanFolder(typed)
    ? 'Enter a folder name.'
    : lib.folderLength(typed) > lib.FOLDER_MAX_LENGTH
      ? `The input must not be longer than ${lib.FOLDER_MAX_LENGTH} characters.`
      : '';
  els.renameError.hidden = !problem;
  els.renameError.textContent = problem;
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
  els.removeFolder.textContent = 'Remove folder';
}

els.removeFolder.addEventListener('click', async () => {
  const from = state.folder;
  if (!from) return;
  if (removeArmed.folder !== from || Date.now() > removeArmed.until) {
    removeArmed = { folder: from, until: Date.now() + PURGE_CONFIRM_MS };
    els.removeFolder.textContent = 'Click again to remove the folder';
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
    ? 'Drag to reorder, or onto a folder to move it'
    : 'Drag to reorder';

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
  if (snippet.abbreviation) row.append(el('span', 'pill', snippet.abbreviation));

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
  els.moveStatus.textContent = `${lib.displayTitle(moved)} moved to position ${shown.indexOf(moved) + 1} of ${shown.length}.`;
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

function fields() {
  return {
    title: els.title.value,
    content: els.content.value,
    abbreviation: els.abbreviation.value.trim(),
    folder: lib.cleanFolder(els.folder.value),
  };
}

// The fields of `snippet` in the shape fields() returns.
function snippetFields(snippet) {
  return {
    title: snippet.title || '',
    content: snippet.content,
    abbreviation: snippet.abbreviation || '',
    folder: snippet.folder || '',
  };
}

function sameFields(a, b) {
  return (
    Boolean(a && b) &&
    a.title === (b.title || '') &&
    a.content === b.content &&
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
  els.unrecognizedList.append(el('span', 'muted', 'Not recognized, inserted as written'));
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
    content: els.content.value,
    abbreviation: els.abbreviation.value.trim(),
  };
  const all = [...state.snippets.filter((s) => s.id !== own.id), own];
  const found = lib.placeholders.references(own.content);
  els.referenceList.hidden = !found.length;
  els.referenceList.replaceChildren();
  if (found.length) els.referenceList.append(el('span', 'muted', 'Includes'));
  for (const abbreviation of found) {
    const target = all.find((s) => s.abbreviation === abbreviation);
    const pill = el('span', 'placeholder-pill reference-pill', target ? `${lib.displayTitle(target)} (${abbreviation})` : abbreviation);
    pill.dir = 'auto';
    if (!target) {
      pill.classList.add('reference-missing');
      pill.title = 'Not found';
    }
    els.referenceList.append(pill);
  }
  const problems = lib.placeholders.resolveReferences(own, all).problems;
  els.referenceProblems.hidden = !problems.length;
  els.referenceProblems.replaceChildren();
  for (const { kind, abbreviation, token } of problems) {
    const text =
      kind === 'missing'
        ? `No snippet has the abbreviation ${abbreviation}, so ${token} is inserted as written.`
        : kind === 'loop'
          ? `${token} would put a snippet inside itself, so it is inserted as written.`
          : 'One insert includes at most 100 snippets, so the other references are inserted as written.';
    const line = el('p', 'field-error', text);
    line.dir = 'auto';
    els.referenceProblems.append(line);
  }
}

// The character count, and the placeholders the text contains, which are replaced on insert.
function updateCount() {
  els.count.textContent = lib.characterCount(els.content.value);
  renderReferences();
  renderUnrecognized(lib.placeholders.unrecognized(els.content.value));
  const found = lib.placeholders.listPlaceholders(els.content.value);
  els.placeholderList.hidden = !found.length;
  els.placeholderList.replaceChildren();
  if (!found.length) return;
  els.placeholderList.append(el('span', 'muted', 'Placeholders'));
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
  els.editorHeading.textContent = snippet ? 'Edit snippet' : 'New snippet';
  els.title.value = snippet ? snippet.title || '' : '';
  els.content.value = snippet ? snippet.content : initialContent;
  els.abbreviation.value = snippet ? snippet.abbreviation || '' : '';
  els.folder.value = snippet ? snippet.folder || '' : initialFolder;
  state.snapshot = snippet
    ? snippetFields(snippet)
    : { title: '', content: '', abbreviation: '', folder: initialFolder };
  els.duplicate.hidden = !snippet;
  els.delete.hidden = !snippet;
  els.titleError.hidden = true;
  els.abbreviationError.hidden = true;
  els.folderError.hidden = true;
  els.contentError.hidden = true;
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
    'You have unsaved changes.',
    {
      label: 'Save',
      run: async () => {
        if (await save()) next();
      },
    },
    {
      label: 'Discard',
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
    const message = `Could not save the change: ${error.message}`;
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

// Form rules, the same as in the panel: the text must not be blank, the name must not be longer
// than 128 characters, and the folder must not be longer than 64.
function validate() {
  let valid = true;
  els.contentError.hidden = els.content.value.trim() !== '';
  if (!els.contentError.hidden) {
    els.contentError.textContent = 'This field must not be empty.';
    valid = false;
  }
  els.titleError.hidden = lib.titleLength(els.title.value) <= lib.TITLE_MAX_LENGTH;
  if (!els.titleError.hidden) {
    els.titleError.textContent = `The input must not be longer than ${lib.TITLE_MAX_LENGTH} characters.`;
    valid = false;
  }
  els.folderError.hidden = lib.folderLength(els.folder.value) <= lib.FOLDER_MAX_LENGTH;
  if (!els.folderError.hidden) {
    els.folderError.textContent = `The input must not be longer than ${lib.FOLDER_MAX_LENGTH} characters.`;
    valid = false;
  }
  const ownId = state.creating ? null : state.selectedId;
  const problem = lib.abbreviationProblem(els.abbreviation.value.trim(), state.snippets, ownId);
  els.abbreviationError.hidden = !problem;
  if (problem) {
    els.abbreviationError.textContent = problem;
    valid = false;
  }
  return valid;
}

// Saves the editor. Returns true when the snippet was saved.
async function save() {
  if (els.editor.hidden || !validate()) return false;
  const values = fields();
  const existing = state.snippets.find((s) => s.id === state.selectedId);
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
  els.editorHeading.textContent = 'Edit snippet';
  els.duplicate.hidden = false;
  els.delete.hidden = false;
  els.editorStatus.textContent = 'Saved.';
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
  els.contentError.hidden = true;
  els.editorStatus.textContent = '';
  updateCount();
});
els.title.addEventListener('input', () => {
  els.titleError.hidden = true;
  els.editorStatus.textContent = '';
  renderReferences();
});
els.abbreviation.addEventListener('input', () => {
  els.abbreviationError.hidden = true;
  els.editorStatus.textContent = '';
  renderReferences();
});
els.folder.addEventListener('input', () => {
  els.folderError.hidden = true;
  els.editorStatus.textContent = '';
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

document.addEventListener('keydown', (event) => {
  const modifier = navigator.userAgent.includes('Mac OS') ? event.metaKey : event.ctrlKey;
  if (modifier && event.key.toLowerCase() === 's' && !els.editor.hidden && currentView() === 'snippets') {
    event.preventDefault();
    save();
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
  main.append(el('span', 'row-preview', `Deleted ${when.toLocaleString()}`));

  const restore = el('button', 'secondary', 'Restore');
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

  const purge = el('button', 'secondary danger', 'Delete forever');
  purge.type = 'button';
  let armedUntil = 0;
  purge.addEventListener('click', async () => {
    if (Date.now() > armedUntil) {
      armedUntil = Date.now() + PURGE_CONFIRM_MS;
      purge.textContent = 'Click again to delete forever';
      setTimeout(() => {
        if (purge.isConnected) purge.textContent = 'Delete forever';
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
    reportError(`Could not save the setting: ${error.message}`);
    return false;
  }
}

els.hotkey.addEventListener('change', async () => {
  const saved = await saveSetting({ hotkey: els.hotkey.value }, (settings) => {
    els.hotkey.value = settings.hotkey;
  });
  if (saved) els.status.textContent = 'Saved. Open pages pick up the change right away.';
});

els.abbreviations.addEventListener('change', () =>
  saveSetting({ abbreviations: els.abbreviations.checked }, (settings) => {
    els.abbreviations.checked = settings.abbreviations !== false;
  })
);

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
  els.shortcut.textContent = shortcut || 'Not set';
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
    reportError(`Could not export the snippets: ${error.message}`);
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
  els.importResult.textContent = `Exported ${snippets.length === 1 ? '1 snippet' : `${snippets.length} snippets`} to ${name}.`;
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
      els.editorHeading.textContent = 'New snippet';
      els.duplicate.hidden = true;
      els.delete.hidden = true;
      showNotice('This snippet was deleted in another tab. Saving creates it again.');
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
    'This snippet changed in another tab.',
    { label: 'Load the other version', run: () => loadEditor(stored) },
    {
      label: 'Keep mine',
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
    els.abbreviations.checked = settings.abbreviations !== false;
  }
});

// Start.

async function start() {
  let loaded;
  try {
    loaded = await Promise.all([lib.readState(), lib.readSettings()]);
  } catch (error) {
    reportError(`Could not load your snippets: ${error.message}`);
    return;
  }
  const [{ snippets, deleted }, settings] = loaded;
  state.snippets = snippets;
  state.deleted = deleted;
  els.hotkey.value = settings.hotkey;
  els.abbreviations.checked = settings.abbreviations !== false;
  renderAll();
  renderShortcut();
  route();
}

window.addEventListener('hashchange', route);
start();
