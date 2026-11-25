# Contributing

Bug reports, feature requests, and pull requests are welcome. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Report a bug or suggest a feature

Open an issue and pick the bug report or feature request form. For a wrong or unclear translation, pick the Translation problem form. Issues are public, so use a made-up snippet in examples. Report a security problem privately, as [SECURITY.md](SECURITY.md) describes.

## Fix a translation

Every translation was drafted by a language model, so fixes from people who speak the language are the most useful contribution. To report a problem without changing a file, open the Translation problem form. Settings and backup links to it in every language except English.

To fix the text yourself:

1. Open `extension/_locales/<code>/messages.json`, where `<code>` is the folder named after the language, such as `de` or `pt_BR`. The English file, `extension/_locales/en/messages.json`, has a `description` on each message that says where the text appears and, for a spot with little room, how many characters it may have. Each translation file has an English copy of these descriptions, but a description is changed only in the English file, so read it there.
2. Change only the `message` text. Keep every `$PLACEHOLDER$`, every `<kbd>...</kbd>` pair, and the names in `placeholders` as they are. Leave `{date}`, `{input:Name}`, `;addr`, Snippet Inserter, Google Docs, and Ko-fi untranslated. Write the text yourself, and do not copy the translations of another extension.
3. Use the terms for your language in [docs/translation-glossary.md](docs/translation-glossary.md), so that each thing has one name in the panel, the manager, and the menus. Corrections to a glossary term are welcome too.
4. Run `npm run test:locales`. It checks that the file has every message, the same placeholders as English, the plural forms your language uses, and no text longer than the character budget for its spot. Run `npm run test:unit` as well.
5. Open a pull request that names the language and says whether you speak it natively. The [Languages section of the user guide](docs/user-guide.md#languages) lists the languages that a native speaker has reviewed.

## Change the code

1. Fork the repository and create a branch from `main`.
2. Run `npm install`, then `npm run browsers` to download the browser the tests use.
3. Load the `extension` folder as the README's "Install from source" section describes, and try the change.
4. Run `npm run test:unit` and `npm test`. A change in behavior needs a test that covers it. The [Tests section of docs/development.md](docs/development.md#tests) describes the suite.
5. Write any text a person reads in `extension/_locales/en/messages.json`, with a note for translators in its `description`. The pages ask for it with `t()` and `plural()` from `lib/i18n.js` or a `data-i18n` attribute, and the content scripts with `chrome.i18n.getMessage`. Write the key as a string in the call, because `npm run test:unit` finds the keys in use that way. Put numbers, names, key names such as Ctrl, and syntax such as `{date}` in `$placeholders$`, and a message that is given a count needs plural forms. Format a number with `i18n.number` so it has the digits of the interface language.
6. Leave `version` in `extension/manifest.json` unchanged. The version goes up when a release is uploaded to the Chrome Web Store.
7. Open a pull request that says what changed and why.

Contributions are licensed under the MIT license in [LICENSE](LICENSE).

## Release a version

A pre-push hook stops a push that changes the version while the docs are stale. The version is `version` in `package.json` and in `extension/manifest.json`. `npm install` turns the hook on by setting `core.hooksPath` to `.githooks`. If `core.hooksPath` is already set, `npm install` leaves it and prints the command that turns the hook on. Outside a git checkout, such as in an unpacked source archive, it does nothing.

The hook compares each pushed branch with that branch on the remote. A new branch has no commit there, so the hook compares it with the commit where it leaves the remote's default branch, such as `origin/HEAD`. If the remote has no default branch in your clone, the hook uses the nearest commit that the new branch shares with a remote-tracking branch, and if there is none, the repository's first commit. When neither version differs from the compared commit, the hook does nothing. When one differs, it checks that:

- `CHANGELOG.md` has a heading for the new version, outside code blocks and HTML comments. A pre-release heading, such as `1.3.0-rc.1`, does not count.
- `extension/manifest.json` has the same version as `package.json`.
- `docs/doc-review.json` lists every tracked Markdown file at the new version, and lists no file that is gone.
- No commit after the last change to `docs/doc-review.json` changes anything under `extension/`, whether or not the push carries that commit.
- Every relative link and `#anchor` in the Markdown files resolves, including the `href` of an `<a>` tag and the `src` of an `<img>` tag. Links in code and in HTML comments are not checked.
- In every Markdown file, a size written as `` `file.js`, N bytes `` matches that file, and a count written as "N languages besides English" matches the language folders in `extension/_locales` other than English. Other wordings, such as "`file.js` is N bytes long", are not checked.

To release, change the code first. Then read each Markdown file against the code and fix what is out of date. In one commit after the last code change, set each file's version in `docs/doc-review.json` to the new version, raise `version` in `package.json` and `extension/manifest.json`, and add the changelog entry. `node scripts/check-release-docs.js <local-sha> <remote-sha>` runs the check by hand, with a third argument for a remote other than `origin`, and `git push --no-verify` skips it.
