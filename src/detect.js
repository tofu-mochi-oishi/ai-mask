// 検出エンジン：文章から日本語の個人情報・登録語を見つける
// DOMに依存しない純粋な関数だけで構成し、Node のテストからも読み込めるようにしている
(function (root) {
  'use strict';

  // 全角英数字・記号とハイフン類を半角に1文字ずつ置き換える
  // （1文字→1文字なので、正規化後の位置がそのまま元の文章の位置になる）
  function normalize(text) {
    let out = '';
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (ch.length === 1 && c >= 0xff01 && c <= 0xff5e) out += String.fromCharCode(c - 0xfee0);
      else if ('‐‑‒–—―−'.includes(ch)) out += '-';
      else if (ch === '　') out += ' ';
      else out += ch;
    }
    return out;
  }

  const digitsOf = (s) => s.replace(/\D/g, '');

  // マイナンバー（12桁）のチェックデジット検証
  function isValidMyNumber(d) {
    if (!/^\d{12}$/.test(d)) return false;
    let sum = 0;
    for (let n = 1; n <= 11; n++) {
      const p = Number(d[11 - n]);
      const q = n <= 6 ? n + 1 : n - 5;
      sum += p * q;
    }
    const r = sum % 11;
    const check = r <= 1 ? 0 : 11 - r;
    return check === Number(d[11]);
  }

  // 法人番号（13桁、先頭がチェックデジット）の検証
  function isValidCorporateNumber(d) {
    if (!/^\d{13}$/.test(d)) return false;
    const base = d.slice(1);
    let sum = 0;
    for (let n = 1; n <= 12; n++) {
      const p = Number(base[12 - n]);
      sum += p * (n % 2 === 1 ? 1 : 2);
    }
    return 9 - (sum % 9) === Number(d[0]);
  }

  // クレジットカード番号の Luhn 検証
  function isValidLuhn(d) {
    if (!/^\d{13,19}$/.test(d)) return false;
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      let x = Number(d[d.length - 1 - i]);
      if (i % 2 === 1) {
        x *= 2;
        if (x > 9) x -= 9;
      }
      sum += x;
    }
    return sum % 10 === 0;
  }

  const PREFS =
    '北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|' +
    '新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|' +
    '奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|' +
    '熊本県|大分県|宮崎県|鹿児島県|沖縄県';

  // 「〇〇さん」などの直前にあっても人名ではない語
  const NAME_STOPWORDS = new Set([
    '皆', '客', '各位', '神', '王', '奥', '患者', '利用者', '担当者', '関係者', '先生', '社員', '会員', '皆々',
    '店員', '職員', '学生', '生徒', '家族', '親御', '貴社', '御社', '弊社', '当社', 'お客', '業者', '大家', '殿',
  ]);

  // 検出器の一覧（priority が大きいものを重なり時に優先）
  const DETECTORS = [
    {
      type: 'メール',
      priority: 90,
      find(n) {
        return matchAll(n, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g);
      },
    },
    {
      type: 'マイナンバー',
      priority: 100,
      find(n) {
        return matchAll(n, /(?<![\d-]|\d )\d{4}[ -]?\d{4}[ -]?\d{4}(?![\d-]| \d)/g).filter((m) => isValidMyNumber(digitsOf(m.text)));
      },
    },
    {
      type: '法人番号',
      priority: 100,
      find(n) {
        return matchAll(n, /(?<![\d-]|\d )\d{13}(?![\d-]| \d)/g).filter((m) => isValidCorporateNumber(m.text));
      },
    },
    {
      type: 'カード番号',
      priority: 95,
      find(n) {
        return matchAll(n, /(?<![\d-]|\d )\d(?:[ -]?\d){12,18}(?![\d-]| \d)/g).filter((m) => isValidLuhn(digitsOf(m.text)));
      },
    },
    {
      type: '電話番号',
      priority: 80,
      find(n) {
        return matchAll(n, /(?<![\d-])(?:\+81[ -]?|0)\d{1,4}(?:[ -]|\(|\)|- ?)?\d{1,4}(?:[ -]|\)|- ?)?\d{3,4}(?![\d-])/g).filter(
          (m) => {
            const d = digitsOf(m.text);
            if (m.text.startsWith('+81')) return d.length === 11 || d.length === 12;
            return d.length === 10 || d.length === 11;
          },
        );
      },
    },
    {
      type: '住所',
      priority: 70,
      find(n) {
        // 都道府県から番地（数字）までを住所とみなす
        const re = new RegExp(
          `(?:〒\\s?\\d{3}-?\\d{4}\\s*)?(?:${PREFS})[^\\s、。,「」『』()（）\\n]{1,30}?\\d+(?:(?:丁目|番地|番|号|-|の)\\d+)*(?:番地|番|号)?`,
          'g',
        );
        return matchAll(n, re);
      },
    },
    {
      type: '郵便番号',
      priority: 60,
      find(n) {
        const a = matchAll(n, /〒\s?\d{3}-?\d{4}/g);
        const b = matchGroup(n, /郵便番号\s*[:：]?\s*(\d{3}-?\d{4})/dg, 1);
        return a.concat(b);
      },
    },
    {
      type: '氏名',
      priority: 50,
      find(n) {
        const results = [];
        // 「氏名：山田太郎」のような項目名つきの記述
        results.push(
          ...matchGroup(
            n,
            /(?:氏名|名前|お名前|フルネーム|担当者?|宛名|申請者|患者名?|顧客名|契約者|依頼者)\s*[:：]\s*([一-龥々ぁ-んァ-ヶー]{1,6}(?:[ 　][一-龥々ぁ-んァ-ヶー]{1,6})?)/dg,
            1,
          ),
        );
        // 「田中様」「山田太郎さん」のような敬称つきの記述
        for (const m of matchGroup(n, /(?<![一-龥々ァ-ヶー])((?:[一-龥々]{1,4}[ 　]?[一-龥々]{1,4})|[ァ-ヶー]{2,8})(?:様|さん|殿|氏(?!名))/dg, 1)) {
          const prev = n[m.start - 1];
          if (prev === 'お' || prev === 'ご' || prev === '御') continue;
          if (NAME_STOPWORDS.has(m.text)) continue;
          results.push(m);
        }
        return results;
      },
    },
  ];

  function matchAll(text, re) {
    const out = [];
    for (const m of text.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    return out;
  }

  // 正規表現の n 番目のグループだけを取り出す（d フラグで位置を得る）
  function matchGroup(text, re, group) {
    const out = [];
    for (const m of text.matchAll(re)) {
      const idx = m.indices && m.indices[group];
      if (!idx) continue;
      out.push({ start: idx[0], end: idx[1], text: text.slice(idx[0], idx[1]) });
    }
    return out;
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * 文章から伏せ字にすべき箇所を探す
   * @param {string} text 元の文章
   * @param {object} opts
   *   dictionary: [{ term, label }] 登録語（label は伏せ字の名前。省略時は「登録語」）
   *   exclusions: [string] 伏せ字にしない語
   *   disabled:   [string] 無効にする検出の種類（例: ['氏名']）
   * @returns {Array<{start,end,text,type}>} 位置順・重なりなし
   */
  function detect(text, opts = {}) {
    const n = normalize(text);
    const disabled = new Set(opts.disabled || []);
    const exclusions = new Set((opts.exclusions || []).map((s) => normalize(s).trim()).filter(Boolean));
    const found = [];

    // 登録語は最優先
    for (const entry of opts.dictionary || []) {
      const term = normalize(entry.term || '').trim();
      if (!term) continue;
      const re = new RegExp(escapeRe(term), 'gi');
      for (const m of matchAll(n, re)) found.push({ ...m, type: entry.label || '登録語', priority: 200 });
    }
    for (const d of DETECTORS) {
      if (disabled.has(d.type)) continue;
      for (const m of d.find(n)) found.push({ ...m, type: d.type, priority: d.priority });
    }

    // 重なりの解消：優先度が高く、長いものを残す
    found.sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || a.start - b.start);
    const kept = [];
    for (const f of found) {
      if (exclusions.has(f.text.trim())) continue;
      if (kept.some((k) => f.start < k.end && k.start < f.end)) continue;
      kept.push(f);
    }
    kept.sort((a, b) => a.start - b.start);
    // 返す text は正規化前の元の文字列
    return kept.map((k) => ({ start: k.start, end: k.end, type: k.type, text: text.slice(k.start, k.end) }));
  }

  /**
   * 検出箇所を伏せ字の記号に置き換える
   * @param {string} text
   * @param {Array} hits detect() の結果
   * @param {(type:string, value:string) => string} assign 値に記号を割り当てる関数
   */
  function applyMask(text, hits, assign) {
    let out = '';
    let pos = 0;
    for (const h of hits) {
      out += text.slice(pos, h.start) + assign(h.type, normalize(h.text).trim());
      pos = h.end;
    }
    return out + text.slice(pos);
  }

  const api = { detect, applyMask, normalize, isValidMyNumber, isValidCorporateNumber, isValidLuhn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIMaskDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
