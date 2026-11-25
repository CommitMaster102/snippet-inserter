/*
 * Snippet storage, shared by the content script, the snippet panel, and the manager page.
 *
 * Snippets live in chrome.storage.local under STORAGE_KEY as an array of records shaped
 * { createdAt, content, title, id }, plus an optional `abbreviation` and an optional `folder`.
 * The folders are not stored on their own: the list of folders is the set of names the snippets
 * carry. The array order is the order in which the panel and the manager list them. A deleted snippet moves to DELETED_KEY,
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
  // A small copy of each snippet's abbreviation and id, written with every change to the list.
  // The content script in every frame reads only this, never the snippet text, until an
  // abbreviation is typed.
  const ABBREVIATIONS_KEY = 'snippet_manager.abbreviations';
  const DELETED_MAX = 20;
  const TITLE_MAX_LENGTH = 128;
  const FOLDER_MAX_LENGTH = 64;
  // Each snippet gets a 12-character random id. ID_ALPHABET is the 64-character URL-safe
  // alphabet of the nanoid library (MIT), so a byte masked to 6 bits picks one character.
  const ID_LENGTH = 12;
  const ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
  const DEFAULT_SETTINGS = {
    hotkey: 'Control',
    abbreviations: true,
    abbreviationTiming: 'immediate',
    offSites: [],
  };

  // Splits text into the characters a person sees. An emoji built from several code points, such
  // as a flag, a skin-tone emoji, or a family, is one piece.
  const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  function graphemes(text) {
    return Array.from(GRAPHEME_SEGMENTER.segment(text), (part) => part.segment);
  }

  // The number of characters in a name, counting an emoji as one, as the forms show it.
  function titleLength(title) {
    return graphemes(title).length;
  }

  // A name cut to TITLE_MAX_LENGTH characters. It is cut between whole characters, so an emoji
  // is never split into a broken half.
  function cutTitle(title) {
    return graphemes(title).slice(0, TITLE_MAX_LENGTH).join('');
  }

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

  // { abbreviation: id } for every snippet that has an abbreviation.
  function abbreviationIndex(list) {
    const index = {};
    for (const snippet of list) if (snippet.abbreviation) index[snippet.abbreviation] = snippet.id;
    return index;
  }

  // The values to store for a new list: the list and its abbreviation index, in one write.
  function listValues(list) {
    return { [STORAGE_KEY]: list, [ABBREVIATIONS_KEY]: abbreviationIndex(list) };
  }

  async function writeSnippets(list) {
    await chrome.storage.local.set(listValues(list));
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

  // The "Expand abbreviations" choice in a settings object: 'immediate', 'delimiter' (after
  // Space, Tab, or Enter), or 'off'. Version 1.2.0 stored only `abbreviations`, which reads as
  // 'immediate' or 'off'.
  function abbreviationMode(settings) {
    if (settings.abbreviations === false) return 'off';
    return settings.abbreviationTiming === 'delimiter' ? 'delimiter' : 'immediate';
  }

  // Stores an "Expand abbreviations" choice. The timing is written only when the user picks a
  // timing that differs from the stored one, so a profile that never picks the delimiter mode
  // keeps the settings shape of version 1.2.0.
  async function writeAbbreviationMode(mode) {
    const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
    const changes = { abbreviations: mode !== 'off' };
    if (mode !== 'off' && abbreviationMode({ ...stored, abbreviations: true }) !== mode) {
      changes.abbreviationTiming = mode;
    }
    return writeSettings(changes);
  }

  // Sites where the double tap and abbreviations are off. The list holds host names, and an
  // entry covers its own host and every subdomain of it.

  // The host name in what the user typed: a bare host, host:port, host/path, or an http or https
  // address. Names with accents come back in their xn-- form, as location.hostname gives them.
  // Returns '' when the input is not a site.
  function siteHost(input) {
    let text = String(input || '').trim().toLowerCase();
    if (text.startsWith('*.')) text = text.slice(2);
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(text);
    if (scheme && scheme[1] !== 'http' && scheme[1] !== 'https') return '';
    try {
      const host = new URL(scheme ? text : `http://${text}`).hostname.replace(/\.$/, '');
      // Chromium turns a space in a host into %20 instead of failing, so that counts as invalid.
      return /[\p{L}\p{N}]/u.test(host) && !host.includes('%') ? host : '';
    } catch {
      return '';
    }
  }

  // The list entry that covers `host`, or null.
  function offSiteEntry(host, entries) {
    for (const entry of entries || []) {
      if (host === entry || host.endsWith(`.${entry}`)) return entry;
    }
    return null;
  }

  // An error about what the user typed, as opposed to a failed write. `invalid` lets the manager
  // show it next to the field.
  function siteProblem(message) {
    return Object.assign(new Error(message), { invalid: true });
  }

  // Adds a site to the list, which stays sorted and free of entries inside other entries.
  async function addOffSite(input) {
    const host = siteHost(input);
    if (!host) throw siteProblem('Enter a site such as example.com.');
    const entries = (await readSettings()).offSites;
    const covering = offSiteEntry(host, entries);
    if (covering === host) throw siteProblem(`${host} is already on the list.`);
    if (covering) throw siteProblem(`${host} is already off, because ${covering} is on the list.`);
    const offSites = [...entries.filter((entry) => !entry.endsWith(`.${host}`)), host].sort();
    await writeSettings({ offSites });
    return { host, offSites };
  }

  async function removeOffSite(entry) {
    const offSites = (await readSettings()).offSites.filter((other) => other !== entry);
    await writeSettings({ offSites });
    return offSites;
  }

  // A record as stored. The abbreviation and the folder are left out when they are empty, so a
  // snippet without them keeps the record shape that version 1.1.1 wrote.
  function record({ createdAt, content, title, id, abbreviation, folder }) {
    const result = { createdAt, content, title: title || '', id };
    if (abbreviation) result.abbreviation = abbreviation;
    if (folder) result.folder = folder;
    return result;
  }

  // Folders. A folder name has up to FOLDER_MAX_LENGTH characters, and capitals do not make a
  // second folder: "work" joins "Work".

  // A folder name with control characters and runs of white space turned into one space and the
  // ends trimmed, not yet cut. Anything that is not text gives an empty name.
  function tidyFolder(name) {
    if (typeof name !== 'string') return '';
    return name.replace(/[\p{Cc}\s]+/gu, ' ').trim();
  }

  // The number of characters in a folder name, counting an emoji as one.
  function folderLength(name) {
    return graphemes(tidyFolder(name)).length;
  }

  // A folder name ready to store: tidied and cut at whole characters.
  function cleanFolder(name) {
    return graphemes(tidyFolder(name)).slice(0, FOLDER_MAX_LENGTH).join('').trim();
  }

  // The spelling to store for `name`: that of a folder in `list` that differs only in capitals,
  // or else the cleaned name.
  function matchFolder(name, list) {
    const clean = cleanFolder(name);
    if (!clean) return '';
    for (const { folder } of list) {
      if (folder && searchForm(folder) === searchForm(clean)) return folder;
    }
    return clean;
  }

  // Each folder once, sorted by name without regard to capitals, with numbers in numeric order.
  function folderNames(list) {
    const names = new Set();
    for (const { folder } of list) if (folder) names.add(folder);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return [...names].sort(collator.compare);
  }

  // The snippets of one folder: all of them for null, the ones without a folder for ''.
  function inFolder(list, folder) {
    if (folder === null) return list;
    return list.filter((snippet) => (snippet.folder || '') === folder);
  }

  // Where `id` goes to move one place up or down among `shown`, the snippets in view, as the
  // position moveSnippet takes in the whole `list`. It is -1 when there is no neighbour. On the
  // whole list it is the snippet's own position plus `step`.
  function moveTarget(list, shown, id, step) {
    const at = shown.findIndex((snippet) => snippet.id === id);
    const neighbour = at === -1 ? undefined : shown[at + step];
    return neighbour ? list.findIndex((snippet) => snippet.id === neighbour.id) : -1;
  }

  // Refuses an abbreviation that the stored list does not allow, with the message the forms show.
  // The forms check against the list they loaded, which another page may have changed since.
  function requireFreeAbbreviation(abbreviation, list, ownId) {
    const problem = abbreviationProblem(abbreviation, list, ownId);
    if (problem) {
      const error = new Error(problem);
      error.name = 'AbbreviationError';
      throw error;
    }
  }

  async function createSnippet({ content, title, abbreviation, folder }) {
    const list = await readSnippets();
    requireFreeAbbreviation(abbreviation, list);
    const created = record({
      createdAt: new Date().toISOString(),
      content,
      title,
      id: freshId(new Set(list.map((s) => s.id))),
      abbreviation,
      folder: matchFolder(folder, list),
    });
    const next = [...list, created];
    await writeSnippets(next);
    return { snippet: created, snippets: next };
  }

  // Changes the fields that `changes` names and keeps the others, so a change of the folder alone
  // leaves the text and the abbreviation as stored.
  async function updateSnippet(id, changes) {
    const list = await readSnippets();
    const index = list.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('not found');
    const merged = { ...list[index] };
    for (const [key, value] of Object.entries(changes)) if (value !== undefined) merged[key] = value;
    requireFreeAbbreviation(merged.abbreviation, list, id);
    if (changes.folder !== undefined) {
      merged.folder = matchFolder(changes.folder, list.filter((s) => s.id !== id));
    }
    const updated = record(merged);
    const was = list[index].abbreviation;
    list.splice(index, 1, updated);
    // Changing one abbreviation to another keeps the {snippet:...} references to it working, in
    // the same write as the change itself. Clearing an abbreviation, or renaming it to one that a
    // reference cannot name, leaves them as they are.
    const referencesRenamed =
      was && updated.abbreviation && was !== updated.abbreviation && isReferenceable(updated.abbreviation)
        ? renameReferences(list, was, updated.abbreviation, id)
        : 0;
    await writeSnippets(list);
    return { snippet: updated, snippets: list, referencesRenamed };
  }

  // True when a {snippet:...} reference can name the abbreviation. A reference holds 2 to 32
  // characters that are not white space or braces, the same rule as in placeholders.js.
  function isReferenceable(abbreviation) {
    return /^[^\s{}]{2,32}$/.test(abbreviation);
  }

  // Replaces {snippet:from} with {snippet:to} in the text of every snippet except `exceptId`, in
  // place, and returns how many snippets changed. Other fields of a changed record stay as they are.
  function renameReferences(list, from, to, exceptId) {
    const oldToken = `{snippet:${from}}`;
    const newToken = `{snippet:${to}}`;
    let changed = 0;
    list.forEach((snippet, i) => {
      if (snippet.id === exceptId || !String(snippet.content).includes(oldToken)) return;
      list[i] = { ...snippet, content: String(snippet.content).split(oldToken).join(newToken) };
      changed += 1;
    });
    return changed;
  }

  // How many snippets other than `exceptId` include the abbreviation.
  function countUsers(list, abbreviation, exceptId) {
    const token = `{snippet:${abbreviation}}`;
    return list.filter((s) => s.id !== exceptId && String(s.content).includes(token)).length;
  }

  // Places a copy right after the original, in the same folder. The copy has no abbreviation,
  // because abbreviations must be unique.
  async function duplicateSnippet(id) {
    const list = await readSnippets();
    const index = list.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('not found');
    const original = list[index];
    const copy = record({
      createdAt: new Date().toISOString(),
      content: original.content,
      title: original.title ? cutTitle(`Copy of ${original.title}`) : '',
      id: freshId(new Set(list.map((s) => s.id))),
      folder: original.folder,
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
    await chrome.storage.local.set({ ...listValues(snippets), [DELETED_KEY]: nextDeleted });
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
    await chrome.storage.local.set({ ...listValues(snippets), [DELETED_KEY]: nextDeleted });
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

  // Moves every snippet of the folder `from` into the folder `to`, in one write, and returns the
  // new list. A `to` of '' takes them out of any folder. The snippets keep their places.
  async function renameFolder(from, to) {
    const list = await readSnippets();
    const target = matchFolder(to, list.filter((s) => s.folder !== from));
    const next = list.map((s) => (s.folder === from ? record({ ...s, folder: target }) : s));
    await writeSnippets(next);
    return next;
  }

  function removeFolder(name) {
    return renameFolder(name, '');
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
  // - a title longer than TITLE_MAX_LENGTH is cut to that length;
  // - a folder that is not text is dropped, and one that differs from a known folder only in
  //   capitals takes that folder's spelling.
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
      const title = typeof raw.title === 'string' ? cutTitle(raw.title) : '';
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
      const folder = typeof raw.folder === 'string' ? matchFolder(raw.folder, known) : '';
      const added = record({ createdAt, content: raw.content, title, id, abbreviation, folder });
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
    return title || content.split(/\r?\n/)[0];
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

  // Scripts that are written without spaces between words, so a word can start anywhere.
  const UNSPACED_SCRIPT =
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
  const WORD_CHARACTER = /^[\p{L}\p{N}\p{M}]/u;

  // The character that ends right before `index`, as a whole code point.
  function characterBefore(text, index) {
    const low = text.charCodeAt(index - 1);
    if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
      const high = text.charCodeAt(index - 2);
      if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
    }
    return text[index - 1];
  }

  // True when `query` occurs in `text` at the start of a word. A word starts at the beginning of
  // the text and after anything that is not a letter, digit, or accent mark, so after a space,
  // an apostrophe, or a hyphen. A query that starts in a script without spaces, or with a symbol,
  // matches anywhere.
  function hasWordStart(text, query) {
    const anywhere = UNSPACED_SCRIPT.test(query) || !WORD_CHARACTER.test(query);
    for (let at = text.indexOf(query); at !== -1; at = text.indexOf(query, at + 1)) {
      if (anywhere || at === 0 || !WORD_CHARACTER.test(characterBefore(text, at))) return true;
    }
    return false;
  }

  // Text compared in one Unicode form, so an accent typed as a separate mark matches the same
  // letter stored as one character.
  function searchForm(text) {
    return text.normalize('NFC').toLowerCase();
  }

  // Keeps snippets whose title, text, or folder has a word starting with the query, or whose
  // abbreviation starts with it. An empty query keeps every snippet.
  function filterSnippets(list, query) {
    const trimmed = query.trim();
    if (!trimmed) return list;
    const lower = searchForm(trimmed);
    return list.filter(
      ({ title, content, abbreviation, folder }) =>
        (!!title && hasWordStart(searchForm(title), lower)) ||
        hasWordStart(searchForm(content), lower) ||
        (!!abbreviation && searchForm(abbreviation).startsWith(lower)) ||
        (!!folder && hasWordStart(searchForm(folder), lower))
    );
  }

  // Characters that can join the one before or after them into a single user-perceived character:
  // a carriage return (joined to a line feed), combining marks, spacing marks, the zero-width
  // joiner, regional indicators, emoji skin-tone modifiers, Hangul jamo, and the Prepend characters
  // of the Unicode segmentation rules.
  const CLUSTER_JOINER =
    /[\r\p{Grapheme_Extend}\p{Mc}\u200D\p{Regional_Indicator}\p{Emoji_Modifier}\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF\u0600-\u0605\u06DD\u070F\u0890\u0891\u08E2\u0D4E\u0E33\u0EB3\u{110BD}\u{110CD}\u{111C2}\u{111C3}\u{1193F}\u{11941}\u{11A3A}\u{11A84}-\u{11A89}\u{11D46}\u{11F02}\u{113D1}\u{16D63}\u{16D67}-\u{16D6A}]/u;

  // The same set, scanned from one match to the next.
  const CLUSTER_JOINERS = new RegExp(CLUSTER_JOINER.source, 'gu');

  // Cutting the text into windows costs less than segmenting all of it only while there is about
  // one window for every 128 units of text. With more windows than that, the whole text is
  // segmented instead.
  const CLUSTER_WINDOW_SPAN = 128;

  // The number of code points in the text.
  function countCodePoints(text) {
    let count = text.length;
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        count--;
        i++;
      }
    }
    return count;
  }
  // Where the code point in front of `end` starts: 2 units back for a surrogate pair, else 1, and
  // 0 at the start of the text.
  function previousPointStart(text, end) {
    if (end >= 2) {
      const low = text.charCodeAt(end - 1);
      const high = text.charCodeAt(end - 2);
      if (low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff) return end - 2;
    }
    return Math.max(0, end - 1);
  }

  // The number of characters a person sees in the text. Counting with Intl.Segmenter takes about
  // 70 ms per megabyte, so the text is counted by code points, and only a short window around
  // each character that can join a cluster is segmented. Two code points that cannot join are
  // always a boundary of the segmenter, so a window starts at the code point before a joining
  // character and ends after the first code point that follows a joining character and is not
  // itself followed by one. Every code point that joins makes the count one lower, so the window's
  // code points minus its characters are taken off.
  function countCharacters(text) {
    let count = countCodePoints(text);
    let windows = 0;
    CLUSTER_JOINERS.lastIndex = 0;
    for (let match = CLUSTER_JOINERS.exec(text); match; match = CLUSTER_JOINERS.exec(text)) {
      if (++windows > text.length / CLUSTER_WINDOW_SPAN) return graphemes(text).length;
      const start = previousPointStart(text, match.index);
      let end = match.index + match[0].length;
      while (end < text.length) {
        const point = text.codePointAt(end);
        end += point > 0xffff ? 2 : 1;
        if (!CLUSTER_JOINER.test(String.fromCodePoint(point)) && !joinsAt(text, end)) break;
      }
      const window = text.slice(start, end);
      count -= countCodePoints(window) - graphemes(window).length;
      CLUSTER_JOINERS.lastIndex = end;
    }
    return count;
  }

  // Whether the code point at `index` can join a cluster. The end of the text does not.
  function joinsAt(text, index) {
    return index < text.length && CLUSTER_JOINER.test(String.fromCodePoint(text.codePointAt(index)));
  }

  function characterCount(text, locale) {
    const count = countCharacters(text);
    return `${count.toLocaleString(locale)} ${count === 1 ? 'character' : 'characters'}`;
  }

  const api = {
    STORAGE_KEY,
    DELETED_KEY,
    SETTINGS_KEY,
    ABBREVIATIONS_KEY,
    abbreviationIndex,
    renameReferences,
    isReferenceable,
    countUsers,
    DELETED_MAX,
    TITLE_MAX_LENGTH,
    FOLDER_MAX_LENGTH,
    titleLength,
    cutTitle,
    folderLength,
    cleanFolder,
    matchFolder,
    folderNames,
    inFolder,
    moveTarget,
    renameFolder,
    removeFolder,
    DEFAULT_SETTINGS,
    makeId,
    readState,
    readSnippets,
    readDeleted,
    readSettings,
    writeSettings,
    abbreviationMode,
    writeAbbreviationMode,
    siteHost,
    offSiteEntry,
    addOffSite,
    removeOffSite,
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
    countCharacters,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnippetInserter = Object.assign(root.SnippetInserter || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
