/* ============================================================
   機材準備.com — ホーム / プロジェクト管理
   ============================================================ */

(function () {
  'use strict';

  const KZ = window.KZ = window.KZ || {};
  const U = KZ.util;
  const $ = U.$;
  const $$ = U.$$;

  let mounted = false;
  let dialogMode = 'new';
  let dialogProjectId = null;
  let pendingTool = null;

  const TOOL_LABEL = { audio: '回線表', lighting: '照明仕込み図' };

  /* ---------------------------------------------------------
     rendering
     --------------------------------------------------------- */

  function statsText(project, tool) {
    if (!project) return 'まだ作成していません';
    if (tool === 'audio') {
      const c = KZ.store.countAudio(project);
      if (!c) return 'まだ作成していません';
      const bits = ['IN ' + c.input, 'OUT ' + c.output];
      if (c.gear) bits.push('PICK ' + c.gear);
      return bits.join(' / ');
    }
    const c = KZ.store.countLighting(project);
    if (!c) return 'まだ作成していません';
    return '灯体 ' + c.fixtures + ' / 吊り物 ' + c.rigging;
  }

  function toolState(project, tool) {
    if (!project) return false;
    if (tool === 'audio') return !!project.audio;
    return !!project.lighting;
  }

  function projectCard(project, isCurrent) {
    const audio = KZ.store.countAudio(project);
    const lighting = KZ.store.countLighting(project);
    const badges = [];
    if (audio) badges.push('<span class="pbadge audio">回線表 ' + audio.input + '/' + audio.output + '</span>');
    if (lighting) badges.push('<span class="pbadge lighting">照明 ' + lighting.fixtures + '灯</span>');
    if (!badges.length) badges.push('<span class="pbadge empty">未作成</span>');

    return '<article class="project-card' + (isCurrent ? ' is-current' : '') + '" data-id="' + U.esc(project.id) + '">' +
      '<header class="project-card-head">' +
        '<button class="project-card-name" type="button" data-select="' + U.esc(project.id) + '">' + U.esc(project.name) + '</button>' +
        (isCurrent ? '<span class="project-current">使用中</span>' : '') +
      '</header>' +
      '<div class="project-card-meta">' +
        '<span>' + U.esc(project.venue || '会場未設定') + '</span>' +
        '<span>' + U.esc(U.formatDate(project.date)) + '</span>' +
        '<span>' + U.esc(project.rev || '') + '</span>' +
      '</div>' +
      '<div class="project-card-badges">' + badges.join('') + '</div>' +
      '<div class="project-card-tools">' +
        '<button type="button" class="pctool' + (audio ? '' : ' is-empty') + '" data-open-tool="audio" data-project="' + U.esc(project.id) + '">' +
          '<span class="pctool-label">回線表</span>' +
          '<span class="pctool-stats">' + (audio ? 'IN ' + audio.input + ' / OUT ' + audio.output : '作成する') + '</span>' +
        '</button>' +
        '<button type="button" class="pctool' + (lighting ? '' : ' is-empty') + '" data-open-tool="lighting" data-project="' + U.esc(project.id) + '">' +
          '<span class="pctool-label">照明仕込み図</span>' +
          '<span class="pctool-stats">' + (lighting ? lighting.fixtures + ' 灯 / ' + lighting.rigging + ' 吊り物' : '作成する') + '</span>' +
        '</button>' +
      '</div>' +
      '<footer class="project-card-foot">' +
        '<span class="project-updated">更新 ' + U.esc(U.formatDateTime(project.updatedAt)) + '</span>' +
        '<div class="project-card-actions">' +
          '<button type="button" data-project-settings="' + U.esc(project.id) + '">設定</button>' +
          '<button type="button" data-project-duplicate="' + U.esc(project.id) + '">複製</button>' +
          '<button type="button" data-project-export="' + U.esc(project.id) + '">書き出し</button>' +
          '<button type="button" class="danger" data-project-delete="' + U.esc(project.id) + '">削除</button>' +
        '</div>' +
      '</footer>' +
    '</article>';
  }

  function render() {
    if (!KZ.store) return;
    const projects = KZ.store.all().slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const current = KZ.store.current();

    const select = $('#home-project-select');
    if (select) {
      if (!projects.length) {
        select.innerHTML = '<option value="">プロジェクトがありません</option>';
        select.disabled = true;
      } else {
        select.disabled = false;
        select.innerHTML = projects.map((p) =>
          '<option value="' + U.esc(p.id) + '"' + (current && p.id === current.id ? ' selected' : '') + '>' +
          U.esc(p.name) + (p.venue ? ' — ' + U.esc(p.venue) : '') + '</option>'
        ).join('');
      }
    }

    const count = $('#project-count');
    if (count) count.textContent = projects.length ? projects.length + ' プロジェクト' : 'プロジェクトはまだありません';

    const settingsBtn = $('#btn-project-settings-home');
    if (settingsBtn) settingsBtn.disabled = !current;

    ['audio', 'lighting'].forEach((tool) => {
      const el = document.getElementById('tool-' + tool + '-stats');
      if (el) {
        el.textContent = statsText(current, tool);
        el.classList.toggle('is-empty', !toolState(current, tool));
      }
      const card = document.getElementById('tool-' + tool);
      if (card) card.classList.toggle('has-project', !!current);
    });

    const list = $('#project-list');
    if (list) {
      list.innerHTML = projects.length
        ? projects.map((p) => projectCard(p, current && p.id === current.id)).join('')
        : '<div class="projects-empty">' +
            '<p class="projects-empty-title">プロジェクトはまだありません</p>' +
            '<p>上の「＋ 新しいプロジェクト」から作成するか、回線表・照明仕込み図を選ぶと自動でプロジェクトが作られます。</p>' +
          '</div>';
    }
  }

  /* ---------------------------------------------------------
     dialogs
     --------------------------------------------------------- */

  function fillForm(meta) {
    const m = meta || {};
    $('#project-name').value = m.name || m.title || '';
    $('#project-venue').value = m.venue || '';
    $('#project-date').value = m.date || U.todayISO();
    $('#project-author').value = m.author || '';
    $('#project-rev').value = m.rev || 'Rev.1';
    $('#project-note').value = m.note || '';
  }

  function openNewProject(tool) {
    dialogMode = 'new';
    dialogProjectId = null;
    pendingTool = tool || null;
    $('#project-dialog-title').textContent = '新しいプロジェクト';
    $('#project-dialog-lead').textContent = pendingTool
      ? (TOOL_LABEL[pendingTool] + 'を作るプロジェクトを用意します。あとから変更できます。')
      : '公演・現場の情報を入れます。あとから変更できます。';
    $('#project-submit').textContent = pendingTool ? TOOL_LABEL[pendingTool] + 'を作成して開く' : 'プロジェクトを作成する';
    fillForm({ date: U.todayISO(), rev: 'Rev.1' });
    const dialog = $('#project-dialog');
    if (!dialog.open) dialog.showModal();
    setTimeout(() => { const el = $('#project-name'); if (el) el.focus(); }, 30);
  }

  function openSettings(id) {
    const project = KZ.store.get(id);
    if (!project) return;
    dialogMode = 'edit';
    dialogProjectId = id;
    pendingTool = null;
    $('#project-dialog-title').textContent = 'プロジェクト設定';
    $('#project-dialog-lead').textContent = 'プロジェクト名・会場・日付などは、回線表と照明仕込み図で共有されます。';
    $('#project-submit').textContent = '保存する';
    fillForm(project);
    const dialog = $('#project-dialog');
    if (!dialog.open) dialog.showModal();
    setTimeout(() => { const el = $('#project-name'); if (el) el.focus(); el.select(); }, 30);
  }

  function closeDialog() {
    const dialog = $('#project-dialog');
    if (dialog && dialog.open) dialog.close();
  }

  function readForm() {
    return {
      name: $('#project-name').value.trim() || '無題のプロジェクト',
      venue: $('#project-venue').value.trim(),
      date: $('#project-date').value,
      author: $('#project-author').value.trim(),
      rev: $('#project-rev').value.trim() || 'Rev.1',
      note: $('#project-note').value.trim(),
    };
  }

  function submitDialog(e) {
    e.preventDefault();
    const meta = readForm();
    if (dialogMode === 'edit' && dialogProjectId) {
      KZ.store.updateMeta(dialogProjectId, meta);
      closeDialog();
      render();
      KZ.app.refreshHeader();
      if (KZ.app.activeTool()) KZ.app.reopenActive();
      U.toast('プロジェクト情報を保存しました');
      return;
    }

    const project = KZ.store.create(meta);
    closeDialog();
    render();
    if (pendingTool) {
      const tool = pendingTool;
      pendingTool = null;
      KZ.app.navigate('#/p/' + project.id + '/' + tool);
    } else {
      KZ.app.refreshHeader();
      U.toast('プロジェクトを作成しました');
    }
  }

  /* ---------------------------------------------------------
     import / export
     --------------------------------------------------------- */

  function importFile(file) {
    if (!file) return;
    U.readFile(file, false).then((text) => {
      let raw;
      try { raw = JSON.parse(String(text)); } catch (err) { throw new Error('json'); }
      if (!raw || typeof raw !== 'object') throw new Error('format');
      if (raw.kind === 'project' || raw.project || raw.audio || raw.lighting || raw.input || raw.output || raw.rows) {
        const project = (raw.kind === 'project' || raw.project)
          ? KZ.store.importPayload(raw)
          : KZ.store.importAudioState(raw);
        render();
        U.toast('プロジェクト「' + project.name + '」を読み込みました');
        KZ.app.navigate('#/p/' + project.id + (project.audio ? '/audio' : '/lighting'));
      } else {
        throw new Error('format');
      }
    }).catch(() => {
      U.toast('読み込めませんでした（プロジェクトファイルを確認してください）');
    });
  }

  /* ---------------------------------------------------------
     bindings
     --------------------------------------------------------- */

  function bind() {
    if (mounted) return;
    mounted = true;

    $('#home-project-select').addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id) return;
      KZ.store.setCurrent(id);
      render();
    });

    $('#btn-new-project').addEventListener('click', () => openNewProject(null));
    $('#btn-project-settings-home').addEventListener('click', () => {
      const p = KZ.store.current();
      if (p) openSettings(p.id);
    });
    $('#btn-import-project-home').addEventListener('click', () => $('#project-file-input').click());

    $$('.tool-card[data-tool]').forEach((card) => {
      card.addEventListener('click', () => {
        const tool = card.dataset.tool;
        const project = KZ.store.current();
        if (!project) openNewProject(tool);
        else KZ.app.navigate('#/p/' + project.id + '/' + tool);
      });
    });

    $('#project-list').addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-tool]');
      if (openBtn) {
        const id = openBtn.dataset.project;
        const tool = openBtn.dataset.openTool;
        KZ.store.setCurrent(id);
        KZ.app.navigate('#/p/' + id + '/' + tool);
        return;
      }
      const selectBtn = e.target.closest('[data-select]');
      if (selectBtn) {
        KZ.store.setCurrent(selectBtn.dataset.select);
        render();
        return;
      }
      const settings = e.target.closest('[data-project-settings]');
      if (settings) { openSettings(settings.dataset.projectSettings); return; }
      const dup = e.target.closest('[data-project-duplicate]');
      if (dup) {
        const copy = KZ.store.duplicate(dup.dataset.projectDuplicate);
        if (copy) { render(); U.toast('プロジェクトを複製しました'); }
        return;
      }
      const exp = e.target.closest('[data-project-export]');
      if (exp) {
        const project = KZ.store.get(exp.dataset.projectExport);
        if (project) KZ.app.exportProject(project);
        return;
      }
      const del = e.target.closest('[data-project-delete]');
      if (del) {
        const project = KZ.store.get(del.dataset.projectDelete);
        if (!project) return;
        const ok = window.confirm('「' + project.name + '」を削除します。\n回線表・照明仕込み図の両方のデータが消えます。この操作は元に戻せません。');
        if (!ok) return;
        KZ.store.remove(project.id);
        render();
        U.toast('プロジェクトを削除しました');
      }
    });

    const form = $('#project-form');
    form.addEventListener('submit', submitDialog);
    $$('#project-dialog [data-close]').forEach((btn) => btn.addEventListener('click', closeDialog));
    $('#project-dialog').addEventListener('click', (e) => {
      if (e.target === $('#project-dialog')) closeDialog();
    });

    $('#project-file-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importFile(file);
      e.target.value = '';
    });
  }

  KZ.home = {
    mount() {
      bind();
      render();
    },
    render,
    openNewProject,
    openSettings,
    renderIfVisible() {
      if (!document.getElementById('view-home').hidden) render();
    },
  };
})();
