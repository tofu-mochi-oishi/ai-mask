// バックグラウンド：対応表（storage.session）をコンテンツスクリプトからも読み書きできるようにする
function allowSessionAccess() {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
}
allowSessionAccess();
chrome.runtime.onStartup.addListener(allowSessionAccess);
chrome.runtime.onInstalled.addListener((details) => {
  allowSessionAccess();
  // 初回インストール時は使い方（設定画面）を開く
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
