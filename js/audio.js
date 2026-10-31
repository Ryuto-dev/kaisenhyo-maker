/* ============================================================
   機材準備.com — 音響回線表エディタ
   Vanilla JS / no build step
   プロジェクトの audio データを編集する
   ============================================================ */

(function () {
  'use strict';

  const KZ = window.KZ = window.KZ || {};
  const U = KZ.util;

  /* ---------------------------------------------------------
     constants
     --------------------------------------------------------- */

  const HISTORY_LIMIT = 100;
  const ROOT_ID = 'view-audio';
  let active = false;
  let onChange = null;
  const SECS = ['input', 'output'];           // 回線表（印刷: 回線表）
  const EDIT_SECS = ['input', 'output', 'gear']; // 編集画面のセクション（gear = 機材ピックリスト）
  const DEFAULT_PHASES = ['出庫', '搬入', 'バラシ', '帰庫'];
  const MAX_PHASES = 6;
  const SCOPES = ['all', 'lines', 'pick'];

  /*
    w   … 編集画面の列幅
    pw  … A4 印刷時の列幅
    fixed … 常に表示（列の表示切り替え対象外）
  */
  const COLS = {
    input: [
      { key: 'no',      label: 'No.',        align: 'c', w: '50px', pw: '9mm',  fixed: true, num: true },
      { key: 'name',    label: '回線名',      align: '',  w: '22%',  pw: 'auto', fixed: true, ph: '例: Kick In' },
      { key: 'source',  label: 'マイク / 機器', align: '',  w: '15%',  pw: '30mm', ph: '例: SM57' },
      { key: 'kind',    label: '種別',        align: 'c', w: '64px', pw: '12mm', list: 'kind-list' },
      { key: 'phantom', label: '+48V',        align: 'c', w: '54px', pw: '10mm', toggle: true },
      { key: 'stand',   label: 'スタンド',     align: 'c', w: '78px', pw: '14mm', list: 'stand-list' },
      { key: 'console', label: '卓CH',        align: 'c', w: '58px', pw: '12mm', num: true, dupe: true },
      { key: 'box',     label: 'BOX',         align: '',  w: '84px', pw: '18mm', num: true, dupe: true },
      { key: 'cable',   label: 'CBL',         align: 'c', w: '62px', pw: '12mm', list: 'cable-list' },
      { key: 'length',  label: '長さ',        align: 'c', w: '56px', pw: '12mm', num: true },
      { key: 'note',    label: '備考',        align: '',  w: 'auto', pw: 'auto' },
    ],
    output: [
      { key: 'no',      label: 'No.',        align: 'c', w: '50px', pw: '9mm',  fixed: true, num: true },
      { key: 'name',    label: '出力名',      align: '',  w: '22%',  pw: 'auto', fixed: true, ph: '例: Main L' },
      { key: 'console', label: '卓OUT',       align: 'c', w: '84px', pw: '17mm', num: true, dupe: true, list: 'out-list' },
      { key: 'dest',    label: '接続先',      align: '',  w: '18%',  pw: '34mm', ph: '例: PA Processor In1' },
      { key: 'box',     label: 'BOX',         align: '',  w: '84px', pw: '18mm', num: true, dupe: true },
      { key: 'cable',   label: 'CBL',         align: 'c', w: '62px', pw: '12mm', list: 'cable-list' },
      { key: 'length',  label: '長さ',        align: 'c', w: '56px', pw: '12mm', num: true },
      { key: 'note',    label: '備考',        align: '',  w: 'auto', pw: 'auto' },
    ],
    gear: [
      { key: 'no',      label: 'No.',        align: 'c', w: '50px', pw: '8mm',  fixed: true, num: true },
      { key: 'name',    label: '品名',        align: '',  w: '26%',  pw: 'auto', fixed: true, ph: '例: SM58' },
      { key: 'model',   label: '型番 / 仕様',  align: '',  w: '18%',  pw: '27mm' },
      { key: 'qty',     label: '数量',        align: 'c', w: '64px', pw: '10mm', num: true },
      { key: 'spare',   label: '予備',        align: 'c', w: '60px', pw: '9mm',  num: true },
      { key: 'case',    label: 'ケース',      align: '',  w: '120px', pw: '18mm', list: 'case-list' },
      { key: 'note',    label: '備考',        align: '',  w: 'auto', pw: '24mm' },
    ],
  };

  const SEC_INFO = {
    input:  { label: 'INPUT',  ja: '入力', unit: 'ch' },
    output: { label: 'OUTPUT', ja: '出力', unit: '系統' },
    gear:   { label: 'PICK LIST', ja: '機材', unit: '品目' },
  };

  const DEFAULT_HIDDEN = ['input:stand'];
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const EMPTY_MARKS = ['', '-', '—', '－', 'ー', 'n/a', 'N/A'];

  /* ---------------------------------------------------------
     utilities
     --------------------------------------------------------- */

  const $ = U.$;
  const $$ = U.$$;
  const uid = () => U.uid();
  const esc = U.esc;
  const pad2 = U.pad2;
  const todayISO = U.todayISO;
  const formatDate = U.formatDate;
  const isTextField = U.isTextField;
  const isBlankMark = U.isBlankMark;
  const download = U.download;

  /* "SB1-8" → "SB1-9", "AUX1" → "AUX2", "09" → "10"。数字がなければ '' */
  function incr(value) {
    const s = String(value == null ? '' : value);
    const m = /^(.*?)(\d+)(\D*)$/.exec(s);
    if (!m) return '';
    const n = String(Number(m[2]) + 1);
    const num = m[2].length > n.length ? n.padStart(m[2].length, '0') : n;
    return m[1] + num + m[3];
  }

  function truthyPhantom(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s) return '';
    return ['0', 'off', 'no', 'false', '-', '—', '×', 'x', 'なし'].indexOf(s) !== -1 ? '' : '1';
  }

  /* ---------------------------------------------------------
     state
     --------------------------------------------------------- */

  function emptyMeta() {
    return { title: '', venue: '', date: '', author: '', rev: 'Rev.1', note: '' };
  }

  function emptyState() {
    return {
      version: 2,
      meta: emptyMeta(),
      paper: 'portrait',
      density: 'normal',
      outputBreak: false,
      hidden: DEFAULT_HIDDEN.slice(),
      input: [],
      output: [],
      gear: [],
      pickPhases: DEFAULT_PHASES.slice(),
      pickNote: '',
      printScope: 'all',
    };
  }

  /* 「出庫, 搬入, バラシ」→ ['出庫', '搬入', 'バラシ'] */
  function parsePhases(value) {
    const list = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,、，\n]/);
    return list.map((p) => String(p).trim().slice(0, 10)).filter(Boolean).slice(0, MAX_PHASES);
  }

  function cleanId(raw) {
    const s = raw != null ? String(raw) : '';
    return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : uid();
  }

  function cleanRow(sec, row) {
    if (row && row.type === 'group') {
      return { id: cleanId(row.id), type: 'group', name: String(row.name || '') };
    }
    const out = { id: cleanId(row && row.id), type: 'row' };
    COLS[sec].forEach((c) => {
      const v = row && row[c.key] != null ? String(row[c.key]) : '';
      out[c.key] = c.toggle ? truthyPhantom(v) : v;
    });
    return out;
  }

  /* v1（rows + section）→ v2（input / output） */
  function migrateRows(rows) {
    const res = { input: [], output: [] };
    const secOf = rows.map((r) => (r && r.type !== 'group' ? (r.section === 'output' ? 'output' : 'input') : null));
    rows.forEach((r, i) => {
      let sec = secOf[i];
      if (!sec) {
        for (let j = i + 1; j < rows.length && !sec; j += 1) sec = secOf[j];
        for (let j = i - 1; j >= 0 && !sec; j -= 1) sec = secOf[j];
        sec = sec || 'input';
      }
      let row = r;
      if (sec === 'output' && r && r.type !== 'group') {
        row = Object.assign({}, r);
        row.dest = r.source || '';
        if (isBlankMark(row.console) && r.kind) row.console = r.kind;
      }
      res[sec].push(cleanRow(sec, row));
    });
    return res;
  }

  function normalize(raw) {
    const s = emptyState();
    if (!raw || typeof raw !== 'object') return s;

    if (raw.meta && typeof raw.meta === 'object') {
      Object.keys(s.meta).forEach((k) => {
        if (raw.meta[k] != null) s.meta[k] = String(raw.meta[k]);
      });
    }
    if (raw.paper === 'landscape') s.paper = 'landscape';
    if (['compact', 'normal', 'large'].indexOf(raw.density) !== -1) s.density = raw.density;
    s.outputBreak = !!raw.outputBreak;
    if (Array.isArray(raw.gear)) s.gear = raw.gear.map((r) => cleanRow('gear', r));
    if (Array.isArray(raw.pickPhases)) s.pickPhases = parsePhases(raw.pickPhases);
    if (raw.pickNote != null) s.pickNote = String(raw.pickNote);
    if (SCOPES.indexOf(raw.printScope) !== -1) s.printScope = raw.printScope;

    if (Array.isArray(raw.input) || Array.isArray(raw.output)) {
      SECS.forEach((sec) => {
        s[sec] = Array.isArray(raw[sec]) ? raw[sec].map((r) => cleanRow(sec, r)) : [];
      });
      if (Array.isArray(raw.hidden)) {
        s.hidden = raw.hidden.filter((k) => {
          const p = String(k).split(':');
          return COLS[p[0]] && COLS[p[0]].some((c) => c.key === p[1] && !c.fixed);
        });
      }
    } else if (Array.isArray(raw.rows)) {
      const m = migrateRows(raw.rows);
      s.input = m.input;
      s.output = m.output;
      if (Array.isArray(raw.hidden)) {
        const h = DEFAULT_HIDDEN.slice();
        raw.hidden.forEach((k) => {
          if (COLS.input.some((c) => c.key === k && !c.fixed)) h.push('input:' + k);
          const ok = k === 'source' ? 'dest' : k;
          if (COLS.output.some((c) => c.key === ok && !c.fixed)) h.push('output:' + ok);
        });
        s.hidden = h.filter((v, i, a) => a.indexOf(v) === i);
      }
    }
    return s;
  }

  let state = emptyState();

  function isHidden(sec, key) {
    return state.hidden.indexOf(sec + ':' + key) !== -1;
  }

  function visibleCols(sec) {
    return COLS[sec].filter((c) => c.fixed || !isHidden(sec, c.key));
  }

  function dataCount(sec) {
    return state[sec].filter((r) => r.type !== 'group').length;
  }

  function totalRows() {
    return state.input.length + state.output.length + state.gear.length;
  }

  /* "6" / "6本" / "x6" → 6 */
  function numVal(v) {
    const m = /\d+/.exec(String(v == null ? '' : v));
    return m ? Number(m[0]) : 0;
  }

  /* 持ち出す総数（数量 + 予備） */
  function gearRowTotal(r) {
    return numVal(r.qty) + numVal(r.spare);
  }

  function gearTotal() {
    return state.gear.reduce((sum, r) => (r.type === 'group' ? sum : sum + gearRowTotal(r)), 0);
  }

  function secCountText(sec) {
    const n = dataCount(sec);
    if (!n) return '';
    if (sec === 'gear') {
      const t = gearTotal();
      return n + ' 品目' + (t ? ' · 計 ' + t : '');
    }
    return n + ' ' + SEC_INFO[sec].unit;
  }

  function blankRow(sec) {
    return cleanRow(sec, {});
  }

  function rowsFrom(sec, defs) {
    const keys = COLS[sec].map((c) => c.key);
    return defs.map((d) => {
      if (typeof d === 'string') return { id: uid(), type: 'group', name: d };
      const obj = {};
      keys.forEach((k, i) => { obj[k] = d[i] == null ? '' : d[i]; });
      return cleanRow(sec, obj);
    });
  }

  function findRow(id) {
    for (let s = 0; s < EDIT_SECS.length; s += 1) {
      const list = state[EDIT_SECS[s]];
      const i = list.findIndex((r) => r.id === id);
      if (i !== -1) return { sec: EDIT_SECS[s], list: list, index: i, row: list[i] };
    }
    return null;
  }

  /* ---------------------------------------------------------
     機材ピックリスト — 回線表からの集計
     マイク・機器（「+」区切りで分割）/ スタンド / ケーブル（種類×長さ）/ BOX を拾い出す
     --------------------------------------------------------- */

  const GEAR_GROUPS = ['卓・BOX', 'マイク', 'ワイヤレス', 'DI', '機器・その他', 'スタンド', 'ケーブル'];
  const KIND_GROUP = { mic: 'マイク', tb: 'マイク', wl: 'ワイヤレス', di: 'DI' };
  const STAND_NAMES = {
    'トール': 'ブームスタンド（トール）',
    'ショート': 'ブームスタンド（ショート）',
    'ストレート': 'ストレートスタンド',
    '卓上': '卓上スタンド',
    'クリップ': 'ドラムクリップ',
  };
  const CABLE_ORDER = ['XLR', 'TRS', 'TS', 'RCA', 'SPK', 'MULTI'];

  function aggregateGear(doc) {
    const buckets = {};
    GEAR_GROUPS.forEach((g) => { buckets[g] = []; });

    function add(group, name, model, sort) {
      const list = buckets[group];
      let e = list.find((x) => x.name === name && x.model === model);
      if (!e) { e = { name: name, model: model, qty: 0, sort: sort }; list.push(e); }
      e.qty += 1;
    }

    doc.input.forEach((r) => {
      if (r.type === 'group') return;
      const group = KIND_GROUP[String(r.kind || '').trim().toLowerCase()] || '機器・その他';
      if (!isBlankMark(r.source)) {
        String(r.source).split(/\s*\+\s*/).forEach((item) => {
          const it = item.trim();
          if (it && !isBlankMark(it)) add(group, it, '');
        });
      }
      const stand = String(r.stand || '').trim();
      if (stand && !isBlankMark(stand) && stand !== 'なし') add('スタンド', STAND_NAMES[stand] || stand + ' スタンド', '');
    });

    const boxes = [];
    SECS.forEach((sec) => {
      doc[sec].forEach((r) => {
        if (r.type === 'group') return;
        const cable = String(r.cable || '').trim();
        if (cable && !isBlankMark(cable)) {
          const len = isBlankMark(r.length) ? '' : String(r.length).trim();
          const ci = CABLE_ORDER.indexOf(cable.toUpperCase());
          add('ケーブル', cable + ' ケーブル', len, [ci === -1 ? 99 : ci, cable, parseFloat(len) || 0]);
        }
        const m = /^([A-Za-z]+\d+)-/.exec(String(r.box || '').trim());
        if (m && boxes.indexOf(m[1].toUpperCase()) === -1) boxes.push(m[1].toUpperCase());
      });
    });
    boxes.forEach((b) => add('卓・BOX', 'ステージボックス', b));

    buckets['ケーブル'].sort((a, b) => (a.sort[0] - b.sort[0]) ||
      (a.sort[1] < b.sort[1] ? -1 : a.sort[1] > b.sort[1] ? 1 : 0) || (a.sort[2] - b.sort[2]));

    const rows = [];
    let n = 1;
    GEAR_GROUPS.forEach((g) => {
      if (!buckets[g].length) return;
      rows.push({ id: uid(), type: 'group', name: g });
      buckets[g].forEach((e) => {
        rows.push(cleanRow('gear', { no: String(n), name: e.name, model: e.model, qty: String(e.qty) }));
        n += 1;
      });
    });
    return rows;
  }

  function renumberList(list) {
    let n = 1;
    list.forEach((row) => {
      if (row.type === 'group') return;
      row.no = String(n);
      n += 1;
    });
  }

  /* ---------------------------------------------------------
     samples
     input : no, name, source, kind, phantom, stand, console, box, cable, length, note
     output: no, name, console, dest, box, cable, length, note
     --------------------------------------------------------- */

  const SAMPLE_BAND_IN = [
    'ドラムス',
    ['1',  'Kick In',      'Beta 91A',    'Mic', '1', '',       '1',  'SB1-1', 'XLR', '5m',  ''],
    ['2',  'Kick Out',     'Beta 52A',    'Mic', '',  'ショート', '2',  'SB1-2', 'XLR', '5m',  ''],
    ['3',  'Snare Top',    'SM57',        'Mic', '',  'ショート', '3',  'SB1-3', 'XLR', '5m',  ''],
    ['4',  'Snare Bottom', 'SM57',        'Mic', '',  'ショート', '4',  'SB1-4', 'XLR', '5m',  'PHASE'],
    ['5',  'Hi-Hat',       'SM81',        'Mic', '1', 'ショート', '5',  'SB1-5', 'XLR', '5m',  ''],
    ['6',  'Rack Tom 1',   'e604',        'Mic', '',  'クリップ', '6',  'SB1-6', 'XLR', '5m',  ''],
    ['7',  'Rack Tom 2',   'e604',        'Mic', '',  'クリップ', '7',  'SB1-7', 'XLR', '5m',  ''],
    ['8',  'Floor Tom',    'e604',        'Mic', '',  'クリップ', '8',  'SB1-8', 'XLR', '5m',  ''],
    ['9',  'OH L',         'C414',        'Mic', '1', 'トール',   '9',  'SB2-1', 'XLR', '10m', ''],
    ['10', 'OH R',         'C414',        'Mic', '1', 'トール',   '10', 'SB2-2', 'XLR', '10m', ''],
    'ベース',
    ['11', 'Bass DI',      'SansAmp DI',  'DI',  '',  '',       '11', 'SB2-3', 'XLR', '10m', ''],
    ['12', 'Bass Amp',     'MD421',       'Mic', '',  'ショート', '12', 'SB2-4', 'XLR', '10m', ''],
    'ギター',
    ['13', 'Gt. L',        'SM57',        'Mic', '',  'ショート', '13', 'SB2-5', 'XLR', '10m', ''],
    ['14', 'Gt. R',        'SM57',        'Mic', '',  'ショート', '14', 'SB2-6', 'XLR', '10m', ''],
    'キーボード',
    ['15', 'Keys L',       'DI box',      'DI',  '1', '',       '15', 'SB2-7', 'XLR', '10m', ''],
    ['16', 'Keys R',       'DI box',      'DI',  '1', '',       '16', 'SB2-8', 'XLR', '10m', ''],
    'ボーカル',
    ['17', 'Vo.1 (Lead)',  'UR4D + SM58', 'WL',  '',  'トール',   '17', '—',     '—',   '—',   '電池確認'],
    ['18', 'Vo.2',         'UR4D + SM58', 'WL',  '',  'トール',   '18', '—',     '—',   '—',   ''],
    ['19', 'Vo.3',         'UR4D + SM58', 'WL',  '',  'トール',   '19', '—',     '—',   '—',   ''],
    '再生・その他',
    ['20', 'Playback L',   'PC / DI',     'PB',  '',  '',       '20', 'DI-1',  'XLR', '10m', ''],
    ['21', 'Playback R',   'PC / DI',     'PB',  '',  '',       '21', 'DI-2',  'XLR', '10m', ''],
    ['22', 'Talkback',     'SM58S',       'TB',  '',  '',       'TB', '—',     'XLR', '—',   '卓脇'],
  ];

  const SAMPLE_BAND_OUT = [
    'メイン',
    ['1',  'Main L',     'MAIN L', 'PA Processor In1', 'RB-1', 'XLR', '50m', ''],
    ['2',  'Main R',     'MAIN R', 'PA Processor In2', 'RB-2', 'XLR', '50m', ''],
    ['3',  'Sub',        'MTX1',   'Sub Processor',    'RB-3', 'XLR', '30m', 'L+R MONO'],
    'モニター',
    ['4',  'MON 1',      'AUX1',   'Wedge 1 (Dr)',     'SB1-R1', 'XLR', '20m', 'ドラマー'],
    ['5',  'MON 2',      'AUX2',   'Wedge 2 (Ba)',     'SB1-R2', 'XLR', '20m', 'ベーシスト'],
    ['6',  'MON 3',      'AUX3',   'Wedge 3 (Gt)',     'SB1-R3', 'XLR', '15m', 'ギタリスト'],
    ['7',  'MON 4',      'AUX4',   'Wedge 4 (Vo)',     'SB1-R4', 'XLR', '15m', 'Vo.'],
    '収録',
    ['8',  'REC L',      'MTX2',   'Recorder In1',     '—',    'XLR', '5m',  ''],
    ['9',  'REC R',      'MTX3',   'Recorder In2',     '—',    'XLR', '5m',  ''],
    ['10', 'ロビー送り', 'MTX4',   'ロビー SP',        'RB-4', 'XLR', '30m', ''],
  ];

  const SAMPLE_TALK_IN = [
    '登壇者',
    ['1',  '卓上マイク 1', 'MX418',         'Mic', '1', '卓上', '1',  'SB1-1', 'XLR', '15m', ''],
    ['2',  '卓上マイク 2', 'MX418',         'Mic', '1', '卓上', '2',  'SB1-2', 'XLR', '15m', ''],
    ['3',  'ワイヤレス 1', 'UR4D + LM',     'WL',  '',  '',     '3',  '—',     '—',   '—',   ''],
    ['4',  'ワイヤレス 2', 'UR4D + LM',     'WL',  '',  '',     '4',  '—',     '—',   '—',   ''],
    '映像・再生',
    ['5',  'PC 音声 L',    'DI box',        'DI',  '',  '',     '5',  'DI-1',  'XLR', '10m', ''],
    ['6',  'PC 音声 R',    'DI box',        'DI',  '',  '',     '6',  'DI-2',  'XLR', '10m', ''],
    ['7',  '映像音声 L',   'HDMI De-emb',   'PB',  '',  '',     '7',  '—',     'RCA', '—',   ''],
    ['8',  '映像音声 R',   'HDMI De-emb',   'PB',  '',  '',     '8',  '—',     'RCA', '—',   ''],
    'その他',
    ['9',  '司会',         'WL ハンド',      'WL',  '',  '',     '9',  '—',     '—',   '—',   ''],
    ['10', 'BGM',          'PC / SE',       'PB',  '',  '',     '10', 'DI-3',  'XLR', '10m', '本番キュー確認'],
  ];

  const SAMPLE_TALK_OUT = [
    ['1', 'Main L',   'MAIN L', '会場 SP L',     '—', 'XLR', '30m', ''],
    ['2', 'Main R',   'MAIN R', '会場 SP R',     '—', 'XLR', '30m', ''],
    ['3', '返し',     'AUX1',   '登壇者モニター', '—', 'XLR', '15m', ''],
    ['4', '配信送り', 'MTX1',   '配信卓',        '—', 'XLR', '10m', '-10dB'],
  ];

  /* gear: no, name, model, qty, spare, case, note */
  const SAMPLE_BAND_GEAR_EXTRA = [
    '卓・周辺',
    ['', 'デジタルミキサー',   '',       '1', '',  '卓ケース',   ''],
    ['', 'ヘッドフォン',       '',       '1', '1', '卓ケース',   ''],
    '電源・小物',
    ['', '電源ドラム',         '30m',    '2', '',  '',           ''],
    ['', 'テーブルタップ',     '6口',    '6', '2', '小物ケース', ''],
    ['', '単3 電池',           '',       '12', '12', '小物ケース', 'ワイヤレス用'],
    ['', 'パーマセル（黒）',   '',       '2', '',  '小物ケース', ''],
  ];

  const SAMPLE_TALK_GEAR_EXTRA = [
    '卓・周辺',
    ['', 'アナログミキサー',   '12ch',   '1', '',  '卓ケース',   ''],
    '電源・小物',
    ['', '電源ドラム',         '30m',    '1', '',  '',           ''],
    ['', '単3 電池',           '',       '8', '8', '小物ケース', 'ワイヤレス用'],
    ['', 'マイクホルダー',     '',       '2', '1', '小物ケース', ''],
  ];

  function sampleDoc(kind) {
    const s = emptyState();
    s.meta.date = todayISO();
    if (kind === 'band') {
      s.meta.title = 'バンドライブ 音響回線表';
      s.meta.venue = '○○ライブハウス';
      s.meta.note = 'マイクは SM58 × 6、SM57 × 3 を用意。\n16:00 仕込み / 17:00 サウンドチェック。';
      s.input = rowsFrom('input', SAMPLE_BAND_IN);
      s.output = rowsFrom('output', SAMPLE_BAND_OUT);
      s.gear = aggregateGear(s).concat(rowsFrom('gear', SAMPLE_BAND_GEAR_EXTRA));
      s.pickNote = '帰庫時はケーブルを8の字巻きでまとめ、長さ別に仕分けること。';
    } else {
      s.meta.title = '講演 音響回線表';
      s.meta.venue = '○○ホール';
      s.meta.note = '受付でワイヤレスの電池残量を確認。発表者PCの音声は会場で実測。';
      s.input = rowsFrom('input', SAMPLE_TALK_IN);
      s.output = rowsFrom('output', SAMPLE_TALK_OUT);
      s.gear = aggregateGear(s).concat(rowsFrom('gear', SAMPLE_TALK_GEAR_EXTRA));
    }
    renumberList(s.gear);
    return s;
  }

  function blankDoc() {
    const s = emptyState();
    s.meta.date = todayISO();
    for (let i = 1; i <= 8; i += 1) {
      const r = blankRow('input');
      r.no = String(i);
      r.console = String(i);
      s.input.push(r);
    }
    for (let i = 1; i <= 4; i += 1) {
      const r = blankRow('output');
      r.no = String(i);
      s.output.push(r);
    }
    return s;
  }

  /* ---------------------------------------------------------
     persistence — プロジェクトストアへ渡す
     --------------------------------------------------------- */

  let saveTimer = null;

  function emitChange() {
    saveTimer = null;
    if (onChange) onChange(state);
  }

  function save() {
    if (!active || !onChange) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(emitChange, 220);
  }

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      emitChange();
    }
  }

  /* ---------------------------------------------------------
     history
     - 構造変更（行追加・削除・移動など）は snapshot() で直前を保存
     - セル入力は「フォーカス時の状態」を、最初の入力時にだけ積む
     --------------------------------------------------------- */

  const undoStack = [];
  const redoStack = [];
  let pendingSnap = null;

  function pushUndo(json) {
    if (undoStack.length && undoStack[undoStack.length - 1] === json) return;
    undoStack.push(json);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function snapshot() {
    pendingSnap = null;
    pushUndo(JSON.stringify(state));
  }

  function armPending() {
    pendingSnap = JSON.stringify(state);
  }

  function consumePending() {
    if (pendingSnap) { pushUndo(pendingSnap); pendingSnap = null; }
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
     duplicate detection（卓CH / BOX の重複）
     --------------------------------------------------------- */

  function normKey(v) {
    return String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
  }

  function findDupes(sec) {
    const result = {}; // id -> [keys]
    let count = 0;
    COLS[sec].filter((c) => c.dupe).forEach((c) => {
      const map = {};
      state[sec].forEach((r) => {
        if (r.type === 'group' || isBlankMark(r[c.key])) return;
        const k = normKey(r[c.key]);
        (map[k] = map[k] || []).push(r.id);
      });
      Object.keys(map).forEach((k) => {
        if (map[k].length < 2) return;
        count += map[k].length;
        map[k].forEach((id) => { (result[id] = result[id] || []).push(c.key); });
      });
    });
    return { byId: result, count: count };
  }

  function refreshDupes(sec) {
    const table = $('.edit-table[data-sec="' + sec + '"]');
    if (!table) return;
    const d = findDupes(sec);
    $$('td.dupe', table).forEach((td) => { td.classList.remove('dupe'); td.removeAttribute('title'); });
    Object.keys(d.byId).forEach((id) => {
      d.byId[id].forEach((key) => {
        const el = $('tr[data-id="' + id + '"] [data-k="' + key + '"]', table);
        if (!el) return;
        const td = el.closest('td');
        td.classList.add('dupe');
        td.title = '重複しています';
      });
    });
    const warn = $('[data-warn="' + sec + '"]');
    if (warn) {
      warn.hidden = !d.count;
      warn.textContent = '重複 ' + d.count;
    }
  }

  /* ---------------------------------------------------------
     rendering — screen editor
     --------------------------------------------------------- */

  function cellHTML(sec, row, c) {
    if (c.toggle) {
      const on = row[c.key] === '1';
      return '<td class="tg"><button type="button" class="ph-btn' + (on ? ' on' : '') + '" data-k="' + c.key + '" aria-pressed="' + on + '" aria-label="ファンタム電源 +48V">' + (on ? '48V' : '') + '</button></td>';
    }
    const attrs = [
      'data-k="' + c.key + '"',
      'value="' + esc(row[c.key]) + '"',
      'aria-label="' + esc(c.label) + '"',
      'autocomplete="off"',
      'spellcheck="false"',
    ];
    if (c.list) attrs.push('list="' + c.list + '"');
    if (c.align === 'c') attrs.push('class="ta-c"');
    if (c.key === 'name') attrs.push('class="nm"');
    return '<td><input ' + attrs.join(' ') + '></td>';
  }

  function renderSection(sec) {
    const card = $('.sec-card[data-sec="' + sec + '"]');
    const table = $('.edit-table[data-sec="' + sec + '"]', card);
    const list = state[sec];
    const cols = visibleCols(sec);
    $('[data-count="' + sec + '"]').textContent = secCountText(sec);
    card.classList.toggle('is-empty', !list.length);

    const colgroup = '<colgroup><col class="c-grip">' +
      cols.map((c) => '<col style="width:' + c.w + '">').join('') +
      '<col class="c-act"></colgroup>';

    const head = '<thead><tr><th class="th-grip"></th>' +
      cols.map((c) => '<th class="' + c.align + '">' + esc(c.label) + '</th>').join('') +
      '<th class="th-act"></th></tr></thead>';

    const grip = '<td class="grip-cell"><span class="grip" draggable="true" title="ドラッグで並べ替え（Alt + ↑↓）">⋮⋮</span></td>';
    const act = '<td class="act-cell"><button type="button" class="row-menu-btn" data-act="row-menu" title="行の操作" aria-label="行の操作">⋯</button></td>';

    const body = list.map((row) => {
      if (row.type === 'group') {
        return '<tr class="group-row" data-id="' + row.id + '">' + grip +
          '<td class="group-cell" colspan="' + cols.length + '">' +
          '<input data-k="name" value="' + esc(row.name) + '" placeholder="見出し（例: ドラムス）" aria-label="見出し" autocomplete="off" spellcheck="false">' +
          '</td>' + act + '</tr>';
      }
      return '<tr data-id="' + row.id + '">' + grip +
        cols.map((c) => cellHTML(sec, row, c)).join('') + act + '</tr>';
    }).join('');

    table.innerHTML = colgroup + head + '<tbody>' + body + '</tbody>';
    refreshDupes(sec);
  }

  function renderEditor() {
    const empty = !totalRows() && !state.meta.title;
    $('#empty-state').hidden = !empty;
    $$('.sec-card').forEach((card) => { card.hidden = empty; });
    if (empty) return;
    EDIT_SECS.forEach(renderSection);
  }

  /* ---------------------------------------------------------
     rendering — A4 sheet (measured pagination)
     --------------------------------------------------------- */

  const MM = 96 / 25.4;

  function docLabel() {
    const hasIn = state.input.length > 0;
    const hasOut = state.output.length > 0;
    if (hasIn && hasOut) return 'INPUT / OUTPUT LIST';
    if (hasOut) return 'OUTPUT LIST';
    return 'INPUT LIST';
  }

  function headHTML(title, meta) {
    const metaParts = [];
    if (meta.venue) metaParts.push('<span><b>会場</b>' + esc(meta.venue) + '</span>');
    if (meta.date) metaParts.push('<span><b>日付</b>' + esc(formatDate(meta.date)) + '</span>');
    if (meta.author) metaParts.push('<span><b>作成</b>' + esc(meta.author) + '</span>');
    const inN = dataCount('input');
    const outN = dataCount('output');
    if (inN || outN) {
      const parts = [];
      if (inN) parts.push('IN ' + inN);
      if (outN) parts.push('OUT ' + outN);
      metaParts.push('<span><b>回線数</b>' + parts.join(' / ') + '</span>');
    }

    let html = '<header class="doc-head">';
    html += '<div class="dh-top"><span class="dh-label">' + docLabel() + '</span>' +
      '<span class="dh-rev">' + esc(meta.rev) + '</span></div>';
    html += '<h1 class="dh-title">' + esc(title) + '</h1>';
    if (metaParts.length) html += '<div class="dh-meta">' + metaParts.join('') + '</div>';
    html += '</header>';
    return html;
  }

  function printCell(row, c) {
    if (c.toggle) return row[c.key] === '1' ? '48V' : '';
    return esc(row[c.key]);
  }

  function rowHTML(row, cols) {
    if (row.type === 'group') {
      return '<tr class="g"><td colspan="' + cols.length + '">' + (esc(row.name) || '&nbsp;') + '</td></tr>';
    }
    return '<tr>' + cols.map((c) => {
      const cls = (c.align || '') + (c.key === 'name' ? ' nm' : '') + (c.toggle ? ' ph' : '');
      return '<td class="' + cls.trim() + '">' + printCell(row, c) + '</td>';
    }).join('') + '</tr>';
  }

  function secLabelHTML(sec, cont) {
    const n = dataCount(sec);
    return '<div class="sec-label"><span>' + SEC_INFO[sec].label + '</span>' +
      '<span class="sec-sub">' + SEC_INFO[sec].ja + (n ? ' ' + n + SEC_INFO[sec].unit : '') +
      (cont ? '（続き）' : '') + '</span></div>';
  }

  function tableOpen(cols) {
    return '<table class="doc-table"><colgroup>' +
      cols.map((c) => '<col style="width:' + c.pw + '">').join('') +
      '</colgroup><thead><tr>' +
      cols.map((c) => '<th class="' + (c.align || '') + '">' + esc(c.label) + '</th>').join('') +
      '</tr></thead><tbody>';
  }

  /* ---------- 回線表（INPUT / OUTPUT） ---------- */

  function buildLinesDoc(measure, ctx) {
    const meta = state.meta;
    const title = (meta.title || '').trim() || '音響回線表';
    const head = headHTML(title, meta);
    const run = '<div class="page-run"><span>' + esc(title) + '</span><span>' + esc(meta.rev) + '</span></div>';
    const note = meta.note && meta.note.trim() ? '<div class="doc-note">' + esc(meta.note) + '</div>' : '';
    const secs = SECS.filter((s) => state[s].length);

    /* ---- pass 1: measure ---- */
    let mh = head + run;
    secs.forEach((sec) => {
      const cols = visibleCols(sec);
      mh += '<div class="m-sec" data-sec="' + sec + '">' + secLabelHTML(sec, false) + tableOpen(cols) +
        state[sec].map((r) => rowHTML(r, cols)).join('') + '</tbody></table></div>';
    });
    mh += note;
    measure.innerHTML = mh;

    const px = ctx.px;
    if (!px($('.doc-head', measure))) return null;
    const headH = px($('.doc-head', measure)) + 3 * MM;
    const runH = px($('.page-run', measure)) + 2 * MM;
    const noteEl = $('.doc-note', measure);
    const noteH = noteEl ? px(noteEl) + 3 * MM : 0;

    const secMeta = {};
    secs.forEach((sec) => {
      const box = $('.m-sec[data-sec="' + sec + '"]', measure);
      const label = $('.sec-label', box);
      const ls = getComputedStyle(label);
      secMeta[sec] = {
        labelH: px(label) + parseFloat(ls.marginTop) + parseFloat(ls.marginBottom),
        theadH: px($('thead', box)),
        rowH: $$('tbody tr', box).map(px),
      };
    });

    /* ---- pass 2: paginate ---- */
    const pages = [];
    let page = null;
    let avail = 0;
    function newPage() {
      page = { first: !pages.length, blocks: [], note: false };
      pages.push(page);
      avail = ctx.contentH - (page.first ? headH : runH);
    }
    newPage();

    secs.forEach((sec, si) => {
      const m = secMeta[sec];
      const list = state[sec];
      if (si > 0 && sec === 'output' && state.outputBreak && page.blocks.length) newPage();
      let block = null;
      let i = 0;
      while (i < list.length) {
        const h = m.rowH[i] || 0;
        const isGroup = list[i].type === 'group';
        /* 見出し行が単独でページ末尾に残らないよう、次の行ぶんも確保する */
        const need = h + (isGroup && i + 1 < list.length ? (m.rowH[i + 1] || 0) : 0);
        const overhead = block ? 0 : m.labelH + m.theadH;
        if (overhead + need > avail && (block || page.blocks.length)) {
          newPage();
          block = null;
          continue;
        }
        if (!block) {
          block = { sec: sec, cont: i > 0, rows: [] };
          page.blocks.push(block);
          avail -= overhead;
        }
        block.rows.push(list[i]);
        avail -= h;
        i += 1;
      }
    });

    if (note) {
      if (noteH > avail && (page.blocks.length || !page.first)) newPage();
      page.note = true;
    }

    /* ---- pass 3: html ---- */
    return pages.map((p) => {
      let inner = p.first ? head : run;
      if (!secs.length && p.first) inner += '<div class="doc-empty">（回線がまだありません）</div>';
      p.blocks.forEach((b) => {
        const cols = visibleCols(b.sec);
        inner += secLabelHTML(b.sec, b.cont) + tableOpen(cols) +
          b.rows.map((r) => rowHTML(r, cols)).join('') + '</tbody></table>';
      });
      if (p.note) inner += note;
      return { kind: 'lines', html: inner };
    });
  }

  /* ---------- 機材ピックリスト ---------- */

  function pickCols() {
    const cols = visibleCols('gear').slice();
    const si = cols.findIndex((c) => c.key === 'spare');
    if (si !== -1) cols.splice(si + 1, 0, { key: '_total', label: '計', align: 'c', pw: '9mm', total: true });
    return cols;
  }

  function pickCheckWidth() {
    const n = state.pickPhases.length;
    if (state.paper === 'landscape') return n > 4 ? '15mm' : '18mm';
    return n > 4 ? '9.5mm' : '11.5mm';
  }

  function pickTableOpen(cols) {
    const phases = state.pickPhases;
    const cw = pickCheckWidth();
    return '<table class="doc-table pick-table"><colgroup>' +
      cols.map((c) => '<col style="width:' + c.pw + '">').join('') +
      phases.map(() => '<col style="width:' + cw + '">').join('') +
      '</colgroup><thead><tr>' +
      cols.map((c) => '<th class="' + (c.align || '') + '">' + esc(c.label) + '</th>').join('') +
      phases.map((p) => '<th class="c ck-h">' + esc(p) + '</th>').join('') +
      '</tr></thead><tbody>';
  }

  function pickRowHTML(row, cols) {
    const phases = state.pickPhases;
    if (row.type === 'group') {
      return '<tr class="g"><td colspan="' + (cols.length + phases.length) + '">' + (esc(row.name) || '&nbsp;') + '</td></tr>';
    }
    const total = gearRowTotal(row);
    const cells = cols.map((c) => {
      if (c.total) return '<td class="c tot">' + (total || '') + '</td>';
      const cls = (c.align || '') + (c.key === 'name' ? ' nm' : '');
      return '<td class="' + cls.trim() + '">' + esc(row[c.key]) + '</td>';
    }).join('');
    /* 数量が 2 以上なら「／6」を薄く入れ、数えた数を書き込めるようにする */
    const hint = total > 1 ? '<span class="ck-of">/' + total + '</span>' : '';
    return '<tr>' + cells + phases.map(() => '<td class="ck">' + hint + '</td>').join('') + '</tr>';
  }

  function pickHeadHTML(title, meta) {
    const metaParts = [];
    if (meta.venue) metaParts.push('<span><b>会場</b>' + esc(meta.venue) + '</span>');
    if (meta.date) metaParts.push('<span><b>日付</b>' + esc(formatDate(meta.date)) + '</span>');
    if (meta.author) metaParts.push('<span><b>作成</b>' + esc(meta.author) + '</span>');
    const n = dataCount('gear');
    if (n) {
      const t = gearTotal();
      metaParts.push('<span><b>品目</b>' + n + (t ? ' / 総数 ' + t : '') + '</span>');
    }
    let html = '<header class="doc-head">';
    html += '<div class="dh-top"><span class="dh-label">EQUIPMENT PICK LIST</span>' +
      '<span class="dh-rev">' + esc(meta.rev) + '</span></div>';
    html += '<h1 class="dh-title">' + esc(title) + '<span class="dh-kind">機材ピックリスト</span></h1>';
    if (metaParts.length) html += '<div class="dh-meta">' + metaParts.join('') + '</div>';
    html += '</header>';
    return html;
  }

  /* 工程ごとのサイン欄（担当 / 日時 / 確認） */
  function pickSignHTML() {
    const phases = state.pickPhases;
    if (!phases.length) return '';
    return '<div class="pick-sign" style="grid-template-columns:repeat(' + phases.length + ',minmax(0,1fr))">' +
      phases.map((p) => '<div class="ps-box"><div class="ps-name">' + esc(p) + '</div>' +
        '<div class="ps-line"><b>日時</b><span></span></div>' +
        '<div class="ps-line"><b>担当</b><span></span></div>' +
        '<div class="ps-line"><b>確認</b><span></span></div></div>').join('') +
      '</div>';
  }

  function pickFootHTML() {
    const note = state.pickNote && state.pickNote.trim() ? '<div class="pick-note">' + esc(state.pickNote) + '</div>' : '';
    return '<div class="pick-foot">' + note +
      '<div class="pick-memo"><div class="pm-title">不足・破損・追加メモ</div>' +
      '<div class="pm-lines"><span></span><span></span><span></span><span></span></div></div></div>';
  }

  function buildPickDoc(measure, ctx) {
    const meta = state.meta;
    const base = (meta.title || '').trim() || '音響回線表';
    const head = pickHeadHTML(base, meta) + pickSignHTML();
    const run = '<div class="page-run"><span>' + esc(base) + ' — 機材ピックリスト</span><span>' + esc(meta.rev) + '</span></div>';
    const legend = '<div class="pick-legend">チェック欄には ✓ または数えた数を記入（「/6」は持ち出し総数）。不足・破損は下のメモ欄へ。</div>';
    const foot = pickFootHTML();
    const cols = pickCols();
    const list = state.gear;

    measure.innerHTML = '<div class="m-head">' + head + '</div>' + run + legend +
      pickTableOpen(cols) + list.map((r) => pickRowHTML(r, cols)).join('') + '</tbody></table>' + foot;

    const px = ctx.px;
    const mHead = $('.m-head', measure);
    if (!px(mHead)) return null;
    const headH = px(mHead) + 3 * MM;
    const runH = px($('.page-run', measure)) + 2 * MM;
    const legendH = px($('.pick-legend', measure)) + 1.2 * MM;
    const theadH = px($('.pick-table thead', measure));
    const rowH = $$('.pick-table tbody tr', measure).map(px);
    const footH = px($('.pick-foot', measure)) + 3 * MM;

    const pages = [];
    let page = null;
    let avail = 0;
    function newPage() {
      page = { first: !pages.length, rows: [], foot: false };
      pages.push(page);
      avail = ctx.contentH - (page.first ? headH + legendH : runH) - theadH;
    }
    newPage();
    let i = 0;
    while (i < list.length) {
      const h = rowH[i] || 0;
      const need = h + (list[i].type === 'group' && i + 1 < list.length ? (rowH[i + 1] || 0) : 0);
      if (need > avail && page.rows.length) { newPage(); continue; }
      page.rows.push(list[i]);
      avail -= h;
      i += 1;
    }
    if (footH > avail && page.rows.length) newPage();
    page.foot = true;

    return pages.map((p) => {
      let inner = p.first ? head + legend : run;
      if (p.rows.length) {
        inner += pickTableOpen(cols) + p.rows.map((r) => pickRowHTML(r, cols)).join('') + '</tbody></table>';
      } else if (p.first) {
        inner += '<div class="doc-empty">（機材がまだありません）</div>';
      }
      if (p.foot) inner += foot;
      return { kind: 'pick', html: inner };
    });
  }

  function currentScope() {
    return printOverride || state.printScope;
  }

  function renderPrint() {
    const pagesEl = $('#sheet-pages');
    const measure = $('#measure-sheet');
    if (!pagesEl || !measure) return;

    const paper = state.paper;
    const pageW = paper === 'landscape' ? 297 : 210;
    const pageH = paper === 'landscape' ? 210 : 297;
    const scope = currentScope();
    const hasLines = SECS.some((s) => state[s].length);
    const hasGear = state.gear.length > 0;

    const docs = [];
    if (scope === 'lines' || (scope === 'all' && (hasLines || !hasGear))) docs.push('lines');
    if (scope === 'pick' || (scope === 'all' && hasGear)) docs.push('pick');

    measure.dataset.paper = paper;
    measure.dataset.density = state.density;
    measure.style.width = pageW + 'mm';

    const ctx = {
      px: (el) => (el ? el.getBoundingClientRect().height : 0),
      contentH: (pageH - 24) * MM - 1.5 * MM, // padding 12mm × 2 + safety
    };

    const sets = [];
    for (let d = 0; d < docs.length; d += 1) {
      const pages = docs[d] === 'pick' ? buildPickDoc(measure, ctx) : buildLinesDoc(measure, ctx);
      /* 計測できない状態（非表示など）では、直前のページ割りを維持する */
      if (!pages) { if (pagesEl.children.length) return; continue; }
      sets.push(pages);
    }

    const all = [];
    sets.forEach((pages) => {
      pages.forEach((p, pi) => {
        const label = p.kind === 'pick' ? 'PICK LIST ' : '';
        all.push('<section class="print-sheet sheet-page' + (p.kind === 'pick' ? ' pick-page' : '') +
          '" data-paper="' + paper + '" data-density="' + state.density + '">' + p.html +
          '<div class="page-num">' + label + (pi + 1) + ' / ' + pages.length + '</div></section>');
      });
    });
    pagesEl.innerHTML = all.join('');

    applyPageStyle();

    const total = all.length;
    const paperLabel = 'A4 ' + (paper === 'landscape' ? '横' : '縦');
    const tag = $('#preview-tag');
    if (tag) tag.textContent = SCOPE_LABEL[scope] + ' / ' + paperLabel + ' / ' + total + 'ページ';
    const pc = $('#page-count');
    if (pc && !printOverride) pc.textContent = paperLabel + ' · ' + total + 'ページ';

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
  let printOverride = null; // プレビュー / 印刷時だけ一時的に印刷範囲を切り替える
  function schedulePrint() {
    clearTimeout(printTimer);
    printTimer = setTimeout(renderPrint, 200);
  }

  /* ---------------------------------------------------------
     rendering — settings + meta
     --------------------------------------------------------- */

  const SCOPE_LABEL = { all: '回線表＋ピックリスト', lines: '回線表のみ', pick: 'ピックリストのみ' };

  function renderSettings() {
    $$('.seg').forEach((seg) => {
      const key = seg.dataset.setting;
      const value = key === 'paper' ? state.paper : key === 'scope' ? state.printScope : state.density;
      $$('button', seg).forEach((btn) => btn.classList.toggle('on', btn.dataset.val === value));
    });

    $$('.chips input[data-col]').forEach((input) => {
      input.checked = state.hidden.indexOf(input.dataset.col) === -1;
    });

    const brk = $('#opt-output-break');
    if (brk) brk.checked = !!state.outputBreak;

    const note = $('.summary-note');
    if (note) {
      const paper = state.paper === 'landscape' ? '横' : '縦';
      const size = { compact: '小', normal: '中', large: '大' }[state.density] || '中';
      note.textContent = 'A4 ' + paper + ' / 文字 ' + size + (state.outputBreak ? ' / OUTPUT 改ページ' : '') +
        ' / ' + SCOPE_LABEL[state.printScope];
    }

    applyPageStyle();
  }

  function syncMeta() {
    $$('[data-meta]').forEach((el) => { el.value = state.meta[el.dataset.meta] || ''; });
    const ph = $('#pick-phases');
    if (ph) ph.value = state.pickPhases.join(', ');
    const pn = $('#pick-note');
    if (pn) pn.value = state.pickNote;
  }

  function buildColumnChips() {
    EDIT_SECS.forEach((sec) => {
      const box = $('#column-chips-' + sec);
      box.innerHTML = COLS[sec].filter((c) => !c.fixed).map((c) => {
        const id = sec + ':' + c.key;
        return '<label class="chip"><input type="checkbox" data-col="' + id + '"><span>' + esc(c.label) + '</span></label>';
      }).join('');
    });

    $('#settings').addEventListener('change', (e) => {
      const input = e.target.closest('input[data-col]');
      if (input) {
        snapshot();
        const id = input.dataset.col;
        if (input.checked) state.hidden = state.hidden.filter((k) => k !== id);
        else if (state.hidden.indexOf(id) === -1) state.hidden.push(id);
        commit();
        return;
      }
      if (e.target.id === 'opt-output-break') {
        snapshot();
        state.outputBreak = e.target.checked;
        commit();
      }
    });
  }

  /* ---------------------------------------------------------
     commit
     --------------------------------------------------------- */

  let suppressArm = false;

  function focusEl(el) {
    if (!el) return;
    suppressArm = true;
    el.focus();
    if (el.select) el.select();
    suppressArm = false;
    armPending();
  }

  function commit(opts) {
    const options = opts || {};
    save();
    renderSettings();
    renderEditor();
    renderPrint();
    if (options.focus) focusEl($(options.focus));
  }

  function cellSel(id, key) {
    return '.edit-table tr[data-id="' + id + '"] [data-k="' + key + '"]';
  }

  /* ---------------------------------------------------------
     row operations（すべてセクション内で完結）
     --------------------------------------------------------- */

  function prevDataRow(list, index) {
    for (let i = index; i >= 0; i -= 1) if (list[i] && list[i].type !== 'group') return list[i];
    return null;
  }

  function maxNo(sec) {
    let max = 0;
    state[sec].forEach((r) => {
      if (r.type === 'group') return;
      const n = parseInt(r.no, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max;
  }

  /* 直前の行を参考に、No.・卓CH・BOX を +1、種別・ケーブル・長さを引き継ぐ */
  function smartRow(sec, ref) {
    const row = blankRow(sec);
    row.no = String(maxNo(sec) + 1);
    if (sec === 'gear') {
      if (ref) row.case = ref.case;
      return row;
    }
    if (!ref) {
      if (sec === 'input') row.console = row.no;
      return row;
    }
    row.console = incr(ref.console);
    row.box = incr(ref.box);
    row.cable = ref.cable;
    row.length = ref.length;
    if (sec === 'input') {
      row.kind = ref.kind;
      row.stand = ref.stand;
    }
    return row;
  }

  function insertIndex(sec, afterId) {
    if (!afterId) return state[sec].length;
    const i = state[sec].findIndex((r) => r.id === afterId);
    return i === -1 ? state[sec].length : i + 1;
  }

  function addRow(sec, afterId, focusKey) {
    snapshot();
    const at = insertIndex(sec, afterId);
    const row = smartRow(sec, prevDataRow(state[sec], at - 1));
    state[sec].splice(at, 0, row);
    commit({ focus: cellSel(row.id, focusKey || 'name') });
  }

  function addRows(sec, count) {
    snapshot();
    let last = null;
    for (let i = 0; i < count; i += 1) {
      const row = smartRow(sec, prevDataRow(state[sec], state[sec].length - 1));
      state[sec].push(row);
      if (!last) last = row;
    }
    commit({ focus: cellSel(last.id, 'name') });
  }

  function insertRowAbove(id) {
    const f = findRow(id);
    if (!f) return;
    snapshot();
    const row = smartRow(f.sec, prevDataRow(f.list, f.index - 1));
    row.no = '';
    f.list.splice(f.index, 0, row);
    commit({ focus: cellSel(row.id, 'name') });
  }

  function addGroup(sec, afterId) {
    snapshot();
    const group = { id: uid(), type: 'group', name: '' };
    state[sec].splice(insertIndex(sec, afterId), 0, group);
    commit({ focus: cellSel(group.id, 'name') });
  }

  function duplicateRow(id, focusKey) {
    const f = findRow(id);
    if (!f) return;
    snapshot();
    const copy = Object.assign({}, f.row, { id: uid() });
    if (copy.type !== 'group') {
      copy.no = String(maxNo(f.sec) + 1);
    }
    if (copy.type !== 'group' && f.sec !== 'gear') {
      copy.console = incr(f.row.console) || f.row.console;
      copy.box = incr(f.row.box) || f.row.box;
    }
    f.list.splice(f.index + 1, 0, copy);
    commit({ focus: cellSel(copy.id, focusKey || 'name') });
  }

  function deleteRow(id, focusKey) {
    const f = findRow(id);
    if (!f) return;
    snapshot();
    f.list.splice(f.index, 1);
    const near = f.list[f.index] || f.list[f.index - 1];
    let sel;
    if (near) sel = cellSel(near.id, near.type === 'group' ? 'name' : (focusKey || 'name'));
    commit(sel ? { focus: sel } : undefined);
    toast('行を削除しました（⌘Z で戻せます）');
  }

  function moveRow(id, delta, focusKey) {
    const f = findRow(id);
    if (!f) return;
    const j = f.index + delta;
    if (j < 0 || j >= f.list.length) return;
    snapshot();
    f.list.splice(f.index, 1);
    f.list.splice(j, 0, f.row);
    commit(focusKey ? { focus: cellSel(id, focusKey) } : undefined);
  }

  function renumber(sec) {
    if (!dataCount(sec)) return;
    snapshot();
    let n = 1;
    state[sec].forEach((row) => {
      if (row.type === 'group') return;
      row.no = String(n);
      n += 1;
    });
    commit();
    toast(SEC_INFO[sec].label + ' の No. を 1 から振り直しました');
  }

  function clearSection(sec) {
    if (!state[sec].length) return;
    if (!window.confirm(SEC_INFO[sec].label + ' の行をすべて削除します。よろしいですか？')) return;
    snapshot();
    state[sec] = [];
    commit();
    toast(SEC_INFO[sec].label + ' を空にしました（⌘Z で戻せます）');
  }

  /* ---------------------------------------------------------
     paste（Excel / スプレッドシートからの複数セル貼り付け）
     --------------------------------------------------------- */

  function parseTSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    while (rows.length && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();
    return rows;
  }

  function handlePaste(e, input) {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || (text.indexOf('\t') === -1 && !/[\r\n]./.test(text.trim()))) return;
    const grid = parseTSV(text);
    if (!grid.length) return;
    e.preventDefault();

    const tr = input.closest('tr[data-id]');
    const f = findRow(tr.dataset.id);
    if (!f) return;
    const cols = visibleCols(f.sec);
    const startCol = Math.max(0, cols.findIndex((c) => c.key === input.dataset.k));

    snapshot();
    let idx = f.index;
    let firstId = null;
    let filled = 0;
    grid.forEach((cells) => {
      /* 見出し行は飛ばして次のデータ行へ（足りなければ追加） */
      while (idx < f.list.length && f.list[idx].type === 'group' && !(f.list[idx].id === f.row.id && startCol === 1)) idx += 1;
      if (idx >= f.list.length) {
        const r = blankRow(f.sec);
        f.list.push(r);
      }
      const row = f.list[idx];
      if (!firstId) firstId = row.id;
      cells.forEach((v, ci) => {
        const c = cols[startCol + ci];
        if (!c) return;
        if (row.type === 'group') { if (c.key === 'name') row.name = v.trim(); return; }
        row[c.key] = c.toggle ? truthyPhantom(v) : v.trim();
      });
      filled += 1;
      idx += 1;
    });
    commit({ focus: cellSel(firstId, input.dataset.k) });
    toast(filled + ' 行を貼り付けました');
  }

  /* ---------------------------------------------------------
     row menu（行の ⋯ ボタン）
     --------------------------------------------------------- */

  let rowMenuId = null;

  function openRowMenu(btn) {
    const tr = btn.closest('tr[data-id]');
    const menu = $('#row-menu');
    if (rowMenuId === tr.dataset.id && menu.classList.contains('open')) { closeRowMenu(); return; }
    rowMenuId = tr.dataset.id;
    const isGroup = tr.classList.contains('group-row');
    $('[data-ract="duplicate"]', menu).hidden = false;
    $('[data-ract="to-group"]', menu).hidden = isGroup;
    menu.classList.add('open');
    const r = btn.getBoundingClientRect();
    const mh = menu.offsetHeight;
    const mw = menu.offsetWidth;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    menu.style.top = top + 'px';
    menu.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) + 'px';
    btn.classList.add('active');
  }

  function closeRowMenu() {
    const menu = $('#row-menu');
    menu.classList.remove('open');
    rowMenuId = null;
    $$('.row-menu-btn.active').forEach((b) => b.classList.remove('active'));
  }

  function bindRowMenu() {
    const menu = $('#row-menu');
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('button[data-ract]');
      if (!item || !rowMenuId) return;
      const id = rowMenuId;
      const f = findRow(id);
      closeRowMenu();
      if (!f) return;
      const act = item.dataset.ract;
      if (act === 'above') insertRowAbove(id);
      else if (act === 'below') addRow(f.sec, id);
      else if (act === 'group-below') addGroup(f.sec, id);
      else if (act === 'duplicate') duplicateRow(id);
      else if (act === 'up') moveRow(id, -1);
      else if (act === 'down') moveRow(id, 1);
      else if (act === 'to-group') {
        snapshot();
        f.list.splice(f.index, 0, { id: uid(), type: 'group', name: '' });
        commit({ focus: cellSel(f.list[f.index].id, 'name') });
      } else if (act === 'delete') deleteRow(id);
    });
    document.addEventListener('mousedown', (e) => {
      if (!menu.classList.contains('open')) return;
      if (e.target.closest('#row-menu') || e.target.closest('.row-menu-btn')) return;
      closeRowMenu();
    });
    window.addEventListener('scroll', closeRowMenu, true);
    window.addEventListener('resize', closeRowMenu);
  }

  /* ---------------------------------------------------------
     drag & drop（同じセクション内のみ）
     --------------------------------------------------------- */

  let drag = null; // { id, sec }
  let dropTarget = null;

  function clearDropMarks() {
    $$('.edit-table tr.drop-before, .edit-table tr.drop-after').forEach((tr) => {
      tr.classList.remove('drop-before', 'drop-after');
    });
  }

  function bindDragAndDrop(table) {
    const sec = table.dataset.sec;

    table.addEventListener('dragstart', (e) => {
      const grip = e.target.closest('.grip');
      if (!grip) return;
      const tr = grip.closest('tr[data-id]');
      drag = { id: tr.dataset.id, sec: sec };
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', drag.id);
        e.dataTransfer.setDragImage(tr, 20, tr.offsetHeight / 2);
      } catch (err) { /* ignore */ }
      tr.classList.add('dragging');
    });

    table.addEventListener('dragend', () => {
      $$('.edit-table tr.dragging').forEach((tr) => tr.classList.remove('dragging'));
      drag = null;
      dropTarget = null;
      clearDropMarks();
    });

    table.addEventListener('dragover', (e) => {
      if (!drag || drag.sec !== sec) return;
      e.preventDefault();
      clearDropMarks();
      const tr = e.target.closest('tbody tr[data-id]');
      if (!tr || tr.dataset.id === drag.id) { dropTarget = null; return; }
      const rect = tr.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      tr.classList.add(after ? 'drop-after' : 'drop-before');
      dropTarget = { id: tr.dataset.id, after: after };
    });

    table.addEventListener('drop', (e) => {
      if (!drag || drag.sec !== sec) return;
      e.preventDefault();
      const list = state[sec];
      const from = list.findIndex((r) => r.id === drag.id);
      if (from === -1 || !dropTarget) return;
      snapshot();
      const row = list.splice(from, 1)[0];
      const idx = list.findIndex((r) => r.id === dropTarget.id);
      const to = idx === -1 ? list.length : idx + (dropTarget.after ? 1 : 0);
      list.splice(to, 0, row);
      drag = null;
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

  /* scope: 'pick' などを渡すと、そのプレビュー / 印刷のあいだだけ印刷範囲を切り替える */
  function openPreview(scope) {
    if (!active) return;
    printOverride = typeof scope === 'string' ? scope : null;
    renderPrint();
    $('#preview').classList.add('open');
    document.body.classList.add('no-scroll');
    $('#preview-scroll').scrollTop = 0;
    requestAnimationFrame(fitPreview);
    setTimeout(() => { fitPreview(); $('#preview-scroll').scrollTop = 0; }, 60);
  }

  function closePreview() {
    const modal = $('#preview');
    if (!modal.classList.contains('open')) return;
    modal.classList.remove('open');
    document.body.classList.remove('no-scroll');
    const hadOverride = !!printOverride;
    printOverride = null;
    if (hadOverride) renderPrint();
    $('#btn-preview').focus();
  }

  function printDoc(scope) {
    if (!active) return;
    const previewOpen = $('#preview').classList.contains('open');
    /* プレビューから印刷する場合は、プレビュー中の範囲をそのまま使う */
    if (typeof scope === 'string') printOverride = scope;
    else if (!previewOpen) printOverride = null;
    renderPrint();
    const trigger = document.getElementById('btn-pdf') || document.getElementById('btn-preview');
    if (trigger) trigger.blur();
    const originalTitle = document.title;
    const base = (state.meta.title || '音響回線表').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
    const suffix = currentScope() === 'pick' ? '_機材ピックリスト' : '';
    document.title = (base || '音響回線表') + suffix;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
      if (!$('#preview').classList.contains('open') && printOverride) {
        printOverride = null;
        renderPrint();
      }
    };
    window.addEventListener('afterprint', restore);
    setTimeout(restore, 5000);
    window.print();
  }

  /* ---------------------------------------------------------
     documents
     --------------------------------------------------------- */

  function confirmReplace(message) {
    if (!totalRows() && !state.meta.title) return true;
    return window.confirm(message || '現在の内容は置き換わります。よろしいですか？');
  }

  function replaceState(next, message) {
    snapshot();
    state = next;
    syncMeta();
    commit();
    toast(message);
  }

  function newDoc() {
    if (!confirmReplace()) return;
    replaceState(blankDoc(), '新規作成しました（⌘Z で戻せます）');
  }

  function loadSample(kind) {
    if (kind === 'blank') { replaceState(blankDoc(), '空の表で始めました'); return; }
    if (!confirmReplace('サンプルに置き換えます。よろしいですか？')) return;
    replaceState(sampleDoc(kind), 'サンプルを読み込みました');
  }

  /* ---------------------------------------------------------
     files
     --------------------------------------------------------- */

  function fileBase() {
    const title = (state.meta.title || '音響回線表').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
    const d = new Date();
    return title + '_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function exportJSON() {
    download(fileBase() + '.json', JSON.stringify(state, null, 2), 'application/json');
    toast('JSONを書き出しました');
  }

  function csvCell(value) {
    const s = String(value == null ? '' : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    const lines = [];
    EDIT_SECS.forEach((sec) => {
      if (!state[sec].length) return;
      const cols = visibleCols(sec);
      if (lines.length) lines.push('');
      lines.push(csvCell('[' + SEC_INFO[sec].label + ']'));
      lines.push(cols.map((c) => csvCell(c.label)).join(','));
      state[sec].forEach((row) => {
        if (row.type === 'group') {
          lines.push(['# ' + row.name].concat(cols.slice(1).map(() => '')).map(csvCell).join(','));
        } else {
          lines.push(cols.map((c) => csvCell(c.toggle ? (row[c.key] === '1' ? '48V' : '') : row[c.key])).join(','));
        }
      });
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
        replaceState(normalize(raw), 'JSONを読み込みました');
      } catch (err) {
        toast('読み込めませんでした（JSON形式を確認してください）');
      }
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------
     toast
     --------------------------------------------------------- */

  const toast = U.toast;

  /* ---------------------------------------------------------
     bindings
     --------------------------------------------------------- */

  let focusValue = null; // フォーカス時のセル値（未編集なら ⌘Z を表全体の取り消しに回す）

  function bindMeta() {
    $$('[data-meta]').forEach((el) => {
      el.addEventListener('focusin', () => { armPending(); focusValue = el.value; });
      el.addEventListener('input', () => {
        consumePending();
        state.meta[el.dataset.meta] = el.value;
        save();
        schedulePrint();
      });
    });
  }

  function editableCells(table) {
    return $$('tbody tr[data-id]', table);
  }

  function moveFocusVert(input, dir) {
    const tr = input.closest('tr[data-id]');
    const key = input.dataset.k;
    const table = tr.closest('table');
    const rows = editableCells(table);
    let i = rows.indexOf(tr) + dir;
    while (i >= 0 && i < rows.length) {
      const target = $('[data-k="' + key + '"]', rows[i]) || (rows[i].classList.contains('group-row') ? null : null);
      if (target) { focusEl(target); return true; }
      i += dir;
    }
    return false;
  }

  function bindTable(table) {
    const sec = table.dataset.sec;

    table.addEventListener('input', (e) => {
      const input = e.target.closest('input[data-k]');
      if (!input) return;
      const tr = input.closest('tr[data-id]');
      const f = tr && findRow(tr.dataset.id);
      if (!f) return;
      consumePending();
      f.row[input.dataset.k] = input.value;
      save();
      schedulePrint();
      const col = COLS[sec].find((c) => c.key === input.dataset.k);
      if (col && col.dupe) refreshDupes(sec);
      if (input.dataset.k === 'no' || f.row.type === 'group') return;
      $('[data-count="' + sec + '"]').textContent = secCountText(sec);
    });

    table.addEventListener('focusin', (e) => {
      if (!e.target.matches('input')) return;
      $$('.edit-table tr.is-current').forEach((tr) => tr.classList.remove('is-current'));
      const tr = e.target.closest('tr');
      if (tr) tr.classList.add('is-current');
      focusValue = e.target.value;
      if (!suppressArm) armPending();
    });

    table.addEventListener('focusout', (e) => {
      const tr = e.target.closest('tr');
      if (tr && !tr.contains(e.relatedTarget)) tr.classList.remove('is-current');
    });

    table.addEventListener('paste', (e) => {
      const input = e.target.closest('input[data-k]');
      if (input) handlePaste(e, input);
    });

    table.addEventListener('click', (e) => {
      const ph = e.target.closest('button.ph-btn');
      if (ph) {
        const f = findRow(ph.closest('tr[data-id]').dataset.id);
        if (!f) return;
        snapshot();
        f.row.phantom = f.row.phantom === '1' ? '' : '1';
        ph.classList.toggle('on', f.row.phantom === '1');
        ph.setAttribute('aria-pressed', String(f.row.phantom === '1'));
        ph.textContent = f.row.phantom === '1' ? '48V' : '';
        save();
        schedulePrint();
        return;
      }
      const menuBtn = e.target.closest('button[data-act="row-menu"]');
      if (menuBtn) { openRowMenu(menuBtn); return; }
    });

    table.addEventListener('keydown', (e) => {
      const el = e.target.closest('[data-k]');
      if (!el) return;
      const tr = el.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      const key = el.dataset.k;
      const mod = e.metaKey || e.ctrlKey;
      const composing = e.isComposing || e.keyCode === 229;
      if (composing) return;

      /* ⌘/Ctrl + Enter … 下に行を挿入 */
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        addRow(sec, id, key === 'name' || tr.classList.contains('group-row') ? 'name' : key);
        return;
      }
      /* ⌘/Ctrl + D … 行を複製 */
      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateRow(id, key);
        return;
      }
      /* ⌘/Ctrl + Shift + Backspace / Delete … 行を削除 */
      if (mod && e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        deleteRow(id, key);
        return;
      }
      /* Alt + ↑↓ … 行を移動 */
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        moveRow(id, e.key === 'ArrowUp' ? -1 : 1, key);
        return;
      }
      if (el.tagName !== 'INPUT') return;

      /* Enter / Shift+Enter … 下 / 上の行へ（最終行なら行を追加） */
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) { moveFocusVert(el, -1); return; }
        if (!moveFocusVert(el, 1)) addRow(sec, id, tr.classList.contains('group-row') ? 'name' : key);
        return;
      }
      /* ↑↓ … 上下のセルへ（候補リスト付きの列は候補表示を優先） */
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !el.getAttribute('list') && !e.shiftKey && !mod) {
        e.preventDefault();
        moveFocusVert(el, e.key === 'ArrowUp' ? -1 : 1);
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
        const key = seg.dataset.setting;
        if (key === 'paper') state.paper = btn.dataset.val;
        else if (key === 'scope') { state.printScope = btn.dataset.val; printOverride = null; }
        else state.density = btn.dataset.val;
        commit();
      });
    });
  }

  function bindSections() {
    $$('.sec-card').forEach((card) => {
      const sec = card.dataset.sec;
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-sact]');
        if (!btn) return;
        const act = btn.dataset.sact;
        if (act === 'add-row') addRow(sec, null);
        else if (act === 'add-rows') addRows(sec, 8);
        else if (act === 'add-group') addGroup(sec, null);
        else if (act === 'renumber') renumber(sec);
        else if (act === 'clear') clearSection(sec);
        else if (act === 'from-lines') gearFromLines();
        else if (act === 'print-pick') printDoc('pick');
        else if (act === 'preview-pick') openPreview('pick');
      });
    });
  }

  /* ピックリストのチェック欄・注意事項 */
  function bindPickOptions() {
    const ph = $('#pick-phases');
    const pn = $('#pick-note');
    [ph, pn].forEach((el) => {
      el.addEventListener('focusin', () => { armPending(); focusValue = el.value; });
    });
    ph.addEventListener('input', () => {
      consumePending();
      state.pickPhases = parsePhases(ph.value);
      save();
      schedulePrint();
    });
    ph.addEventListener('change', () => {
      ph.value = state.pickPhases.join(', ');
      if (!state.pickPhases.length) toast('チェック欄が空です（例: 出庫, 搬入, バラシ, 帰庫）');
    });
    pn.addEventListener('input', () => {
      consumePending();
      state.pickNote = pn.value;
      save();
      schedulePrint();
    });
  }

  function gearFromLines() {
    const rows = aggregateGear(state);
    if (!rows.length) {
      toast('回線表にマイク・スタンド・ケーブルが入力されていません');
      return;
    }
    if (dataCount('gear') && !window.confirm('回線表から集計した機材で、現在のピックリストを置き換えます。よろしいですか？')) return;
    snapshot();
    state.gear = rows;
    commit();
    toast(dataCount('gear') + ' 品目を回線表から作成しました（⌘Z で戻せます）');
  }

  function bindGlobal() {
    $('#btn-preview').addEventListener('click', () => openPreview());
    $('#btn-pdf').addEventListener('click', () => printDoc());
    $('#btn-print').addEventListener('click', () => printDoc());
    $('#btn-close-preview').addEventListener('click', closePreview);
    $('#preview').addEventListener('click', (e) => { if (e.target === $('#preview')) closePreview(); });
    $('#btn-shortcuts').addEventListener('click', () => $('#shortcuts').showModal());
    $('#shortcuts').addEventListener('click', (e) => {
      if (e.target === $('#shortcuts') || e.target.closest('[data-close]')) $('#shortcuts').close();
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
      if (!active) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && (k === 'z' || k === 'y')) {
        const ae = document.activeElement;
        /* テキスト入力中でも、フォーカス後に未編集なら表全体の取り消しを行う */
        const untouched = !isTextField(ae) || ae.value === focusValue;
        if (!untouched) return;
        e.preventDefault();
        if (k === 'y' || e.shiftKey) redo(); else undo();
        if (isTextField(ae)) focusValue = document.activeElement && document.activeElement.value;
        return;
      }
      if (mod && k === 'p') {
        e.preventDefault();
        printDoc();
        return;
      }
      if (e.key === 'Escape') {
        if ($('#row-menu').classList.contains('open')) closeRowMenu();
        else if ($('#preview').classList.contains('open')) closePreview();
      }
    });

    window.addEventListener('resize', () => {
      if ($('#preview').classList.contains('open')) fitPreview();
    });

    window.addEventListener('beforeprint', () => { if (active) renderPrint(); });
    window.addEventListener('beforeunload', () => { if (active) flushSave(); });
    window.addEventListener('pagehide', () => { if (active) flushSave(); });
  }

  /* ---------------------------------------------------------
     init
     --------------------------------------------------------- */

  function mount() {
    if (mount.done) return;
    mount.done = true;
    buildColumnChips();
    bindMeta();
    bindSettings();
    $$('#view-audio .edit-table').forEach(bindTable);
    bindSections();
    bindPickOptions();
    bindRowMenu();
    bindGlobal();
    renderPrint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (active) renderPrint(); });
  }

  function createState(meta) {
    const next = blankDoc();
    if (meta) {
      next.meta.title = meta.name || meta.title || '';
      next.meta.venue = meta.venue || '';
      next.meta.date = meta.date || todayISO();
      next.meta.author = meta.author || '';
      next.meta.rev = meta.rev || 'Rev.1';
      next.meta.note = meta.note || '';
    }
    return next;
  }

  function open(project) {
    mount();
    active = true;
    state = normalize(project && project.audio ? project.audio : createState(project));
    if (project) {
      /* プロジェクト情報を正として、空欄だけ補完する */
      if (!state.meta.title) state.meta.title = project.name || '';
      if (!state.meta.date) state.meta.date = project.date || todayISO();
    }
    syncMeta();
    renderSettings();
    renderEditor();
    renderPrint();
    $('#view-audio').hidden = false;
    requestAnimationFrame(() => { renderPrint(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderPrint); });
  }

  function close() {
    flushSave();
    active = false;
    if ($('#preview').classList.contains('open')) closePreview();
    closeRowMenu();
  }

  /* プロジェクト設定を変更したとき、回線表のメタ情報にも反映する */
  function applyProjectMeta(project) {
    if (!project) return;
    state.meta.title = project.name || state.meta.title;
    state.meta.venue = project.venue || '';
    state.meta.date = project.date || state.meta.date;
    state.meta.author = project.author || '';
    state.meta.rev = project.rev || 'Rev.1';
    state.meta.note = project.note || '';
    syncMeta();
    renderPrint();
    save();
  }

  KZ.audio = {
    mount, open, close, createState, applyProjectMeta,
    getState: () => state,
    onChange: (fn) => { onChange = fn; },
    undo, redo,
    openPreview, printDoc, newDoc, loadSample, exportJSON, exportCSV,
    openShortcuts: () => $('#shortcuts').showModal(),
    focusMeta: () => { const el = $('#view-audio [data-meta="title"]'); if (el) el.focus(); },
  };
})();
