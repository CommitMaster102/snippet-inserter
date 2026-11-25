# Contributing

Bug reports, feature requests, and pull requests are welcome. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Report a bug or suggest a feature

Open an issue and pick the bug report or feature request form. Issues are public, so use a made-up snippet in examples. Report a security problem privately, as [SECURITY.md](SECURITY.md) describes.

## Change the code

1. Fork the repository and create a branch from `main`.
2. Run `npm install`, then `npm run browsers` to download the browser the tests use.
3. Load the `extension` folder as the README's "Install from source" section describes, and try the change.
4. Run `npm run test:unit` and `npm test`. A change in behavior needs a test that covers it. The README's Tests section describes the suite.
5. Write any text a person reads in `extension/_locales/en/messages.json`, with a note for translators in its `description`. The pages ask for it with `t()` and `plural()` from `lib/i18n.js` or a `data-i18n` attribute, and the content scripts with `chrome.i18n.getMessage`. Write the key as a string in the call, because `npm run test:unit` finds the keys in use that way. Put numbers, names, key names such as Ctrl, and syntax such as `{date}` in `$placeholders$`, and a message that is given a count needs plural forms. Format a number with `i18n.number` so it has the digits of the interface language.
6. Leave `version` in `extension/manifest.json` unchanged. The version goes up when a release is uploaded to the Chrome Web Store.
7. Open a pull request that says what changed and why.

Contributions are licensed under the MIT license in [LICENSE](LICENSE).
