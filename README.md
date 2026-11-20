# Snippet Inserter

A browser extension for Chrome and other Chromium-based browsers that inserts saved text snippets
where you type. Double-tap Ctrl in a text box, a rich-text editor, or a Google Docs document,
pick a snippet, and it is inserted at the cursor. Snippets have no length limit.

The panel is modeled on the snippet manager in QuillBot's browser extension, without its
1,024-character limit. This project is not affiliated with QuillBot.

![Snippet list](docs/screenshots/panel-list-light.png)

## Project layout

```
extension/            The extension itself; this is the folder to load.
  manifest.json
  content.js          Detects the double tap, places the panel, inserts the snippet.
  panel.html/.css/.js The snippet panel, shown in an extension iframe.
  options.html/.js    Settings page (which key opens the panel).
  background.js       Opens the settings page from the toolbar icon.
  icons/
tests/
  e2e/                Playwright end-to-end tests and their fixtures.
  live/               The check against the real Google Docs editor.
  pages/              Test pages served to the browser during the tests.
scripts/
  make-icons.py       Redraws extension/icons.
docs/screenshots/     Screenshots used in this README.
playwright.config.js        Configuration for npm test.
playwright.live.config.js   Configuration for npm run test:docs-live.
package.json
```

## Install from source

1. Clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.

The browser loads the extension from that folder on every start, so leave it in place. After
pulling changes, click the reload button on the extension's card. Chromium disables extensions
loaded this way while developer mode is off.

## Use

Click in a textarea, a rich-text editor, or a Google Docs document and tap Ctrl twice quickly.

- With snippets saved, the panel lists them. Pick one with the mouse, with the arrow keys and
  Enter, or with Ctrl+2 to Ctrl+9 (Ctrl+1 is "Create new snippet").
- Type in the search box to filter. Filtering starts at three characters, after a half-second
  pause, and matches words that start with the query in the name or the text.
- If text is selected when the panel opens, the first entry reads "Create snippet from
  selection" and the form starts with that text. Picking a snippet replaces the selection.
- The pencil on a snippet opens the edit form, which also has "Delete snippet" (Ctrl+1).
- In a form, Ctrl+Enter saves, and Enter in the name field saves too. Escape goes back to the
  list, and Escape in the list closes the panel.

The snippet gets a leading space when the character before the caret is not a space or line
break, and a trailing space when the character after it is not a space, line break, or
punctuation. Google Docs is the exception; see below.

The trigger key can be changed to Shift or Alt, or turned off, from the extension's options page
(click its toolbar icon).

## Google Docs

Docs draws the document on a canvas and takes typing through a hidden frame, so the extension
opens the panel at the cursor Docs draws and inserts the snippet into that frame as a paste.
Picking a snippet over a selection replaces it, "Create snippet from selection" works, one Ctrl+Z
removes an insert, and with other people in the document the panel opens at your own cursor.
Three things differ from other editors:

- No space is added before or after the snippet, because Docs does not expose the text next to
  the cursor.
- Docs drops spaces at the very start and end of a pasted snippet.
- Each line break in the snippet starts a new paragraph.

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
- Single-line inputs (`<input type="text">`) are not supported, only textareas, rich-text
  editors, and Google Docs.

## Storage

Snippets are kept in `chrome.storage.local` under `snippet_manager.snippets`, as an array of
`{ createdAt, content, title, id }` records. The extension has the `unlimitedStorage` permission,
so the browser's 10 MB local-storage quota does not apply. Nothing is synced or sent over the
network.

## Tests

The end-to-end tests load the extension into Playwright's Chromium and drive real pages.

```
npm install
npm run browsers      # once: downloads Playwright's Chromium build
npm test              # headless run
npm run test:headed   # watch the browser
npm run test:report   # open the HTML report of the last run
```

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

## License

MIT. See [LICENSE](LICENSE).
