/* ============================================================
   機材準備.com — 照明仕込み図エディタ
   SVG / mm基準 / プロジェクトの lighting データを編集する
   ============================================================ */

(function () {
  'use strict';

  const KZ = window.KZ = window.KZ || {};
  const U = KZ.util;
  const $ = U.$;
  const $$ = U.$$;
  const esc = U.esc;

  const FONT = "-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,sans-serif";
  const PAPER = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
  const PAPER_NAME = { A4: 'A4', A3: 'A3' };
  const SCALES = [20, 30, 40, 50, 100, 200];
  const GRID_OPTIONS = [
    { value: 500, label: '500mm' },
    { value: 1000, label: '1m' },
    { value: 2000, label: '2m' },
  ];
  const LIMIT = 80;
  const MARGIN_MM = 10;
  const TITLE_W_MM = 140;
  const TITLE_H_MM = 38;
  const LEGEND_W_MM = 112;
  const LEGEND_ROW_MM = 7.4;
  const RIG_TYPES = { batten: 'バトン', truss: 'トラス', stand: 'スタンド' };
  const RIG_COLORS = { batten: '#7b8494', truss: '#4f5f78', stand: '#8a6a44' };

  const LIB = [
    { id: 'par', name: 'PAR', short: 'PAR', cat: '基本', power: 500, beam: 25, dmx: 4, color: '#c8891a', shape: 'par' },
    { id: 'fresnel', name: 'フレネル', short: 'FR', cat: '基本', power: 1000, beam: 15, dmx: 2, color: '#2f6f9f', shape: 'fresnel' },
    { id: 'spot', name: 'スポット', short: 'SP', cat: '基本', power: 750, beam: 12, dmx: 2, color: '#53658c', shape: 'spot' },
    { id: 'moving', name: 'ムービング', short: 'MV', cat: 'ムービング', power: 800, beam: 10, dmx: 16, color: '#7a4fa0', shape: 'moving' },
    { id: 'ledbar', name: 'LEDバー', short: 'BAR', cat: 'LED', power: 120, beam: 40, dmx: 8, color: '#3f8f6b', shape: 'ledbar' },
    { id: 'wash', name: 'LEDウォッシュ', short: 'WSH', cat: 'LED', power: 200, beam: 55, dmx: 8, color: '#2f8f8f', shape: 'wash' },
    { id: 'blinder', name: 'ブリンダー', short: 'BL', cat: '効果', power: 1200, beam: 50, dmx: 2, color: '#b65a2e', shape: 'blinder' },
    { id: 'strobe', name: 'ストロボ', short: 'STB', cat: '効果', power: 1000, beam: 60, dmx: 2, color: '#8f3b3b', shape: 'strobe' },
    { id: 'follow', name: 'フォロースポット', short: 'FLW', cat: '基本', power: 1200, beam: 8, dmx: 0, color: '#555d69', shape: 'follow' },
    { id: 'foot', name: 'フット', short: 'FT', cat: '基本', power: 300, beam: 60, dmx: 0, color: '#7b6d5a', shape: 'foot' },
  ];

  let active = false;
  let mounted = false;
  let state = defaultState();
  let currentProject = null;
  let onChange = null;
  let zoom = 0.05;
  let selection = new Set();
  let activeTool = 'select';
  let pendingLib = null;
  let textDialogPos = null;
  let spaceDown = false;
  let drag = null;
  let draft = null;
  let marquee = null;
  let needFit = false;
  let undoStack = [];
  let redoStack = [];
  let editSnapshot = null;
  let viewSaveTimer = null;
  let rafPending = false;

  /* ---------------------------------------------------------
     state
     --------------------------------------------------------- */

  function defaultState() {
    return {
      version: 1,
      sheet: {
        title: '',
        paper: 'A3',
        orientation: 'landscape',
        scale: 50,
        grid: 1000,
        showGrid: true,
        snap: true,
        showLabels: true,
        showBeams: true,
        showLegend: true,
        showTitleBlock: true,
      },
      view: { cx: 10500, cy: 7425, zoom: null },
      fixtures: [],
      rigging: [],
      shapes: [],
      texts: [],
      underlay: null,
    };
  }

  function num(value, fallback) {
    const n = Number(value);
    return isFinite(n) ? n : (fallback == null ? 0 : fallback);
  }

  function cleanId(value, prefix) {
    const s = value != null ? String(value) : '';
    return /^[A-Za-z0-9_-]{1,50}$/.test(s) ? s : U.uid(prefix || 'lt_');
  }

  function libById(id) {
    return LIB.find((l) => l.id === id) || LIB[0];
  }

  function normalize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const sheet = raw.sheet && typeof raw.sheet === 'object' ? raw.sheet : {};
    base.sheet.title = String(sheet.title || '');
    base.sheet.paper = sheet.paper === 'A4' ? 'A4' : 'A3';
    base.sheet.orientation = sheet.orientation === 'portrait' ? 'portrait' : 'landscape';
    base.sheet.scale = SCALES.indexOf(Number(sheet.scale)) !== -1 ? Number(sheet.scale) : 50;
    base.sheet.grid = Number(sheet.grid) > 100 ? Number(sheet.grid) : 1000;
    ['showGrid', 'snap', 'showLabels', 'showBeams', 'showLegend', 'showTitleBlock'].forEach((k) => {
      if (sheet[k] != null) base.sheet[k] = !!sheet[k];
    });

    if (raw.view && typeof raw.view === 'object') {
      base.view.cx = num(raw.view.cx, base.view.cx);
      base.view.cy = num(raw.view.cy, base.view.cy);
      base.view.zoom = num(raw.view.zoom, 0) > 0 ? num(raw.view.zoom) : null;
    }

    const seen = new Set();
    base.fixtures = (Array.isArray(raw.fixtures) ? raw.fixtures : []).map((f) => {
      const lib = libById(f && f.lib);
      let id = cleanId(f && f.id, 'f_');
      while (seen.has(id)) id = U.uid('f_');
      seen.add(id);
      return {
        id: id,
        lib: lib.id,
        x: num(f && f.x),
        y: num(f && f.y),
        rot: num(f && f.rot),
        beam: num(f && f.beam, lib.beam),
        unit: String(f && f.unit != null ? f.unit : ''),
        channel: String(f && f.channel != null ? f.channel : ''),
        circuit: String(f && f.circuit != null ? f.circuit : ''),
        dmxU: String(f && f.dmxU != null ? f.dmxU : ''),
        dmxA: String(f && f.dmxA != null ? f.dmxA : ''),
        color: String(f && f.color != null ? f.color : ''),
        gobo: String(f && f.gobo != null ? f.gobo : ''),
        purpose: String(f && f.purpose != null ? f.purpose : ''),
        power: num(f && f.power, lib.power),
        height: num(f && f.height, 0),
        note: String(f && f.note != null ? f.note : ''),
        rigId: f && f.rigId ? String(f.rigId) : '',
      };
    });

    base.rigging = (Array.isArray(raw.rigging) ? raw.rigging : []).map((r) => {
      let id = cleanId(r && r.id, 'r_');
      while (seen.has(id)) id = U.uid('r_');
      seen.add(id);
      const type = r && RIG_TYPES[r.type] ? r.type : 'batten';
      return {
        id: id,
        type: type,
        name: String(r && r.name != null ? r.name : ''),
        x1: num(r && r.x1),
        y1: num(r && r.y1),
        x2: num(r && r.x2),
        y2: num(r && r.y2),
      };
    });

    base.shapes = (Array.isArray(raw.shapes) ? raw.shapes : []).map((s) => {
      let id = cleanId(s && s.id, 's_');
      while (seen.has(id)) id = U.uid('s_');
      seen.add(id);
      return {
        id: id,
        type: 'rect',
        x: num(s && s.x),
        y: num(s && s.y),
        w: num(s && s.w, 1000),
        h: num(s && s.h, 1000),
        stroke: String(s && s.stroke || '#4a5568'),
        fill: String(s && s.fill || 'rgba(255,255,255,.55)'),
      };
    });

    base.texts = (Array.isArray(raw.texts) ? raw.texts : []).map((t) => {
      let id = cleanId(t && t.id, 't_');
      while (seen.has(id)) id = U.uid('t_');
      seen.add(id);
      return {
        id: id,
        x: num(t && t.x),
        y: num(t && t.y),
        text: String(t && t.text != null ? t.text : ''),
        size: num(t && t.size, 3.5),
        align: t && t.align === 'middle' ? 'middle' : 'start',
      };
    });

    if (raw.underlay && typeof raw.underlay === 'object' && raw.underlay.dataUrl) {
      base.underlay = {
        id: cleanId(raw.underlay.id, 'img_'),
        dataUrl: String(raw.underlay.dataUrl),
        x: num(raw.underlay.x, 0),
        y: num(raw.underlay.y, 0),
        w: num(raw.underlay.w, 10000),
        h: num(raw.underlay.h, 7000),
        opacity: U.clamp(num(raw.underlay.opacity, 0.5), 0.05, 1),
      };
    }
    return base;
  }

  /* ---------------------------------------------------------
     geometry / paper
     --------------------------------------------------------- */

  function paperDims(sheet) {
    const p = PAPER[sheet.paper] || PAPER.A3;
    const landscape = sheet.orientation !== 'portrait';
    return landscape
      ? { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) }
      : { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) };
  }

  function sheetSize() {
    const p = paperDims(state.sheet);
    return { w: p.w * state.sheet.scale, h: p.h * state.sheet.scale, paper: p };
  }

  function paperText() {
    return state.sheet.paper + ' ' + (state.sheet.orientation === 'landscape' ? '横' : '縦') + ' / 1:' + state.sheet.scale;
  }

  function snapValue(v) {
    if (!state.sheet.snap) return v;
    const g = state.sheet.grid || 1000;
    return Math.round(v / g) * g;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy;
    if (!len) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len;
    t = U.clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function nearestRig(x, y, threshold) {
    let best = null;
    let bestDist = threshold == null ? 500 : threshold;
    state.rigging.forEach((r) => {
      const d = distToSegment(x, y, r.x1, r.y1, r.x2, r.y2);
      if (d < bestDist) { bestDist = d; best = r; }
    });
    return best;
  }

  function fixtureById(id) { return state.fixtures.find((f) => f.id === id) || null; }
  function rigById(id) { return state.rigging.find((r) => r.id === id) || null; }
  function shapeById(id) { return state.shapes.find((s) => s.id === id) || null; }
  function textById(id) { return state.texts.find((t) => t.id === id) || null; }

  function findObject(id) {
    if (state.underlay && state.underlay.id === id) return { type: 'underlay', obj: state.underlay };
    let obj = fixtureById(id);
    if (obj) return { type: 'fixture', obj: obj };
    obj = rigById(id);
    if (obj) return { type: 'rigging', obj: obj };
    obj = shapeById(id);
    if (obj) return { type: 'shape', obj: obj };
    obj = textById(id);
    if (obj) return { type: 'text', obj: obj };
    return null;
  }

  function selectedObjects() {
    return Array.from(selection).map(findObject).filter(Boolean);
  }

  function oneSelected() {
    if (selection.size !== 1) return null;
    return findObject(Array.from(selection)[0]);
  }

  function nextUnit() {
    let max = 0;
    state.fixtures.forEach((f) => {
      const n = parseInt(f.unit, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return String(max + 1);
  }

  function pad3(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    const n = Number(s);
    return isNaN(n) ? s : String(n).padStart(3, '0');
  }

  function fixtureLabel(f) {
    const lib = libById(f.lib);
    return f.unit ? String(f.unit) : lib.short;
  }

  function nextRigName(type) {
    const prefix = type === 'batten' ? 'BAT' : (type === 'truss' ? 'TRS' : 'STD');
    const n = state.rigging.filter((r) => r.type === type).length + 1;
    return prefix + ' ' + n;
  }

  /* ---------------------------------------------------------
     symbols
     --------------------------------------------------------- */

  function symbolSVG(lib, sw) {
    const c = lib.color;
    const fill = c;
    const open = '<g class="lt-glyph" fill="' + fill + '" fill-opacity=".16" stroke="' + c + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round">';
    const close = '</g>';
    switch (lib.shape) {
      case 'ledbar':
        return open +
          '<rect x="-340" y="-78" width="680" height="156" rx="26"/>' +
          '<path d="M-250 -24h500M-250 24h500" fill="none"/>' +
          '<circle cx="300" cy="0" r="24" fill="' + c + '"/>' + close;
      case 'moving':
        return open +
          '<rect x="-250" y="-150" width="500" height="300" rx="50"/>' +
          '<circle cx="0" cy="-20" r="150"/>' +
          '<path d="M-150 -20a150 150 0 0 1 300 0" fill="none"/>' +
          '<circle cx="0" cy="-20" r="52" fill="' + c + '" fill-opacity=".5"/>' +
          '<path d="M250 -50l80 50-80 50" fill="none"/>' + close;
      case 'blinder':
        return open +
          '<rect x="-300" y="-160" width="600" height="320" rx="30"/>' +
          '<circle cx="-150" cy="-80" r="62"/><circle cx="0" cy="-80" r="62"/>' +
          '<circle cx="150" cy="-80" r="62"/><circle cx="-150" cy="80" r="62"/>' +
          '<circle cx="0" cy="80" r="62"/><circle cx="150" cy="80" r="62"/>' +
          '<path d="M300 -80l70 80-70 80" fill="none"/>' + close;
      case 'strobe':
        return open +
          '<rect x="-250" y="-170" width="500" height="340" rx="24"/>' +
          '<path d="M-90 -90l60 0-50 90 90 0-80 90" fill="none" stroke-width="' + (sw * 1.4) + '"/>' +
          '<path d="M250 -90l60 90-60 90" fill="none"/>' + close;
      case 'follow':
        return open +
          '<circle cx="0" cy="0" r="230"/>' +
          '<path d="M-230 0h460M0 -230v460" fill="none"/>' +
          '<circle cx="0" cy="0" r="70" fill="' + c + '" fill-opacity=".6"/>' +
          '<path d="M230 -70l90 70-90 70" fill="none"/>' + close;
      case 'foot':
        return open +
          '<path d="M-250 60a250 250 0 0 1 500 0z"/>' +
          '<path d="M-110 60l110 -170 110 170z" fill="none"/>' + close;
      case 'wash':
        return open +
          '<circle cx="0" cy="0" r="240"/>' +
          '<circle cx="0" cy="0" r="160"/>' +
          '<path d="M-160 0h320M0 -160v320" fill="none" stroke-opacity=".55"/>' +
          '<path d="M240 -90l90 90-90 90" fill="none"/>' + close;
      case 'fresnel':
        return open +
          '<circle cx="0" cy="0" r="230"/>' +
          '<circle cx="45" cy="0" r="130"/>' +
          '<path d="M-170 -120l-80 0M-170 120l-80 0M230 -80l80 0M230 80l80 0" fill="none"/>' + close;
      case 'spot':
        return open +
          '<circle cx="0" cy="0" r="220"/>' +
          '<path d="M-120 -130l240 260M120 -130l-240 260" fill="none"/>' +
          '<circle cx="0" cy="0" r="70"/>' +
          '<path d="M220 -70l80 70-80 70" fill="none"/>' + close;
      default:
        return open +
          '<circle cx="0" cy="0" r="235"/>' +
          '<circle cx="0" cy="0" r="112"/>' +
          '<path d="M235 -85l80 85-80 85" fill="none"/>' + close;
    }
  }

  function labelText(f) {
    const lib = libById(f.lib);
    if (f.unit) return String(f.unit) + ' ' + lib.short;
    return lib.short;
  }

  /* ---------------------------------------------------------
     view / zoom
     --------------------------------------------------------- */

  function canvasEl() { return $('#lt-canvas'); }

  function fitZoom() {
    const svg = canvasEl();
    const box = sheetSize();
    const cw = svg && svg.clientWidth ? svg.clientWidth : 900;
    const ch = svg && svg.clientHeight ? svg.clientHeight : 600;
    return Math.min(cw / box.w, ch / box.h) * 0.9;
  }

  function viewRect() {
    const svg = canvasEl();
    const cw = svg && svg.clientWidth ? svg.clientWidth : 900;
    const ch = svg && svg.clientHeight ? svg.clientHeight : 600;
    const z = zoom || fitZoom() || 0.05;
    const w = cw / z;
    const h = ch / z;
    return {
      x: (state.view.cx || 0) - w / 2,
      y: (state.view.cy || 0) - h / 2,
      w: w,
      h: h,
      zoom: z,
    };
  }

  function fitCanvas(save) {
    const box = sheetSize();
    zoom = fitZoom() || 0.05;
    state.view.cx = box.w / 2;
    state.view.cy = box.h / 2;
    state.view.zoom = zoom;
    needFit = false;
    renderCanvas();
    updateZoomLabel();
    if (save) scheduleViewSave();
  }

  function updateZoomLabel() {
    const el = $('#lt-zoom-label');
    if (!el) return;
    const base = fitZoom() || 0.05;
    el.textContent = Math.round((zoom / base) * 100) + '%';
  }

  function screenToWorld(clientX, clientY) {
    const svg = canvasEl();
    const r = svg.getBoundingClientRect();
    const v = viewRect();
    return {
      x: v.x + ((clientX - r.left) / Math.max(1, r.width)) * v.w,
      y: v.y + ((clientY - r.top) / Math.max(1, r.height)) * v.h,
    };
  }

  function zoomAt(clientX, clientY, factor) {
    const svg = canvasEl();
    const r = svg.getBoundingClientRect();
    const before = screenToWorld(clientX, clientY);
    const base = fitZoom() || 0.05;
    const next = U.clamp((zoom || base) * factor, base * 0.18, base * 14);
    const cw = svg.clientWidth || 900;
    const ch = svg.clientHeight || 600;
    state.view.cx = before.x - ((clientX - r.left) - cw / 2) / next;
    state.view.cy = before.y - ((clientY - r.top) - ch / 2) / next;
    zoom = next;
    state.view.zoom = next;
    renderCanvas();
    updateZoomLabel();
    scheduleViewSave();
  }

  /* ---------------------------------------------------------
     duplicate detection
     --------------------------------------------------------- */

  function dupeInfo() {
    const byId = new Set();
    let circuitCount = 0;
    let dmxCount = 0;

    const circuitMap = {};
    const dmxMap = {};
    state.fixtures.forEach((f) => {
      const c = String(f.circuit || '').trim();
      if (c) (circuitMap[c] = circuitMap[c] || []).push(f.id);
      const u = String(f.dmxU || '').trim();
      const a = String(f.dmxA || '').trim();
      if (u && a) {
        const key = u + '/' + String(Number(a) || a);
        (dmxMap[key] = dmxMap[key] || []).push(f.id);
      }
    });

    Object.keys(circuitMap).forEach((k) => {
      if (circuitMap[k].length < 2) return;
      circuitCount += circuitMap[k].length;
      circuitMap[k].forEach((id) => byId.add(id));
    });
    Object.keys(dmxMap).forEach((k) => {
      if (dmxMap[k].length < 2) return;
      dmxCount += dmxMap[k].length;
      dmxMap[k].forEach((id) => byId.add(id));
    });

    return { byId: byId, circuit: circuitCount, dmx: dmxCount };
  }

  /* ---------------------------------------------------------
     rendering — canvas
     --------------------------------------------------------- */

  function swFor(mode, px, mm) {
    if (mode === 'print') return state.sheet.scale * (mm == null ? 0.35 : mm);
    const z = viewRect().zoom;
    return px / z;
  }

  function fixtureExtent(f) {
    const lib = libById(f.lib);
    if (lib.shape === 'ledbar') return { w: 760, h: 220 };
    if (lib.shape === 'blinder') return { w: 680, h: 380 };
    if (lib.shape === 'moving') return { w: 580, h: 380 };
    return { w: 560, h: 560 };
  }

  function selectionRing(cx, cy, w, h, mode) {
    if (mode !== 'screen') return '';
    return '<rect class="lt-sel-ring" x="' + (cx - w / 2 - 60) + '" y="' + (cy - h / 2 - 60) + '" width="' + (w + 120) + '" height="' + (h + 120) + '" rx="60" fill="none" stroke="#2557d6" stroke-width="' + swFor('screen', 1.6) + '" stroke-dasharray="' + swFor('screen', 6) + ' ' + swFor('screen', 4) + '"/>';
  }

  function beamSVG(f, mode) {
    if (!state.sheet.showBeams) return '';
    const len = 2800;
    const half = Math.max(2, num(f.beam, 25) / 2) * Math.PI / 180;
    const x0 = 250;
    const x1 = x0 + len;
    const y1 = Math.tan(half) * len;
    const color = libById(f.lib).color;
    return '<path d="M' + x0 + ' 0 L' + x1.toFixed(1) + ' ' + (-y1).toFixed(1) + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Z" fill="' + color + '" fill-opacity=".12" stroke="' + color + '" stroke-opacity=".38" stroke-width="' + swFor(mode, 0.8, 0.25) + '" stroke-dasharray="' + swFor(mode, 5, 0.8) + ' ' + swFor(mode, 4, 0.6) + '"/>';
  }

  function fixtureSVG(f, mode) {
    const lib = libById(f.lib);
    const sw = swFor(mode, 1.4, 0.4);
    const ext = fixtureExtent(f);
    let html = '<g class="lt-fixture" data-lt-id="' + esc(f.id) + '" transform="translate(' + f.x + ' ' + f.y + ') rotate(' + f.rot + ')">';
    html += beamSVG(f, mode);
    html += symbolSVG(lib, sw);
    html += '</g>';
    if (mode === 'screen' && selection.has(f.id)) {
      html += selectionRing(f.x, f.y, ext.w, ext.h, mode);
    }
    return html;
  }

  function riggingSVG(r, mode) {
    const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    if (len < 1) return '';
    const color = RIG_COLORS[r.type] || '#7b8494';
    const truss = r.type === 'truss';
    const base = swFor(mode, truss ? 7 : 3.2, truss ? 2.2 : 0.9);
    const sel = mode === 'screen' && selection.has(r.id);
    let html = '<g class="lt-rigging lt-rig-' + r.type + '" data-lt-id="' + esc(r.id) + '">';
    if (mode === 'screen') {
      html += '<line x1="' + r.x1 + '" y1="' + r.y1 + '" x2="' + r.x2 + '" y2="' + r.y2 + '" stroke="transparent" stroke-width="' + swFor('screen', 18) + '" stroke-linecap="round"/>';
    }
    html += '<line x1="' + r.x1 + '" y1="' + r.y1 + '" x2="' + r.x2 + '" y2="' + r.y2 + '" stroke="' + color + '" stroke-width="' + base + '" stroke-linecap="round"/>';
    if (truss) {
      html += '<line x1="' + r.x1 + '" y1="' + r.y1 + '" x2="' + r.x2 + '" y2="' + r.y2 + '" stroke="#fff" stroke-width="' + base * 0.38 + '" stroke-dasharray="' + swFor(mode, 5, 1.3) + ' ' + swFor(mode, 5, 1.3) + '" stroke-linecap="butt"/>';
    }
    html += '<circle cx="' + r.x1 + '" cy="' + r.y1 + '" r="' + (base * 1.1) + '" fill="' + color + '"/>';
    html += '<circle cx="' + r.x2 + '" cy="' + r.y2 + '" r="' + (base * 1.1) + '" fill="' + color + '"/>';
    if (sel) {
      html += '<line x1="' + r.x1 + '" y1="' + r.y1 + '" x2="' + r.x2 + '" y2="' + r.y2 + '" stroke="#2557d6" stroke-width="' + swFor('screen', 1.8) + '" stroke-dasharray="' + swFor('screen', 8) + ' ' + swFor('screen', 5) + '" stroke-linecap="round"/>';
    }
    html += '</g>';

    if (state.sheet.showLabels) {
      const font = mode === 'print' ? 2.1 * state.sheet.scale : 11 / viewRect().zoom;
      const name = r.name || RIG_TYPES[r.type] || '';
      if (name) {
        html += '<text x="' + ((r.x1 + r.x2) / 2) + '" y="' + ((r.y1 + r.y2) / 2 - 220) + '" font-family="' + FONT + '" font-size="' + font + '" font-weight="600" fill="#3a4452" text-anchor="middle">' + esc(name) + '</text>';
      }
    }
    return html;
  }

  function shapeSVG(s, mode) {
    const sel = mode === 'screen' && selection.has(s.id);
    let html = '<g class="lt-shape" data-lt-id="' + esc(s.id) + '">';
    html += '<rect x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" fill="' + esc(s.fill) + '" stroke="' + esc(s.stroke) + '" stroke-width="' + swFor(mode, 1.3, 0.4) + '"/>';
    if (sel) {
      html += '<rect x="' + (s.x - 70) + '" y="' + (s.y - 70) + '" width="' + (s.w + 140) + '" height="' + (s.h + 140) + '" fill="none" stroke="#2557d6" stroke-width="' + swFor('screen', 1.6) + '" stroke-dasharray="' + swFor('screen', 6) + ' ' + swFor('screen', 4) + '"/>';
    }
    return html + '</g>';
  }

  function textSVG(t, mode) {
    const size = t.size * state.sheet.scale;
    const sel = mode === 'screen' && selection.has(t.id);
    const w = Math.max(600, String(t.text || '').length * size * 0.62);
    const h = size * 1.35;
    let html = '<g class="lt-text" data-lt-id="' + esc(t.id) + '">';
    html += '<text x="' + t.x + '" y="' + t.y + '" font-family="' + FONT + '" font-size="' + size + '" fill="#1b2028" text-anchor="' + (t.align === 'middle' ? 'middle' : 'start') + '">' + esc(t.text) + '</text>';
    if (sel) {
      const x = t.align === 'middle' ? t.x - w / 2 : t.x;
      html += '<rect x="' + (x - 60) + '" y="' + (t.y - h) + '" width="' + (w + 120) + '" height="' + (h + 100) + '" fill="none" stroke="#2557d6" stroke-width="' + swFor('screen', 1.4) + '" stroke-dasharray="' + swFor('screen', 5) + ' ' + swFor('screen', 4) + '"/>';
    }
    return html + '</g>';
  }

  function underlaySVG(mode) {
    if (!state.underlay) return '';
    const u = state.underlay;
    const sel = mode === 'screen' && selection.has(u.id);
    let html = '<g class="lt-underlay" data-lt-id="' + esc(u.id) + '" opacity="' + u.opacity + '">';
    html += '<image x="' + u.x + '" y="' + u.y + '" width="' + u.w + '" height="' + u.h + '" href="' + esc(u.dataUrl) + '" preserveAspectRatio="none"/>';
    if (sel) {
      html += '<rect x="' + u.x + '" y="' + u.y + '" width="' + u.w + '" height="' + u.h + '" fill="none" stroke="#2557d6" stroke-width="' + swFor('screen', 1.6) + '" stroke-dasharray="' + swFor('screen', 7) + ' ' + swFor('screen', 5) + '"/>';
    }
    return html + '</g>';
  }

  function labelSVG(mode) {
    if (!state.sheet.showLabels) return '';
    const print = mode === 'print';
    const font = print ? 2.2 * state.sheet.scale : 12 / viewRect().zoom;
    const padding = font * 0.34;
    const h = font * 1.22;
    const off = print ? 660 : font * 1.7;
    const dupe = dupeInfo();
    const boxes = [];

    state.fixtures.forEach((f) => {
      const ext = fixtureExtent(f);
      boxes.push({ x: f.x - ext.w / 2, y: f.y - ext.h / 2, w: ext.w, h: ext.h });
    });

    /* 吊り物の名前もラベルと重ならないようにする */
    const rigFont = print ? 2.1 * state.sheet.scale : 11 / viewRect().zoom;
    state.rigging.forEach((r) => {
      const name = r.name || RIG_TYPES[r.type] || '';
      if (!name) return;
      const w = String(name).length * rigFont * 0.62;
      const h = rigFont * 1.3;
      boxes.push({
        x: (r.x1 + r.x2) / 2 - w / 2,
        y: (r.y1 + r.y2) / 2 - 220 - h / 2,
        w: w,
        h: h,
      });
    });

    function overlaps(box) {
      return boxes.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y);
    }

    const sorted = state.fixtures.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    let html = '';
    sorted.forEach((f) => {
      const text = labelText(f);
      const w = Math.max(font * 2, String(text).length * font * 0.62 + padding * 2);
      const candidates = [
        { x: f.x - w / 2, y: f.y - off - h, w: w, h: h },
        { x: f.x - w / 2, y: f.y + off, w: w, h: h },
        { x: f.x + off, y: f.y - h / 2, w: w, h: h },
        { x: f.x - off - w, y: f.y - h / 2, w: w, h: h },
      ];
      let box = candidates[0];
      for (let i = 0; i < candidates.length; i += 1) {
        if (!overlaps(candidates[i])) { box = candidates[i]; break; }
      }
      boxes.push({ x: box.x, y: box.y, w: w, h: h });

      const danger = dupe.byId.has(f.id);
      const stroke = danger ? '#c53434' : '#9aa3b0';
      html += '<g class="lt-label-item">' +
        '<rect x="' + box.x + '" y="' + box.y + '" width="' + w + '" height="' + h + '" rx="' + (font * 0.22) + '" fill="#fff" fill-opacity=".88" stroke="' + stroke + '" stroke-width="' + (print ? state.sheet.scale * 0.16 : 0.8 / viewRect().zoom) + '"/>' +
        '<text x="' + (box.x + padding) + '" y="' + (box.y + h * 0.78) + '" font-family="' + FONT + '" font-size="' + font + '" font-weight="700" fill="' + (danger ? '#b42323' : '#1b2028') + '">' + esc(text) + '</text>' +
        '</g>';
    });
    return html;
  }

  /* ---------------------------------------------------------
     sheet furniture
     --------------------------------------------------------- */

  function titleBlockSVG(mode) {
    if (!state.sheet.showTitleBlock) return '';
    const box = sheetSize();
    const s = state.sheet.scale;
    const m = MARGIN_MM * s;
    const w = TITLE_W_MM * s;
    const h = TITLE_H_MM * s;
    const x = box.w - m - w;
    const y = box.h - m - h;
    const line = swFor(mode, 1, 0.3);
    const project = currentProject || {};
    const title = state.sheet.title || project.name || '照明仕込み図';
    const venue = project.venue || '';
    const date = U.formatDate(project.date || '');
    const author = project.author || '';
    const rev = project.rev || 'Rev.1';

    let html = '<g class="lt-titleblock">';
    html += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#fff" stroke="#111" stroke-width="' + line + '"/>';
    const headH = 22 * s;
    html += '<line x1="' + x + '" y1="' + (y + headH) + '" x2="' + (x + w) + '" y2="' + (y + headH) + '" stroke="#111" stroke-width="' + line + '"/>';
    html += '<text x="' + (x + 4 * s) + '" y="' + (y + 9 * s) + '" font-family="' + FONT + '" font-size="' + (5 * s) + '" font-weight="700" fill="#111">' + esc(title) + '</text>';
    if (venue) {
      html += '<text x="' + (x + 4 * s) + '" y="' + (y + 15.5 * s) + '" font-family="' + FONT + '" font-size="' + (3.1 * s) + '" fill="#333">' + esc(venue) + '</text>';
    }
    html += '<text x="' + (x + w - 4 * s) + '" y="' + (y + 7 * s) + '" font-family="' + FONT + '" font-size="' + (2.2 * s) + '" font-weight="700" letter-spacing="' + (0.35 * s) + '" fill="#555" text-anchor="end">LIGHTING PLOT</text>';
    html += '<text x="' + (x + w - 4 * s) + '" y="' + (y + 12 * s) + '" font-family="' + FONT + '" font-size="' + (2.1 * s) + '" fill="#666" text-anchor="end">' + esc(paperText()) + '</text>';

    const cols = [
      { w: 42, label: 'DATE', value: date },
      { w: 40, label: 'AUTHOR', value: author },
      { w: 30, label: 'REV.', value: rev },
      { w: 28, label: 'SCALE', value: '1:' + state.sheet.scale },
    ];
    let cx = x;
    const by = y + headH;
    const bh = h - headH;
    cols.forEach((c, i) => {
      const cw = c.w * s;
      if (i > 0) html += '<line x1="' + cx + '" y1="' + by + '" x2="' + cx + '" y2="' + (y + h) + '" stroke="#111" stroke-width="' + line + '"/>';
      html += '<text x="' + (cx + 2.5 * s) + '" y="' + (by + 4.6 * s) + '" font-family="' + FONT + '" font-size="' + (1.9 * s) + '" font-weight="700" letter-spacing="' + (0.2 * s) + '" fill="#777">' + esc(c.label) + '</text>';
      html += '<text x="' + (cx + 2.5 * s) + '" y="' + (by + 11.2 * s) + '" font-family="' + FONT + '" font-size="' + (2.9 * s) + '" fill="#111">' + esc(c.value) + '</text>';
      cx += cw;
    });
    html += '</g>';
    return html;
  }

  function legendSVG(mode) {
    if (!state.sheet.showLegend) return '';
    const box = sheetSize();
    const s = state.sheet.scale;
    const m = MARGIN_MM * s;
    const counts = {};
    state.fixtures.forEach((f) => { counts[f.lib] = (counts[f.lib] || 0) + 1; });
    const rows = LIB.filter((l) => counts[l.id]).map((l) => ({
      lib: l,
      count: counts[l.id],
      power: state.fixtures.filter((f) => f.lib === l.id).reduce((a, f) => a + num(f.power), 0),
    }));
    const rowH = LEGEND_ROW_MM * s;
    const headH = 8 * s;
    const w = LEGEND_W_MM * s;
    const bodyRows = Math.max(1, rows.length);
    const h = headH + bodyRows * rowH + 2 * s;
    const x = m;
    const y = box.h - m - h;
    const line = swFor(mode, 1, 0.3);
    const font = 2.15 * s;

    let html = '<g class="lt-legend">';
    html += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#fff" fill-opacity=".93" stroke="#111" stroke-width="' + line + '"/>';
    html += '<text x="' + (x + 2.8 * s) + '" y="' + (y + 5.2 * s) + '" font-family="' + FONT + '" font-size="' + (2.6 * s) + '" font-weight="700" fill="#111">灯体リスト</text>';
    const total = state.fixtures.length;
    const power = state.fixtures.reduce((a, f) => a + num(f.power), 0);
    html += '<text x="' + (x + w - 2.8 * s) + '" y="' + (y + 5.2 * s) + '" font-family="' + FONT + '" font-size="' + (2.1 * s) + '" fill="#444" text-anchor="end">' + total + '灯 / ' + power.toLocaleString('ja-JP') + 'W</text>';
    html += '<line x1="' + x + '" y1="' + (y + headH) + '" x2="' + (x + w) + '" y2="' + (y + headH) + '" stroke="#111" stroke-width="' + line + '"/>';

    if (!rows.length) {
      html += '<text x="' + (x + 2.8 * s) + '" y="' + (y + headH + 5 * s) + '" font-family="' + FONT + '" font-size="' + font + '" fill="#777">灯体なし</text>';
    } else {
      rows.forEach((row, i) => {
        const ry = y + headH + i * rowH;
        if (i > 0) html += '<line x1="' + (x + 2 * s) + '" y1="' + ry + '" x2="' + (x + w - 2 * s) + '" y2="' + ry + '" stroke="#d7dbe2" stroke-width="' + line * 0.6 + '"/>';
        html += '<g transform="translate(' + (x + 6 * s) + ' ' + (ry + rowH / 2) + ') scale(.34)">' + symbolSVG(row.lib, 38) + '</g>';
        html += '<text x="' + (x + 13 * s) + '" y="' + (ry + rowH * 0.66) + '" font-family="' + FONT + '" font-size="' + font + '" fill="#111">' + esc(row.lib.name) + '</text>';
        html += '<text x="' + (x + 72 * s) + '" y="' + (ry + rowH * 0.66) + '" font-family="' + FONT + '" font-size="' + font + '" fill="#333" text-anchor="end">' + row.count + '灯</text>';
        html += '<text x="' + (x + w - 3 * s) + '" y="' + (ry + rowH * 0.66) + '" font-family="' + FONT + '" font-size="' + font + '" fill="#333" text-anchor="end">' + row.power.toLocaleString('ja-JP') + 'W</text>';
      });
    }
    html += '</g>';
    return html;
  }

  function draftSVG() {
    if (!draft) return '';
    const z = viewRect().zoom;
    if (draft.kind === 'rigging') {
      const color = RIG_COLORS[draft.type] || '#2557d6';
      return '<g class="lt-draft"><line x1="' + draft.x1 + '" y1="' + draft.y1 + '" x2="' + draft.x2 + '" y2="' + draft.y2 + '" stroke="' + color + '" stroke-width="' + 5 / z + '" stroke-dasharray="' + 14 / z + ' ' + 8 / z + '" stroke-linecap="round"/></g>';
    }
    return '<g class="lt-draft"><rect x="' + Math.min(draft.x1, draft.x2) + '" y="' + Math.min(draft.y1, draft.y2) + '" width="' + Math.abs(draft.x2 - draft.x1) + '" height="' + Math.abs(draft.y2 - draft.y1) + '" fill="rgba(37,87,214,.08)" stroke="#2557d6" stroke-width="' + 2 / z + '" stroke-dasharray="' + 10 / z + ' ' + 6 / z + '"/></g>';
  }

  function marqueeSVG() {
    if (!marquee) return '';
    const z = viewRect().zoom;
    const x = Math.min(marquee.x1, marquee.x2);
    const y = Math.min(marquee.y1, marquee.y2);
    return '<rect x="' + x + '" y="' + y + '" width="' + Math.abs(marquee.x2 - marquee.x1) + '" height="' + Math.abs(marquee.y2 - marquee.y1) + '" fill="rgba(37,87,214,.08)" stroke="#2557d6" stroke-width="' + 1.4 / z + '" stroke-dasharray="' + 7 / z + ' ' + 5 / z + '"/>';
  }

  function svgContent(mode) {
    const box = sheetSize();
    const z = mode === 'print' ? 0.05 : viewRect().zoom;
    const g = state.sheet.grid;
    const line = swFor(mode, 1, 0.28);
    let html = '';

    if (mode === 'screen') {
      html += '<defs>' +
        '<pattern id="lt-grid-minor" width="' + g + '" height="' + g + '" patternUnits="userSpaceOnUse">' +
          '<path d="M' + g + ' 0H0V' + g + '" fill="none" stroke="#c9cfd8" stroke-width="' + 1 / z + '"/>' +
        '</pattern>' +
        '<pattern id="lt-grid-major" width="' + (g * 5) + '" height="' + (g * 5) + '" patternUnits="userSpaceOnUse">' +
          '<path d="M' + (g * 5) + ' 0H0V' + (g * 5) + '" fill="none" stroke="#aeb6c1" stroke-width="' + 1.2 / z + '"/>' +
        '</pattern>' +
        '<filter id="lt-sheet-shadow" x="-10%" y="-10%" width="130%" height="130%">' +
          '<feDropShadow dx="0" dy="' + 4 / z + '" stdDeviation="' + 8 / z + '" flood-color="#101828" flood-opacity=".22"/>' +
        '</filter>' +
        '<clipPath id="lt-screen-sheet-clip"><rect x="0" y="0" width="' + box.w + '" height="' + box.h + '"/></clipPath>' +
      '</defs>';
    } else {
      html += '<defs><clipPath id="lt-print-sheet-clip"><rect x="0" y="0" width="' + box.w + '" height="' + box.h + '"/></clipPath></defs>';
    }

    if (mode === 'screen') {
      const v = viewRect();
      html += '<rect x="' + v.x + '" y="' + v.y + '" width="' + v.w + '" height="' + v.h + '" fill="url(#lt-grid-minor)" opacity=".45"/>';
      html += '<rect x="' + v.x + '" y="' + v.y + '" width="' + v.w + '" height="' + v.h + '" fill="url(#lt-grid-major)" opacity=".35"/>';
      html += '<rect x="0" y="0" width="' + box.w + '" height="' + box.h + '" fill="#fff" filter="url(#lt-sheet-shadow)"/>';
      if (state.sheet.showGrid) {
        html += '<g clip-path="url(#lt-screen-sheet-clip)">' +
          '<rect x="0" y="0" width="' + box.w + '" height="' + box.h + '" fill="url(#lt-grid-minor)" opacity=".75"/>' +
          '<rect x="0" y="0" width="' + box.w + '" height="' + box.h + '" fill="url(#lt-grid-major)" opacity=".7"/>' +
        '</g>';
      }
    } else {
      html += '<rect x="0" y="0" width="' + box.w + '" height="' + box.h + '" fill="#fff"/>';
    }

    html += '<g' + (mode === 'print' ? ' clip-path="url(#lt-print-sheet-clip)"' : '') + '>';
    html += underlaySVG(mode);
    html += state.shapes.map((s) => shapeSVG(s, mode)).join('');
    html += state.rigging.map((r) => riggingSVG(r, mode)).join('');
    html += state.fixtures.map((f) => fixtureSVG(f, mode)).join('');
    html += state.texts.map((t) => textSVG(t, mode)).join('');
    html += labelSVG(mode);
    html += '</g>';

    /* sheet frame */
    const m = MARGIN_MM * state.sheet.scale;
    html += '<rect x="' + m + '" y="' + m + '" width="' + (box.w - m * 2) + '" height="' + (box.h - m * 2) + '" fill="none" stroke="#111" stroke-width="' + line + '"/>';

    html += titleBlockSVG(mode);
    html += legendSVG(mode);

    if (mode === 'screen') {
      html += draftSVG();
      html += marqueeSVG();
    }
    return html;
  }

  function renderCanvas() {
    const svg = canvasEl();
    if (!svg) return;
    const v = viewRect();
    svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h);
    svg.innerHTML = svgContent('screen');
    const hint = $('#lt-canvas-hint');
    if (hint) hint.hidden = !(state.fixtures.length === 0 && state.rigging.length === 0 && !draft);
    const badge = $('#lt-placement-badge');
    if (badge) {
      badge.hidden = !pendingLib;
      if (pendingLib) badge.textContent = libById(pendingLib).name + ' を配置中 — クリックで配置 / Esc で解除';
    }
    updateZoomLabel();
  }

  function rafRenderCanvas() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderCanvas();
    });
  }

  /* ---------------------------------------------------------
     library / toolbar
     --------------------------------------------------------- */

  function renderLibrary(filter) {
    const box = $('#lt-library');
    if (!box) return;
    const q = String(filter || '').trim().toLowerCase();
    const items = LIB.filter((l) => !q || l.name.toLowerCase().indexOf(q) !== -1 || l.id.indexOf(q) !== -1 || l.short.toLowerCase().indexOf(q) !== -1);
    box.innerHTML = items.map((l) => {
      const active = pendingLib === l.id;
      return '<button type="button" class="lt-lib-item' + (active ? ' on' : '') + '" data-lib="' + l.id + '" draggable="true">' +
        '<span class="lt-lib-icon"><svg viewBox="-380 -380 760 760" aria-hidden="true">' + symbolSVG(l, 26) + '</svg></span>' +
        '<span class="lt-lib-text"><b>' + esc(l.name) + '</b><small>' + l.power + 'W · ' + l.beam + '°' + (l.dmx ? ' · DMX ' + l.dmx + 'ch' : '') + '</small></span>' +
        '<span class="lt-lib-dot" style="background:' + l.color + '"></span>' +
      '</button>';
    }).join('');
    if (!items.length) box.innerHTML = '<p class="lt-lib-empty">該当する灯体がありません</p>';
  }

  function updateToolbar() {
    $$('.lt-tool[data-lt-tool]').forEach((btn) => {
      const t = btn.dataset.ltTool;
      btn.classList.toggle('on', t === activeTool || (t === 'select' && activeTool === 'place'));
    });
    const map = { 'lt-grid': 'showGrid', 'lt-snap': 'snap', 'lt-labels': 'showLabels', 'lt-beams': 'showBeams' };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!state.sheet[map[id]];
    });
    const undo = $('#lt-undo');
    const redo = $('#lt-redo');
    if (undo) undo.disabled = !undoStack.length;
    if (redo) redo.disabled = !redoStack.length;
    const auto = $('#lt-autonumber');
    if (auto) auto.disabled = !state.fixtures.length;
    const info = $('#lt-sheet-info');
    if (info) info.textContent = paperText();
    const pc = $('#page-count');
    if (pc) pc.textContent = paperText();
    updateZoomLabel();
  }

  /* ---------------------------------------------------------
     properties panel
     --------------------------------------------------------- */

  function inputProp(label, prop, value, opts) {
    const o = opts || {};
    const type = o.type || 'text';
    const attrs = 'data-prop="' + prop + '" class="lt-input" type="' + type + '" value="' + esc(value) + '"' +
      (o.min != null ? ' min="' + o.min + '"' : '') +
      (o.max != null ? ' max="' + o.max + '"' : '') +
      (o.step != null ? ' step="' + o.step + '"' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '');
    return '<label class="lt-field' + (o.span ? ' span2' : '') + '"><span>' + label + '</span>' +
      '<input ' + attrs + '></label>';
  }

  function textareaProp(label, prop, value, span) {
    return '<label class="lt-field' + (span ? ' span2' : '') + '"><span>' + label + '</span>' +
      '<textarea data-prop="' + prop + '" class="lt-input" rows="2">' + esc(value) + '</textarea></label>';
  }

  function selectProp(label, prop, value, options, span) {
    return '<label class="lt-field' + (span ? ' span2' : '') + '"><span>' + label + '</span>' +
      '<select data-prop="' + prop + '" class="lt-input">' +
        options.map((o) => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(value) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
      '</select></label>';
  }

  function sheetSettingsHTML() {
    const s = state.sheet;
    return '<div class="lt-props-section">' +
      '<div class="lt-props-head"><div><span class="lt-props-kicker">SHEET</span><h2>シート設定</h2></div><span class="lt-chip">' + esc(paperText()) + '</span></div>' +
      '<div class="lt-prop-grid">' +
        '<label class="lt-field span2"><span>図面タイトル</span><input class="lt-input" data-sheet="title" type="text" value="' + esc(s.title) + '" placeholder="' + esc((currentProject && currentProject.name) || '照明仕込み図') + '"></label>' +
        '<label class="lt-field"><span>用紙</span><select class="lt-input" data-sheet="paper">' +
          ['A3', 'A4'].map((p) => '<option value="' + p + '"' + (s.paper === p ? ' selected' : '') + '>' + p + '</option>').join('') +
        '</select></label>' +
        '<label class="lt-field"><span>向き</span><select class="lt-input" data-sheet="orientation">' +
          '<option value="landscape"' + (s.orientation === 'landscape' ? ' selected' : '') + '>横</option>' +
          '<option value="portrait"' + (s.orientation === 'portrait' ? ' selected' : '') + '>縦</option>' +
        '</select></label>' +
        '<label class="lt-field"><span>縮尺</span><select class="lt-input" data-sheet="scale">' +
          SCALES.map((v) => '<option value="' + v + '"' + (Number(s.scale) === v ? ' selected' : '') + '>1:' + v + '</option>').join('') +
        '</select></label>' +
        '<label class="lt-field"><span>グリッド</span><select class="lt-input" data-sheet="grid">' +
          GRID_OPTIONS.map((g) => '<option value="' + g.value + '"' + (Number(s.grid) === g.value ? ' selected' : '') + '>' + g.label + '</option>').join('') +
        '</select></label>' +
      '</div>' +
      '<div class="lt-prop-checks">' +
        '<label class="lt-check"><input type="checkbox" data-sheet-toggle="showLegend"' + (s.showLegend ? ' checked' : '') + '><span>凡例</span></label>' +
        '<label class="lt-check"><input type="checkbox" data-sheet-toggle="showTitleBlock"' + (s.showTitleBlock ? ' checked' : '') + '><span>タイトルブロック</span></label>' +
        '<label class="lt-check"><input type="checkbox" data-sheet-toggle="showBeams"' + (s.showBeams ? ' checked' : '') + '><span>ビーム</span></label>' +
      '</div>' +
      '<div class="lt-props-actions">' +
        '<button type="button" class="lt-mini-btn" data-lt-act="fit">全体を表示</button>' +
      '</div>' +
    '</div>';
  }

  function fixturePropsHTML(f) {
    const lib = libById(f.lib);
    const dupe = dupeInfo();
    const rigOptions = [{ value: '', label: 'なし（床・自由配置）' }].concat(state.rigging.map((r) => ({
      value: r.id,
      label: (r.name || RIG_TYPES[r.type]) + '（' + RIG_TYPES[r.type] + '）',
    })));
    return '<div class="lt-props-section">' +
      '<div class="lt-props-head"><div><span class="lt-props-kicker">FIXTURE</span><h2>' + esc(lib.name) + '</h2></div><span class="lt-chip">' + (f.unit ? 'No.' + esc(f.unit) : '番号未設定') + '</span></div>' +
      (dupe.byId.has(f.id) ? '<p class="lt-warning">回路または DMX が他の灯体と重複しています。</p>' : '') +
      '<div class="lt-prop-grid">' +
        '<label class="lt-field span2"><span>灯体種別</span><select class="lt-input" data-prop="lib">' +
          LIB.map((l) => '<option value="' + l.id + '"' + (l.id === f.lib ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') +
        '</select></label>' +
        inputProp('ユニット番号', 'unit', f.unit, { placeholder: '例: 12' }) +
        inputProp('回路（ディマー）', 'circuit', f.circuit, { placeholder: '例: D-12' }) +
        inputProp('DMX ユニバース', 'dmxU', f.dmxU, { placeholder: '例: 1' }) +
        inputProp('DMX アドレス', 'dmxA', f.dmxA, { placeholder: '例: 001' }) +
        inputProp('色（ゲル / 任意）', 'color', f.color, { placeholder: '例: L201' }) +
        inputProp('ゴボ', 'gobo', f.gobo, { placeholder: '例: Breakup' }) +
        inputProp('用途・ターゲット', 'purpose', f.purpose, { placeholder: '例: 正面 / Vo.' }) +
        inputProp('消費電力（W）', 'power', f.power, { type: 'number', min: 0, step: 10 }) +
        inputProp('高さ（mm）', 'height', f.height, { type: 'number', step: 50 }) +
        inputProp('向き（°）', 'rot', f.rot, { type: 'number', step: 5 }) +
        inputProp('ビーム角（°）', 'beam', f.beam, { type: 'number', step: 1, min: 1 }) +
        selectProp('吊り物', 'rigId', f.rigId, rigOptions, true) +
        textareaProp('メモ', 'note', f.note, true) +
        inputProp('X（mm）', 'x', Math.round(f.x), { type: 'number', step: 10 }) +
        inputProp('Y（mm）', 'y', Math.round(f.y), { type: 'number', step: 10 }) +
      '</div>' +
      '<div class="lt-props-actions">' +
        '<button type="button" class="lt-mini-btn" data-lt-act="duplicate">複製</button>' +
        (f.rigId ? '<button type="button" class="lt-mini-btn" data-lt-act="detach">吊り物から外す</button>' : '') +
        '<button type="button" class="lt-mini-btn danger" data-lt-act="delete">削除</button>' +
      '</div>' +
      '<details class="lt-prop-details"><summary>シート設定</summary>' + sheetSettingsHTML() + '</details>' +
    '</div>';
  }

  function riggingPropsHTML(r) {
    const attached = state.fixtures.filter((f) => f.rigId === r.id);
    return '<div class="lt-props-section">' +
      '<div class="lt-props-head"><div><span class="lt-props-kicker">RIGGING</span><h2>' + esc(RIG_TYPES[r.type]) + '</h2></div><span class="lt-chip">' + attached.length + ' 灯</span></div>' +
      '<div class="lt-prop-grid">' +
        '<label class="lt-field span2"><span>名称</span><input class="lt-input" data-prop="name" type="text" value="' + esc(r.name) + '" placeholder="例: BAT 1 / 上手トラス"></label>' +
        selectProp('種類', 'type', r.type, [
          { value: 'batten', label: 'バトン' },
          { value: 'truss', label: 'トラス' },
          { value: 'stand', label: 'スタンド' },
        ], true) +
        inputProp('始点 X', 'x1', Math.round(r.x1), { type: 'number', step: 10 }) +
        inputProp('始点 Y', 'y1', Math.round(r.y1), { type: 'number', step: 10 }) +
        inputProp('終点 X', 'x2', Math.round(r.x2), { type: 'number', step: 10 }) +
        inputProp('終点 Y', 'y2', Math.round(r.y2), { type: 'number', step: 10 }) +
      '</div>' +
      (attached.length ? '<p class="lt-prop-note">載っている灯体: ' + attached.map((f) => esc(f.unit || libById(f.lib).short)).join(' / ') + '</p>' : '<p class="lt-prop-note">灯体をこの吊り物の近くに置くと自動で載ります。</p>') +
      '<div class="lt-props-actions">' +
        '<button type="button" class="lt-mini-btn" data-lt-act="duplicate">複製</button>' +
        '<button type="button" class="lt-mini-btn danger" data-lt-act="delete">削除</button>' +
      '</div>' +
      '<details class="lt-prop-details"><summary>シート設定</summary>' + sheetSettingsHTML() + '</details>' +
    '</div>';
  }

  function textPropsHTML(t) {
    return '<div class="lt-props-section">' +
      '<div class="lt-props-head"><div><span class="lt-props-kicker">TEXT</span><h2>テキスト</h2></div></div>' +
      '<div class="lt-prop-grid">' +
        textareaProp('内容', 'text', t.text, true) +
        inputProp('文字サイズ（mm）', 'size', t.size, { type: 'number', min: 1, step: 0.5 }) +
        selectProp('揃え', 'align', t.align, [{ value: 'start', label: '左' }, { value: 'middle', label: '中央' }], true) +
        inputProp('X（mm）', 'x', Math.round(t.x), { type: 'number', step: 10 }) +
        inputProp('Y（mm）', 'y', Math.round(t.y), { type: 'number', step: 10 }) +
      '</div>' +
      '<div class="lt-props-actions"><button type="button" class="lt-mini-btn" data-lt-act="duplicate">複製</button><button type="button" class="lt-mini-btn danger" data-lt-act="delete">削除</button></div>' +
      '<details class="lt-prop-details"><summary>シート設定</summary>' + sheetSettingsHTML() + '</details>' +
    '</div>';
  }

  function shapePropsHTML(s) {
    return '<div class="lt-props-section">' +
      '<div class="lt-props-head"><div><span class="lt-props-kicker">SHAPE</span><h2>矩形</h2></div></div>' +
      '<div class="lt-prop-grid">' +
        inputProp('X（mm）', 'x', Math.round(s.x), { type: 'number', step: 10 }) +
        inputProp('Y（mm）', 'y', Math.round(s.y), { type: 'number', step: 10 }) +
        inputProp('幅（mm）', 'w', Math.round(s.w), { type: 'number', step: 10, min: 10 }) +
        inputProp('高さ（mm）', 'h', Math.round(s.h), { type: 'number', step: 10, min: 10 }) +
        '<label class="lt-field"><span>線色</span><input class="lt-input" data-prop="stroke" type="color" value="' + esc(s.stroke) + '"></label>' +
        '<label class="lt-field"><span>塗り</span><input class="lt-input" data-prop="fill" type="text" value="' + esc(s.fill) + '" placeholder="rgba(255,255,255,.55)"></label>' +
      '</div>' +
      '<div class="lt-props-actions"><button type="button" class="lt-mini-btn" data-lt-act="duplicate">複製</button><button type="button" class="lt-mini-btn danger" data-lt-act="delete">削除</button></div>' +
      '<details class="lt-prop-details"><summary>シート設定</summary>' + sheetSettingsHTML() + '</details>' +
    '</div>';
  }

  function underlayPropsHTML(u) {
    return '<div class="lt-props-section">' +
      '<div class="lt-props-head"><div><span class="lt-props-kicker">UNDERLAY</span><h2>下敷き画像</h2></div></div>' +
      '<p class="lt-prop-note">会場図面などを下に敷いて、位置合わせに使えます。</p>' +
      '<div class="lt-prop-grid">' +
        inputProp('X（mm）', 'x', Math.round(u.x), { type: 'number', step: 10 }) +
        inputProp('Y（mm）', 'y', Math.round(u.y), { type: 'number', step: 10 }) +
        inputProp('幅（mm）', 'w', Math.round(u.w), { type: 'number', step: 10, min: 10 }) +
        inputProp('高さ（mm）', 'h', Math.round(u.h), { type: 'number', step: 10, min: 10 }) +
        '<label class="lt-field span2"><span>不透明度</span><input class="lt-input" data-prop="opacity" type="range" min="0.05" max="1" step="0.05" value="' + u.opacity + '"></label>' +
      '</div>' +
      '<div class="lt-props-actions"><button type="button" class="lt-mini-btn" data-lt-act="replace-image">画像を差し替え</button><button type="button" class="lt-mini-btn danger" data-lt-act="delete">削除</button></div>' +
      '<details class="lt-prop-details"><summary>シート設定</summary>' + sheetSettingsHTML() + '</details>' +
    '</div>';
  }

  function renderProps() {
    const box = $('#lt-props');
    if (!box) return;
    const items = selectedObjects();
    if (!items.length) {
      box.innerHTML = '<div class="lt-props-home"><div class="lt-props-head"><div><span class="lt-props-kicker">PLOT</span><h2>仕込み図</h2></div></div>' +
        '<p class="lt-prop-note">左のライブラリから灯体を選び、キャンバスをクリックして配置します。選択した灯体の属性はここで編集できます。</p>' +
        sheetSettingsHTML() + '</div>';
      return;
    }
    if (items.length > 1) {
      const names = items.map((i) => {
        if (i.type === 'fixture') return libById(i.obj.lib).name;
        if (i.type === 'rigging') return RIG_TYPES[i.obj.type];
        if (i.type === 'shape') return '矩形';
        if (i.type === 'text') return 'テキスト';
        return '下敷き';
      });
      const uniq = names.filter((v, i, a) => a.indexOf(v) === i);
      box.innerHTML = '<div class="lt-props-section"><div class="lt-props-head"><div><span class="lt-props-kicker">MULTI SELECT</span><h2>' + items.length + ' 個を選択中</h2></div></div>' +
        '<p class="lt-prop-note">' + esc(uniq.join(' / ')) + '</p>' +
        '<div class="lt-props-actions"><button type="button" class="lt-mini-btn" data-lt-act="duplicate">複製</button><button type="button" class="lt-mini-btn danger" data-lt-act="delete">削除</button></div>' +
        '<details class="lt-prop-details" open><summary>シート設定</summary>' + sheetSettingsHTML() + '</details></div>';
      return;
    }
    const one = items[0];
    if (one.type === 'fixture') box.innerHTML = fixturePropsHTML(one.obj);
    else if (one.type === 'rigging') box.innerHTML = riggingPropsHTML(one.obj);
    else if (one.type === 'text') box.innerHTML = textPropsHTML(one.obj);
    else if (one.type === 'shape') box.innerHTML = shapePropsHTML(one.obj);
    else if (one.type === 'underlay') box.innerHTML = underlayPropsHTML(one.obj);
  }

  /* ---------------------------------------------------------
     table / footer
     --------------------------------------------------------- */

  function renderTable() {
    const body = $('#lt-table-body');
    if (!body) return;
    const dupe = dupeInfo();
    body.innerHTML = state.fixtures.map((f, i) => {
      const lib = libById(f.lib);
      return '<tr data-lt-id="' + esc(f.id) + '" class="' + (selection.has(f.id) ? 'is-selected ' : '') + (dupe.byId.has(f.id) ? 'has-dupe' : '') + '">' +
        '<td class="c muted">' + (i + 1) + '</td>' +
        '<td class="lt-td-type"><span class="lt-type-dot" style="background:' + lib.color + '"></span>' + esc(lib.name) + '</td>' +
        '<td class="c"><input class="lt-td-input" data-field="unit" value="' + esc(f.unit) + '"></td>' +
        '<td class="c"><input class="lt-td-input' + (isDupeField(f, 'circuit', dupe) ? ' is-dupe' : '') + '" data-field="circuit" value="' + esc(f.circuit) + '"></td>' +
        '<td class="c muted">' + esc(f.dmxU ? f.dmxU + '/' + pad3(f.dmxA) : '') + '</td>' +
        '<td class="c"><input class="lt-td-input" data-field="color" value="' + esc(f.color) + '"></td>' +
        '<td><input class="lt-td-input" data-field="purpose" value="' + esc(f.purpose) + '"></td>' +
        '<td class="c"><input class="lt-td-input num" data-field="power" type="number" value="' + num(f.power) + '"></td>' +
        '<td><input class="lt-td-input" data-field="note" value="' + esc(f.note) + '"></td>' +
      '</tr>';
    }).join('');
    const empty = $('#lt-table-empty');
    if (empty) empty.hidden = state.fixtures.length > 0;
    const count = $('#lt-table-count');
    if (count) count.textContent = state.fixtures.length;
  }

  function isDupeField(f, field, dupe) {
    if (!dupe.byId.has(f.id)) return false;
    if (field === 'circuit') {
      const v = String(f.circuit || '').trim();
      return !!v && state.fixtures.filter((x) => String(x.circuit || '').trim() === v).length > 1;
    }
    return false;
  }

  function renderFooter() {
    const total = state.fixtures.length;
    const power = state.fixtures.reduce((a, f) => a + num(f.power), 0);
    const summary = $('#lt-summary');
    if (summary) summary.textContent = total ? '灯体 ' + total + ' / 合計 ' + power.toLocaleString('ja-JP') + 'W' : '灯体なし';
    const sel = $('#lt-selection-info');
    if (sel) {
      const items = selectedObjects();
      if (!items.length) sel.textContent = '選択なし';
      else if (items.length === 1) {
        const one = items[0];
        if (one.type === 'fixture') sel.textContent = '選択: ' + libById(one.obj.lib).name + (one.obj.unit ? ' / No.' + one.obj.unit : '');
        else if (one.type === 'rigging') sel.textContent = '選択: ' + (one.obj.name || RIG_TYPES[one.obj.type]);
        else sel.textContent = '選択: 1 個';
      } else sel.textContent = items.length + ' 個を選択中';
    }
    const count = $('#lt-table-count');
    if (count) count.textContent = total;
  }

  function renderWarnings() {
    const badge = $('#lt-warn');
    if (!badge) return;
    const d = dupeInfo();
    const parts = [];
    if (d.circuit) parts.push('回路 ' + d.circuit);
    if (d.dmx) parts.push('DMX ' + d.dmx);
    badge.hidden = !parts.length;
    badge.textContent = parts.length ? '重複: ' + parts.join(' / ') : '';
    badge.title = parts.length ? '回路またはDMXアドレスが重複しています' : '';
  }

  function renderAll() {
    renderCanvas();
    renderLibrary($('#lt-search') ? $('#lt-search').value : '');
    renderProps();
    renderTable();
    renderFooter();
    updateToolbar();
    renderWarnings();
  }

  /* ---------------------------------------------------------
     history / change plumbing
     --------------------------------------------------------- */

  function pushUndo() {
    const json = JSON.stringify(state);
    if (undoStack.length && undoStack[undoStack.length - 1] === json) return;
    undoStack.push(json);
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function beginEdit() {
    if (editSnapshot) {
      undoStack.push(editSnapshot);
      if (undoStack.length > LIMIT) undoStack.shift();
      redoStack.length = 0;
      editSnapshot = null;
    }
  }

  function emitChange() {
    if (onChange) onChange(state);
  }

  function commitAll() {
    emitChange();
    renderAll();
  }

  function commitLight() {
    emitChange();
    renderCanvas();
    renderTable();
    renderFooter();
    renderWarnings();
    updateToolbar();
  }

  function undo() {
    if (!undoStack.length) { U.toast('これ以上戻せません'); return; }
    redoStack.push(JSON.stringify(state));
    state = normalize(JSON.parse(undoStack.pop()));
    selection.clear();
    commitAll();
    U.toast('元に戻しました');
  }

  function redo() {
    if (!redoStack.length) { U.toast('やり直す操作がありません'); return; }
    undoStack.push(JSON.stringify(state));
    state = normalize(JSON.parse(redoStack.pop()));
    selection.clear();
    commitAll();
    U.toast('やり直しました');
  }

  function scheduleViewSave() {
    clearTimeout(viewSaveTimer);
    viewSaveTimer = setTimeout(() => {
      viewSaveTimer = null;
      if (onChange && active) onChange(state);
    }, 420);
  }

  /* ---------------------------------------------------------
     mutations
     --------------------------------------------------------- */

  function addFixture(libId, x, y) {
    const lib = libById(libId);
    pushUndo();
    const rig = nearestRig(x, y, 650);
    const f = {
      id: U.uid('f_'),
      lib: lib.id,
      x: x,
      y: y,
      rot: 0,
      beam: lib.beam,
      unit: nextUnit(),
      channel: '',
      circuit: '',
      dmxU: '',
      dmxA: '',
      color: '',
      gobo: '',
      purpose: '',
      power: lib.power,
      height: 0,
      note: '',
      rigId: rig ? rig.id : '',
    };
    state.fixtures.push(f);
    selection = new Set([f.id]);
    commitAll();
    return f;
  }

  function addRigging(type, x1, y1, x2, y2) {
    pushUndo();
    const r = {
      id: U.uid('r_'),
      type: type,
      name: nextRigName(type),
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
    };
    state.rigging.push(r);
    selection = new Set([r.id]);
    commitAll();
    return r;
  }

  function addTextAt(x, y) {
    const dlg = $('#lt-text-dialog');
    if (!dlg) return;
    textDialogPos = { x: x, y: y };
    const input = $('#lt-text-value');
    if (input) input.value = '';
    if (!dlg.open) dlg.showModal();
    if (input) setTimeout(() => { input.focus(); input.select(); }, 30);
  }

  function commitTextDialog(value) {
    const text = String(value || '').trim();
    if (!text || !textDialogPos) return;
    pushUndo();
    const t = {
      id: U.uid('t_'),
      x: textDialogPos.x,
      y: textDialogPos.y,
      text: text,
      size: 3.5,
      align: 'start',
    };
    state.texts.push(t);
    selection = new Set([t.id]);
    textDialogPos = null;
    commitAll();
  }

  function addRect(x1, y1, x2, y2) {
    pushUndo();
    const s = {
      id: U.uid('s_'),
      type: 'rect',
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.max(100, Math.abs(x2 - x1)),
      h: Math.max(100, Math.abs(y2 - y1)),
      stroke: '#4a5568',
      fill: 'rgba(255,255,255,.55)',
    };
    state.shapes.push(s);
    selection = new Set([s.id]);
    commitAll();
  }

  function selectionWithAttachments() {
    const ids = new Set(selection);
    state.rigging.forEach((r) => {
      if (!selection.has(r.id)) return;
      state.fixtures.forEach((f) => { if (f.rigId === r.id) ids.add(f.id); });
    });
    return Array.from(ids);
  }

  function deleteSelection() {
    if (!selection.size) return;
    pushUndo();
    const ids = new Set(selection);
    state.fixtures = state.fixtures.filter((f) => !ids.has(f.id));
    const removedRigs = new Set(state.rigging.filter((r) => ids.has(r.id)).map((r) => r.id));
    state.rigging = state.rigging.filter((r) => !ids.has(r.id));
    state.shapes = state.shapes.filter((s) => !ids.has(s.id));
    state.texts = state.texts.filter((t) => !ids.has(t.id));
    if (state.underlay && ids.has(state.underlay.id)) state.underlay = null;
    if (removedRigs.size) {
      state.fixtures.forEach((f) => { if (removedRigs.has(f.rigId)) f.rigId = ''; });
    }
    selection.clear();
    commitAll();
    U.toast('削除しました（⌘Z で戻せます）');
  }

  function duplicateSelection() {
    if (!selection.size) return;
    pushUndo();
    const ids = new Set(selection);
    const nextIds = new Set();
    let unit = parseInt(nextUnit(), 10) || 1;

    state.fixtures.filter((f) => ids.has(f.id)).forEach((f) => {
      const copy = Object.assign({}, f, { id: U.uid('f_'), x: f.x + 900, y: f.y + 900, unit: String(unit) });
      unit += 1;
      state.fixtures.push(copy);
      nextIds.add(copy.id);
    });
    state.rigging.filter((r) => ids.has(r.id)).forEach((r) => {
      const copy = Object.assign({}, r, { id: U.uid('r_'), name: (r.name || RIG_TYPES[r.type]) + ' コピー', x1: r.x1 + 900, y1: r.y1 + 900, x2: r.x2 + 900, y2: r.y2 + 900 });
      state.rigging.push(copy);
      nextIds.add(copy.id);
    });
    state.shapes.filter((s) => ids.has(s.id)).forEach((s) => {
      const copy = Object.assign({}, s, { id: U.uid('s_'), x: s.x + 900, y: s.y + 900 });
      state.shapes.push(copy);
      nextIds.add(copy.id);
    });
    state.texts.filter((t) => ids.has(t.id)).forEach((t) => {
      const copy = Object.assign({}, t, { id: U.uid('t_'), x: t.x + 900, y: t.y + 900 });
      state.texts.push(copy);
      nextIds.add(copy.id);
    });
    if (state.underlay && ids.has(state.underlay.id)) {
      const copy = Object.assign({}, state.underlay, { id: U.uid('img_'), x: state.underlay.x + 900, y: state.underlay.y + 900 });
      /* 下敷きは1枚まで */
      state.underlay = copy;
      nextIds.add(copy.id);
    }
    selection = nextIds;
    commitAll();
  }

  function moveSelectionBy(dx, dy) {
    const ids = selectionWithAttachments();
    if (!ids.length) return;
    pushUndo();
    moveObjects(ids, dx, dy, null, false);
    commitAll();
  }

  function moveObjects(ids, dx, dy, originals, snap) {
    ids.forEach((id) => {
      const found = findObject(id);
      if (!found) return;
      const o = originals && originals[id] ? originals[id] : null;
      const baseX = o ? o.x : (found.obj.x != null ? found.obj.x : found.obj.x1);
      const baseY = o ? o.y : (found.obj.y != null ? found.obj.y : found.obj.y1);
      if (found.type === 'fixture' || found.type === 'text' || found.type === 'shape' || found.type === 'underlay') {
        let nx = baseX + dx;
        let ny = baseY + dy;
        if (snap) { nx = snapValue(nx); ny = snapValue(ny); }
        found.obj.x = nx;
        found.obj.y = ny;
      } else if (found.type === 'rigging') {
        const o1x = o ? o.x1 : found.obj.x1;
        const o1y = o ? o.y1 : found.obj.y1;
        const o2x = o ? o.x2 : found.obj.x2;
        const o2y = o ? o.y2 : found.obj.y2;
        let x1 = o1x + dx;
        let y1 = o1y + dy;
        let x2 = o2x + dx;
        let y2 = o2y + dy;
        if (snap) {
          x1 = snapValue(x1); y1 = snapValue(y1);
          x2 = snapValue(x2); y2 = snapValue(y2);
        }
        found.obj.x1 = x1; found.obj.y1 = y1;
        found.obj.x2 = x2; found.obj.y2 = y2;
      }
    });
  }

  function autoNumber() {
    if (!state.fixtures.length) return;
    pushUndo();
    const sorted = state.fixtures.slice().sort((a, b) => {
      const ay = Math.round(a.y / Math.max(100, state.sheet.grid));
      const by = Math.round(b.y / Math.max(100, state.sheet.grid));
      return (ay - by) || (a.x - b.x);
    });
    sorted.forEach((f, i) => { f.unit = String(i + 1); });
    commitAll();
    U.toast('灯体番号を左から順に振り直しました');
  }

  /* ---------------------------------------------------------
     property updates
     --------------------------------------------------------- */

  function applyProp(prop, value) {
    const one = oneSelected();
    if (!one) return;
    const obj = one.obj;
    const numeric = {
      x: true, y: true, w: true, h: true, size: true, power: true, height: true,
      rot: true, beam: true, x1: true, y1: true, x2: true, y2: true, opacity: true,
    };
    if (numeric[prop]) {
      const n = num(value, obj[prop]);
      if (prop === 'w' || prop === 'h') obj[prop] = Math.max(10, n);
      else if (prop === 'opacity') obj[prop] = U.clamp(n, 0.05, 1);
      else obj[prop] = n;
    } else {
      obj[prop] = String(value == null ? '' : value);
    }
  }

  function applySheet(key, value) {
    if (key === 'paper') state.sheet.paper = value === 'A4' ? 'A4' : 'A3';
    else if (key === 'orientation') state.sheet.orientation = value === 'portrait' ? 'portrait' : 'landscape';
    else if (key === 'scale' || key === 'grid') state.sheet[key] = num(value, state.sheet[key]);
    else if (key === 'title') state.sheet.title = String(value || '');
  }

  function applyToggle(key, checked) {
    state.sheet[key] = !!checked;
  }

  /* ---------------------------------------------------------
     pointer interaction
     --------------------------------------------------------- */

  function hitObject(clientX, clientY) {
    const w = screenToWorld(clientX, clientY);
    const z = zoom || 0.05;
    const hitR = 10 / z;
    let best = null;
    let bestDist = Infinity;

    state.fixtures.forEach((f) => {
      const ext = fixtureExtent(f);
      if (w.x >= f.x - ext.w / 2 - hitR && w.x <= f.x + ext.w / 2 + hitR &&
          w.y >= f.y - ext.h / 2 - hitR && w.y <= f.y + ext.h / 2 + hitR) {
        const d = Math.hypot(w.x - f.x, w.y - f.y);
        if (d < bestDist) { bestDist = d; best = f.id; }
      }
    });
    state.rigging.forEach((r) => {
      const d = distToSegment(w.x, w.y, r.x1, r.y1, r.x2, r.y2);
      if (d < 14 / z && d < bestDist) { bestDist = d; best = r.id; }
    });
    state.shapes.slice().reverse().forEach((s) => {
      if (w.x >= s.x - hitR && w.x <= s.x + s.w + hitR && w.y >= s.y - hitR && w.y <= s.y + s.h + hitR) {
        if (!best) best = s.id;
      }
    });
    state.texts.slice().reverse().forEach((t) => {
      const size = t.size * state.sheet.scale;
      const width = Math.max(600, String(t.text || '').length * size * 0.62);
      const x = t.align === 'middle' ? t.x - width / 2 : t.x;
      const pad = 8 / z;
      if (w.x >= x - pad && w.x <= x + width + pad && w.y >= t.y - size * 1.5 - pad && w.y <= t.y + size * 0.6 + pad) {
        if (!best) best = t.id;
      }
    });
    if (state.underlay) {
      const u = state.underlay;
      if (w.x >= u.x && w.x <= u.x + u.w && w.y >= u.y && w.y <= u.y + u.h) {
        /* 下敷きは最背面なので、他に当たりがなければ選ぶ */
        if (!best) best = u.id;
      }
    }
    return best;
  }

  function onPointerDown(e) {
    if (!active) return;
    if (e.button === 2) return;
    const svg = canvasEl();
    if (e.target.closest('#lt-preview') || e.target.closest('dialog')) return;
    const world = screenToWorld(e.clientX, e.clientY);
    const panMode = e.button === 1 || spaceDown || activeTool === 'pan';

    if (panMode) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: state.view.cx, cy: state.view.cy, pointerId: e.pointerId };
      svg.classList.add('is-panning');
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    if (pendingLib) {
      addFixture(pendingLib, snapValue(world.x), snapValue(world.y));
      e.preventDefault();
      return;
    }

    if (activeTool === 'text') {
      addTextAt(snapValue(world.x), snapValue(world.y));
      setTool('select');
      e.preventDefault();
      return;
    }

    if (activeTool === 'batten' || activeTool === 'truss' || activeTool === 'stand' || activeTool === 'rect') {
      draft = {
        kind: activeTool === 'rect' ? 'rect' : 'rigging',
        type: activeTool === 'rect' ? '' : activeTool,
        x1: snapValue(world.x),
        y1: snapValue(world.y),
        x2: snapValue(world.x),
        y2: snapValue(world.y),
      };
      drag = { mode: 'draw', pointerId: e.pointerId };
      e.preventDefault();
      return;
    }

    const id = hitObject(e.clientX, e.clientY);
    if (id) {
      if (e.shiftKey) {
        if (selection.has(id)) selection.delete(id); else selection.add(id);
      } else if (!selection.has(id)) {
        selection = new Set([id]);
      }
      renderCanvas();
      renderProps();
      renderTable();
      renderFooter();

      if (selection.has(id)) {
        const ids = selectionWithAttachments();
        const originals = {};
        ids.forEach((oid) => {
          const found = findObject(oid);
          if (!found) return;
          if (found.type === 'rigging') {
            originals[oid] = { x1: found.obj.x1, y1: found.obj.y1, x2: found.obj.x2, y2: found.obj.y2 };
          } else {
            originals[oid] = { x: found.obj.x, y: found.obj.y };
          }
        });
        drag = {
          mode: 'move',
          ids: ids,
          originals: originals,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          history: false,
          pointerId: e.pointerId,
        };
        svg.classList.add('is-moving');
        document.body.classList.add('lt-dragging');
      }
      e.preventDefault();
      return;
    }

    if (!e.shiftKey) selection.clear();
    drag = {
      mode: 'marquee',
      start: { x: world.x, y: world.y },
      startClient: { x: e.clientX, y: e.clientY },
      pointerId: e.pointerId,
      shift: e.shiftKey,
      base: new Set(selection),
    };
    marquee = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
    renderCanvas();
    renderProps();
    renderTable();
    renderFooter();
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (drag.mode === 'pan') {
      const z = zoom || fitZoom();
      state.view.cx = drag.cx - (e.clientX - drag.sx) / z;
      state.view.cy = drag.cy - (e.clientY - drag.sy) / z;
      rafRenderCanvas();
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);
    if (drag.mode === 'draw' && draft) {
      draft.x2 = snapValue(world.x);
      draft.y2 = snapValue(world.y);
      rafRenderCanvas();
      return;
    }

    if (drag.mode === 'marquee' && marquee) {
      marquee.x2 = world.x;
      marquee.y2 = world.y;
      rafRenderCanvas();
      return;
    }

    if (drag.mode === 'move') {
      const dxPix = e.clientX - drag.startX;
      const dyPix = e.clientY - drag.startY;
      if (!drag.moved && Math.abs(dxPix) + Math.abs(dyPix) < 3) return;
      if (!drag.moved) {
        pushUndo();
        drag.moved = true;
        drag.history = true;
      }
      const z = zoom || fitZoom();
      moveObjects(drag.ids, dxPix / z, dyPix / z, drag.originals, state.sheet.snap);
      rafRenderCanvas();
      renderFooter();
    }
  }

  function marqueeSelect() {
    if (!marquee) return;
    const x1 = Math.min(marquee.x1, marquee.x2);
    const y1 = Math.min(marquee.y1, marquee.y2);
    const x2 = Math.max(marquee.x1, marquee.x2);
    const y2 = Math.max(marquee.y1, marquee.y2);

    function inside(x, y, w, h) {
      return x < x2 && x + w > x1 && y < y2 && y + h > y1;
    }

    const next = new Set(drag && drag.shift ? drag.base : []);
    state.fixtures.forEach((f) => {
      const ext = fixtureExtent(f);
      if (inside(f.x - ext.w / 2, f.y - ext.h / 2, ext.w, ext.h)) next.add(f.id);
    });
    state.rigging.forEach((r) => {
      if (inside(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1))) next.add(r.id);
    });
    state.shapes.forEach((s) => { if (inside(s.x, s.y, s.w, s.h)) next.add(s.id); });
    state.texts.forEach((t) => {
      const size = t.size * state.sheet.scale;
      if (inside(t.x, t.y - size, Math.max(600, String(t.text || '').length * size * 0.62), size * 1.4)) next.add(t.id);
    });
    if (state.underlay && inside(state.underlay.x, state.underlay.y, state.underlay.w, state.underlay.h)) next.add(state.underlay.id);
    selection = next;
  }

  function onPointerUp(e) {
    if (!drag) return;
    const svg = canvasEl();
    const mode = drag.mode;

    if (mode === 'pan') {
      svg.classList.remove('is-panning');
      scheduleViewSave();
    } else if (mode === 'move') {
      svg.classList.remove('is-moving');
      document.body.classList.remove('lt-dragging');
      if (drag.moved) commitAll();
      else {
        renderFooter();
      }
    } else if (mode === 'draw') {
      if (draft) {
        if (draft.kind === 'rigging') {
          const len = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
          if (len >= 200) addRigging(draft.type, draft.x1, draft.y1, draft.x2, draft.y2);
        } else {
          const w = Math.abs(draft.x2 - draft.x1);
          const h = Math.abs(draft.y2 - draft.y1);
          if (w >= 100 && h >= 100) addRect(draft.x1, draft.y1, draft.x2, draft.y2);
        }
      }
      draft = null;
      setTool('select');
    } else if (mode === 'marquee') {
      marqueeSelect();
      marquee = null;
      renderCanvas();
      renderProps();
      renderTable();
      renderFooter();
    }

    drag = null;
    rafRenderCanvas();
  }

  /* ---------------------------------------------------------
     image underlay
     --------------------------------------------------------- */

  function loadImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { U.toast('画像ファイルを選んでください'); return; }
    U.readFile(file, true).then((dataUrl) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ img: img, dataUrl: dataUrl });
        img.onerror = reject;
        img.src = dataUrl;
      });
    }).then((res) => {
      const max = 2200;
      const iw = res.img.naturalWidth || res.img.width;
      const ih = res.img.naturalHeight || res.img.height;
      const ratio = Math.min(1, max / Math.max(iw, ih));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(iw * ratio));
      canvas.height = Math.max(1, Math.round(ih * ratio));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(res.img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL('image/jpeg', 0.82);
      const box = sheetSize();
      const w = box.w * 0.62;
      const h = w * (ih / iw);
      pushUndo();
      state.underlay = {
        id: U.uid('img_'),
        dataUrl: out,
        x: (box.w - w) / 2,
        y: (box.h - h) / 2,
        w: w,
        h: h,
        opacity: 0.5,
      };
      selection = new Set([state.underlay.id]);
      commitAll();
      U.toast('下敷き画像を配置しました');
      if (out.length > 2600000) U.toast('画像が大きいため、保存容量に注意してください');
    }).catch(() => {
      U.toast('画像を読み込めませんでした');
    });
  }

  /* ---------------------------------------------------------
     preview / export
     --------------------------------------------------------- */

  function setPageStyle() {
    let style = $('#page-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'page-style';
      document.head.appendChild(style);
    }
    style.textContent = '@page { size: ' + state.sheet.paper + ' ' + state.sheet.orientation + '; margin: 0; }';
  }

  function buildPrintSVG() {
    const p = paperDims(state.sheet);
    const box = sheetSize();
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + p.w + 'mm" height="' + p.h + 'mm" viewBox="0 0 ' + box.w + ' ' + box.h + '" font-family="' + FONT + '">' +
      svgContent('print') + '</svg>';
  }

  function renderPrintPreview() {
    const sheet = $('#lt-preview-sheet');
    if (!sheet) return;
    const p = paperDims(state.sheet);
    sheet.innerHTML = buildPrintSVG();
    sheet.style.width = p.w + 'mm';
    sheet.style.height = p.h + 'mm';
    setPageStyle();
    const tag = $('#lt-preview-tag');
    if (tag) tag.textContent = paperText();
    if ($('#lt-preview').classList.contains('open')) fitPreview();
  }

  function fitPreview() {
    const preview = $('#lt-preview');
    if (!preview || !preview.classList.contains('open')) return;
    const sheet = $('#lt-preview-sheet');
    const stage = $('#lt-preview-stage');
    const scroll = $('#lt-preview-scroll');
    void preview.offsetWidth;
    sheet.style.transform = 'none';
    const w = sheet.offsetWidth;
    const h = sheet.offsetHeight;
    if (!w) return;
    const availW = Math.max(200, scroll.clientWidth - 40);
    const availH = Math.max(200, scroll.clientHeight - 48);
    const scale = Math.max(0.1, Math.min(1, availW / w, availH / h));
    sheet.style.transformOrigin = 'top left';
    sheet.style.transform = 'scale(' + scale + ')';
    stage.style.width = Math.round(w * scale) + 'px';
    stage.style.height = Math.round(h * scale) + 'px';
  }

  function openPreview() {
    if (!active) return;
    renderPrintPreview();
    $('#lt-preview').classList.add('open');
    document.body.classList.add('no-scroll');
    $('#lt-preview-scroll').scrollTop = 0;
    requestAnimationFrame(fitPreview);
    setTimeout(fitPreview, 70);
  }

  function closePreview() {
    const el = $('#lt-preview');
    if (!el || !el.classList.contains('open')) return;
    el.classList.remove('open');
    document.body.classList.remove('no-scroll');
  }

  function printDoc() {
    if (!active) return;
    renderPrintPreview();
    if (!$('#lt-preview').classList.contains('open')) openPreview();
    setTimeout(() => window.print(), 120);
  }

  function exportSVG() {
    const base = U.fileBase(state.sheet.title || (currentProject && currentProject.name), '照明仕込み図');
    U.download(base + '_' + U.todayISO() + '.svg', buildPrintSVG(), 'image/svg+xml');
    U.toast('SVGを書き出しました');
  }

  function exportPNG() {
    const p = paperDims(state.sheet);
    const dpi = 200;
    const width = Math.round(p.w / 25.4 * dpi);
    const height = Math.round(p.h / 25.4 * dpi);
    const svgStr = buildPrintSVG();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) { U.toast('PNGを書き出せませんでした'); return; }
        const base = U.fileBase(state.sheet.title || (currentProject && currentProject.name), '照明仕込み図');
        U.download(base + '_' + U.todayISO() + '.png', b, 'image/png');
        U.toast('PNGを書き出しました');
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      U.toast('PNGを書き出せませんでした');
    };
    img.src = url;
  }

  function exportCSV() {
    const p = currentProject || {};
    const head = ['No.', 'ユニット', '種別', '回路', 'DMX U', 'DMX Adr', '色', 'ゴボ', '用途', '消費電力(W)', '高さ(mm)', 'メモ'];
    const lines = [
      ['プロジェクト', p.name || '', '会場', p.venue || '', '日付', p.date || '', 'Rev', p.rev || ''],
      [],
      head,
    ];
    state.fixtures.forEach((f, i) => {
      const lib = libById(f.lib);
      lines.push([
        i + 1, f.unit, lib.name, f.circuit, f.dmxU, f.dmxA, f.color, f.gobo, f.purpose,
        num(f.power), num(f.height), f.note,
      ]);
    });
    lines.push([]);
    const power = state.fixtures.reduce((a, f) => a + num(f.power), 0);
    lines.push(['合計', state.fixtures.length + '灯', '', '', '', '', '', '', '', power, '', '']);
    const csv = lines.map((row) => row.map(U.csvCell).join(',')).join('\r\n');
    const base = U.fileBase(state.sheet.title || p.name, '照明仕込み図');
    U.download(base + '_灯体リスト.csv', '\ufeff' + csv, 'text/csv');
    U.toast('灯体リストをCSVで書き出しました');
  }

  function openShortcuts() {
    const dlg = $('#lt-shortcuts');
    if (dlg && !dlg.open) dlg.showModal();
  }

  /* ---------------------------------------------------------
     bindings
     --------------------------------------------------------- */

  function setTool(tool) {
    if (tool === 'image') {
      $('#lt-image-input').click();
      return;
    }
    activeTool = tool;
    pendingLib = null;
    draft = null;
    marquee = null;
    if (tool !== 'select') selection.clear();
    const wrap = $('#lt-canvas-wrap');
    if (wrap) {
      wrap.classList.toggle('tool-pan', tool === 'pan');
      wrap.classList.toggle('tool-draw', ['batten', 'truss', 'stand', 'rect', 'text'].indexOf(tool) !== -1);
    }
    renderLibrary($('#lt-search') ? $('#lt-search').value : '');
    renderProps();
    renderCanvas();
    updateToolbar();
  }

  function setPendingLib(libId) {
    if (pendingLib === libId) {
      pendingLib = null;
      activeTool = 'select';
    } else {
      pendingLib = libId;
      activeTool = 'place';
    }
    const wrap = $('#lt-canvas-wrap');
    if (wrap) {
      wrap.classList.toggle('tool-pan', false);
      wrap.classList.toggle('tool-draw', false);
    }
    renderLibrary($('#lt-search') ? $('#lt-search').value : '');
    updateToolbar();
    renderCanvas();
  }

  function bindToolbar() {
    $$('.lt-tool[data-lt-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.ltTool;
        if (tool === 'image') { $('#lt-image-input').click(); return; }
        setTool(tool);
      });
    });

    $('#lt-zoom-in').addEventListener('click', () => {
      const svg = canvasEl();
      const r = svg.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25);
    });
    $('#lt-zoom-out').addEventListener('click', () => {
      const svg = canvasEl();
      const r = svg.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8);
    });
    $('#lt-fit').addEventListener('click', () => fitCanvas(true));
    $('#lt-undo').addEventListener('click', undo);
    $('#lt-redo').addEventListener('click', redo);
    $('#lt-autonumber').addEventListener('click', autoNumber);

    const toggleMap = {
      'lt-grid': 'showGrid',
      'lt-snap': 'snap',
      'lt-labels': 'showLabels',
      'lt-beams': 'showBeams',
    };
    Object.keys(toggleMap).forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => {
        pushUndo();
        applyToggle(toggleMap[id], el.checked);
        commitAll();
      });
    });

    $('#lt-table-toggle').addEventListener('click', () => {
      const wrap = $('#lt-table-wrap');
      wrap.classList.toggle('open');
      $('#lt-table-toggle').classList.toggle('open', wrap.classList.contains('open'));
      renderCanvas();
      setTimeout(fitPreview, 0);
    });

    $('#lt-search').addEventListener('input', (e) => renderLibrary(e.target.value));

    $('#lt-library').addEventListener('click', (e) => {
      const item = e.target.closest('[data-lib]');
      if (item) setPendingLib(item.dataset.lib);
    });
    $('#lt-library').addEventListener('dragstart', (e) => {
      const item = e.target.closest('[data-lib]');
      if (!item) return;
      try {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/lt-lib', item.dataset.lib);
      } catch (err) { /* ignore */ }
    });

    $('#lt-image-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) loadImageFile(file);
      e.target.value = '';
      setTool('select');
    });

    $('#lt-btn-preview').addEventListener('click', openPreview);
    $('#lt-btn-pdf').addEventListener('click', printDoc);
    $('#lt-btn-print').addEventListener('click', printDoc);
    $('#lt-btn-close-preview').addEventListener('click', closePreview);
    $('#lt-preview').addEventListener('click', (e) => {
      if (e.target === $('#lt-preview')) closePreview();
    });

    const shortcuts = $('#lt-shortcuts');
    $$('#lt-shortcuts [data-close]').forEach((btn) => btn.addEventListener('click', () => shortcuts.close()));
    shortcuts.addEventListener('click', (e) => {
      if (e.target === shortcuts) shortcuts.close();
    });

    const textDlg = $('#lt-text-dialog');
    const textForm = $('#lt-text-form');
    if (textDlg && textForm) {
      $$('#lt-text-dialog [data-close]').forEach((btn) => btn.addEventListener('click', () => {
        textDialogPos = null;
        textDlg.close();
      }));
      textDlg.addEventListener('click', (e) => {
        if (e.target === textDlg) {
          textDialogPos = null;
          textDlg.close();
        }
      });
      textDlg.addEventListener('close', () => { textDialogPos = null; });
      textForm.addEventListener('submit', (e) => {
        e.preventDefault();
        commitTextDialog($('#lt-text-value').value);
        textDlg.close();
      });
    }
  }

  function bindCanvas() {
    const svg = canvasEl();
    const wrap = $('#lt-canvas-wrap');

    svg.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    svg.addEventListener('wheel', (e) => {
      if (!active) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });

    wrap.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types && Array.from(e.dataTransfer.types).indexOf('text/lt-lib') !== -1) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    wrap.addEventListener('drop', (e) => {
      const libId = e.dataTransfer.getData('text/lt-lib');
      if (!libId) return;
      e.preventDefault();
      const w = screenToWorld(e.clientX, e.clientY);
      addFixture(libId, snapValue(w.x), snapValue(w.y));
    });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        if (!active) return;
        if (needFit) fitCanvas(false);
        else renderCanvas();
        updateZoomLabel();
      });
      ro.observe(wrap);
    }
    window.addEventListener('resize', () => { if ($('#lt-preview').classList.contains('open')) fitPreview(); });
  }

  function bindProps() {
    const props = $('#lt-props');
    props.addEventListener('focusin', (e) => {
      if (e.target.matches('input,textarea,select')) editSnapshot = JSON.stringify(state);
    });
    props.addEventListener('focusout', () => { editSnapshot = null; });

    props.addEventListener('input', (e) => {
      const sheetKey = e.target.dataset.sheet;
      if (sheetKey === 'title') {
        beginEdit();
        applySheet('title', e.target.value);
        emitChange();
        renderCanvas();
        return;
      }
      const prop = e.target.dataset.prop;
      if (!prop) return;
      if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') return;
      beginEdit();
      applyProp(prop, e.target.value);
      emitChange();
      renderCanvas();
      renderTable();
      renderFooter();
      renderWarnings();
      updateToolbar();
    });

    props.addEventListener('change', (e) => {
      const sheetKey = e.target.dataset.sheet;
      if (sheetKey && sheetKey !== 'title') {
        beginEdit();
        const geometry = sheetKey === 'paper' || sheetKey === 'orientation' || sheetKey === 'scale';
        applySheet(sheetKey, e.target.value);
        emitChange();
        commitAll();
        if (geometry) fitCanvas(true);
        return;
      }
      const toggle = e.target.dataset.sheetToggle;
      if (toggle) {
        beginEdit();
        applyToggle(toggle, e.target.checked);
        commitAll();
        return;
      }
      const prop = e.target.dataset.prop;
      if (prop) {
        beginEdit();
        applyProp(prop, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
        commitAll();
      }
    });

    props.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lt-act]');
      if (!btn) return;
      const act = btn.dataset.ltAct;
      if (act === 'duplicate') duplicateSelection();
      else if (act === 'delete') deleteSelection();
      else if (act === 'detach') {
        const one = oneSelected();
        if (one && one.type === 'fixture') {
          pushUndo();
          one.obj.rigId = '';
          commitAll();
        }
      } else if (act === 'fit') fitCanvas(true);
      else if (act === 'replace-image') $('#lt-image-input').click();
    });
  }

  function bindTable() {
    const body = $('#lt-table-body');
    body.addEventListener('focusin', (e) => {
      if (e.target.matches('input')) editSnapshot = JSON.stringify(state);
    });
    body.addEventListener('focusout', () => { editSnapshot = null; });
    body.addEventListener('input', (e) => {
      const input = e.target.closest('[data-field]');
      if (!input) return;
      const tr = input.closest('tr[data-lt-id]');
      const f = tr && fixtureById(tr.dataset.ltId);
      if (!f) return;
      beginEdit();
      const field = input.dataset.field;
      f[field] = field === 'power' ? num(input.value, f.power) : input.value;
      emitChange();
      renderCanvas();
      renderFooter();
      renderWarnings();
      updateToolbar();
    });
    body.addEventListener('click', (e) => {
      if (e.target.closest('input')) return;
      const tr = e.target.closest('tr[data-lt-id]');
      if (!tr) return;
      selection = new Set([tr.dataset.ltId]);
      commitLight();
      renderProps();
      renderTable();
      fitPreview();
    });
  }

  /* ---------------------------------------------------------
     keyboard
     --------------------------------------------------------- */

  function onKeyDown(e) {
    if (!active) return;
    const preview = $('#lt-preview');
    if (preview.classList.contains('open')) {
      if (e.key === 'Escape') { closePreview(); e.preventDefault(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); printDoc(); }
      return;
    }
    if (document.querySelector('dialog[open]')) return;
    if (U.isTextField(document.activeElement)) return;

    const mod = e.metaKey || e.ctrlKey;
    const k = String(e.key || '').toLowerCase();

    if (mod && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && k === 'd') { e.preventDefault(); duplicateSelection(); return; }
    if (mod && k === 'p') { e.preventDefault(); printDoc(); return; }
    if (mod && k === 's') { e.preventDefault(); KZ.store.saveNow(); U.toast('保存しました'); return; }

    if (e.key === 'Escape') {
      pendingLib = null;
      activeTool = 'select';
      draft = null;
      marquee = null;
      selection.clear();
      renderLibrary($('#lt-search') ? $('#lt-search').value : '');
      renderAll();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selection.size) { e.preventDefault(); deleteSelection(); }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!selection.size) return;
      e.preventDefault();
      const step = e.shiftKey ? 100 : 10;
      if (e.key === 'ArrowLeft') moveSelectionBy(-step, 0);
      else if (e.key === 'ArrowRight') moveSelectionBy(step, 0);
      else if (e.key === 'ArrowUp') moveSelectionBy(0, -step);
      else moveSelectionBy(0, step);
      return;
    }
    if (e.code === 'Space') {
      if (!spaceDown) {
        spaceDown = true;
        canvasEl().classList.add('is-space');
      }
      e.preventDefault();
      return;
    }
    if (!mod) {
      if (k === 'v') { setTool('select'); return; }
      if (k === 'h') { setTool('pan'); return; }
      if (k === 'b') { setTool('batten'); return; }
      if (k === 'r') { setTool('truss'); return; }
      if (k === 's') { setTool('stand'); return; }
      if (k === 't') { setTool('text'); return; }
      if (k === 'm') { setTool('rect'); return; }
      if (k === '0') { fitCanvas(true); return; }
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      const svg = canvasEl();
      if (svg) svg.classList.remove('is-space');
    }
  }

  /* ---------------------------------------------------------
     sample
     --------------------------------------------------------- */

  function loadSample() {
    if (state.fixtures.length && !window.confirm('現在の灯体・吊り物をサンプルに置き換えます。よろしいですか？')) return;
    pushUndo();
    const box = sheetSize();
    state.fixtures = [];
    state.rigging = [];
    state.shapes = [];
    selection.clear();

    const x1 = box.w * 0.16;
    const x2 = box.w * 0.84;
    const rigs = [
      { type: 'batten', name: 'BAT 1（正面）', y: box.h * 0.22 },
      { type: 'truss', name: 'TRS 1（中吊り）', y: box.h * 0.42 },
      { type: 'truss', name: 'TRS 2（後面）', y: box.h * 0.6 },
    ].map((r) => {
      const rig = { id: U.uid('r_'), type: r.type, name: r.name, x1: x1, y1: r.y, x2: x2, y2: r.y };
      state.rigging.push(rig);
      return rig;
    });

    let unit = 1;
    let circuit = 1;
    let dmx = 1;

    function place(rig, libId, count, color, purpose, inset) {
      const lib = libById(libId);
      const pad = inset == null ? 800 : inset;
      for (let i = 0; i < count; i += 1) {
        const x = x1 + pad + ((x2 - x1 - pad * 2) * (count === 1 ? 0.5 : i / (count - 1)));
        state.fixtures.push({
          id: U.uid('f_'),
          lib: lib.id,
          x: x,
          y: rig.y1 - 550,
          rot: 90,
          beam: lib.beam,
          unit: String(unit),
          channel: '',
          circuit: 'D-' + circuit,
          dmxU: lib.dmx ? '1' : '',
          dmxA: lib.dmx ? String(dmx) : '',
          color: color || '',
          gobo: '',
          purpose: purpose || '',
          power: lib.power,
          height: 6000,
          note: '',
          rigId: rig.id,
        });
        unit += 1;
        circuit += 1;
        if (lib.dmx) dmx += lib.dmx;
      }
    }

    place(rigs[0], 'par', 6, 'L201', '正面');
    place(rigs[0], 'wash', 2, 'L202', '正面', 2600);
    place(rigs[1], 'fresnel', 4, 'R02', '中割');
    place(rigs[1], 'moving', 2, 'L181', '中割', 2600);
    place(rigs[2], 'spot', 4, 'NC', '後方');
    place(rigs[2], 'ledbar', 2, 'L219', '後方', 2600);

    commitAll();
    fitCanvas(true);
    U.toast('サンプル配置を作成しました（⌘Z で戻せます）');
  }

  /* ---------------------------------------------------------
     lifecycle
     --------------------------------------------------------- */

  function mount() {
    if (mounted) return;
    mounted = true;
    bindToolbar();
    bindCanvas();
    bindProps();
    bindTable();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => {
      spaceDown = false;
      const svg = canvasEl();
      if (svg) svg.classList.remove('is-space');
    });
    window.addEventListener('beforeprint', () => {
      if (active) renderPrintPreview();
    });
    renderLibrary('');
    renderAll();
  }

  function createState() {
    return defaultState();
  }

  function open(project) {
    mount();
    active = true;
    currentProject = project || null;
    state = normalize(project && project.lighting ? project.lighting : null);
    selection.clear();
    undoStack = [];
    redoStack = [];
    pendingLib = null;
    activeTool = 'select';
    draft = null;
    marquee = null;
    drag = null;
    editSnapshot = null;
    zoom = num(state.view.zoom, 0) || 0;
    needFit = !zoom;
    $('#view-lighting').hidden = false;
    const wrap = $('#lt-canvas-wrap');
    if (wrap) {
      wrap.classList.remove('tool-pan', 'tool-draw');
    }
    renderAll();
    setTool('select');
    requestAnimationFrame(() => {
      if (needFit) fitCanvas(false);
      else renderCanvas();
      updateZoomLabel();
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (active) renderCanvas(); });
    }
  }

  function close() {
    active = false;
    closePreview();
    const dlg = $('#lt-shortcuts');
    if (dlg && dlg.open) dlg.close();
    const textDlg = $('#lt-text-dialog');
    if (textDlg && textDlg.open) textDlg.close();
    textDialogPos = null;
    if (viewSaveTimer) {
      clearTimeout(viewSaveTimer);
      viewSaveTimer = null;
      if (onChange) onChange(state);
    }
    drag = null;
    marquee = null;
    draft = null;
    document.body.classList.remove('lt-dragging');
  }

  function refreshProject(project) {
    currentProject = project || currentProject;
    renderAll();
  }

  KZ.lighting = {
    mount,
    open,
    close,
    createState,
    refreshProject,
    onChange: (fn) => { onChange = fn; },
    undo,
    redo,
    loadSample,
    exportCSV,
    exportSVG,
    exportPNG,
    openShortcuts,
    openPreview,
    printDoc,
  };
})();
