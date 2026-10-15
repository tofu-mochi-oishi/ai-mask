// 設定画面：有効/無効、検出の種類、登録語、除外語を chrome.storage.local に保存する

const DETECTOR_TYPES = ['マイナンバー', '法人番号', 'カード番号', '電話番号', 'メール', '住所', '郵便番号', '氏名'];
const FREE_DICT_LIMIT = 20; // 無料版で登録できる語の数
const DEFAULTS = { enabled: true, addNote: true, disabled: [], dictionary: [], exclusions: [] };

let settings = { ...DEFAULTS };
const $ = (id) => document.getElementById(id);

async function load() {
  const got = await chrome.storage.local.get('settings');
  settings = { ...DEFAULTS, ...(got.settings || {}) };
  render();
}

let savedTimer = 0;
async function save() {
  await chrome.storage.local.set({ settings });
  $('saved').hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($('saved').hidden = true), 1500);
}

function render() {
  $('enabled').checked = settings.enabled;
  $('addNote').checked = settings.addNote !== false;

  const det = $('detectors');
  det.textContent = '';
  for (const type of DETECTOR_TYPES) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !settings.disabled.includes(type);
    cb.addEventListener('change', () => {
      settings.disabled = cb.checked ? settings.disabled.filter((t) => t !== type) : [...settings.disabled, type];
      save();
    });
    label.append(cb, ' ' + type);
    det.append(label);
  }

  const tbody = $('dict').querySelector('tbody');
  tbody.textContent = '';
  settings.dictionary.forEach((entry, i) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = entry.term;
    const td2 = document.createElement('td');
    td2.textContent = entry.label;
    const td3 = document.createElement('td');
    const del = document.createElement('button');
    del.textContent = '削除';
    del.className = 'secondary';
    del.addEventListener('click', () => {
      settings.dictionary.splice(i, 1);
      save();
      render();
    });
    td3.append(del);
    tr.append(td1, td2, td3);
    tbody.append(tr);
  });
  $('dictCount').textContent = `（${settings.dictionary.length} / ${FREE_DICT_LIMIT}語）`;
  $('exclusions').value = settings.exclusions.join('\n');
}

$('enabled').addEventListener('change', () => {
  settings.enabled = $('enabled').checked;
  save();
});

$('addNote').addEventListener('change', () => {
  settings.addNote = $('addNote').checked;
  save();
});

$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const term = $('term').value.trim();
  // 記号の名前は【】や空白・数字で終わる名前だと復元の判定が崩れるため除去する
  const label = ($('label').value.trim() || '登録語').replace(/[【】\s\d]/g, '').slice(0, 10) || '登録語';
  const err = $('dictError');
  err.hidden = true;
  if (!term) return;
  if (settings.dictionary.length >= FREE_DICT_LIMIT) {
    err.textContent = `無料版で登録できるのは${FREE_DICT_LIMIT}語までです。`;
    err.hidden = false;
    return;
  }
  if (settings.dictionary.some((d) => d.term === term)) {
    err.textContent = 'この語はすでに登録されています。';
    err.hidden = false;
    return;
  }
  settings.dictionary.push({ term, label });
  $('term').value = '';
  save();
  render();
});

$('exclusions').addEventListener('change', () => {
  settings.exclusions = $('exclusions').value.split('\n').map((s) => s.trim()).filter(Boolean);
  save();
});

load();
