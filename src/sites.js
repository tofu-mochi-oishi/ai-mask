// 対応サイトごとの入力欄・送信ボタンの探し方。
// 拡張機能（content.js）と、画面変更チェック（monitor/check-sites.mjs）の両方がこのファイルを使う。
// AIサイトの画面が変わったときは、ここだけを直せばよい。
(function (root) {
  'use strict';

  const SITES = {
    'chatgpt.com': {
      name: 'ChatGPT',
      url: 'https://chatgpt.com/',
      // 2026-10-16 確認：ログイン後は div.ProseMirror と「送信」ボタン、ログイン前は textarea[name="prompt"] と「メッセージを送信します」
      editor: '#prompt-textarea, div.ProseMirror[contenteditable="true"], textarea[name="prompt"]',
      send: '[data-testid="send-button"], #composer-submit-button, button[aria-label="送信"], button[aria-label="Send"], button[aria-label="メッセージを送信します"], button[aria-label="Send prompt"]',
    },
    'claude.ai': {
      name: 'Claude',
      url: 'https://claude.ai/new',
      editor: 'div.ProseMirror[contenteditable="true"]',
      send: 'button[aria-label="Send message"], button[aria-label="メッセージを送信"]',
    },
    'gemini.google.com': {
      name: 'Gemini',
      url: 'https://gemini.google.com/app',
      editor: 'rich-textarea [contenteditable="true"]',
      send: 'button.send-button, button[aria-label="Send message"], button[aria-label="プロンプトを送信"]',
    },
  };
  // サイト別の指定で見つからないときに使う、汎用の探し方
  const GENERIC_EDITOR = '[contenteditable="true"], textarea';
  const GENERIC_SEND = 'button[data-testid*="send" i], button[aria-label*="send" i], button[aria-label*="送信"]';

  root.AIMaskSites = { SITES, GENERIC_EDITOR, GENERIC_SEND };
})(globalThis);
