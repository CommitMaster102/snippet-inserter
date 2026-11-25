# Changelog

Each version lists what a person using Snippet Inserter sees. The version is `version` in `package.json`, and `extension/manifest.json` has the same one.

## 1.3.0 (2026-11-25)

- The interface comes in 29 languages besides English, chosen by the browser's language. A language model drafted the translations, so report a wrong one with the Translation problem form in Settings and backup. Arabic and Persian interfaces and Hebrew and Arabic snippets read from right to left.
- A snippet can have a folder, and backups keep it.
- `{date+3d}`, `{time-2h}`, and `{date+1fri}` count from now, and `{snippet:;sig}` puts one snippet inside another. A snippet that already holds such a placeholder or reference now expands it, and its edit form lists it under Placeholders or Includes. The edit forms list a mistyped date or time placeholder, such as `{date+3x}`, as not recognized, show what each date and time placeholder gives, and update the `{snippet:...}` references to an abbreviation when you rename it.
- The snippet manager adds bold, italic, underline, links, lists, colored code blocks, and a Format JSON button. Rich editors and Google Docs get the formatting, and text boxes get plain text. The panel shows a formatted snippet read-only, with "Open in snippet manager" to change it.
- Abbreviations can wait for Space, Tab, or Enter instead of expanding at once, and work with Japanese, Chinese, and Korean input methods. A button in the panel, or a list in Settings, turns the double tap and abbreviations off on a site. Keys typed while an abbreviation expands in a rich editor now go in after the snippet.
- The panel opens above dialogs, popovers, and fullscreen elements, and fits short windows and high zoom.
- Screen readers announce field errors in the panel and the manager, and read the panel list as a list box. Tab stays in the panel, F2 edits the highlighted snippet, and the manager list is one Tab stop. The Ctrl shortcuts work on any keyboard layout, and a narrow manager window shows the editor under the list.
- A failed action shows a message, and a panel left open no longer saves an abbreviation that another tab took meanwhile.
- Search finds Chinese, Japanese, and Thai text anywhere, also searches folder names, and finds "école" in "l'école". Tabs stay tabs in rich editors, and an emoji counts as one character in names and folders.
- Settings and backup links to Ko-fi for optional donations.

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
