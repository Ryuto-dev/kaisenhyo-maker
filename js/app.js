/* ============================================================
   機材準備.com — router / shell
   ============================================================ */

(function () {
  'use strict';

  const KZ = window.KZ = window.KZ || {};
  const U = KZ.util;
  const $ = U.$;
  const $$ = U.$$;

  const TOOL_LABEL = { audio: '回線表', lighting: '照明仕込み図' };
  let currentTool = null;
  let saveStateTimer = null;

  /* ---------------------------------------------------------
     header
     --------------------------------------------------------- */

  function setSaveState(text, revert) {
    const el = $('#save-state');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', text.indexOf('でき') !== -1);
    clearTimeout(saveStateTimer);
    if (revert) {
      saveStateTimer = setTimeout(() => {
        el.textContent = '自動保存';
        el.classList.remove('is-error');
      }, 1800);
    }
  }

  function setMenuScope(tool) {
    $$('#menu [data-scope]').forEach((el) => {
      const scopes = String(el.dataset.scope || '').split(/\s+/);
      el.hidden = !tool || scopes.indexOf(tool) === -1;
    });
  }

  function refreshHeader() {
    const project = KZ.store.current();
    const inProject = !!project && !!currentTool;

    const crumbs = $('#crumbs');
    if (crumbs) crumbs.hidden = !inProject;
    const crumbProject = $('#crumb-project');
    if (crumbProject) crumbProject.textContent = project ? project.name : '';

    const toolTabs = $('#tool-tabs');
    if (toolTabs) toolTabs.hidden = !project;
    $('#tab-audio').classList.toggle('active', currentTool === 'audio');
    $('#tab-lighting').classList.toggle('active', currentTool === 'lighting');
    if (project) {
      $('#tab-audio').classList.toggle('has-data', !!project.audio);
      $('#tab-lighting').classList.toggle('has-data', !!project.lighting);
      $('#tab-audio').setAttribute('href', '#/p/' + project.id + '/audio');
      $('#tab-lighting').setAttribute('href', '#/p/' + project.id + '/lighting');
    } else {
      $('#tab-audio').classList.remove('has-data');
      $('#tab-lighting').classList.remove('has-data');
    }

    const audioActions = $('#audio-actions');
    const lightingActions = $('#lighting-actions');
    if (audioActions) audioActions.hidden = currentTool !== 'audio';
    if (lightingActions) lightingActions.hidden = currentTool !== 'lighting';

    setMenuScope(currentTool);

    if (!currentTool) {
      const pc = $('#page-count');
      if (pc) pc.textContent = '';
    }

    const toolLabel = currentTool ? TOOL_LABEL[currentTool] : '';
    document.title = inProject
      ? project.name + ' — ' + toolLabel + ' | 機材準備.com'
      : '機材準備.com — 回線表と照明仕込み図をひとつのプロジェクトに';
  }

  /* ---------------------------------------------------------
     routing
     --------------------------------------------------------- */

  function parseRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);
    if (parts[0] === 'p' && parts[1]) {
      const tool = parts[2] === 'lighting' ? 'lighting' : 'audio';
      return { projectId: decodeURIComponent(parts[1]), tool: tool };
    }
    if (parts[0] === 'audio' || parts[0] === 'lighting') {
      return { projectId: null, tool: parts[0] };
    }
    return { projectId: null, tool: null };
  }

  function navigate(hash) {
    if (location.hash === hash) handleRoute();
    else location.hash = hash;
  }

  function hideViews() {
    $('#view-home').hidden = true;
    $('#view-audio').hidden = true;
    $('#view-lighting').hidden = true;
  }

  function showHome() {
    if (currentTool === 'audio') KZ.audio.close();
    if (currentTool === 'lighting') KZ.lighting.close();
    currentTool = null;
    hideViews();
    $('#view-home').hidden = false;
    document.body.classList.remove('mode-audio', 'mode-lighting');
    document.body.classList.add('mode-home');
    refreshHeader();
    KZ.home.render();
    KZ.home.renderIfVisible();
  }

  function openTool(tool, project) {
    if (!project) { navigate('#/'); return; }
    KZ.store.setCurrent(project.id);

    if (tool === 'audio') {
      if (!project.audio) {
        project.audio = KZ.audio.createState(project);
        KZ.store.setData(project.id, 'audio', project.audio);
        KZ.store.saveNow();
      }
    } else if (!project.lighting) {
      project.lighting = KZ.lighting.createState(project);
      KZ.store.setData(project.id, 'lighting', project.lighting);
      KZ.store.saveNow();
    }

    const previous = currentTool;
    if (previous === 'audio' && tool !== 'audio') KZ.audio.close();
    if (previous === 'lighting' && tool !== 'lighting') KZ.lighting.close();

    currentTool = tool;
    hideViews();
    document.body.classList.remove('mode-home', 'mode-audio', 'mode-lighting');
    document.body.classList.add('mode-' + tool);

    if (tool === 'audio') {
      $('#view-audio').hidden = false;
      KZ.audio.open(project);
    } else {
      $('#view-lighting').hidden = false;
      KZ.lighting.open(project);
    }

    refreshHeader();
    const pc = $('#page-count');
    if (pc && tool === 'audio') pc.textContent = '';
  }

  function handleRoute() {
    const route = parseRoute();
    closeMenu();

    if (!KZ.store.all().length) {
      if (route.tool) {
        showHome();
        KZ.home.openNewProject(route.tool);
        return;
      }
      showHome();
      return;
    }

    let project = route.projectId ? KZ.store.get(route.projectId) : KZ.store.current();
    if (!project) {
      showHome();
      if (route.projectId) U.toast('プロジェクトが見つかりません');
      return;
    }

    if (!route.tool) {
      showHome();
      return;
    }

    openTool(route.tool, project);
  }

  /* ---------------------------------------------------------
     menu
     --------------------------------------------------------- */

  function openMenu() {
    $('#menu').classList.add('open');
    $('#btn-menu').setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    const menu = $('#menu');
    if (!menu) return;
    menu.classList.remove('open');
    const btn = $('#btn-menu');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function menuAction(act) {
    const project = KZ.store.current();
    if (act === 'undo' || act === 'redo') {
      if (currentTool === 'audio') { if (act === 'undo') KZ.audio.undo(); else KZ.audio.redo(); }
      if (currentTool === 'lighting') { if (act === 'undo') KZ.lighting.undo(); else KZ.lighting.redo(); }
      return;
    }
    if (act === 'home') { navigate('#/'); return; }
    if (!project) return;

    if (act === 'project-settings') { KZ.home.openSettings(project.id); return; }
    if (act === 'project-export') { exportProject(project); return; }
    if (act === 'project-import') { $('#project-file-input').click(); return; }

    if (act.indexOf('audio-') === 0) {
      const sub = act.slice(6);
      if (sub === 'sample-band') KZ.audio.loadSample('band');
      else if (sub === 'sample-talk') KZ.audio.loadSample('talk');
      else if (sub === 'csv') KZ.audio.exportCSV();
      else if (sub === 'json') KZ.audio.exportJSON();
      else if (sub === 'import') $('#file-input').click();
      else if (sub === 'shortcuts') KZ.audio.openShortcuts();
      return;
    }

    if (act.indexOf('lighting-') === 0) {
      const sub = act.slice(9);
      if (sub === 'sample') KZ.lighting.loadSample();
      else if (sub === 'csv') KZ.lighting.exportCSV();
      else if (sub === 'svg') KZ.lighting.exportSVG();
      else if (sub === 'png') KZ.lighting.exportPNG();
      else if (sub === 'shortcuts') KZ.lighting.openShortcuts();
    }
  }

  function bindMenu() {
    $('#btn-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      if ($('#menu').classList.contains('open')) closeMenu(); else openMenu();
    });
    $('#menu').addEventListener('click', (e) => {
      const item = e.target.closest('button[data-act]');
      if (!item) return;
      const act = item.dataset.act;
      closeMenu();
      menuAction(act);
    });
    document.addEventListener('click', (e) => {
      if (!$('#menu').classList.contains('open')) return;
      if (e.target.closest('#menu') || e.target.closest('#btn-menu')) return;
      closeMenu();
    });
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
  }

  /* ---------------------------------------------------------
     project files
     --------------------------------------------------------- */

  function exportProject(project) {
    const payload = KZ.store.exportPayload(project);
    const base = U.fileBase(project.name, '機材準備プロジェクト');
    U.download(base + '_' + U.todayISO() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    U.toast('プロジェクトを書き出しました');
  }

  /* ---------------------------------------------------------
     wiring
     --------------------------------------------------------- */

  function bindStore() {
    KZ.store.onChange((type, detail) => {
      if (type === 'save') {
        setSaveState('保存済み ✓', true);
        if (currentTool) refreshHeader();
        KZ.home.renderIfVisible();
      } else if (type === 'save-error') {
        setSaveState('保存できません', false);
      } else if (type === 'data') {
        setSaveState('保存中…', false);
        refreshHeader();
      } else if (type === 'update' || type === 'create' || type === 'remove' ||
                 type === 'duplicate' || type === 'import' || type === 'migrate') {
        refreshHeader();
        KZ.home.renderIfVisible();
      }
    });
  }

  function bindAudio() {
    KZ.audio.onChange((state) => {
      const project = KZ.store.current();
      if (!project) return;
      KZ.store.syncMetaFromAudio(project.id, state.meta);
      KZ.store.setData(project.id, 'audio', state);
    });
  }

  function bindLighting() {
    KZ.lighting.onChange((state) => {
      const project = KZ.store.current();
      if (!project) return;
      KZ.store.setData(project.id, 'lighting', state);
    });
  }

  function bindGlobal() {
    $('#crumb-project').addEventListener('click', () => {
      const project = KZ.store.current();
      if (project) KZ.home.openSettings(project.id);
    });

    $('#project-file-input').addEventListener('change', () => {
      /* 読み込み処理は home.js 側で行う */
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMenu();
        const dialog = $('#project-dialog');
        if (dialog && dialog.open) dialog.close();
      }
    });

    window.addEventListener('beforeunload', () => {
      KZ.store.flush();
    });
    window.addEventListener('pagehide', () => {
      KZ.store.flush();
    });
  }

  /* ---------------------------------------------------------
     boot
     --------------------------------------------------------- */

  function boot() {
    KZ.store.load();
    KZ.audio.mount();
    KZ.lighting.mount();
    KZ.home.mount();
    bindStore();
    bindAudio();
    bindLighting();
    bindMenu();
    bindGlobal();

    document.body.classList.add('mode-home');
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
    setSaveState('自動保存', false);
  }

  KZ.app = {
    navigate,
    refreshHeader,
    exportProject,
    activeTool: () => currentTool,
    reopenActive() {
      const project = KZ.store.current();
      if (!project || !currentTool) return;
      if (currentTool === 'audio') KZ.audio.applyProjectMeta(project);
      else KZ.lighting.refreshProject(project);
      refreshHeader();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
