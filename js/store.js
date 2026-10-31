/* ============================================================
   機材準備.com — project store
   プロジェクト = 公演・現場ひとつぶん。
   音響（回線表）と照明（仕込み図）を同じファイルに入れて保存する。
   ============================================================ */

(function () {
  'use strict';

  const KZ = window.KZ = window.KZ || {};
  const U = KZ.util;

  const STORAGE_KEY = 'kizai-junbi.com/projects/v1';
  const LEGACY_AUDIO_KEY = 'kaisenhyo-maker/v1';
  const HISTORY_LIMIT = 40;

  let db = { version: 1, currentId: null, projects: [] };
  let saveTimer = null;
  let listeners = [];
  let storageOK = true;

  /* ---------------------------------------------------------
     schema
     --------------------------------------------------------- */

  function metaDefaults(meta) {
    const m = meta || {};
    return {
      name: String(m.name || m.title || '無題のプロジェクト').trim() || '無題のプロジェクト',
      venue: String(m.venue || ''),
      date: String(m.date || U.todayISO()),
      author: String(m.author || ''),
      rev: String(m.rev || 'Rev.1'),
      note: String(m.note || ''),
    };
  }

  function audioMeta(project) {
    return {
      title: project.name,
      venue: project.venue,
      date: project.date,
      author: project.author,
      rev: project.rev,
      note: project.note,
    };
  }

  function normalizeProject(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const meta = metaDefaults(raw);
    const now = new Date().toISOString();
    return {
      schema: 2,
      id: /^[A-Za-z0-9_-]{3,60}$/.test(String(raw.id || '')) ? String(raw.id) : U.uid('p_'),
      name: meta.name,
      venue: meta.venue,
      date: meta.date,
      author: meta.author,
      rev: meta.rev,
      note: meta.note,
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
      audio: raw.audio && typeof raw.audio === 'object' ? raw.audio : null,
      lighting: raw.lighting && typeof raw.lighting === 'object' ? raw.lighting : null,
    };
  }

  function normalizeDb(raw) {
    const out = { version: 1, currentId: null, projects: [] };
    if (!raw || typeof raw !== 'object') return out;
    const list = Array.isArray(raw.projects) ? raw.projects : (Array.isArray(raw) ? raw : []);
    out.projects = list.map(normalizeProject).filter(Boolean);
    out.currentId = out.projects.some((p) => p.id === raw.currentId) ? raw.currentId : null;
    if (!out.currentId && out.projects.length) out.currentId = out.projects[0].id;
    return out;
  }

  /* ---------------------------------------------------------
     migration from the old 音響回線表メーカー storage
     --------------------------------------------------------- */

  function legacyProject() {
    let raw = null;
    try { raw = localStorage.getItem(LEGACY_AUDIO_KEY); } catch (err) { return null; }
    if (!raw) return null;
    let state = null;
    try { state = JSON.parse(raw); } catch (err) { return null; }
    if (!state || typeof state !== 'object') return null;
    const meta = state.meta || {};
    const name = String(meta.title || '').trim() || '音響回線表（旧データ）';
    const project = normalizeProject({
      id: U.uid('p_'),
      name: name,
      venue: meta.venue,
      date: meta.date,
      author: meta.author,
      rev: meta.rev,
      note: meta.note,
      audio: state,
      lighting: null,
    });
    return project;
  }

  /* ---------------------------------------------------------
     load / save
     --------------------------------------------------------- */

  function load() {
    let raw = null;
    let exists = false;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      exists = raw != null;
    } catch (err) {
      storageOK = false;
    }

    if (exists) {
      try { db = normalizeDb(JSON.parse(raw)); } catch (err) { db = normalizeDb(null); }
    } else {
      db = normalizeDb(null);
      const legacy = legacyProject();
      if (legacy) {
        db.projects.push(legacy);
        db.currentId = legacy.id;
        saveNow();
        emit('migrate', legacy.id);
      }
    }

    if (!db.currentId && db.projects.length) db.currentId = db.projects[0].id;
    emit('load', db.currentId);
    return db;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      storageOK = true;
      emit('save', null);
      return true;
    } catch (err) {
      storageOK = false;
      emit('save-error', err);
      return false;
    }
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    return persist();
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 260);
  }

  function flush() {
    if (saveTimer) saveNow();
  }

  function emit(type, detail) {
    listeners.forEach((fn) => {
      try { fn(type, detail); } catch (err) { /* keep the app alive */ }
    });
  }

  function onChange(fn) { listeners.push(fn); }

  /* ---------------------------------------------------------
     project CRUD
     --------------------------------------------------------- */

  function all() { return db.projects.slice(); }

  function get(id) { return db.projects.find((p) => p.id === id) || null; }

  function current() { return get(db.currentId) || db.projects[0] || null; }

  function setCurrent(id) {
    if (!get(id)) return null;
    if (db.currentId !== id) {
      db.currentId = id;
      saveSoon();
    }
    return get(id);
  }

  function create(meta) {
    const m = metaDefaults(meta);
    const project = normalizeProject({
      id: U.uid('p_'),
      name: m.name,
      venue: m.venue,
      date: m.date,
      author: m.author,
      rev: m.rev,
      note: m.note,
    });
    db.projects.unshift(project);
    db.currentId = project.id;
    saveSoon();
    emit('create', project.id);
    return project;
  }

  function updateMeta(id, patch) {
    const project = get(id);
    if (!project) return null;
    const next = metaDefaults(Object.assign({}, project, patch));
    Object.keys(next).forEach((k) => { project[k] = next[k]; });
    project.updatedAt = new Date().toISOString();
    saveSoon();
    emit('update', id);
    return project;
  }

  /* 音響側のメタ情報はプロジェクトと共有する */
  function syncMetaFromAudio(id, meta) {
    const project = get(id);
    if (!project || !meta) return;
    const name = String(meta.title || '').trim();
    if (name) project.name = name;
    ['venue', 'date', 'author', 'rev', 'note'].forEach((k) => {
      if (meta[k] != null) project[k] = String(meta[k]);
    });
    project.updatedAt = new Date().toISOString();
    emit('update', id);
  }

  function setData(id, tool, value) {
    const project = get(id);
    if (!project) return null;
    project[tool] = value;
    project.updatedAt = new Date().toISOString();
    saveSoon();
    emit('data', { id, tool });
    return project;
  }

  function remove(id) {
    const i = db.projects.findIndex((p) => p.id === id);
    if (i === -1) return false;
    db.projects.splice(i, 1);
    if (db.currentId === id) db.currentId = db.projects.length ? db.projects[0].id : null;
    saveNow();
    emit('remove', id);
    return true;
  }

  function duplicate(id) {
    const source = get(id);
    if (!source) return null;
    const copy = normalizeProject(U.clone(source));
    copy.id = U.uid('p_');
    copy.name = source.name + ' のコピー';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    db.projects.unshift(copy);
    db.currentId = copy.id;
    saveNow();
    emit('duplicate', copy.id);
    return copy;
  }

  /* ---------------------------------------------------------
     summaries
     --------------------------------------------------------- */

  function countAudio(project) {
    if (!project || !project.audio) return null;
    const a = project.audio;
    const rows = (list) => (Array.isArray(list) ? list.filter((r) => r && r.type !== 'group').length : 0);
    return { input: rows(a.input), output: rows(a.output) };
  }

  function countLighting(project) {
    if (!project || !project.lighting) return null;
    const l = project.lighting;
    return {
      fixtures: Array.isArray(l.fixtures) ? l.fixtures.length : 0,
      rigging: Array.isArray(l.rigging) ? l.rigging.length : 0,
    };
  }

  function isEmpty(project) {
    if (!project) return true;
    return !project.audio && !project.lighting;
  }

  /* ---------------------------------------------------------
     project files
     --------------------------------------------------------- */

  function exportPayload(project) {
    return {
      app: '機材準備.com',
      kind: 'project',
      schema: 2,
      exportedAt: new Date().toISOString(),
      project: U.clone(project),
    };
  }

  function importPayload(raw) {
    const candidate = raw && raw.kind === 'project' && raw.project ? raw.project : raw;
    if (!candidate || typeof candidate !== 'object') throw new Error('invalid');
    const project = normalizeProject(U.clone(candidate));
    if (!project) throw new Error('invalid');

    /* 同じプロジェクトを二重に読み込んだ場合は別プロジェクトとして残す */
    if (get(project.id)) {
      project.id = U.uid('p_');
      project.name = project.name + '（読み込み）';
    }
    project.updatedAt = new Date().toISOString();
    db.projects.unshift(project);
    db.currentId = project.id;
    saveNow();
    emit('import', project.id);
    return project;
  }

  /* 旧・回線表単体JSON（audio state）をプロジェクトとして読み込む */
  function importAudioState(raw) {
    if (!raw || typeof raw !== 'object' || !(Array.isArray(raw.input) || Array.isArray(raw.rows))) {
      throw new Error('invalid');
    }
    const meta = raw.meta || {};
    const project = normalizeProject({
      id: U.uid('p_'),
      name: String(meta.title || '').trim() || '回線表（読み込み）',
      venue: meta.venue,
      date: meta.date,
      author: meta.author,
      rev: meta.rev,
      note: meta.note,
      audio: raw,
      lighting: null,
    });
    db.projects.unshift(project);
    db.currentId = project.id;
    saveNow();
    emit('import', project.id);
    return project;
  }

  KZ.store = {
    STORAGE_KEY, LEGACY_AUDIO_KEY,
    load, flush, saveNow, saveSoon, onChange,
    all, get, current, setCurrent,
    create, updateMeta, syncMetaFromAudio, setData, remove, duplicate,
    audioMeta, countAudio, countLighting, isEmpty,
    exportPayload, importPayload, importAudioState,
    isStorageOK: () => storageOK,
    HISTORY_LIMIT,
  };
})();
