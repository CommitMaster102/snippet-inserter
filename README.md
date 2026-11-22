# Snippet Inserter

A browser extension for Chrome and other Chromium-based browsers that inserts saved text snippets
where you type. Double-tap Ctrl, or press Ctrl+Shift+Space, in a text box, a rich-text editor, or a
Google Docs document, pick a snippet, and it is inserted at the cursor. Snippets have no length
limit, can hold the date, the time, and fill-in fields, and can be typed as abbreviations.

The panel is modeled on the snippet manager in QuillBot's browser extension, without its
1,024-character limit. This project is not affiliated with QuillBot.

![Snippet list](docs/screenshots/panel-list-light.png)

## Project layout

```
extension/            The extension itself; this is the folder to load.
  manifest.json
  content.js          Runs in every frame: the double tap, the shortcut and menu messages, and
                      typed abbreviations.
  content-main.js     Loaded when a frame needs it: places the panel and inserts the snippet.
  panel.html/.css/.js The snippet panel, shown in an extension iframe.
  options.html/.css/.js
                      The snippet manager, opened from the toolbar icon.
  background.js       The right-click menu items and the keyboard shortcut.
  lib/
    snippets.js       Storage, import and export, abbreviation rules.
    placeholders.js   {date}, {time}, {cursor}, and {input:Label}.
  icons/
tests/
  e2e/                Playwright end-to-end tests and their fixtures.
  unit/               Node unit tests for extension/lib.
  live/               The check against the real Google Docs editor.
  pages/              Test pages served to the browser during the tests.
scripts/
  make-icons.py       Redraws extension/icons.
docs/screenshots/     Screenshots used in this README.
playwright.config.js        Configuration for npm test.
playwright.live.config.js   Configuration for npm run test:docs-live.
package.json
```

## Install

