/*
 * Runs before the bundled Prism files on the manager page. Prism highlights every code element on
 * a page by itself unless this setting is made first, and the manager only wants the token list
 * that lib/highlight.js asks for.
 */
window.Prism = { manual: true, disableWorkerMessageHandler: true };
