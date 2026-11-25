# Development

[CONTRIBUTING.md](../CONTRIBUTING.md) says how to send a change.

## Tests

The end-to-end tests load the extension into Playwright's Chromium and drive real pages.

```
npm install
npm run browsers      # once: downloads Playwright's Chromium build
npm test              # headless run
npm run test:headed   # watch the browser
npm run test:report   # open the HTML report of the last run
npm run test:unit     # Node unit tests for extension/lib, no browser
npm run test:locales  # checks every language folder in extension/_locales
```

The layout tests in `tests/e2e/locales.spec.js` load a copy of the extension whose English text is
replaced by a pseudo-language: one about 40 percent longer, and one written from right to left. They
check that the panel, the manager, and the page notices fit and mirror, including the manager's
formatting toolbar and link bar, and the manager at 800 pixels wide, where the list sits above the
editor. In the longer one, every text that is not snippet text must carry its marks, so a text the
code builds itself, outside the catalog, fails the test. The right-to-left one also runs with
Persian digits, to check that every count and position on the pages and in a notice is written in
the digits of the interface language. Another test gives Ctrl and the Mac Command key other names in
the catalog, in a browser that reports a Mac, and checks that the formatting toolbar's shortcuts and
the notes in the settings use the catalog's name for the Command key. `npm run test:locales` lets a
translation write a fixed number, such as the 20 of Recently deleted, in the digits of its language,
and a key name, such as Ctrl or Cmd, as keyboards in its language print it, the same way in every
message and with no space around a plus sign.

`extension/lib/richtext.js` parses HTML with the browser's own parser, so its unit tests,
`tests/e2e/richtext.spec.js`, run in Playwright's Chromium with `npm test` instead of in Node.

Playwright cannot open the browser's own right-click menu or press an extension command, so the
menu and shortcut tests call the service worker's handlers, which it exposes as
`self.snippetInserter`. The real menu and shortcut call the same functions.

`tests/pages/docs.html` stands in for the Google Docs editor in `npm test`, and its query
parameters imitate changes Google could make, such as a renamed input frame or a missing cursor.
To check the real editor, set `DOCS_TEST_URL` to a Google Doc that anyone with the link can edit
and run `npm run test:docs-live`. The check replaces the document's text, so use a scratch
document. If it fails while `npm test` passes, the failure message says which part of the live
editor no longer matches the stand-in. Its second test, the formatted step, inserts a formatted
snippet through the extension and checks that Docs keeps the bold text, the link, the paragraphs,
and every space and tab of a code block. A formatted snippet goes into Docs as a paste that carries
its HTML beside its plain text, and Docs inserts the HTML. In a code block, Docs drops the first
space after each `<br>`, so the HTML for Docs breaks code lines with newline characters. The
stand-in records the HTML of each paste but inserts only the plain text.

`playwright.config.js` runs the tests fully in parallel on 4 worker processes (2 when the `CI`
environment variable is set) and retries a failed test up to 2 times. Retries use Playwright's
`isolated` strategy: they wait until the rest of the suite has finished, then run one at a time
in a single worker. A test that failed only because the other workers loaded the machine then
runs without that load. The first retry records a trace. Each test gets its own browser profile,
so tests share no stored snippets or settings and can run in any order. To check for intermittent
failures, repeat the suite with `npx playwright test --repeat-each=3`.

To test another copy of the extension, such as an unzipped release package, point the
`EXTENSION_PATH` environment variable at its folder before running `npm test`.

In a test, send a key that closes the panel with the `pressInPanel` helper, not with
`page.keyboard`. The panel iframe is removed on keydown, and `page.keyboard` would then wait for
a keyup that can no longer reach it.

When the panel changes view, its frame grows in a step that the browser needs a round trip to
apply, and a click computed in that time lands on the page underneath and is lost. Before a test
clicks into a form or the header after the panel opens or changes view, call
`waitForPanelFit(page, panel)` from `tests/e2e/helpers.js`. It waits until the panel's viewport
and its frame match the height of its content. That does not yet mean the browser sends clicks
there to the panel: for a few frames after the panel opens or grows, the browser can still route
them by the frame's old position and size. Before clicking into a panel that has just opened or
grown, also call `waitForStablePanel(page)`, which waits until the frame has kept its position
and size for 100 ms. `openPanel` calls both. For a panel inside another frame, call
`waitForStablePanel(page, frame.locator(PANEL))`, and pass `waitForPanelFit` the panel's
`frame.frameLocator(PANEL)` as the second argument and `frame.locator(PANEL)` as the third, where
`frame` is the frame that holds the panel.

## Project layout

