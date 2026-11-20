/*
 * Snippet storage, shared by the content script, the snippet panel, and the manager page.
 *
 * Snippets live in chrome.storage.local under STORAGE_KEY as an array of records shaped
 * { createdAt, content, title, id }, plus an optional `abbreviation`. The array order is the
 * order in which the panel and the manager list them. A deleted snippet moves to DELETED_KEY,
 * newest first, so it can be restored; that list keeps at most DELETED_MAX entries.
 *
 * Every write first reads the stored list, so two pages that change snippets at about the same
 * time lose at most the change made within one storage round trip. The functions that do not
 * touch storage are also exported for the Node unit tests.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'snippet_manager.snippets';
  const DELETED_KEY = 'snippet_manager.deleted';
  const SETTINGS_KEY = 'settings';
  const DELETED_MAX = 20;
  const TITLE_MAX_LENGTH = 128;
  // Each snippet gets a 12-character random id. ID_ALPHABET is the 64-character URL-safe
  // alphabet of the nanoid library (MIT), so a byte masked to 6 bits picks one character.
  const ID_LENGTH = 12;
  const ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
  const DEFAULT_SETTINGS = { hotkey: 'Control', abbreviations: true };

  function makeId() {
    let id = '';
    let n = ID_LENGTH;
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    while (n--) id += ID_ALPHABET[63 & bytes[n]];
    return id;
  }

  // An id that no record in `taken` uses.
  function freshId(taken) {
    let id = makeId();
    while (taken.has(id)) id = makeId();
    return id;
  }

  // Storage access.

  async function readState() {
    const stored = await chrome.storage.local.get([STORAGE_KEY, DELETED_KEY]);
    return {
      snippets: Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [],
      deleted: Array.isArray(stored[DELETED_KEY]) ? stored[DELETED_KEY] : [],
    };
  }

  async function readSnippets() {
    return (await readState()).snippets;
  }

  async function readDeleted() {
    return (await readState()).deleted;
  }

  async function writeSnippets(list) {
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  }

  async function readSettings() {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
  }

  async function writeSettings(changes) {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    const next = { ...(stored[SETTINGS_KEY] || {}), ...changes };
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return { ...DEFAULT_SETTINGS, ...next };
  }

  // A record as stored. The abbreviation is left out when it is empty, so a snippet without one
  // keeps the record shape that version 1.1.1 wrote.
  function record({ createdAt, content, title, id, abbreviation }) {
    const result = { createdAt, content, title: title || '', id };
    if (abbreviation) result.abbreviation = abbreviation;
    return result;
  }

  async function createSnippet({ content, title, abbreviation }) {
    const list = await readSnippets();
    const created = record({
      createdAt: new Date().toISOString(),
      content,
      title,
      id: freshId(new Set(list.map((s) => s.id))),
      abbreviation,
    });
    const next = [...list, created];
    await writeSnippets(next);
    return { snippet: created, snippets: next };
  }

  async function updateSnippet(id, { content, title, abbreviation }) {
    const list = await readSnippets();
    const index = list.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('not found');
    const updated = record({ ...list[index], content, title, abbreviation });
    list.splice(index, 1, updated);
    await writeSnippets(list);
    return { snippet: updated, snippets: list };
  }

  // Places a copy right after the original. The copy has no abbreviation, because abbreviations
  // must be unique.
  async function duplicateSnippet(id) {
    const list = await readSnippets();
    const index = list.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('not found');
    const original = list[index];
    const copy = record({
      createdAt: new Date().toISOString(),
      content: original.content,
      title: original.title ? `Copy of ${original.title}`.slice(0, TITLE_MAX_LENGTH) : '',
      id: freshId(new Set(list.map((s) => s.id))),
    });
    list.splice(index + 1, 0, copy);
    await writeSnippets(list);
    return { snippet: copy, snippets: list };
  }

  // Moves a snippet to the recently deleted list, newest first, and remembers its position. Both
  // keys are written in one call, so the snippet is always in one of the two lists.
  async function deleteSnippet(id) {
    const { snippets, deleted } = await readState();
    const index = snippets.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('not found');
    const [snippet] = snippets.splice(index, 1);
    const entry = { ...snippet, deletedAt: new Date().toISOString(), index };
    const nextDeleted = [entry, ...deleted.filter((d) => d.id !== id)].slice(0, DELETED_MAX);
    await chrome.storage.local.set({ [STORAGE_KEY]: snippets, [DELETED_KEY]: nextDeleted });
    return { entry, snippets, deleted: nextDeleted };
  }

  // Puts a deleted snippet back at its old position, or at the end when the list is shorter now.
  // It gets a new id if its old one is in use again, and loses its abbreviation if another
  // snippet now uses an overlapping one.
  async function restoreSnippet(id) {
    const { snippets, deleted } = await readState();
    const entry = deleted.find((d) => d.id === id);
    if (!entry) throw new Error('not found');
    const taken = new Set(snippets.map((s) => s.id));
    const restored = record({
      ...entry,
      id: taken.has(entry.id) ? freshId(taken) : entry.id,
      abbreviation:
        entry.abbreviation && !abbreviationProblem(entry.abbreviation, snippets) ? entry.abbreviation : '',
    });
    const index = Math.min(Number.isInteger(entry.index) ? entry.index : snippets.length, snippets.length);
    snippets.splice(index, 0, restored);
    const nextDeleted = deleted.filter((d) => d !== entry);
    await chrome.storage.local.set({ [STORAGE_KEY]: snippets, [DELETED_KEY]: nextDeleted });
    return { snippet: restored, snippets, deleted: nextDeleted };
  }

  async function purgeDeleted(id) {
    const deleted = (await readDeleted()).filter((d) => d.id !== id);
    await chrome.storage.local.set({ [DELETED_KEY]: deleted });
    return deleted;
  }

  // Moves a snippet to `toIndex`, counted in the list without the moved snippet.
  async function moveSnippet(id, toIndex) {
    const list = await readSnippets();
    const index = list.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('not found');
    const [snippet] = list.splice(index, 1);
    list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, snippet);
    await writeSnippets(list);
    return list;
  }

  // Abbreviations. An abbreviation has 2 to 32 characters and no white space, is used by one
  // snippet only, and is not the start of another snippet's abbreviation: with ";a" and ";ab"
  // both stored, typing ";ab" would always expand ";a" first.

  const ABBREVIATION_MIN = 2;
  const ABBREVIATION_MAX = 32;

  // Returns why `abbreviation` cannot be used, or null when it can. `ownId` is the snippet being
  // edited, whose current abbreviation does not count against it.
  function abbreviationProblem(abbreviation, snippets, ownId) {
    if (!abbreviation) return null;
    if (
      abbreviation.length < ABBREVIATION_MIN ||
      abbreviation.length > ABBREVIATION_MAX ||
      /\s/.test(abbreviation)
    ) {
      return `Use ${ABBREVIATION_MIN} to ${ABBREVIATION_MAX} characters without spaces.`;
    }
    for (const other of snippets) {
      if (other.id === ownId || !other.abbreviation) continue;
      if (other.abbreviation === abbreviation) return `Another snippet already uses ${abbreviation}.`;
      if (other.abbreviation.startsWith(abbreviation)) {
        return `Another snippet's abbreviation, ${other.abbreviation}, starts with this one.`;
      }
      if (abbreviation.startsWith(other.abbreviation)) {
        return `This starts with another snippet's abbreviation, ${other.abbreviation}.`;
      }
    }
    return null;
  }

  // Backup files. An export is a JSON object with a format name and a version, so a later
  // version of the extension can recognize an older file and convert it. Import also accepts a
  // bare array of records, such as a copy of the stored value.

  const EXPORT_FORMAT = 'snippet-inserter';
  const EXPORT_VERSION = 1;

  function buildExport(snippets, now = new Date()) {
    const data = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      snippets: snippets.map(record),
    };
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  // snippets-YYYY-MM-DD.json, in the local date.
  function exportFileName(now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `snippets-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
  }

  // Reads a backup file and decides what to add to `existing`. It never changes or removes a
  // stored snippet:
  // - a record whose title and text both match a stored snippet, or an earlier record in the
  //   file, is skipped;
  // - a record whose id is in use gets a new id;
  // - a record whose abbreviation clashes with one in use is added without it;
  // - a record without text is counted as invalid and skipped;
  // - a title longer than TITLE_MAX_LENGTH is cut to that length.
  // A file that is not a backup throws an Error whose message can be shown to the user.
  function parseImport(text, existing) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('This file is not a snippet backup: it is not valid JSON.');
    }
    let records;
    if (Array.isArray(data)) {
      records = data;
    } else if (data && data.format === EXPORT_FORMAT && Array.isArray(data.snippets)) {
      if (typeof data.version === 'number' && data.version > EXPORT_VERSION) {
        throw new Error('This backup was made by a newer version of Snippet Inserter. Update the extension and try again.');
      }
      records = data.snippets;
    } else {
      throw new Error('This file is not a snippet backup.');
    }

    const known = existing.slice();
    const taken = new Set(existing.map((s) => s.id));
    const sameText = (s) => `${s.title || ''}\u0000${s.content}`;
    const seen = new Set(existing.map(sameText));
    const result = { add: [], skipped: 0, invalid: 0, renamed: 0, abbreviationsDropped: 0 };

    for (const raw of records) {
      if (!raw || typeof raw !== 'object' || typeof raw.content !== 'string' || !raw.content.trim()) {
        result.invalid++;
        continue;
      }
      const title = typeof raw.title === 'string' ? raw.title.slice(0, TITLE_MAX_LENGTH) : '';
      const key = sameText({ title, content: raw.content });
      if (seen.has(key)) {
        result.skipped++;
        continue;
      }
      seen.add(key);

      let id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? raw.id : '';
      if (!id || taken.has(id)) {
        if (id) result.renamed++;
        id = freshId(taken);
      }
      taken.add(id);

      let abbreviation = typeof raw.abbreviation === 'string' ? raw.abbreviation : '';
      if (abbreviation && abbreviationProblem(abbreviation, known)) {
        abbreviation = '';
        result.abbreviationsDropped++;
      }
      const createdAt =
        typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
          ? raw.createdAt
          : new Date().toISOString();
      const added = record({ createdAt, content: raw.content, title, id, abbreviation });
      result.add.push(added);
      known.push(added);
    }
    return result;
  }

  // The sentence shown after an import.
  function importReport(result) {
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const parts = [`Imported ${plural(result.add.length, 'snippet', 'snippets')}.`];
    if (result.skipped) {
      parts.push(`Skipped ${plural(result.skipped, 'snippet that was', 'snippets that were')} already here.`);
    }
    if (result.invalid) {
      parts.push(`Skipped ${plural(result.invalid, 'record', 'records')} without text.`);
    }
    if (result.abbreviationsDropped) {
      parts.push(
        `${plural(result.abbreviationsDropped, 'snippet', 'snippets')} lost an abbreviation that another snippet already uses.`
      );
    }
    return parts.join(' ');
  }

  // Adds the snippets in a backup file to the end of the list, in one storage write.
  async function importSnippets(text) {
    const list = await readSnippets();
    const result = parseImport(text, list);
    if (result.add.length) await writeSnippets([...list, ...result.add]);
    return result;
  }

  // Panel and manager helpers that do not touch storage.

  // The name shown for a snippet: its title, or the first line of its text.
  function displayTitle({ title, content }) {
    return title || content.split(/\n/)[0];
  }

  // The muted second line under a snippet's name: the first non-empty line of the text when the
  // snippet has a title, otherwise the next non-empty line after the one used as its name.
  function previewLine({ title, content }) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return (title ? lines[0] : lines[1]) || '';
  }

  function escapeRegExp(text) {
    return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }

  // Keeps snippets whose title or text has a word starting with the query, or whose abbreviation
  // starts with it. An empty query keeps every snippet.
  function filterSnippets(list, query) {
    const trimmed = query.trim();
    if (!trimmed) return list;
    const pattern = new RegExp(`(^|\\b|\\s)${escapeRegExp(trimmed)}`, 'i');
    const lower = trimmed.toLowerCase();
    return list.filter(
      ({ title, content, abbreviation }) =>
        (!!title && pattern.test(title)) ||
        pattern.test(content) ||
        (!!abbreviation && abbreviation.toLowerCase().startsWith(lower))
    );
  }

  function characterCount(text, locale) {
    const count = [...text].length;
    return `${count.toLocaleString(locale)} ${count === 1 ? 'character' : 'characters'}`;
  }

  const api = {
    STORAGE_KEY,
    DELETED_KEY,
    SETTINGS_KEY,
    DELETED_MAX,
    TITLE_MAX_LENGTH,
    DEFAULT_SETTINGS,
    makeId,
    readState,
    readSnippets,
    readDeleted,
    readSettings,
    writeSettings,
    createSnippet,
    updateSnippet,
    duplicateSnippet,
    deleteSnippet,
    restoreSnippet,
    purgeDeleted,
    moveSnippet,
    abbreviationProblem,
    buildExport,
    exportFileName,
    parseImport,
    importReport,
    importSnippets,
    displayTitle,
    previewLine,
    filterSnippets,
    characterCount,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
