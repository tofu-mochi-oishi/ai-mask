# プライバシーポリシー – AI伏せ字ガード

最終更新日：2026-10-16

AI伏せ字ガード（以下「本拡張機能」）は、個人情報を伏せ字にするという目的のために、下の表の情報を利用者の端末内で扱います。Chromeウェブストアの区分では「個人を特定できる情報」「財務状況や支払いに関する情報」（カード番号）「ウェブサイトのコンテンツ」に当たります。これらの情報を、開発者のサーバーや第三者へ送信・販売することはありません。

## 本拡張機能が扱う情報と保存場所
| 情報 | 用途 | 保存場所 |
|---|---|---|
| 対応サイトの入力欄に書いた文章 | 個人情報らしき箇所を見つけ、送信前に記号へ置き換えるため | 保存しません（その場で処理するだけです） |
| 記号と元の値の対応表（例：【氏名1】＝山田太郎） | AIの返答に出てきた記号を、画面上で元の値に戻して表示するため | `chrome.storage.session`（ブラウザのメモリ内。ブラウザを閉じると消えます） |
| 設定・登録語・伏せ字にしない語 | 利用者が指定したとおりに動作するため | `chrome.storage.local`（この端末内） |
| 伏せ字にした件数 | ポップアップに表示するため | `chrome.storage.session`（ブラウザを閉じると消えます） |

- これらの情報は、すべて利用者の端末の中だけで処理します。開発者のサーバーや第三者へ送信することはありません。
- アクセス解析・広告・トラッキングは使用していません。リモートのコードも読み込みません。
- 本拡張機能が動作するのは chatgpt.com、claude.ai、gemini.google.com のページだけです。

## AIサービスへの送信について
利用者が送信ボタンを押した文章は、各AIサービスへ送られます（これは本拡張機能ではなく、利用者と各サービスとの間の通信です）。本拡張機能は、送信の直前に、見つけた個人情報を記号に置き換えます。ただし、すべての個人情報を確実に見つけられるわけではありません。送られた文章の取り扱いは、各AIサービスのプライバシーポリシーに従います。

## お問い合わせ
nabesukishahu@gmail.com

---

# Privacy Policy – AI Fuseji Guard (English summary)

AI Fuseji Guard handles personal data only on your device, for the single purpose of masking it. In Chrome Web Store terms this covers personally identifiable information, financial and payment information (card numbers) and website content. This data is never transmitted to the developer or any third party, and never sold. Text typed into the supported sites (chatgpt.com, claude.ai, gemini.google.com) is processed only on your device to replace personal information with placeholders before you send it. The placeholder-to-original mapping is kept in `chrome.storage.session` (memory, cleared when the browser closes); settings and your word list are kept in `chrome.storage.local` on your device. No analytics, advertising, tracking, remote code or remote servers are used. The text you choose to send is delivered to the AI service you use, under that service's privacy policy.

Contact: nabesukishahu@gmail.com
