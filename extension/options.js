// Settings page: stores which key opens the snippet panel when tapped twice.
'use strict';

const select = document.getElementById('hotkey');
const status = document.getElementById('status');

chrome.storage.local.get('settings').then((stored) => {
  select.value = (stored.settings && stored.settings.hotkey) || 'Control';
});

select.addEventListener('change', async () => {
  const stored = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...(stored.settings || {}), hotkey: select.value } });
  status.textContent = 'Saved. Open pages pick up the change right away.';
});
