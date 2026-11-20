// Clicking the toolbar icon opens the settings page, because the snippets themselves are
// managed from the in-page panel.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
