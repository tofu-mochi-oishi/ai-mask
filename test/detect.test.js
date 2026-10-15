// 検出エンジンのユニットテスト（node --test で実行）
const test = require('node:test');
const assert = require('node:assert/strict');
const { detect, applyMask, isValidMyNumber, isValidCorporateNumber } = require('../src/detect.js');

// チェックデジットの式から、形式上正しい架空のマイナンバーを作る
function makeMyNumber(base11) {
  let sum = 0;
  for (let n = 1; n <= 11; n++) sum += Number(base11[11 - n]) * (n <= 6 ? n + 1 : n - 5);
  const r = sum % 11;
  return base11 + (r <= 1 ? 0 : 11 - r);
}
// 同じく架空の法人番号を作る
function makeCorporateNumber(base12) {
  let sum = 0;
  for (let n = 1; n <= 12; n++) sum += Number(base12[12 - n]) * (n % 2 === 1 ? 1 : 2);
  return String(9 - (sum % 9)) + base12;
}
const types = (text, opts) => detect(text, opts).map((h) => `${h.type}:${h.text}`);

test('マイナンバー: 正しい番号だけを検出する', () => {
  const ok = makeMyNumber('12345678901');
  assert.ok(isValidMyNumber(ok));
  const bad = ok.slice(0, 11) + ((Number(ok[11]) + 1) % 10);
  assert.deepEqual(types(`番号は${ok}です`), [`マイナンバー:${ok}`]);
  assert.deepEqual(types(`番号は${bad}です`), []);
  // 4桁区切り・全角数字
  const spaced = `${ok.slice(0, 4)} ${ok.slice(4, 8)} ${ok.slice(8)}`;
  assert.deepEqual(types(spaced), [`マイナンバー:${spaced}`]);
  const zen = ok.replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));
  assert.deepEqual(types(`ＩＤ：${zen}`), [`マイナンバー:${zen}`]);
});

test('法人番号: チェックデジットで判定する', () => {
  const ok = makeCorporateNumber('700110005901');
  assert.ok(isValidCorporateNumber(ok));
  assert.deepEqual(types(`法人番号 ${ok}`), [`法人番号:${ok}`]);
});

test('カード番号: Luhn を満たすものだけ', () => {
  assert.deepEqual(types('カード 4111 1111 1111 1111 で決済'), ['カード番号:4111 1111 1111 1111']);
  assert.deepEqual(types('注文番号 4111111111111112'), []);
});

test('電話番号: 携帯・固定・国際表記・全角', () => {
  assert.deepEqual(types('携帯は090-1234-5678です'), ['電話番号:090-1234-5678']);
  assert.deepEqual(types('会社 03-1234-5678'), ['電話番号:03-1234-5678']);
  assert.deepEqual(types('連絡先 ０８０１２３４５６７８'), ['電話番号:０８０１２３４５６７８']);
  assert.deepEqual(types('call +81 90-1234-5678'), ['電話番号:+81 90-1234-5678']);
  assert.deepEqual(types('03(1234)5678まで'), ['電話番号:03(1234)5678']);
  // 日付や金額は電話番号にしない
  assert.deepEqual(types('2026-10-15 に 12,000円'), []);
});

test('メールアドレス', () => {
  assert.deepEqual(types('送信先は taro.yamada+test@example.co.jp まで'), ['メール:taro.yamada+test@example.co.jp']);
});

test('住所と郵便番号', () => {
  assert.deepEqual(types('〒100-0005 東京都千代田区丸の内1丁目2-3 に送付'), ['住所:〒100-0005 東京都千代田区丸の内1丁目2-3']);
  assert.deepEqual(types('郵便番号：123-4567'), ['郵便番号:123-4567']);
  // 都道府県名だけ（番地なし）は住所にしない
  assert.deepEqual(types('東京都の人口について'), []);
});

test('氏名: 項目名つき・敬称つき', () => {
  assert.deepEqual(types('氏名：山田 太郎'), ['氏名:山田 太郎']);
  assert.deepEqual(types('田中様にご連絡ください'), ['氏名:田中']);
  assert.deepEqual(types('スミスさんへ'), ['氏名:スミス']);
  // 人名でない「〇〇さん/様」は除外
  assert.deepEqual(types('お客様と皆さんへ。患者さんの対応'), []);
});

test('登録語と除外語', () => {
  const opts = { dictionary: [{ term: '株式会社トーフ', label: '社名' }, { term: 'Project Mochi', label: '案件名' }], exclusions: ['田中'] };
  assert.deepEqual(types('株式会社トーフの project mochi について田中様に相談', opts), [
    '社名:株式会社トーフ',
    '案件名:project mochi',
  ]);
});

test('無効にした種類は検出しない', () => {
  assert.deepEqual(types('田中様 090-1234-5678', { disabled: ['氏名'] }), ['電話番号:090-1234-5678']);
});

test('applyMask: 同じ値には同じ記号を割り当てる', () => {
  const text = '田中様（090-1234-5678）へ。田中様にもう一度 ０９０－１２３４－５６７８ で連絡';
  const map = new Map();
  const counters = {};
  const assign = (type, value) => {
    const key = `${type}\u0000${value}`;
    if (!map.has(key)) map.set(key, `【${type}${(counters[type] = (counters[type] || 0) + 1)}】`);
    return map.get(key);
  };
  const masked = applyMask(text, detect(text), assign);
  assert.equal(masked, '【氏名1】様（【電話番号1】）へ。【氏名1】様にもう一度 【電話番号1】 で連絡');
});
