# Snippet Inserter

A browser extension for Chrome and other Chromium-based browsers that inserts saved text snippets
where you type. Double-tap Ctrl, or press Ctrl+Shift+Space, in a text box, a rich-text editor, or a
Google Docs document, pick a snippet, and it is inserted at the cursor. Snippets have no length
limit and can hold the date, the time, and fill-in fields. A snippet can also have an
abbreviation that turns into the snippet when you type it.

Snippets stay in your browser on this device. The extension sends nothing over the network and
syncs nothing ([how snippets are stored](docs/development.md#storage)).

The panel is modeled on the snippet manager in QuillBot's browser extension, without its
1,024-character limit. This project is not affiliated with QuillBot.

![Snippet list](docs/screenshots/panel-list-light.png)

## Install

Install Snippet Inserter from the
[Chrome Web Store](https://chromewebstore.google.com/detail/snippet-inserter/fbpkffddkibmmkodahmpbggoelbaieaj).

## Install from source

1. Clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.

The browser loads the extension from that folder on every start, so leave it in place. After
pulling changes, click the reload button on the extension's card. If you turn developer mode
off, Chromium disables extensions loaded this way.

## Use

To open the snippet panel, click in a text field and tap Ctrl twice quickly, or press
Ctrl+Shift+Space. You can also right-click a field and choose "Insert snippet...". Pick a snippet
with the mouse, with the arrow keys and Enter, or with Ctrl+2 to Ctrl+9 (Ctrl+1 creates a new
snippet), and it is inserted at the cursor. To save text from any page as a snippet, select it,
right-click, and choose "Save selection as snippet". On a Mac, press Cmd wherever this README names
Ctrl in a shortcut; the double tap uses the Control key.

Click the extension's toolbar icon to open the snippet manager. It shows every snippet with a large
editor and drag-and-drop ordering. Its Settings and backup section changes the trigger key and when
abbreviations expand, and exports and imports snippets. The [user guide](docs/user-guide.md#use)
describes search, folders, the forms, and every shortcut.

## Features

- [Placeholders](docs/user-guide.md#placeholders) for the date, the time, and fill-in fields.
- [Abbreviations](docs/user-guide.md#abbreviations), such as `;addr`, that turn into their
  snippet when you type them.
- [Snippets inside snippets](docs/user-guide.md#snippets-inside-snippets), with `{snippet:;sig}`.
- [Folders and search](docs/user-guide.md#use) in the panel and the snippet manager.
- [Formatting](docs/user-guide.md#formatting): bold, italic, underline, links, lists, and code.
- [Colored code blocks](docs/user-guide.md#code-blocks-and-colors) in 8 languages, such as JSON.
- A [Format JSON](docs/user-guide.md#format-json) button that checks JSON and indents it with 2
  spaces.
- A [list of sites](docs/user-guide.md#turning-sites-off) where the double tap and abbreviations
  are off.
- [Undo](docs/user-guide.md#use) after a delete, and the last 20 deleted snippets in the manager.
- [Export and import](docs/user-guide.md#backup) of every snippet in a JSON file.
- Support for [Google Docs](docs/user-guide.md#google-docs) documents, but not Slides or Sheets.
- [No length limit](docs/user-guide.md#limits) on a snippet's text.
- The interface in [29 languages besides English](docs/user-guide.md#languages).

## Formatting

You add formatting in the snippet manager. Snippets made in the snippet panel are plain.
A rich-text editor, such as webmail, and a Google Docs document get the formatting, and each keeps
as much of it as it supports. A text box and a single-line field get the plain text. The
[user guide](docs/user-guide.md#formatting) describes the toolbar, the plain text, and which
editors keep the colors.

## Languages

The panel, the snippet manager, the right-click menu items, and the notices on pages use your
browser's display language when Snippet Inserter has it, and English otherwise. In Arabic and
Persian the panel and the manager read from right to left. A language model drafted every
translation, and no translation has been reviewed by a native speaker yet. The
[user guide](docs/user-guide.md#languages) lists the languages and will list the reviewed ones.
Report a wrong or unclear translation with the
[Translation problem form](https://github.com/CommitMaster102/snippet-inserter/issues/new?template=translation.yml).

## Contributing

Report bugs and suggest features in
[issues](https://github.com/CommitMaster102/snippet-inserter/issues).
[CONTRIBUTING.md](CONTRIBUTING.md) says how to build and test a change, and everyone taking part
follows the [code of conduct](CODE_OF_CONDUCT.md). Report a security problem privately, as
[SECURITY.md](SECURITY.md) describes. [docs/development.md](docs/development.md) describes the
tests, the project layout, how snippets are stored, and what the extension costs a page.

## Support the project

Snippet Inserter is free, and every feature works without paying. If you want to support its
development, you can donate on [Ko-fi](https://ko-fi.com/commitmaster102). The snippet manager has
the same link under Settings and backup.

## License

MIT. See [LICENSE](LICENSE).

The snippet manager bundles [Prism](https://prismjs.com/) 1.30.0 by Lea Verou, also under the MIT
license, to color code blocks. Its files and license are in
[extension/vendor/prism](extension/vendor/prism), unchanged from the `prismjs@1.30.0` npm package.
