/*
 * Service worker: the toolbar icon, the right-click menu items, and the keyboard shortcut.
 *
 * The menu items and the shortcut do no work of their own. They send a message to the content
 * script in the page, which opens the panel the same way the double tap does.
 */
'use strict';

const MENU_SAVE = 'save-selection';
const MENU_INSERT = 'insert-snippet';
const COMMAND_OPEN = 'open-panel';
// The manager reads this from session storage when it opens at #new.
const PENDING_KEY = 'pendingSnippet';

// Chromium keeps menu items across service worker restarts, so they are created once per
// install or update. Removing them first avoids a duplicate-id error on update.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_SAVE, title: 'Save selection as snippet', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU_INSERT, title: 'Insert snippet...', contexts: ['editable'] });
  });
});

// Opens the manager with a new snippet that holds `text`. Used where no content script runs,
// such as browser pages, the Chrome Web Store, and the PDF viewer.
async function openManagerWithText(text) {
  await chrome.storage.session.set({ [PENDING_KEY]: text || '' });
  await chrome.tabs.create({ url: chrome.runtime.getURL('options.html#new') });
}

// The menu item goes to the frame that was right-clicked. Every content script answers, so a
// failed send means the page has none.
async function onMenuClick(info, tab) {
  if (!tab || tab.id === undefined) return;
  const type = info.menuItemId === MENU_SAVE ? 'save-selection' : 'open-panel';
  const options = typeof info.frameId === 'number' ? { frameId: info.frameId } : undefined;
  try {
    await chrome.tabs.sendMessage(tab.id, { type, source: 'menu' }, options);
  } catch {
    // The menu's own selectionText has its line breaks collapsed, so it is only the fallback.
    if (type === 'save-selection') await openManagerWithText(info.selectionText);
  }
}

// The shortcut goes to every frame of the tab; the frame that has the focus opens the panel.
async function onCommand(command, tab) {
  if (command !== COMMAND_OPEN || !tab || tab.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'open-panel', source: 'shortcut' });
  } catch {
    // No content script on this page; the shortcut does nothing here.
  }
}

chrome.contextMenus.onClicked.addListener(onMenuClick);
chrome.commands.onCommand.addListener(onCommand);

// The toolbar icon opens the snippet manager.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// The tests call these directly, because Playwright cannot open the browser's own menu or press
// an extension command.
self.snippetInserter = { onMenuClick, onCommand };