```
extension/            The extension itself; this is the folder to load.
  manifest.json
  _locales/           The interface text, one folder per language. en/ is the English text,
                      with a note for translators on each message, and the manifest names it
                      as the default language.
  content.js          Runs in every frame: the double tap, the shortcut and menu messages, and
                      typed abbreviations.
  content-main.js     Loaded when a frame needs it: places the panel and inserts the snippet.
  panel.html/.css/.js The snippet panel, shown in an extension iframe.
  options.html/.css/.js
                      The snippet manager, opened from the toolbar icon.
  background.js       The right-click menu items and the keyboard shortcut.
  lib/
    i18n.js           Reads the message catalog for the pages: fills in text, picks plural
                      forms, and sets the language and direction of a page.
    snippets.js       Storage, import and export, abbreviation rules.
    placeholders.js   {date}, {time}, {cursor}, {input:Label}, and
                      {snippet:;abbreviation}.
    richtext.js       The cleaner for formatted snippets, and their plain text.
    keyboard.js       Names the key of a Ctrl shortcut the same on every keyboard layout.
    json-format.js    The Format JSON button: the check and the 2-space indent.
    highlight.js      Syntax colors for code blocks; loaded by the manager only.
    prism-setup.js    Stops Prism from highlighting the manager page by itself.
  vendor/prism/       Prism 1.30.0 (MIT), unmodified files from the prismjs npm package,
                      with its LICENSE. Loaded by the manager only.
  icons/
tests/
  e2e/                Playwright end-to-end tests and their fixtures.
  unit/               Node unit tests for extension/lib.
  live/               The check against the real Google Docs editor.
  pages/              Test pages served to the browser during the tests.
scripts/
  make-icons.py       Redraws extension/icons.
  check-locales.js    The check behind npm run test:locales.
  pseudo-locales.js   Makes the stretched and the mirrored pseudo-language for the layout tests.
i18n/                 The width budgets of the interface text, for the language check.
docs/
  user-guide.md       Every feature in detail.
  development.md      This page.
  translation-glossary.md
                      The glossary of fixed terms in each language.
  screenshots/        Screenshots used in the README and the user guide.
playwright.config.js        Configuration for npm test.
playwright.live.config.js   Configuration for npm run test:docs-live.
package.json
```

## Storage

Snippets are kept in `chrome.storage.local` under `snippet_manager.snippets`, as an array of
`{ createdAt, content, title, id }` records, plus `abbreviation`, `folder`, and `html` when a
snippet has them. `html` holds the formatting of a formatted snippet, and `content` then holds the
same text without formatting, which is what text boxes and search use. A folder name has up to 64
characters. There is no list of folders: the folders are the names that snippets carry, so a folder
exists while a snippet is in it. The array order is the order of the list, and moving a snippet to
another folder does not change its place. Deleted snippets go to `snippet_manager.deleted`, newest
first, at most 20, each with `deletedAt` and its old position. `snippet_manager.abbreviations` holds
a small `{ abbreviation: id }` copy written with every change to the list, so pages read only that.
The settings are in `settings`. `abbreviationTiming` is stored only once someone picks "After I
press Space, Tab, or Enter", and `offSites`, the host names of the turned-off sites, only once
someone adds one. Settings are not part of an export. The extension has the `unlimitedStorage`
permission, so the browser's 10 MB local-storage quota does not apply. Nothing is synced to other
devices.

Export in the manager saves every snippet to `snippets-YYYY-MM-DD.json`:

```json
{
  "format": "snippet-inserter",
  "version": 1,
  "exportedAt": "2026-11-20T09:30:00.000Z",
  "snippets": [{ "createdAt": "...", "content": "...", "title": "...", "id": "..." }]
}
```

Import accepts that file, or a bare array of records, and gives a new id to a record whose id is in
use. The [Backup section of the user guide](user-guide.md#backup) says which records an import
skips or changes and which files it refuses.

## Resource use

The extension adds no network traffic, timers, or caches, and nothing runs while a page is
idle. Measured in Playwright's Chromium 159 on Windows, as the median of 15 page loads:

- **Each frame of a page**: the browser itself spends about 170 KB on any extension's content
  script. This extension's own code adds about 25 to 40 KB of memory and 0.2 to 0.6 ms of
  script time when the frame loads. These two figures were measured on version 1.2.0 and are
  measured again at each release.
- **What loads where**: every frame gets `content.js`, 21,815 bytes (about 21.8 KB), which only
  watches for the double tap, the shortcut, the menu items, and abbreviations. `content-main.js`,
  52,636 bytes (about 52.6 KB), loads only in a frame where the panel opens or an abbreviation
  matches. `lib/richtext.js`, 39,262 bytes (about 39.3 KB), loads only in a frame where a formatted
  snippet goes into a rich-text editor, or where an abbreviation is typed into a rich-text editor
  for a snippet that includes others while any snippet is formatted. Prism loads only on the
  snippet manager page, never in a page you visit. The sizes are file sizes from `wc -c` and are
  measured again at each release.
- **Storage**: a frame reads the settings and the abbreviation list at its first focus or key
  press, so frames nobody types in, such as ads, never read storage. The snippet text is read
  only when the panel opens or an abbreviation matches.
- **Each typed character**: about 7 microseconds of script, or about 14 microseconds with 50
  abbreviations stored. The abbreviation check reads at most 33 characters before the cursor,
  so the size of the field does not change it. When abbreviations wait for Space, Tab, or Enter,
  a typed character other than a space returns after two comparisons without reading the field,
  and a space reads at most 34 characters. These two cases were not timed. On a site in the
  list of turned-off sites, no typing listener is attached, so a typed character costs nothing,
  and a key press costs one test of a stored yes-or-no value in the double tap check.
- **The panel** exists only while it is open. The service worker runs for the toolbar icon, the
  menu items, and the shortcut, and once at each browser start, to give the menu items their
  titles in the browser's language.
