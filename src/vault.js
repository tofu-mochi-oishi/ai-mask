// 伏せ字の対応表：元の値 ⇔ 【氏名1】のような記号
// chrome.storage.session（ブラウザを閉じると消えるメモリ領域）に保存し、ディスクには残さない
(function (root) {
  'use strict';

  const KEY = 'vault';
  let state = { byKey: {}, byPh: {}, counters: {} };
  let saving = Promise.resolve();

  async function load() {
    try {
      const got = await chrome.storage.session.get(KEY);
      if (got[KEY]) state = got[KEY];
    } catch (e) {
      // バックグラウンドの準備前などで読めない場合は空のまま使う
      console.warn('[AI伏せ字ガード] 対応表を読み込めませんでした', e);
    }
  }

  // 他のタブで割り当てた記号も共有する
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[KEY] && changes[KEY].newValue) state = changes[KEY].newValue;
  });

  // 値に記号を割り当てる（同じ種類・同じ値なら同じ記号）
  function assign(type, value) {
    const key = `${type}\u0000${value}`;
    if (state.byKey[key]) return state.byKey[key];
    const n = (state.counters[type] || 0) + 1;
    state.counters[type] = n;
    const ph = `【${type}${n}】`;
    state.byKey[key] = ph;
    state.byPh[ph] = value;
    return ph;
  }

  function save() {
    saving = saving.then(() => chrome.storage.session.set({ [KEY]: state })).catch((e) => {
      console.warn('[AI伏せ字ガード] 対応表を保存できませんでした', e);
    });
    return saving;
  }

  const lookup = (ph) => state.byPh[ph];
  const size = () => Object.keys(state.byPh).length;

  root.AIMaskVault = { load, assign, save, lookup, size };
})(globalThis);