Install Snippet Inserter from the
[Chrome Web Store](https://chromewebstore.google.com/detail/snippet-inserter/fbpkffddkibmmkodahmpbggoelbaieaj).
Brave and other Chromium-based browsers can install it from the same page.

## Install from source

1. Clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.

The browser loads the extension from that folder on every start, so leave it in place. After
pulling changes, click the reload button on the extension's card. Chromium disables extensions
loaded this way while developer mode is off.

## Use

Click in a textarea, a single-line text field, a rich-text editor, or a Google Docs document and
tap Ctrl twice quickly, or press Ctrl+Shift+Space. You can also right-click a field and choose
"Insert snippet...".

- With snippets saved, the panel lists them. Pick one with the mouse, with the arrow keys and
  Enter, or with Ctrl+2 to Ctrl+9 (Ctrl+1 is "Create new snippet").
- Type in the search box to filter. Search matches words that start with what you type, in the
  name or the text, and abbreviations that start with it.
- Alt+Up and Alt+Down move the highlighted snippet while the search box is empty. The order
  decides which snippets get Ctrl+2 to Ctrl+9.
- If text is selected when the panel opens, the first entry reads "Create snippet from
  selection" and the form starts with that text. Picking a snippet replaces the selection.
- The pencil on a snippet opens the edit form, with Duplicate and Delete below it. No shortcut
  deletes. After a delete, the list shows "Snippet deleted." with Undo, and Ctrl+Z in the list
  does the same.
- In a form, Ctrl+Enter saves, and Enter in the name or abbreviation field saves too. Escape goes
  back to the list, and Escape in the list closes the panel.
- To save text from any page as a snippet, select it, right-click, and choose "Save selection as
  snippet".

The snippet gets a leading space when the character before the caret is not a space or line
break, and a trailing space when the character after it is not a space, line break, or
punctuation. Google Docs is the exception; see below. In a single-line field, a multi-line
snippet goes in as one line: each line break, with the spaces around it, becomes one space.

Click the extension's toolbar icon to open the snippet manager: every snippet with a large
editor, drag-and-drop ordering, Recently deleted (the last 20 deleted snippets), and Settings and
backup. There you can change the trigger key to Shift or Alt or turn it off, see the keyboard
shortcut and change it in the browser's shortcuts page, turn abbreviations off, and export or
import snippets.

![Snippet manager](docs/screenshots/manager.png)

## Placeholders

Snippet text can hold placeholders, which are filled in when the snippet is inserted. The
examples are for English (United States) on 20 November 2026 at 9:14.

| Placeholder | Becomes |
| --- | --- |
| `{date}` | November 20, 2026 |
| `{date:short}` | 11/20/26 |
| `{date:iso}` | 2026-11-20 |
| `{time}` | 9:14 AM |
| `{time:iso}` | 09:14 |
| `{cursor}` | Nothing; the caret ends here after the insert |
| `{input:Customer name}` | What you type in the fill-in form |

Dates and times use the language of the field. A snippet with `{input:...}` placeholders opens a
fill-in form first, with one field per label and a preview; Enter moves to the next field and
Ctrl+Enter inserts. Only these exact forms are recognized, so other text in braces, such as JSON,
is inserted as written. The edit form lists the placeholders it finds in the text.

## Abbreviations

A snippet can have an abbreviation, such as `;addr`. Typing the abbreviation in a text field
replaces it with the snippet, and Ctrl+Z brings the typed text back. It expands only after the
start of the field, a space, punctuation, or a symbol, so `;addr` inside `x;addr` stays as typed.
An abbreviation has 2 to 32 characters and no spaces, and one abbreviation cannot start another,
because the shorter one would always expand first.

## Google Docs

Docs draws the document on a canvas and takes typing through a hidden frame, so the extension
opens the panel at the cursor Docs draws and inserts the snippet into that frame as a paste.
Picking a snippet over a selection replaces it, "Create snippet from selection" works, one Ctrl+Z
removes an insert, and with other people in the document the panel opens at your own cursor. The
keyboard shortcut works as well. These things differ from other editors:

- No space is added before or after the snippet, because Docs does not expose the text next to
  the cursor.
- Docs drops spaces at the very start and end of a pasted snippet.
- Each line break in the snippet starts a new paragraph.
- Abbreviations do not expand, and `{cursor}` has no effect, because the text and the cursor
  position are not in the page.

Docs has no documented interface for this, so the extension relies first on how the browser
delivers focus and pastes, and treats the Docs names it uses as hints with a fallback for each.
If Google changes the editor, the panel still opens in the page: at the cursor when it can be
found, otherwise at your last click or at the top of the document. After each insert the
extension checks that the Docs cursor moved. If it cannot confirm the insert, it copies the
snippet to the clipboard and shows a notice asking you to press Ctrl+V. The Docs names live in
the `DOCS` constant at the top of `extension/content.js`. The Docs support covers documents
only, not Slides or Sheets, and other sites are not affected.

## Limits

- Snippet content has no length limit. A snippet name can be up to 128 characters.
- Single-line fields work when their type is text, search, url, or tel. Password, email, and
  number fields are left alone: email and number fields do not expose the cursor position.
- When a field's `maxlength` would cut a snippet short, nothing is inserted and a notice says
  how many characters fit.

## Storage

Snippets are kept in `chrome.storage.local` under `snippet_manager.snippets`, as an array of
`{ createdAt, content, title, id }` records, plus `abbreviation` when a snippet has one. The
array order is the order of the list. Deleted snippets go to `snippet_manager.deleted`, newest
first, at most 20, each with `deletedAt` and its old position. `snippet_manager.abbreviations`
holds a small `{ abbreviation: id }` copy written with every change to the list, so pages read
only that. The extension has the `unlimitedStorage` permission, so the browser's 10 MB
local-storage quota does not apply. Nothing is synced or sent over the network.

Export in the manager saves every snippet to `snippets-YYYY-MM-DD.json`:

```json
{
  "format": "snippet-inserter",
  "version": 1,
  "exportedAt": "2026-11-20T09:30:00.000Z",
  "snippets": [{ "createdAt": "...", "content": "...", "title": "...", "id": "..." }]
}
```

Import accepts that file, or a bare array of records. It never changes or removes a stored
snippet: it skips records whose name and text match a stored snippet, gives a new id to a record
whose id is in use, and drops an abbreviation that is already taken. A file with a higher
`version` is refused with a message to update the extension.

## Resource use

The extension adds no network traffic, timers, or caches, and nothing runs while a page is
idle. Measured in Playwright's Chromium 159 on Windows, as the median of 15 page loads:

- **Each frame of a page**: the browser itself spends about 170 KB on any extension's content
  script. This extension's own code adds about 25 to 40 KB of memory, less than version 1.1.1
  did, and 0.2 to 0.6 ms of script time when the frame loads. Close to half of that time is the
  browser setting up the message listener that the keyboard shortcut and the menu items need.
- **What loads where**: every frame gets `content.js`, about 17 KB, which only watches for the
  double tap, the shortcut, the menu items, and abbreviations. `content-main.js`, about 36 KB,
  loads only in a frame where the panel opens or an abbreviation matches.
- **Storage**: a frame reads the settings and the abbreviation list at its first focus or key
  press, so frames nobody types in, such as ads, never read storage. The snippet text is read
  only when the panel opens or an abbreviation matches.
- **Each typed character**: about 7 microseconds of script, or about 14 microseconds with 50
  abbreviations stored. The abbreviation check looks only at the last few characters before
  the cursor, so the size of the field does not matter.
- **The panel** exists only while it is open, and the service worker runs only for the toolbar
  icon, the menu items, and the shortcut.

## Tests

The end-to-end tests load the extension into Playwright's Chromium and drive real pages.

```
npm install
npm run browsers      # once: downloads Playwright's Chromium build
npm test              # headless run
npm run test:headed   # watch the browser
npm run test:report   # open the HTML report of the last run
npm run test:unit     # Node unit tests for extension/lib, no browser
```

Playwright cannot open the browser's own right-click menu or press an extension command, so the
menu and shortcut tests call the service worker's handlers, which it exposes as
`self.snippetInserter`. The real menu and shortcut call the same functions.

`tests/pages/docs.html` stands in for the Google Docs editor in `npm test`, and its query
parameters imitate changes Google could make, such as a renamed input frame or a missing cursor.
To check the real editor, set `DOCS_TEST_URL` to a Google Doc that anyone with the link can edit
and run `npm run test:docs-live`. The check replaces the document's text, so use a scratch
document. If it fails while `npm test` passes, Google has changed the editor, and the failure
message says which part.

`playwright.config.js` runs the tests fully in parallel on 4 worker processes (2 when the `CI`
environment variable is set) and retries a failed test up to 2 times. Retries use Playwright's
`isolated` strategy: they wait until the rest of the suite has finished and then run one at a
time in a single worker, so a failure caused by load from the other workers is retried without
that load. The first retry records a trace. Each test gets its own browser profile, so tests
share no stored snippets or settings and can run in any order. To check for intermittent
failures, repeat the suite with `npx playwright test --repeat-each=3`.

To test another copy of the extension, such as an unzipped release package, point the
`EXTENSION_PATH` environment variable at its folder before running `npm test`.

Keys that close the panel are dispatched inside the panel document by the `pressInPanel` helper
instead of being pressed with `page.keyboard`. The panel iframe is removed on keydown, and
Playwright waits for the matching keyup to reach a frame that no longer exists.

## Contributing

Report bugs and suggest features in
[issues](https://github.com/CommitMaster102/snippet-inserter/issues).
[CONTRIBUTING.md](CONTRIBUTING.md) says how to build and test a change, and everyone taking part
follows the [code of conduct](CODE_OF_CONDUCT.md). Report a security problem privately, as
[SECURITY.md](SECURITY.md) describes.

## License

MIT. See [LICENSE](LICENSE).
