// コンテンツスクリプト：AIサイトの入力欄で送信に割り込み、伏せ字にしてから送信する。
// 返答などに出てくる記号は、画面上だけ元の値に戻して表示する。
(function () {
  'use strict';

  const { detect, applyMask } = globalThis.AIMaskDetect;
  const vault = globalThis.AIMaskVault;
  const TAG = '[AI伏せ字ガード]';

  // サイトごとの入力欄・送信ボタン（見つからなければ汎用の探し方に切り替える）
  const SITES = {
    'chatgpt.com': {
      editor: '#prompt-textarea',
      send: '[data-testid="send-button"], #composer-submit-button',
    },
    'claude.ai': {
      editor: 'div.ProseMirror[contenteditable="true"]',
      send: 'button[aria-label="Send message"], button[aria-label="メッセージを送信"]',
    },
    'gemini.google.com': {
      editor: 'rich-textarea [contenteditable="true"]',
      send: 'button.send-button, button[aria-label="Send message"], button[aria-label="プロンプトを送信"]',
    },
  };
  const site = SITES[location.hostname] || {};
  const GENERIC_SEND = 'button[data-testid*="send" i], button[aria-label*="send" i], button[aria-label*="送信"]';

  // AIが記号を「埋め忘れたテンプレートの空欄」と誤解しないよう、伏せ字にしたメッセージの末尾に付ける注記
  const NOTE =
    '（注：【】で囲んだ記号は、個人情報保護のために伏せ字にした実在の情報です。テンプレートの空欄ではありません。記号のまま使って回答してください。）';

  let settings = { enabled: true, addNote: true, disabled: [], dictionary: [], exclusions: [] };
  let bypass = false; // 自分で送信し直すときは割り込まない

  // ---------- 設定 ----------
  async function loadSettings() {
    const got = await chrome.storage.local.get('settings');
    settings = { ...settings, ...(got.settings || {}) };
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) settings = { ...settings, ...changes.settings.newValue };
  });
  const detectOpts = () => ({
    dictionary: settings.dictionary,
    exclusions: settings.exclusions,
    disabled: settings.disabled,
  });

  // ---------- 入力欄の操作 ----------
  function findEditor(from) {
    const el = from && from.closest && from.closest('[contenteditable="true"], textarea');
    if (el && !el.closest('.aimask-ui')) return el;
    return (site.editor && document.querySelector(site.editor)) || document.querySelector('[contenteditable="true"], textarea');
  }

  function findSendButton() {
    return (site.send && document.querySelector(site.send)) || document.querySelector(GENERIC_SEND);
  }

  // 入力欄の文章を取り出す（段落ごとに改行1つで連結する）
  function editorText(ed) {
    if (ed.tagName === 'TEXTAREA') return ed.value;
    const blocks = Array.from(ed.children);
    if (blocks.length && blocks.every((b) => /^(P|DIV|H[1-6]|LI|UL|OL|PRE|BLOCKQUOTE)$/.test(b.tagName))) {
      return blocks.map((b) => b.innerText.replace(/\n$/, '')).join('\n');
    }
    return ed.innerText.replace(/\n$/, '');
  }

  const squash = (s) => s.replace(/\s+/g, '');

  // 入力欄の文章を置き換える。サイト側の内部状態と同期させるため、貼り付け操作として流し込む
  async function replaceEditorText(ed, text) {
    ed.focus();
    if (ed.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ed, text);
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    const selectAll = () => {
      const range = document.createRange();
      range.selectNodeContents(ed);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    // 1回目：貼り付けイベント（ProseMirror や Quill が正しく処理する）
    selectAll();
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await frames(2);
    if (squash(editorText(ed)) === squash(text)) return true;
    // 2回目：文字入力コマンド
    selectAll();
    document.execCommand('insertText', false, text);
    await frames(2);
    return squash(editorText(ed)) === squash(text);
  }

  const frames = (n) =>
    new Promise((resolve) => {
      const step = (i) => (i <= 0 ? resolve() : requestAnimationFrame(() => step(i - 1)));
      step(n);
    });

  // ---------- 送信への割り込み ----------
  function pendingHits(ed) {
    if (!settings.enabled || !ed) return [];
    return detect(editorText(ed), detectOpts());
  }

  async function maskAndSend(ed, hits, how) {
    const original = editorText(ed);
    let masked = applyMask(original, hits, vault.assign);
    if (settings.addNote !== false) masked += '\n\n' + NOTE;
    await vault.save();
    const ok = await replaceEditorText(ed, masked);
    if (!ok) {
      // 伏せ字にできなかった場合は、元の文章を送らないよう送信を止める
      showChip(`⚠ 伏せ字にできなかったため、送信を止めました。入力欄を確認してください。`, 'error', 8000);
      console.warn(TAG, '入力欄の書き換えに失敗しました');
      return;
    }
    await frames(2);
    bypass = true;
    try {
      const btn = findSendButton();
      if (btn && !btn.disabled) {
        btn.click();
      } else if (how === 'enter') {
        ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      } else {
        showChip('伏せ字にしました。もう一度送信してください。', 'info', 6000);
        return;
      }
    } finally {
      setTimeout(() => (bypass = false), 0);
    }
    const kinds = [...new Set(hits.map((h) => h.type))].join('・');
    showChip(`🛡 ${hits.length}件を伏せ字にして送信しました（${kinds}）`, 'ok', 5000);
    bumpStats(hits.length);
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (bypass || e.key !== 'Enter' || e.shiftKey || e.altKey) return;
      if (e.isComposing || e.keyCode === 229) return; // 日本語変換の確定 Enter は対象外
      const ed = e.target && e.target.closest && e.target.closest('[contenteditable="true"], textarea');
      if (!ed || ed.closest('.aimask-ui')) return;
      const hits = pendingHits(ed);
      if (!hits.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      maskAndSend(ed, hits, 'enter');
    },
    true,
  );

  window.addEventListener(
    'click',
    (e) => {
      if (bypass) return;
      const btn = e.target && e.target.closest && e.target.closest('button');
      if (!btn) return;
      const sendBtn = findSendButton();
      if (!sendBtn || (btn !== sendBtn && !btn.matches(GENERIC_SEND))) return;
      const ed = findEditor(null);
      const hits = pendingHits(ed);
      if (!hits.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      maskAndSend(ed, hits, 'click');
    },
    true,
  );

  // ---------- 入力中の目印（送信前に下線で知らせる） ----------
  const supportsHighlight = typeof Highlight !== 'undefined' && CSS.highlights;
  const pendingHL = supportsHighlight ? new Highlight() : null;
  const restoredHL = supportsHighlight ? new Highlight() : null;
  if (supportsHighlight) {
    CSS.highlights.set('aimask-pending', pendingHL);
    CSS.highlights.set('aimask-restored', restoredHL);
    const style = document.createElement('style');
    style.textContent =
      '::highlight(aimask-pending){text-decoration:underline wavy #d93025;text-decoration-thickness:1.5px;background:rgba(217,48,37,.08)}' +
      '::highlight(aimask-restored){background:rgba(26,115,232,.12);text-decoration:underline dotted rgba(26,115,232,.7)}';
    document.documentElement.appendChild(style);
  }

  let inputTimer = 0;
  document.addEventListener(
    'input',
    (e) => {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => refreshPending(findEditor(e.target)), 250);
    },
    true,
  );

  function refreshPending(ed) {
    if (!pendingHL) return;
    pendingHL.clear();
    if (!settings.enabled || !ed || ed.tagName === 'TEXTAREA') return updatePendingChip(0);
    let count = 0;
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const h of detect(node.nodeValue, detectOpts())) {
        const r = new Range();
        r.setStart(node, h.start);
        r.setEnd(node, h.end);
        pendingHL.add(r);
        count++;
      }
    }
    updatePendingChip(count);
  }

  function updatePendingChip(count) {
    if (count > 0) showChip(`🛡 個人情報らしき箇所 ${count}件：送信時に伏せ字にします`, 'info', 0, 'pending');
    else hideChip('pending');
  }

  // ---------- 返答などの記号を元の値に戻して表示 ----------
  const PH_RE = /【[^【】\s]{1,20}?\d{1,4}】/g;

  function restoreNode(node) {
    let v = node.nodeValue;
    if (!v || !v.includes('【')) return;
    const parent = node.parentElement;
    if (!parent || parent.closest('[contenteditable="true"], textarea, .aimask-ui, script, style')) return;
    let changed = false;
    // 自分が付けた注記は画面上では表示しない
    if (v.includes(NOTE)) {
      v = v.replace(NOTE, '').replace(/\s+$/, '');
      changed = true;
    }
    const spans = [];
    let out = '';
    let pos = 0;
    for (const m of v.matchAll(PH_RE)) {
      const real = vault.lookup(m[0]);
      if (real === undefined) continue;
      out += v.slice(pos, m.index);
      spans.push([out.length, out.length + real.length]);
      out += real;
      pos = m.index + m[0].length;
      changed = true;
    }
    if (!changed) return;
    out += v.slice(pos);
    node.nodeValue = out;
    if (spans.length) restoredNodes.add(node);
    if (restoredHL) {
      for (const [s, e] of spans) {
        const r = new Range();
        r.setStart(node, s);
        r.setEnd(node, e);
        restoredHL.add(r);
      }
    }
  }

  // 文字列中の記号を元の値に戻す（コピー用）
  function restoreString(text) {
    return text.replace(NOTE, '').replace(PH_RE, (ph) => vault.lookup(ph) ?? ph);
  }

  function restoreTree(rootNode) {
    if (rootNode.nodeType === Node.TEXT_NODE) return restoreNode(rootNode);
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) restoreNode(n);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') restoreNode(m.target);
      else m.addedNodes.forEach((n) => restoreTree(n));
    }
  });

  // ---------- コピーボタン対策 ----------
  // サイトのコピーボタンは内部の文章（記号入り）をコピーするため、
  // 押された直後に「元の値に戻した表示中の文章」でクリップボードを上書きする。
  // 元の値はページ側のプログラムには渡さない（拡張の隔離された環境の中だけで扱う）
  const restoredNodes = new Set();
  const COPY_BUTTON =
    'button[aria-label*="copy" i], button[aria-label*="コピー"], button[data-testid*="copy" i], button[title*="copy" i], button[title*="コピー"]';

  function messageTextFor(btn) {
    for (const n of restoredNodes) if (!n.isConnected) restoredNodes.delete(n);
    // ボタンから親をたどり、元の値に戻した箇所を含む最初の要素を「その返答」とみなす
    let container = btn.parentElement;
    for (let i = 0; container && i < 12; i++, container = container.parentElement) {
      if ([...restoredNodes].some((n) => container.contains(n))) break;
    }
    if (!container) return null;
    // ボタンを含む部分（操作バーなど）を除いた文章を集める
    const parts = Array.from(container.children)
      .filter((c) => !c.contains(btn) && !c.classList.contains('aimask-ui'))
      .map((c) => c.innerText.trim())
      .filter(Boolean);
    return restoreString(parts.join('\n\n'));
  }

  window.addEventListener(
    'click',
    (e) => {
      const btn = e.target && e.target.closest && e.target.closest(COPY_BUTTON);
      if (!btn || !settings.enabled) return;
      const text = messageTextFor(btn);
      if (!text) return;
      // サイト側の書き込みが終わった後に上書きする（遅れて書き込むサイトに備えて2回）
      const write = () => navigator.clipboard.writeText(text).catch((err) => console.warn(TAG, 'コピーの上書きに失敗', err));
      setTimeout(write, 150);
      setTimeout(() => {
        write();
        showChip('🛡 元の値に戻した文章をコピーしました（書式は簡略化）', 'ok', 4000);
      }, 600);
    },
    true,
  );

  // ---------- 画面右下の小さな通知 ----------
  const chips = {};
  function showChip(text, kind, ms, id = 'toast') {
    let el = chips[id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'aimask-ui';
      el.setAttribute('role', 'status');
      Object.assign(el.style, {
        position: 'fixed', right: '16px', zIndex: 2147483647, maxWidth: '360px', padding: '8px 12px',
        borderRadius: '8px', font: '13px/1.5 system-ui, sans-serif', boxShadow: '0 2px 10px rgba(0,0,0,.2)',
        pointerEvents: 'none',
      });
      el.style.bottom = id === 'pending' ? '16px' : '64px';
      document.documentElement.appendChild(el);
      chips[id] = el;
    }
    const colors = { info: ['#e8f0fe', '#174ea6'], ok: ['#e6f4ea', '#137333'], error: ['#fce8e6', '#a50e0e'] }[kind];
    el.style.background = colors[0];
    el.style.color = colors[1];
    el.textContent = text;
    el.hidden = false;
    clearTimeout(el._t);
    if (ms) el._t = setTimeout(() => (el.hidden = true), ms);
  }
  function hideChip(id) {
    if (chips[id]) chips[id].hidden = true;
  }

  // 伏せ字にした件数（ポップアップで表示）
  async function bumpStats(n) {
    try {
      const got = await chrome.storage.session.get('stats');
      const stats = got.stats || { masked: 0 };
      stats.masked += n;
      await chrome.storage.session.set({ stats });
    } catch {
      // 統計は必須ではないので失敗は無視する
    }
  }

  // ---------- 起動 ----------
  (async () => {
    await Promise.all([loadSettings(), vault.load()]);
    restoreTree(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  })();
})();
