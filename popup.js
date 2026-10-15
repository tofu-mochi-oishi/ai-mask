// ポップアップ：有効/無効の切り替えと、伏せ字にした件数の表示
const $ = (id) => document.getElementById(id);

(async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  $('enabled').checked = settings.enabled !== false;
  const { stats } = await chrome.storage.session.get('stats');
  $('masked').textContent = String((stats && stats.masked) || 0);
})();

$('enabled').addEventListener('change', async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, enabled: $('enabled').checked } });
});

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
