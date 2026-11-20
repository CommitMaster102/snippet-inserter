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

const $ = (id) => document.getElementById(id);
const els = {
  newSnippet: $('newSnippet'),
  nav: document.querySelectorAll('.nav a'),
  snippetCount: $('snippetCount'),
  deletedCount: $('deletedCount'),
  search: $('search'),
  snippetList: $('snippetList'),
  listEmpty: $('listEmpty'),
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
  content: $('content'),
  contentError: $('contentError'),
  placeholderList: $('placeholderList'),
  count: $('count'),
  duplicate: $('duplicate'),
  delete: $('delete'),
  save: $('save'),
  editorStatus: $('editorStatus'),
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
  busy: false,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
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
  renderList();
  renderDeleted();
}

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
  const shown = lib.filterSnippets(state.snippets, els.search.value);
  els.snippetList.replaceChildren(...shown.map(snippetRow));
  els.listEmpty.hidden = state.snippets.length > 0;
  if (focusId) {
    const row = els.snippetList.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
    if (row) row.focus();
  }
}

function snippetRow(snippet) {
  const row = el('li', 'row');
  row.dataset.id = snippet.id;
  row.tabIndex = 0;
  row.draggable = !filtering();
  if (snippet.id === state.selectedId) row.setAttribute('aria-selected', 'true');

  const handle = el('span', 'handle');
  handle.innerHTML = HANDLE_ICON;
  handle.title = 'Drag to reorder';

  const main = el('div', 'row-main');
  main.append(el('span', 'row-name', lib.displayTitle(snippet)));
  const preview = lib.previewLine(snippet);
  if (preview) main.append(el('span', 'row-preview', preview));

  row.append(handle, main);
  if (snippet.abbreviation) row.append(el('span', 'pill', snippet.abbreviation));

  row.addEventListener('click', () => requestSelect(snippet.id));
  row.addEventListener('keydown', (event) => onRowKey(event, snippet));
  row.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', snippet.id);
    event.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
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
    const from = state.snippets.findIndex((s) => s.id === snippet.id);
    const to = from + (event.key === 'ArrowDown' ? 1 : -1);
    if (to >= 0 && to < state.snippets.length) move(snippet.id, to);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
  }
}

els.search.addEventListener('input', () => renderList());

// The editor.

function fields() {
  return { title: els.title.value, content: els.content.value };
}

function sameFields(a, b) {
  return Boolean(a && b) && a.title === (b.title || '') && a.content === b.content;
}

function isDirty() {
  return !els.editor.hidden && !sameFields(fields(), state.snapshot);
}

// The character count, and the placeholders the text contains, which are replaced on insert.
function updateCount() {
  els.count.textContent = lib.characterCount(els.content.value);
  const found = lib.placeholders.listPlaceholders(els.content.value);
  els.placeholderList.hidden = !found.length;
  els.placeholderList.replaceChildren();
  if (!found.length) return;
  els.placeholderList.append(el('span', 'muted', 'Placeholders'));
  for (const token of found) els.placeholderList.append(el('span', 'placeholder-pill', token));
}

// Shows `snippet` in the editor, or an empty new snippet when it is null.
function loadEditor(snippet, initialContent = '') {
  els.editorEmpty.hidden = true;
  els.editor.hidden = false;
  els.editorHeading.textContent = snippet ? 'Edit snippet' : 'New snippet';
  els.title.value = snippet ? snippet.title || '' : '';
  els.content.value = snippet ? snippet.content : initialContent;
  state.snapshot = snippet ? { title: els.title.value, content: snippet.content } : { title: '', content: '' };
  els.duplicate.hidden = !snippet;
  els.delete.hidden = !snippet;
  els.titleError.hidden = true;
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

function select(id) {
  const snippet = state.snippets.find((s) => s.id === id);
  if (!snippet) return;
  state.selectedId = id;
  state.creating = false;
  loadEditor(snippet);
  renderList();
}

function startNew(initialContent = '') {
  whenSaved(() => {
    state.selectedId = null;
    state.creating = true;
    loadEditor(null, initialContent);
    renderList();
    els.content.focus();
  });
}

// Runs one storage change, one at a time. Returns its result, or null when it failed, after
// showing the error in the editor.
async function run(work) {
  if (state.busy) return null;
  state.busy = true;
  try {
    return await work();
  } catch (error) {
    els.editorStatus.textContent = `Could not save the change: ${error.message}`;
    return null;
  } finally {
    state.busy = false;
  }
}

// Form rules, the same as in the panel: the text must not be blank, and the name must not be
// longer than 128 characters.
function validate() {
  let valid = true;
  els.contentError.hidden = els.content.value.trim() !== '';
  if (!els.contentError.hidden) {
    els.contentError.textContent = 'This field must not be empty.';
    valid = false;
  }
  els.titleError.hidden = els.title.value.length <= lib.TITLE_MAX_LENGTH;
  if (!els.titleError.hidden) {
    els.titleError.textContent = `The input must not be longer than ${lib.TITLE_MAX_LENGTH} characters.`;
    valid = false;
  }
  return valid;
}

// Saves the editor. Returns true when the snippet was saved.
async function save() {
  if (els.editor.hidden || !validate()) return false;
  const values = fields();
  const existing = state.snippets.find((s) => s.id === state.selectedId);
  const result = await run(() =>
    state.creating || !existing
      ? lib.createSnippet(values)
      : lib.updateSnippet(existing.id, { ...values, abbreviation: existing.abbreviation })
  );
  if (!result) return false;
  state.snippets = result.snippets;
  state.selectedId = result.snippet.id;
  state.creating = false;
  state.snapshot = values;
  els.editorHeading.textContent = 'Edit snippet';
  els.duplicate.hidden = false;
  els.delete.hidden = false;
  els.editorStatus.textContent = 'Saved.';
  renderCounts();
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
});

els.duplicate.addEventListener('click', () =>
  whenSaved(async () => {
    const result = await run(() => lib.duplicateSnippet(state.selectedId));
    if (!result) return;
    state.snippets = result.snippets;
    renderCounts();
    select(result.snippet.id);
  })
);

els.delete.addEventListener('click', async () => {
  const id = state.selectedId;
  if (!id) return;
  const result = await run(() => lib.deleteSnippet(id));
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
  main.append(el('span', 'row-name', lib.displayTitle(entry)));
  const preview = lib.previewLine(entry);
  if (preview) main.append(el('span', 'row-preview', preview));
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

els.hotkey.addEventListener('change', async () => {
  await lib.writeSettings({ hotkey: els.hotkey.value });
  els.status.textContent = 'Saved. Open pages pick up the change right away.';
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
  els.shortcut.textContent = shortcut || 'Not set';
}

els.shortcutButton.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
window.addEventListener('focus', renderShortcut);

// The file is built in the page and saved through a download link, which needs no permission.
els.exportButton.addEventListener('click', async () => {
  const snippets = await lib.readSnippets();
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
    state.snapshot = { title: stored.title || '', content: stored.content };
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
        state.snapshot = { title: stored.title || '', content: stored.content };
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
  }
});

// Start.

async function start() {
  const [{ snippets, deleted }, settings] = await Promise.all([lib.readState(), lib.readSettings()]);
  state.snippets = snippets;
  state.deleted = deleted;
  els.hotkey.value = settings.hotkey;
  renderAll();
  renderShortcut();
  route();
}

window.addEventListener('hashchange', route);
start();
