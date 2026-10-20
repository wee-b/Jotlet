import type { ImportSummary } from '../../../shared/events';
import type { BackupPreview, ImportMode } from '../../../shared/import';
import { errorText, unwrap } from '../../utils/result';

export function createBackupParser(options: {
  flush(): Promise<void>;
  imported(summary: ImportSummary): void;
  notify(text: string, error?: boolean): void;
}) {
  const api = window.jotletBackup;
  const dialog = document.createElement('dialog');
  dialog.id = 'backup-parser';
  dialog.setAttribute('aria-labelledby', 'backup-parser-title');
  dialog.innerHTML = `
    <header class="backup-heading"><div><span class="settings-eyebrow">数据与备份</span><h2 id="backup-parser-title">解析与导入</h2><p>先查看备份内容，再决定如何导入。</p></div><button type="button" id="backup-close" aria-label="关闭解析窗口">×</button></header>
    <div class="backup-body">
      <section id="backup-drop" tabindex="0" aria-label="将一个 .jotlet 文件拖到这里，或点击选择文件">
        <strong>拖入 .jotlet 备份文件</strong><span>或手动选择一个文件，无文件大小上限</span>
        <button type="button" class="cal-secondary" id="backup-choose">选择文件</button>
      </section>
      <div class="backup-file-row"><code id="backup-file">尚未选择文件</code><button type="button" class="cal-primary" id="backup-analyze" disabled>开始解析</button></div>
      <p id="backup-status" role="status" aria-live="polite"></p>
      <section id="backup-result" hidden aria-label="解析结果">
        <div class="backup-result-heading"><h3>解析完成</h3><span id="backup-exported"></span></div>
        <div class="backup-counts"><div><strong id="backup-events"></strong><span>事件</span></div><div><strong id="backup-entries"></strong><span>时间记录</span></div><div><strong id="backup-schedules"></strong><span>日程</span></div></div>
        <p id="backup-current"></p>
        <div class="backup-merge-summary"><strong>合并预览</strong><p id="backup-event-merge"></p><p id="backup-schedule-merge"></p><p>重复内容会跳过；同 ID 的不同内容保留两份，日程关联会自动调整。</p></div>
        <p id="backup-orphans" class="backup-warning" hidden></p>
        <details class="backup-samples"><summary>查看备份内容（每类最多展示 50 项）</summary><h4>事件与记录数</h4><ul id="backup-event-samples"></ul><h4>日程</h4><ul id="backup-schedule-samples"></ul></details>
      </section>
      <section id="backup-replace-confirm" class="backup-warning" hidden><strong>确认覆盖当前数据？</strong><p id="backup-replace-description"></p><p>原数据文件会保留，当前视图将切换为这份备份的完整内容。</p><div class="backup-confirm-actions"><button type="button" class="cal-secondary" id="backup-replace-back">返回</button><button type="button" class="backup-danger" id="backup-replace-confirm-button">确认覆盖</button></div></section>
    </div>
    <footer class="backup-actions"><button type="button" class="cal-secondary" id="backup-cancel">取消导入</button><span></span><button type="button" class="cal-secondary" id="backup-replace" disabled>覆盖当前数据</button><button type="button" class="cal-primary" id="backup-merge" disabled>合并导入</button></footer>`;
  document.body.append(dialog);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    dialog.querySelector<T>(selector)!;
  let filePath = '';
  let preview: BackupPreview | undefined;
  let busy = false;
  function status(text: string, error = false) {
    $('#backup-status').textContent = text;
    $('#backup-status').classList.toggle('error', error);
  }
  function controls() {
    for (const selector of [
      '#backup-close',
      '#backup-choose',
      '#backup-cancel',
      '#backup-replace-back',
      '#backup-replace-confirm-button',
    ])
      $<HTMLButtonElement>(selector).disabled = busy;
    $<HTMLButtonElement>('#backup-analyze').disabled = busy || !filePath;
    for (const selector of ['#backup-merge', '#backup-replace'])
      $<HTMLButtonElement>(selector).disabled =
        busy || !preview || !$('#backup-replace-confirm').hidden;
    dialog.setAttribute('aria-busy', String(busy));
  }
  async function discard() {
    const token = preview?.token;
    preview = undefined;
    if (token) unwrap(await api.discard(token));
  }
  async function selectFile(path: string) {
    await discard();
    filePath = path;
    $('#backup-file').textContent = path || '尚未选择文件';
    $('#backup-result').hidden = true;
    $('#backup-replace-confirm').hidden = true;
    status(path ? '文件已选择，点击“开始解析”查看内容。' : '');
    controls();
  }
  function renderPreview(value: BackupPreview) {
    $('#backup-events').textContent = String(value.events);
    $('#backup-entries').textContent = String(value.entries);
    $('#backup-schedules').textContent = String(value.schedules);
    $('#backup-exported').textContent =
      `备份时间：${new Date(value.exportedAt).toLocaleString('zh-CN')}`;
    $('#backup-current').textContent =
      `本地现有 ${value.currentEvents} 个事件、${value.currentSchedules} 个日程。`;
    const counts = (label: string, count: BackupPreview['eventMerge']) =>
      `${label}：新增 ${count.added}，跳过重复 ${count.skipped}，其中 ${count.conflicts} 项 ID 冲突将另存。`;
    $('#backup-event-merge').textContent = counts('事件', value.eventMerge);
    $('#backup-schedule-merge').textContent = counts(
      '日程',
      value.scheduleMerge,
    );
    $('#backup-orphans').hidden = !value.orphanSchedules;
    $('#backup-orphans').textContent =
      `${value.orphanSchedules} 个日程引用的事件不在备份中；合并时会作为独立日程导入。`;
    for (const [selector, items] of [
      [
        '#backup-event-samples',
        value.eventSamples.map(
          (item) => `${item.title || '未命名事件'} · ${item.entries} 条记录`,
        ),
      ],
      [
        '#backup-schedule-samples',
        value.scheduleSamples.map(
          (item) =>
            `${item.title} · ${new Date(item.start).toLocaleString('zh-CN')} · ${item.linked ? '关联事件' : '独立日程'}`,
        ),
      ],
    ] as const) {
      $(selector).replaceChildren(
        ...(items.length ? items : ['无']).map((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          return li;
        }),
      );
    }
    $('#backup-result').hidden = false;
  }
  async function analyze() {
    if (busy || !filePath) return;
    busy = true;
    controls();
    status('正在解析，请稍候…');
    $('#backup-result').hidden = true;
    $('#backup-replace-confirm').hidden = true;
    try {
      await discard();
      await options.flush();
      preview = unwrap(await api.analyze(filePath));
      renderPreview(preview);
      status('解析成功，尚未更改本地数据。');
    } catch (error) {
      status(errorText(error), true);
    } finally {
      busy = false;
      controls();
    }
  }
  async function close() {
    if (busy) return;
    busy = true;
    controls();
    try {
      await discard();
      dialog.close();
      busy = false;
      controls();
      unwrap(await api.ready());
    } catch (error) {
      status(errorText(error), true);
    } finally {
      busy = false;
      controls();
    }
  }
  async function commit(mode: ImportMode) {
    if (busy || !preview) return;
    busy = true;
    controls();
    status(mode === 'merge' ? '正在合并导入…' : '正在覆盖数据…');
    try {
      await options.flush();
      const summary = unwrap(await api.commit(preview.token, mode));
      preview = undefined;
      options.imported(summary);
      dialog.close();
      busy = false;
      controls();
      options.notify(
        mode === 'merge'
          ? `合并完成：现有 ${summary.events.length} 个事件、${summary.schedules?.length ?? 0} 个日程。`
          : `已覆盖为备份中的 ${summary.events.length} 个事件、${summary.schedules?.length ?? 0} 个日程。`,
      );
      unwrap(await api.ready());
    } catch (error) {
      status(errorText(error), true);
    } finally {
      busy = false;
      controls();
    }
  }
  $('#backup-choose').addEventListener('click', () => {
    if (busy) return;
    busy = true;
    controls();
    void (async () => {
      try {
        const path = unwrap(await api.chooseFile());
        if (path) await selectFile(path);
      } catch (error) {
        status(errorText(error), true);
      } finally {
        busy = false;
        controls();
      }
    })();
  });
  $('#backup-analyze').addEventListener('click', () => void analyze());
  for (const selector of ['#backup-close', '#backup-cancel'])
    $(selector).addEventListener('click', () => void close());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void close();
  });
  $('#backup-merge').addEventListener('click', () => void commit('merge'));
  $('#backup-replace').addEventListener('click', () => {
    if (!preview || busy) return;
    $('#backup-replace-description').textContent =
      `将本地 ${preview.currentEvents} 个事件、${preview.currentSchedules} 个日程替换为备份中的 ${preview.events} 个事件、${preview.schedules} 个日程。`;
    $('#backup-replace-confirm').hidden = false;
    controls();
    $('#backup-replace-confirm').scrollIntoView({ block: 'nearest' });
    $('#backup-replace-confirm-button').focus();
  });
  $('#backup-replace-back').addEventListener('click', () => {
    $('#backup-replace-confirm').hidden = true;
    controls();
  });
  $('#backup-replace-confirm-button').addEventListener(
    'click',
    () => void commit('replace'),
  );
  const drop = $('#backup-drop');
  drop.addEventListener('keydown', (event) => {
    if (event.target === drop && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      $('#backup-choose').click();
    }
  });
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!busy) drop.classList.add('dragging');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('dragging');
    if (busy) return;
    const files = event.dataTransfer?.files;
    if (!files || files.length !== 1) {
      status('请只拖入一个 .jotlet 文件。', true);
      return;
    }
    try {
      const path = api.filePath(files[0]);
      if (!path || !/\.jotlet$/i.test(path)) {
        status('仅支持本机的 .jotlet 文件。', true);
        return;
      }
      busy = true;
      controls();
      void selectFile(path)
        .catch((error) => status(errorText(error), true))
        .finally(() => {
          busy = false;
          controls();
        });
    } catch (error) {
      status(errorText(error), true);
    }
  });
  // Prevent Chromium from navigating away when a file misses the drop area.
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => event.preventDefault());
  return {
    async open(path = '', autoAnalyze = false) {
      if (busy) return;
      busy = true;
      controls();
      try {
        unwrap(await api.busy());
        await options.flush();
        await selectFile(path);
        if (!dialog.open) dialog.showModal();
        busy = false;
        controls();
        if (autoAnalyze) await analyze();
        else $('#backup-choose').focus();
      } catch (error) {
        options.notify(errorText(error), true);
        if (!dialog.open) await api.ready();
      } finally {
        busy = false;
        controls();
      }
    },
  };
}
