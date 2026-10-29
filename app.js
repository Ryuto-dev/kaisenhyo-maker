/* ============================================================
   音響回線表メーカー — app
   Vanilla JS / no build step / localStorage autosave
   ============================================================ */

(function () {
  'use strict';

  /* ---------------------------------------------------------
     constants
     --------------------------------------------------------- */

  const STORAGE_KEY = 'kaisenhyo-maker/v1';
  const HISTORY_LIMIT = 80;

  const COLUMNS = [
    { key: 'no',      label: 'No.',          align: 'c', editWidth: '46px', printWidth: '9mm'  },
    { key: 'name',    label: '回線名 / 内容', align: '',  editWidth: '22%',  printWidth: 'auto' },
    { key: 'source',  label: '機器',          align: '',  editWidth: '16%',  printWidth: '32mm' },
    { key: 'kind',    label: '種別',          align: 'c', editWidth: '66px', printWidth: '13mm' },
    { key: 'console', label: '卓CH',          align: 'c', editWidth: '54px', printWidth: '12mm' },
    { key: 'box',     label: 'BOX',           align: '',  editWidth: '84px', printWidth: '18mm' },
    { key: 'cable',   label: 'CBL',           align: 'c', editWidth: '56px', printWidth: '12mm' },
    { key: 'length',  label: '長さ',          align: 'c', editWidth: '52px', printWidth: '12mm' },
    { key: 'note',    label: '備考',          align: '',  editWidth: 'auto', printWidth: 'auto' },
  ];

  const OPTIONAL_KEYS = ['source', 'kind', 'console', 'box', 'cable', 'length', 'note'];

  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  const SECTIONS = {
    input:  { label: 'INPUT',  ja: '入力' },
    output: { label: 'OUTPUT', ja: '出力' },
  };

  const SECTION_COLUMN_LABELS = {
    input: { source: '機器', console: '卓CH' },
    output: { source: '接続先', console: '卓OUT' },
  };

  const sectionOf = (row) => (row && row.section === 'output' ? 'output' : 'input');

  /* ---------------------------------------------------------
     utilities
     --------------------------------------------------------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function uid() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function formatDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!m) return value || '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return value;
    return m[1] + '.' + m[2] + '.' + m[3] + ' (' + WEEKDAYS[d.getDay()] + ')';
  }

  function isTextField(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  /* ---------------------------------------------------------
     state
     --------------------------------------------------------- */

  let state = loadState();

  function emptyMeta() {
    return { title: '', venue: '', date: '', author: '', rev: 'Rev.1', note: '' };
  }

  function normalize(raw) {
    const s = {
      meta: emptyMeta(),
      paper: 'portrait',
      density: 'normal',
      hidden: [],
      rows: [],
    };

    if (!raw || typeof raw !== 'object') return s;

    if (raw.meta && typeof raw.meta === 'object') {
      Object.keys(s.meta).forEach((k) => {
        if (raw.meta[k] != null) s.meta[k] = String(raw.meta[k]);
      });
    }
    if (raw.paper === 'landscape') s.paper = 'landscape';
    if (['compact', 'normal', 'large'].indexOf(raw.density) !== -1) s.density = raw.density;
    if (Array.isArray(raw.hidden)) {
      s.hidden = raw.hidden.filter((k) => OPTIONAL_KEYS.indexOf(k) !== -1);
    }
    if (Array.isArray(raw.rows)) {
      s.rows = raw.rows.map((row) => {
        const rawId = row && row.id != null ? String(row.id) : '';
        const id = /^[A-Za-z0-9_-]{1,40}$/.test(rawId) ? rawId : uid();
        if (row && row.type === 'group') {
          return { id: id, type: 'group', name: String(row.name || '') };
        }
        const section = row && row.section === 'output' ? 'output' : 'input';
        const out = { id: id, type: 'row', section: section };
        COLUMNS.forEach((c) => {
          out[c.key] = row && row[c.key] != null ? String(row[c.key]) : '';
        });
        return out;
      });
    }
    return s;
  }

  function visibleColumns() {
    return COLUMNS.filter((c) => c.key === 'no' || state.hidden.indexOf(c.key) === -1);
  }

  function dataRows() {
    return state.rows.filter((r) => r.type !== 'group');
  }

  function blankRow(no, section) {
    const row = { id: uid(), type: 'row', section: section || 'input' };
    COLUMNS.forEach((c) => { row[c.key] = ''; });
    if (no != null) row.no = String(no);
    return row;
  }

  function blankDoc(count) {
    const s = normalize({});
    s.meta.date = todayISO();
    for (let i = 1; i <= (count || 8); i += 1) s.rows.push(blankRow(i));
    return s;
  }

  function rowsFrom(defs, section) {
    return defs.map((d) => {
      if (typeof d === 'string') return { id: uid(), type: 'group', name: d };
      const row = { id: uid(), type: 'row', section: section || 'input' };
      COLUMNS.forEach((c, i) => { row[c.key] = d[i] == null ? '' : String(d[i]); });
      return row;
    });
  }

  /* ---------------------------------------------------------
     samples
     --------------------------------------------------------- */

  const SAMPLE_BAND = [
    /* --- INPUT --- */
    'ドラムス',
    ['1',  'Kick In',      'Beta 91A',      'Mic', '1',  'SB1-1', 'XLR', '5m',  ''],
    ['2',  'Kick Out',     'Beta 52A',      'Mic', '2',  'SB1-2', 'XLR', '5m',  ''],
    ['3',  'Snare Top',    'SM57',          'Mic', '3',  'SB1-3', 'XLR', '5m',  ''],
    ['4',  'Snare Bottom', 'SM57',          'Mic', '4',  'SB1-4', 'XLR', '5m',  'PHASE'],
    ['5',  'Hi-Hat',       'SM81',          'Mic', '5',  'SB1-5', 'XLR', '5m',  ''],
    ['6',  'Rack Tom 1',   'e604',          'Mic', '6',  'SB1-6', 'XLR', '5m',  ''],
    ['7',  'Rack Tom 2',   'e604',          'Mic', '7',  'SB1-7', 'XLR', '5m',  ''],
    ['8',  'Floor Tom',    'e604',          'Mic', '8',  'SB1-8', 'XLR', '5m',  ''],
    ['9',  'OH L',         'C414',          'Mic', '9',  'SB2-1', 'XLR', '10m', ''],
    ['10', 'OH R',         'C414',          'Mic', '10', 'SB2-2', 'XLR', '10m', ''],
    'ベース',
    ['11', 'Bass DI',      'SansAmp DI',    'DI',  '11', 'SB2-3', 'XLR', '10m', ''],
    ['12', 'Bass Amp',     'MD421',         'Mic', '12', 'SB2-4', 'XLR', '10m', ''],
    'ギター',
    ['13', 'Gt. L',        'SM57',          'Mic', '13', 'SB2-5', 'XLR', '10m', ''],
    ['14', 'Gt. R',        'SM57',          'Mic', '14', 'SB2-6', 'XLR', '10m', ''],
    'キーボード',
    ['15', 'Keys L',       'DI box',        'DI',  '15', 'SB2-7', 'XLR', '10m', ''],
    ['16', 'Keys R',       'DI box',        'DI',  '16', 'SB2-8', 'XLR', '10m', ''],
    'ボーカル',
    ['17', 'Vo.1 (Lead)',  'UR4D + SM58',   'WL',  '17', '—',     '—',   '—',   '電池確認'],
    ['18', 'Vo.2',         'UR4D + SM58',   'WL',  '18', '—',     '—',   '—',   ''],
    ['19', 'Vo.3',         'UR4D + SM58',   'WL',  '19', '—',     '—',   '—',   ''],
    '再生・その他',
    ['20', 'Playback L',   'PC / DI',       'PB',  '20', 'DI-1',  'XLR', '10m', ''],
    ['21', 'Playback R',   'PC / DI',       'PB',  '21', 'DI-2',  'XLR', '10m', ''],
    ['22', 'Talkback',     'TB マイク',      'TB',  '—',  '—',     'XLR', '—',   ''],
  ];

  const SAMPLE_BAND_OUTPUT = [
    'Main',
    ['1', 'Main L',     'PA Processor', 'L',  '—',  'XLR-3', '50m', 'L'],
    ['2', 'Main R',     'PA Processor', 'R',  '—',  'XLR-3', '50m', 'R'],
    'Monitor',
    ['3', 'MON 1',      'Amp Rack 1',   'AUX1', '—', 'XLR-3', '20m', 'ドラマー'],
    ['4', 'MON 2',      'Amp Rack 1',   'AUX2', '—', 'XLR-3', '20m', 'ベーシスト'],
    ['5', 'MON 3',      'Amp Rack 1',   'AUX3', '—', 'XLR-3', '15m', 'ギタリスト'],
    ['6', 'MON 4',      'Amp Rack 1',   'AUX4', '—', 'XLR-3', '15m', 'Vo.'],
    'その他',
    ['7', 'REC L',      'DAW',           'MTX1', '—', 'XLR',   '10m', ''],
    ['8', 'REC R',      'DAW',           'MTX2', '—', 'XLR',   '10m', ''],
    ['9', 'Subwoofer',  'SW Processor',  'L+R',  '—', 'XLR',   '30m', ''],
    ['10', 'Stage Monitor L', 'Monitor Speaker', 'AUX1', '—', 'SPK', '15m', ''],
  ];

  const SAMPLE_TALK = [
    '登壇者',
    ['1',  '卓上マイク 1', 'MX418',        'Mic', '1', 'SB1-1', 'XLR', '15m', ''],
    ['2',  '卓上マイク 2', 'MX418',        'Mic', '2', 'SB1-2', 'XLR', '15m', ''],
    ['3',  'ワイヤレス 1', 'UR4D + LM',    'WL',  '3', '—',     '—',   '—',   ''],
    ['4',  'ワイヤレス 2', 'UR4D + LM',    'WL',  '4', '—',     '—',   '—',   ''],
    '映像・再生',
    ['5',  'PC 音声 L',    'DI box',       'DI',  '5', 'DI-1',  'XLR', '10m', ''],
    ['6',  'PC 音声 R',    'DI box',       'DI',  '6', 'DI-2',  'XLR', '10m', ''],
    ['7',  '映像音声 L',   'Canvas / HDMI', 'PB', '7', '—',     'RCA', '—',   ''],
    ['8',  '映像音声 R',   'Canvas / HDMI', 'PB', '8', '—',     'RCA', '—',   ''],
    'その他',
    ['9',  '司会',         'WL ハンド',     'WL',  '9', '—',     '—',   '—',   ''],
    ['10', 'BGM',          'PC / SE',      'PB',  '10', 'DI-3', 'XLR', '10m', '本番キュー確認'],
  ];

  function sampleDoc(kind) {
    const s = normalize({});
    s.meta.date = todayISO();
    s.meta.rev = 'Rev.1';
    if (kind === 'band') {
      s.meta.title = 'バンドライブ 音響回線表';
      s.meta.note = 'マイクは SM58 × 6、SM57 × 3 を用意。\n16:00 仕込み / 17:00 サウンドチェック。';
      s.rows = rowsFrom(SAMPLE_BAND, 'input');
      s.rows = s.rows.concat(rowsFrom(SAMPLE_BAND_OUTPUT, 'output'));
    } else if (kind === 'talk') {
      s.meta.title = '講演 音響回線表';
      s.meta.note = '受付でワイヤレスの電池残量を確認。発表者PCの音声は会場で実測。';
      s.rows = rowsFrom(SAMPLE_TALK, 'input');
    }
    return s;
  }

  /* ---------------------------------------------------------
     persistence
     --------------------------------------------------------- */

  let saveTimer = null;
  let saveStateTimer = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (err) { /* ignore broken storage */ }
    return normalize({ rows: [] });
  }

  function setSaveState(text, revert) {
    const el = $('#save-state');
    if (!el) return;
    el.textContent = text;
    clearTimeout(saveStateTimer);
    if (revert) {
      saveStateTimer = setTimeout(() => { el.textContent = '自動保存'; }, 1400);
    }
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveState('保存済み ✓', true);
      } catch (err) {
        setSaveState('保存できません');
      }
    }, 250);
  }

  /* ---------------------------------------------------------
     history
     --------------------------------------------------------- */

  const undoStack = [];
  const redoStack = [];
  let skipFocusSnapshot = false;

  function snapshot() {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) { toast('これ以上戻せません'); return; }
    redoStack.push(JSON.stringify(state));
    state = normalize(JSON.parse(undoStack.pop()));
    syncMeta();
    commit();
    toast('元に戻しました');
  }

  function redo() {
    if (!redoStack.length) { toast('やり直す操作がありません'); return; }
    undoStack.push(JSON.stringify(state));
    state = normalize(JSON.parse(redoStack.pop()));
    syncMeta();
    commit();
    toast('やり直しました');
  }

  /* ---------------------------------------------------------
     rendering — screen editor
     --------------------------------------------------------- */

  function renderEditor() {
    const table = $('#edit-table');
    const empty = $('#empty-state');
    const count = $('#row-count');
    const cols = visibleColumns();

    if (!state.rows.length) {
      table.hidden = true;
      table.innerHTML = '';
      empty.hidden = false;
      count.textContent = '';
      return;
    }

    table.hidden = false;
    empty.hidden = true;

    const colgroup = '<colgroup>' +
      cols.map((c) => '<col style="width:' + c.editWidth + '">').join('') +
      '<col style="width:64px"></colgroup>';

    const head = '<thead><tr>' +
      cols.map((c) => '<th class="' + c.align + '">' + c.label + '</th>').join('') +
      '<th class="tools-head"></th></tr></thead>';

    const tools = '<td class="tools">' +
      '<span class="grip" draggable="true" title="ドラッグで移動（Alt + ↑↓）" aria-hidden="true">⋮⋮</span>' +
      '<button type="button" class="sec-btn" data-act="sec" title="入力／出力を切り替え" aria-label="入力／出力">IN</button>' +
      '<button type="button" class="icon-btn" data-act="del" title="この行を削除" aria-label="この行を削除">✕</button>' +
      '</td>';

    let body = '';

    function addSecDivider(label, icon) {
      body += '<tr class="sec-divider"><td colspan="' + cols.length + '">' + icon + esc(label) + '</td><td class="tools"></td></tr>';
    }

    /* group rows by section */
    const rowGroups = [];
    let grp = [];
    let grpLabel = 'INPUT';
    let grpIcon = '◉';
    state.rows.forEach((row) => {
      if (row.type === 'group') { grp.push(row); return; }
      const sec = row.section === 'output' ? 'output' : 'input';
      const label = sec === 'output' ? 'OUTPUT' : 'INPUT';
      const icon = sec === 'output' ? '◎' : '◉';
      if (label !== grpLabel && grp.length) {
        rowGroups.push({ label: grpLabel, rows: grp, icon: grpIcon });
        grp = [];
        grpLabel = label;
        grpIcon = icon;
      }
      grp.push(row);
    });
    if (grp.length) rowGroups.push({ label: grpLabel, rows: grp, icon: grpIcon });

    rowGroups.forEach((group, gi) => {
      addSecDivider(group.label, group.icon);
      group.rows.forEach((row) => {
        if (row.type === 'group') {
          body += '<tr class="group-row" data-id="' + row.id + '">' +
            '<td class="group-cell" colspan="' + cols.length + '">' +
            '<input data-k="name" value="' + esc(row.name) + '" placeholder="見出し（例: ドラムス）" aria-label="見出し">' +
            '</td>' + tools + '</tr>';
          return;
        }
        const sec = row.section === 'output' ? 'output' : 'input';
        body += '<tr data-id="' + row.id + '" data-section="' + sec + '">' + cols.map((c) => {
          const attrs = [
            'data-k="' + c.key + '"',
            'value="' + esc(row[c.key]) + '"',
            'aria-label="' + c.label + '"',
          ];
          if (c.key === 'kind') attrs.push('list="kind-list"');
          if (c.key === 'no' || c.key === 'console') attrs.push('inputmode="numeric"');
          if (c.align === 'c') attrs.push('class="ta-c"');
          return '<td><input ' + attrs.join(' ') + '></td>';
        }).join('') + tools + '</tr>';
      });
    });

    table.innerHTML = colgroup + head + '<tbody>' + body + '</tbody>';

    const inputN = state.rows.filter((r) => r.type !== 'group' && r.section !== 'output').length;
    const outputN = state.rows.filter((r) => r.type !== 'group' && r.section === 'output').length;
    const parts = [];
    if (inputN) parts.push('IN ' + inputN);
    if (outputN) parts.push('OUT ' + outputN);
    count.textContent = parts.join(' / ') || '';
  }

  /* ---------------------------------------------------------
     rendering — A4 sheet (measured pagination)
     --------------------------------------------------------- */

  const MM = 96 / 25.4;

  function headHTML(title, meta) {
    const metaParts = [];
    if (meta.venue) metaParts.push('<span><b>会場</b>' + esc(meta.venue) + '</span>');
    if (meta.date) metaParts.push('<span><b>日付</b>' + esc(formatDate(meta.date)) + '</span>');
    if (meta.author) metaParts.push('<span><b>作成</b>' + esc(meta.author) + '</span>');
    const n = dataRows().length;
    if (n) {
      const inN = state.rows.filter((r) => r.type !== 'group' && r.section !== 'output').length;
      const outN = state.rows.filter((r) => r.type !== 'group' && r.section === 'output').length;
      const parts = ['<b>回線数</b>' + n];
      if (inN) parts.push('IN ' + inN);
      if (outN) parts.push('OUT ' + outN);
      metaParts.push('<span>' + parts.join(' / ') + '</span>');
    }

    let html = '<header class="doc-head">';
    html += '<div class="dh-top"><span class="dh-label">INPUT LIST</span>' +
      '<span class="dh-rev">' + esc(meta.rev) + '</span></div>';
    html += '<h1 class="dh-title">' + esc(title) + '</h1>';
    if (metaParts.length) html += '<div class="dh-meta">' + metaParts.join('') + '</div>';
    html += '</header>';
    return html;
  }

  function rowHTML(row, cols) {
    if (row.type === 'group') {
      return '<tr class="g"><td colspan="' + cols.length + '">' + (esc(row.name) || '&nbsp;') + '</td></tr>';
    }
    return '<tr>' + cols.map((c) => {
      const cls = (c.align || '') + (c.key === 'name' ? ' nm' : '');
      return '<td class="' + cls + '">' + esc(row[c.key]) + '</td>';
    }).join('') + '</tr>';
  }

  function buildSections() {
    const out = [];
    if (!state.rows.length) {
      out.push({ label: null, cols: visibleColumns(), trs: [] });
      return out;
    }
    let curSec = 'input';
    let buf = { label: null, cols: sectionCols('input'), trs: [] };
    state.rows.forEach((r) => {
      if (r.type === 'group') { buf.trs.push(r); return; }
      const s = r.section || 'input';
      if (s !== curSec) {
        if (buf.trs.length) out.push({ label: curSec === 'output' ? 'OUTPUT' : 'INPUT', cols: buf.cols, trs: buf.trs });
        curSec = s;
        buf = { label: null, cols: sectionCols(s), trs: [] };
      }
      buf.trs.push(r);
    });
    if (buf.trs.length) out.push({ label: curSec === 'output' ? 'OUTPUT' : 'INPUT', cols: buf.cols, trs: buf.trs });
    return out;
  }

  function sectionCols(section) {
    const labels = SECTION_COLUMN_LABELS[section] || SECTION_COLUMN_LABELS.input;
    const base = visibleColumns();
    return base.map((c) => (labels[c.key] ? Object.assign({}, c, { label: labels[c.key] }) : c));
  }

  function renderPrint() {
    const pagesEl = $('#sheet-pages');
    const measure = $('#measure-sheet');
    if (!pagesEl || !measure) return;

    const meta = state.meta;
    const title = (meta.title || '').trim() || '音響回線表';
    const paper = state.paper;
    const pageW = paper === 'landscape' ? 297 : 210;
    const pageH = paper === 'landscape' ? 210 : 297;

    const head = headHTML(title, meta);
    const run = '<div class="page-run"><span>' + esc(title) + '</span><span>' + esc(meta.rev) + '</span></div>';
    const note = meta.note && meta.note.trim() ? '<div class="doc-note">' + esc(meta.note) + '</div>' : '';
    const emptyCell = '<td class="empty-row" colspan="' + visibleColumns().length + '">（回線がまだありません）</td>';

    /* group rows by section */
    const sections = buildSections();

    const colgroup = (cols) => '<colgroup>' + cols.map((c) => '<col style="width:' + c.printWidth + '">').join('') + '</colgroup>';
    const thead = (cols) => '<thead><tr>' + cols.map((c) => '<th class="' + (c.align || '') + '">' + c.label + '</th>').join('') + '</tr></thead>';
    const secLabel = (s) => s.label ? '<div class="sec-label">' + esc(s.label) + '</div>' : '';
    const tableWrap = (s, body) => secLabel(s) + '<table class="doc-table">' + colgroup(s.cols) + thead(s.cols) + '<tbody>' + body + '</tbody></table>';

    /* ---- pass 1: measure ---- */
    let measureHtml = head + run;
    sections.forEach((s) => {
      const body = s.trs.length ? s.trs.map((r) => rowHTML(r, s.cols)).join('') : emptyCell;
      measureHtml += tableWrap(s, body);
    });
    measureHtml += note;

    measure.dataset.paper = paper;
    measure.dataset.density = state.density;
    measure.style.width = pageW + 'mm';
    measure.innerHTML = measureHtml;

    const px = (el) => (el ? el.offsetHeight : 0);
    const headH = px(measure.querySelector('.doc-head'));
    const runH = px(measure.querySelector('.page-run')) + 2 * MM;
    const noteH = px(measure.querySelector('.doc-note'));

    /* build flat block list with state row reference */
    const rowStack = []; // { si, tri, tr } where tri = index within section.trs
    sections.forEach((s, si) => {
      s.trs.forEach((tr, tri) => {
        rowStack.push({ si, tri, tr, h: 0 });
      });
    });

    /* measure each section's label + thead */
    const secLabelHeights = sections.map((s, si) => {
      if (!s.label) return 0;
      return px(measure.querySelectorAll('.sec-label')[si]);
    });
    const secTheadHeights = sections.map((s, si) => {
      return px(measure.querySelectorAll('.doc-table thead')[si]);
    });

    /* measure each row's height */
    let idx = 0;
    sections.forEach((s, si) => {
      const table = measure.querySelectorAll('.doc-table')[si];
      const trs = table.querySelectorAll('tbody tr');
      trs.forEach((tr) => {
        if (idx < rowStack.length) rowStack[idx].h = px(tr);
        idx += 1;
      });
    });

    /* ---- pass 2: paginate ---- */
    const contentH = (pageH - 24) * MM;
    const headGap = 3 * MM;
    const safety = 1.5 * MM;
    const pageList = [];

    if (!rowStack.length) {
      pageList.push({ first: true, items: [], note: !!noteH });
    } else {
      let ri = 0;
      let first = true;
      while (ri < rowStack.length) {
        let avail = contentH - safety;
        if (first) avail -= headH + headGap;
        const items = [];
        // store which section tables are open
        let openTable = null;
        while (ri < rowStack.length) {
          if (!items.length && !first) {
            if (avail < runH) break;
            avail -= runH;
          }
          const r = rowStack[ri];
          /* section overhead (label + thead) if this row is in a new section */
          if (r.si !== openTable) {
            const overhead = secLabelHeights[r.si] + secTheadHeights[r.si];
            if (items.length && overhead > avail) break;
            avail -= overhead;
            openTable = r.si;
          }
          if (r.h > avail) break;
          items.push(ri);
          avail -= r.h;
          ri += 1;
        }
        pageList.push({ items: items, first: first, note: !!noteH });
        first = false;
        if (!items.length) break;
      }
    }

    if (noteH && pageList.length) {
      const last = pageList[pageList.length - 1];
      if (last) {
        // check if note fits on last page; if not, add a dedicated note page (not needed for now)
      }
    }

    /* ---- pass 3: render ---- */
    const total = Math.max(pageList.length, 1);
    const shownSections = {}; // track which sections have already been labeled
    pagesEl.innerHTML = pageList.map((page, pageIdx) => {
      let inner = page.first ? head : run;
      if (page.items && page.items.length) {
        let curSec = -1;
        let emitRows = [];
        const flush = () => {
          if (!emitRows.length) return;
          const si = emitRows[0].si;
          const sc = sections[si];
          if (sc.label && !shownSections[si]) {
            inner += '<div class="sec-label">' + esc(sc.label) + '</div>';
            shownSections[si] = true;
          }
          inner += '<table class="doc-table"><colgroup>' +
            sc.cols.map((c) => '<col style="width:' + c.printWidth + '">').join('') +
            '</colgroup><thead><tr>' +
            sc.cols.map((c) => '<th class="' + (c.align || '') + '">' + c.label + '</th>').join('') +
            '</tr></thead><tbody>';
          emitRows.forEach((er) => { inner += rowHTML(er.tr, sections[er.si].cols); });
          inner += '</tbody></table>';
          emitRows = [];
        };
        page.items.forEach((ri) => {
          const r = rowStack[ri];
          if (r.si !== curSec) { flush(); curSec = r.si; }
          emitRows.push(r);
        });
        flush();
      }
      if (page.note) inner += note;
      inner += '<div class="page-num">' + (pageIdx + 1) + ' / ' + total + '</div>';
      return '<section class="print-sheet sheet-page" data-paper="' + paper + '" data-density="' + state.density + '">' + inner + '</section>';
    }).join('');

    applyPageStyle();

    const tag = $('#preview-tag');
    if (tag) {
      tag.textContent = 'A4 ' + (paper === 'landscape' ? '横' : '縦') + ' / ' + total + 'ページ';
    }

    if ($('#preview').classList.contains('open')) fitPreview();
  }

  function applyPageStyle() {
    let style = $('#page-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'page-style';
      document.head.appendChild(style);
    }
    style.textContent = '@page { size: A4 ' + state.paper + '; margin: 0; }';
  }

  let printTimer = null;
  function schedulePrint() {
    clearTimeout(printTimer);
    printTimer = setTimeout(renderPrint, 200);
  }

  /* ---------------------------------------------------------
     rendering — settings + meta
     --------------------------------------------------------- */

  function renderSettings() {
    $$('.seg').forEach((seg) => {
      const value = seg.dataset.setting === 'paper' ? state.paper : state.density;
      $$('button', seg).forEach((btn) => {
        btn.classList.toggle('on', btn.dataset.val === value);
      });
    });

    $$('#column-chips input').forEach((input) => {
      input.checked = state.hidden.indexOf(input.value) === -1;
    });

    const note = $('.summary-note');
    if (note) {
      const paper = state.paper === 'landscape' ? '横' : '縦';
      const size = { compact: '小', normal: '中', large: '大' }[state.density] || '中';
      note.textContent = 'A4 ' + paper + ' / 文字 ' + size;
    }

    applyPageStyle();
  }

  function syncMeta() {
    $$('[data-meta]').forEach((el) => {
      el.value = state.meta[el.dataset.meta] || '';
    });
  }

  function buildColumnChips() {
    const box = $('#column-chips');
    box.innerHTML = OPTIONAL_KEYS.map((key) => {
      const col = COLUMNS.find((c) => c.key === key);
      return '<label class="chip"><input type="checkbox" value="' + key + '"><span>' + col.label + '</span></label>';
    }).join('');

    box.addEventListener('change', (e) => {
      const input = e.target.closest('input[type="checkbox"]');
      if (!input) return;
      snapshot();
      if (input.checked) {
        state.hidden = state.hidden.filter((k) => k !== input.value);
      } else if (state.hidden.indexOf(input.value) === -1) {
        state.hidden.push(input.value);
      }
      commit();
    });
  }

  /* ---------------------------------------------------------
     commit
     --------------------------------------------------------- */

  function commit(opts) {
    const options = opts || {};
    save();
    renderSettings();
    renderEditor();
    renderPrint();
    if (options.focus) {
      const el = $(options.focus);
      if (el) {
        skipFocusSnapshot = true;
        el.focus();
        if (el.select) el.select();
        skipFocusSnapshot = false;
      }
    }
  }

  /* ---------------------------------------------------------
     row operations
     --------------------------------------------------------- */

  function nextNo() {
    let max = 0;
    state.rows.forEach((r) => {
      if (r.type === 'group') return;
      const n = parseInt(r.no, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return String(max + 1);
  }

  function addRow(afterId, focusKey, section) {
    snapshot();
    const row = blankRow(nextNo(), section || 'input');
    let index = state.rows.length;
    if (afterId) {
      const i = state.rows.findIndex((r) => r.id === afterId);
      if (i !== -1) index = i + 1;
    }
    state.rows.splice(index, 0, row);
    commit({ focus: '[data-id="' + row.id + '"] [data-k="' + (focusKey || 'name') + '"]' });
  }

  function addGroup(afterId) {
    snapshot();
    const group = { id: uid(), type: 'group', name: '' };
    let index = state.rows.length;
    if (afterId) {
      const i = state.rows.findIndex((r) => r.id === afterId);
      if (i !== -1) index = i + 1;
    }
    state.rows.splice(index, 0, group);
    commit({ focus: '[data-id="' + group.id + '"] [data-k="name"]' });
  }

  function deleteRow(id) {
    snapshot();
    state.rows = state.rows.filter((r) => r.id !== id);
    commit();
  }

  function moveRow(id, delta, focusKey) {
    const i = state.rows.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= state.rows.length) return;
    snapshot();
    const row = state.rows.splice(i, 1)[0];
    state.rows.splice(j, 0, row);
    commit(focusKey ? { focus: '[data-id="' + id + '"] [data-k="' + focusKey + '"]' } : undefined);
  }

  function focusCell(id, key) {
    const el = $('[data-id="' + id + '"] [data-k="' + key + '"]');
    if (!el) return;
    skipFocusSnapshot = true;
    el.focus();
    if (el.select) el.select();
    skipFocusSnapshot = false;
  }

  function renumber() {
    if (!state.rows.length) return;
    snapshot();
    let n = 1;
    state.rows.forEach((row) => {
      if (row.type === 'group') return;
      row.no = String(n);
      n += 1;
    });
    commit();
    toast('連番を振り直しました');
  }

  /* ---------------------------------------------------------
     drag & drop
     --------------------------------------------------------- */

  let dragId = null;
  let dropTarget = null;

  function clearDropMarks() {
    $$('#edit-table tr.drop-before, #edit-table tr.drop-after').forEach((tr) => {
      tr.classList.remove('drop-before', 'drop-after');
    });
  }

  function bindDragAndDrop(table) {
    table.addEventListener('dragstart', (e) => {
      const grip = e.target.closest('.grip');
      if (!grip) return;
      const tr = grip.closest('tr[data-id]');
      if (!tr) return;
      dragId = tr.dataset.id;
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
      } catch (err) { /* ignore */ }
      tr.classList.add('dragging');
    });

    table.addEventListener('dragend', () => {
      if (dragId) {
        const tr = $('tr[data-id="' + dragId + '"]');
        if (tr) tr.classList.remove('dragging');
      }
      dragId = null;
      dropTarget = null;
      clearDropMarks();
    });

    table.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      clearDropMarks();
      const tr = e.target.closest('tr[data-id]');
      if (!tr || tr.dataset.id === dragId) { dropTarget = null; return; }
      const rect = tr.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      tr.classList.add(after ? 'drop-after' : 'drop-before');
      dropTarget = { id: tr.dataset.id, after: after };
    });

    table.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const from = state.rows.findIndex((r) => r.id === dragId);
      if (from === -1) return;
      snapshot();
      const row = state.rows.splice(from, 1)[0];
      let to = state.rows.length;
      if (dropTarget) {
        const idx = state.rows.findIndex((r) => r.id === dropTarget.id);
        to = idx === -1 ? state.rows.length : idx + (dropTarget.after ? 1 : 0);
      }
      state.rows.splice(to, 0, row);
      dragId = null;
      dropTarget = null;
      clearDropMarks();
      commit();
    });
  }

  /* ---------------------------------------------------------
     preview
     --------------------------------------------------------- */

  function fitPreview() {
    const modal = $('#preview');
    if (!modal.classList.contains('open')) return;

    const stack = $('#sheet-pages');
    const stage = $('#sheet-stage');
    const scroll = $('#preview-scroll');

    stack.style.transform = 'none';
    const width = stack.offsetWidth;
    const height = stack.offsetHeight;
    if (!width) return;

    const available = scroll.clientWidth - 32;
    const scale = Math.max(0.15, Math.min(1, available / width));

    stack.style.transform = 'scale(' + scale + ')';
    stage.style.width = Math.round(width * scale) + 'px';
    stage.style.height = Math.round(height * scale) + 'px';
  }

  function openPreview() {
    closeMenu();
    renderPrint();
    const modal = $('#preview');
    modal.classList.add('open');
    document.body.classList.add('no-scroll');
    $('#preview-scroll').scrollTop = 0;
    requestAnimationFrame(fitPreview);
    setTimeout(() => {
      fitPreview();
      $('#preview-scroll').scrollTop = 0;
    }, 60);
  }

  function closePreview() {
    const modal = $('#preview');
    if (!modal.classList.contains('open')) return;
    modal.classList.remove('open');
    document.body.classList.remove('no-scroll');
    $('#btn-preview').focus();
  }

  function printDoc() {
    closeMenu();
    renderPrint();

    const originalTitle = document.title;
    const base = (state.meta.title || '音響回線表').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
    document.title = base || '音響回線表';

    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    setTimeout(restore, 5000);

    window.print();
  }

  /* ---------------------------------------------------------
     menu
     --------------------------------------------------------- */

  function openMenu() {
    $('#menu').classList.add('open');
    $('#btn-menu').setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    $('#menu').classList.remove('open');
    $('#btn-menu').setAttribute('aria-expanded', 'false');
  }

  function bindMenu() {
    const btn = $('#btn-menu');
    const menu = $('#menu');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu.classList.contains('open')) closeMenu(); else openMenu();
    });

    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('open')) return;
      if (e.target.closest('#menu') || e.target.closest('#btn-menu')) return;
      closeMenu();
    });

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('button[data-act]');
      if (!item) return;
      const act = item.dataset.act;
      closeMenu();

      if (act === 'undo') undo();
      else if (act === 'redo') redo();
      else if (act === 'new') newDoc();
      else if (act === 'sample-band') loadSample('band');
      else if (act === 'sample-talk') loadSample('talk');
      else if (act === 'export-json') exportJSON();
      else if (act === 'import-json') $('#file-input').click();
      else if (act === 'export-csv') exportCSV();
    });
  }

  /* ---------------------------------------------------------
     documents
     --------------------------------------------------------- */

  function confirmReplace(message) {
    if (!state.rows.length && !state.meta.title) return true;
    return window.confirm(message || '現在の内容は置き換わります。よろしいですか？');
  }

  function newDoc() {
    if (!confirmReplace()) return;
    snapshot();
    state = blankDoc(8);
    syncMeta();
    commit();
    toast('新規作成しました');
  }

  function loadSample(kind) {
    if (kind === 'blank') {
      snapshot();
      state = blankDoc(8);
      syncMeta();
      commit();
      toast('空の表で始めました');
      return;
    }
    if (!confirmReplace('サンプルに置き換えます。よろしいですか？')) return;
    snapshot();
    state = sampleDoc(kind);
    syncMeta();
    commit();
    toast('サンプルを読み込みました');
  }

  /* ---------------------------------------------------------
     files
     --------------------------------------------------------- */

  function fileBase() {
    const title = (state.meta.title || '音響回線表').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
    const d = new Date();
    return title + '_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJSON() {
    download(fileBase() + '.json', JSON.stringify(state, null, 2), 'application/json');
    toast('JSONを書き出しました');
  }

  function csvCell(value) {
    const s = String(value == null ? '' : value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    const cols = visibleColumns();
    const lines = [cols.map((c) => csvCell(c.label)).join(',')];
    state.rows.forEach((row) => {
      if (row.type === 'group') {
        lines.push(['# ' + row.name].concat(cols.slice(1).map(() => '')).map(csvCell).join(','));
      } else {
        lines.push(cols.map((c) => csvCell(row[c.key])).join(','));
      }
    });
    download(fileBase() + '.csv', '\ufeff' + lines.join('\r\n'), 'text/csv');
    toast('CSVを書き出しました');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        if (!raw || typeof raw !== 'object') throw new Error('format');
        snapshot();
        state = normalize(raw);
        syncMeta();
        commit();
        toast('JSONを読み込みました');
      } catch (err) {
        toast('読み込めませんでした（JSON形式を確認してください）');
      }
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------
     toast
     --------------------------------------------------------- */

  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------------------------------------------------------
     bindings
     --------------------------------------------------------- */

  function bindMeta() {
    $$('[data-meta]').forEach((el) => {
      el.addEventListener('focusin', () => snapshot());
      el.addEventListener('input', () => {
        state.meta[el.dataset.meta] = el.value;
        save();
        schedulePrint();
      });
    });
  }

  function bindTable(table) {
    table.addEventListener('input', (e) => {
      const input = e.target.closest('input[data-k]');
      if (!input) return;
      const tr = input.closest('tr[data-id]');
      if (!tr) return;
      const row = state.rows.find((r) => r.id === tr.dataset.id);
      if (!row) return;
      row[input.dataset.k] = input.value;
      save();
      schedulePrint();
    });

    table.addEventListener('focusin', (e) => {
      if (skipFocusSnapshot) return;
      if (e.target.matches('input')) snapshot();
    });

    table.addEventListener('click', (e) => {
      const secBtn = e.target.closest('button[data-act="sec"]');
      if (secBtn) {
        const tr = secBtn.closest('tr[data-id]');
        if (!tr) return;
        snapshot();
        const row = state.rows.find((r) => r.id === tr.dataset.id);
        if (!row) return;
        if (row.type === 'group') return;
        row.section = row.section === 'output' ? 'input' : 'output';
        /* move row to end of its section */
        const i = state.rows.findIndex((r) => r.id === row.id);
        if (i !== -1) {
          state.rows.splice(i, 1);
          let insertAt = state.rows.length;
          for (let j = state.rows.length - 1; j >= 0; j -= 1) {
            const r = state.rows[j];
            if (r.type === 'row' && (r.section || 'input') === row.section) { insertAt = j + 1; break; }
            // insert after last group row in that section
          }
          // if no same-section row found, place after first section divider position
          state.rows.splice(insertAt, 0, row);
        }
        commit();
        return;
      }
      const btn = e.target.closest('button[data-act="del"]');
      if (!btn) return;
      const tr = btn.closest('tr[data-id]');
      if (!tr) return;
      deleteRow(tr.dataset.id);
    });

    table.addEventListener('keydown', (e) => {
      const input = e.target.closest('input[data-k]');
      if (!input) return;
      const tr = input.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      const key = input.dataset.k;

      if (e.key === 'Enter' && !e.isComposing && !e.shiftKey && e.keyCode !== 229) {
        e.preventDefault();
        const index = state.rows.findIndex((r) => r.id === id);
        const next = state.rows[index + 1];
        if (next && next.type === 'row') focusCell(next.id, key);
        else addRow(id, key);
        return;
      }

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        moveRow(id, e.key === 'ArrowUp' ? -1 : 1, key);
      }
    });

    bindDragAndDrop(table);
  }

  function bindSettings() {
    $$('.seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-val]');
        if (!btn) return;
        snapshot();
        if (seg.dataset.setting === 'paper') state.paper = btn.dataset.val;
        else state.density = btn.dataset.val;
        commit();
      });
    });
  }

  function bindGlobal() {
    $('#btn-add-row').addEventListener('click', () => addRow(null, null, 'input'));
    $('#btn-add-group').addEventListener('click', () => addGroup(null));
    $('#btn-add-out-row').addEventListener('click', () => addRow(null, null, 'output'));
    $('#btn-add-out-group').addEventListener('click', () => {
      snapshot();
      const group = { id: uid(), type: 'group', name: '' };
      state.rows.push(group);
      commit({ focus: '[data-id="' + group.id + '"] [data-k="name"]' });
    });
    $('#btn-renumber').addEventListener('click', renumber);
    $('#btn-preview').addEventListener('click', openPreview);
    $('#btn-pdf').addEventListener('click', printDoc);
    $('#btn-print').addEventListener('click', printDoc);
    $('#btn-close-preview').addEventListener('click', closePreview);

    $('#preview').addEventListener('click', (e) => {
      if (e.target === $('#preview')) closePreview();
    });

    $$('[data-sample]').forEach((btn) => {
      btn.addEventListener('click', () => loadSample(btn.dataset.sample));
    });

    $('#file-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importJSON(file);
      e.target.value = '';
    });

    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !isTextField(document.activeElement)) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (e.key === 'Escape') {
        if ($('#preview').classList.contains('open')) closePreview();
        else closeMenu();
      }
    });

    window.addEventListener('resize', () => {
      if ($('#preview').classList.contains('open')) fitPreview();
    });

    window.addEventListener('beforeprint', renderPrint);

    window.addEventListener('beforeunload', (e) => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { /* ignore */ }
      }
    });
  }

  /* ---------------------------------------------------------
     init
     --------------------------------------------------------- */

  function init() {
    buildColumnChips();
    bindMeta();
    bindSettings();
    bindTable($('#edit-table'));
    bindMenu();
    bindGlobal();

    syncMeta();
    renderSettings();
    renderEditor();
    renderPrint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
