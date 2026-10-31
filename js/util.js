/* ============================================================
   機材準備.com — shared utilities
   ============================================================ */

(function () {
  'use strict';

  const KZ = window.KZ = window.KZ || {};
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const EMPTY_MARKS = ['', '-', '—', '－', 'ー', 'n/a', 'N/A'];

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function uid(prefix) {
    return (prefix || '') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
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

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function isTextField(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function isBlankMark(v) {
    return EMPTY_MARKS.indexOf(String(v == null ? '' : v).trim()) !== -1;
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function debounce(fn, wait) {
    let timer = null;
    const wrapped = function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn.apply(ctx, args); }, wait);
    };
    wrapped.cancel = () => { clearTimeout(timer); timer = null; };
    wrapped.flush = function () {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      fn.apply(this, arguments);
    };
    return wrapped;
  }

  function download(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function fileBase(name, fallback) {
    return String(name || fallback || '機材準備')
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || '機材準備';
  }

  function csvCell(value) {
    const s = String(value == null ? '' : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  let toastTimer = null;
  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function clone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }

  function readFile(file, asDataUrl) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      if (asDataUrl) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  }

  KZ.util = {
    $, $$, uid, esc, pad2, todayISO, formatDate, formatDateTime,
    isTextField, isBlankMark, clamp, debounce, download, fileBase,
    csvCell, toast, clone, readFile, WEEKDAYS, EMPTY_MARKS,
  };
})();
