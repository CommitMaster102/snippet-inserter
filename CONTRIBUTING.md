# Contributing

Bug reports, feature requests, and pull requests are welcome. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Report a bug or suggest a feature

Open an issue and pick the bug report or feature request form. Issues are public, so use a made-up snippet in examples. Report a security problem privately, as [SECURITY.md](SECURITY.md) describes.

## Change the code

1. Fork the repository and create a branch from `main`.
2. Run `npm install`, then `npm run browsers` to download the browser the tests use.
3. Load the `extension` folder as the README's "Install from source" section describes, and try the change.
4. Run `npm run test:unit` and `npm test`. A change in behavior needs a test that covers it. The README's Tests section describes the suite.
5. Leave `version` in `extension/manifest.json` unchanged. The version goes up when a release is uploaded to the Chrome Web Store.
6. Open a pull request that says what changed and why.

Contributions are licensed under the MIT license in [LICENSE](LICENSE).
