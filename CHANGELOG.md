# Changelog

Each version lists what a person using Snippet Inserter sees. The version is `version` in `package.json`,, and `extension/manifest.json` has the same one.

## 1.2.0 (2026-11-20)

- Press a keyboard shortcut or use the right-click menu items to open the panel or create a snippet from the selected text.
- The panel also opens in single-line inputs.
- The options page is now a snippet manager. It saves and restores backup files.
- Deleted snippets stay in Recently deleted, so a deletion can be undone.
- Placeholders such as `{date}` and `{input:Name}` are filled in when a snippet is inserted.
- An abbreviation expands into its snippet as you type it.
- Every change to the snippet list now rewrites the abbreviation index in the same storage write.

## 1.1.1 (2026-11-19)

- Google Docs support no longer depends on Docs class names. If Google renames the hidden input frame, the panel still opens at your caret and not in the hidden frame.
- The panel opens at your own caret, never at a collaborator's cursor.
- When Docs does not take the pasted snippet, the snippet is copied to the clipboard and a notice asks for Ctrl+V.

## 1.1.0 (2026-11-19)

- Added Google Docs support. The panel opens at the Docs caret, the snippet is pasted in, and "Create snippet from selection" works there too.
- Docs does not expose the text next to the caret, so the automatic spacing is skipped there.

## 1.0.0 (2026-11-19)

- First version. A double tap of Ctrl in a text area or rich-text editor opens a panel at the caret with your saved snippets, search, and forms to create, edit, and delete them.
- The chosen snippet goes in at the caret, with a space added on either side when the neighboring character needs one. Snippet content has no length limit.
