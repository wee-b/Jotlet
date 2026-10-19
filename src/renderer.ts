import './index.css';
import { chronological, createCalendarEvent, parseEvent } from './events';
import type { EventRecord, TimelineEntry, Result } from './events';
import { createCalendar } from './calendar-page';

const icons: Record<string, string> = {
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  pin: '<path d="m16 3 5 5-4 1-3 5v3l-3-3-5 3 3-5-3-3h3l5-3zM8 16l-5 5"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  import:
    '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  export:
    '<path d="M12 15V3m-4 4 4-4 4 4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  leaf: '<path d="M20 4C8 2 3 8 5 14s13 6 15-10ZM5 20l9-10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};
const icon = (name: string, className = '') =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.note}</svg>`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

document.querySelector('#app')!.innerHTML = `
  <aside class="sidebar">
    <button class="new-event primary" disabled>${icon('plus')}<span>新建事件</span><kbd>Ctrl N</kbd></button>
    <div class="nav-label">我的事件</div>
    <nav aria-label="事件分类">
      <button class="nav-item active" data-filter="all">${icon('note')}<span>所有事件</span><span class="count" id="count-all">0</span></button>
      <button class="nav-item" data-filter="active">${icon('calendar')}<span>进行中</span><span class="count" id="count-active">0</span></button>
      <button class="nav-item" data-filter="finished">${icon('check')}<span>已结束</span><span class="count" id="count-finished">0</span></button>
      <button class="nav-item" data-filter="pinned">${icon('pin')}<span>已置顶</span><span class="count" id="count-pinned">0</span></button>
    </nav>
    <div class="sidebar-spacer"></div>
    <div class="local-card"><span class="local-icon">${icon('leaf')}</span><strong>把过程，也留在这里</strong><p>从最初的念头，到后来的进展。<br>一个事件，串起一段时间。</p><span class="local-badge"><i></i> 全部保存在本机</span></div>
    <button class="import-button" disabled>${icon('import')} 导入数据 <span>.jetlet / JSON / MD / TXT</span></button>
    <button class="data-info">${icon('note')} 数据与备份 <span>↗</span></button>
    <div class="sidebar-footer">JOTLET <span>慢慢记，看见变化。</span></div>
  </aside>
  <main>
    <header class="workspace-header"><div><div class="eyebrow">EVERY STORY HAS A TIMELINE</div><h1 id="view-title">所有事件 <span class="header-count">0</span></h1></div><div class="header-actions"><span class="offline-indicator"><i></i> 离线可用</span><details class="export-menu"><summary>${icon('export')} 导出 ${icon('down')}</summary><div class="dropdown"><button data-export="jetlet"><strong>完整备份 · .jetlet</strong><span>保留事件、记录、日程及关联关系</span></button><button data-export="json"><strong>事件备份 · JSON</strong><span>兼容旧版，仅包含事件与记录</span></button><button data-export="markdown"><strong>时间线文档 · Markdown</strong><span>按事件和时间顺序导出阅读副本</span></button></div></details></div></header>
    <section class="workspace">
      <section class="note-panel" aria-label="事件列表"><div class="list-toolbar"><label class="search-box">${icon('search')}<input id="search" type="search" placeholder="搜索事件或进展…" aria-label="搜索事件"><kbd>Ctrl K</kbd></label><div class="list-caption"><span id="result-count">正在加载…</span><span>置顶优先 · 最近更新</span></div></div><div id="event-list" class="note-list"></div><div class="list-footer">每一次进展，都是故事的一部分。</div></section>
      <section class="editor-panel" aria-label="事件追踪">
        <div id="empty-state" class="empty-state"><div class="empty-art">${icon('calendar')}<span class="art-spark">✳</span></div><div class="eyebrow">FROM A MOMENT TO A STORY</div><h2>一件事，一条时间线。</h2><p>给正在发生的事一个名字，<br>把每一步进展，按时间串起来。</p><button class="new-event primary" disabled>${icon('plus')} 创建第一个事件 ${icon('arrow')}</button><span class="empty-hint">本地保存 · 持续追加 · 随时回顾</span></div>
        <div id="event-detail" hidden>
          <div class="editor-toolbar"><span class="note-category">${icon('calendar')} 事件追踪</span><div class="editor-actions"><button id="pin-event" class="icon-button" aria-label="置顶事件" title="置顶事件">${icon('pin')}</button><span class="divider"></span><button id="delete-event" class="icon-button danger" aria-label="删除事件" title="删除事件">${icon('trash')}</button></div></div>
          <div class="event-heading"><label class="sr-only" for="event-title">事件名称</label><input id="event-title" maxlength="500" placeholder="给这件事起个名字…" autocomplete="off"><div class="event-meta"><span id="event-status" class="event-badge"></span><button id="event-dates" title="修改事件起止时间"></button><button id="finish-event" class="finish-button"></button></div></div>
          <div class="timeline-scroll"><div class="timeline-heading"><div><h2>事件追踪 <span id="entry-count">0 个节点</span></h2></div><button id="add-entry" class="primary">${icon('plus')} 添加记录</button></div><div id="timeline-empty" class="timeline-empty"><span>${icon('note')}</span><h3>故事从第一步开始</h3><p>记下此刻的进展，或者补录过去发生的事。</p></div><div id="timeline" class="timeline" role="list" aria-label="按发生时间排列的节点"></div></div>
          <footer class="editor-footer"><button id="save-state" title="点击重试保存" aria-live="polite">已保存到本机</button><span id="timeline-caption">从开始到现在</span></footer>
        </div>
      </section>
    </section>
  </main>
  <div id="toast" role="status" hidden></div>
  <dialog id="entry-dialog" class="entry-dialog"><form id="entry-form"><div class="dialog-eyebrow">A NEW MOMENT IN THIS STORY</div><h2 id="entry-dialog-title">添加记录</h2><label class="field-label" for="entry-time">发生时间</label><input class="field-input" id="entry-time" type="datetime-local" step="1" required><label class="field-label" for="entry-content">发生了什么</label><textarea class="field-input entry-text" id="entry-content" maxlength="1000000" placeholder="记下事情的进展、决定，或是一个新的发现…" required></textarea><p class="form-hint">可以补录过去的进展，保存后会自动按发生时间排序。</p><p id="entry-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" id="cancel-entry" class="secondary">取消</button><button type="submit" id="save-entry" class="primary">保存记录</button></div></form></dialog>
  <dialog id="dates-dialog"><form id="dates-form"><h2>事件的起止时间</h2><label class="field-label" for="event-start">开始时间</label><input class="field-input" id="event-start" type="datetime-local" step="1" required><label class="field-label" for="event-end">结束时间 <span>留空表示进行中</span></label><input class="field-input" id="event-end" type="datetime-local" step="1"><p class="form-hint">起止时间需包含已有的全部时间节点。</p><p id="dates-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" id="cancel-dates" class="secondary">取消</button><button type="submit" id="save-dates" class="primary">保存时间</button></div></form></dialog>
  <dialog id="delete-dialog"><span class="dialog-icon">${icon('trash')}</span><h2 id="delete-title">删除这个事件？</h2><p id="delete-description"></p><div class="dialog-actions"><button id="cancel-delete" class="secondary">再想想</button><button id="confirm-delete" class="danger-button">确认删除</button></div></dialog>
  <dialog id="info-dialog"><span class="dialog-icon green">${icon('leaf')}</span><h2>每件事的经过，都留在本机。</h2><p>事件包含起止时间和多个进展节点，无需账号或云服务。换设备或重装前，请在设置中导出 .jetlet 完整备份。</p><label class="path-label">当前数据文件</label><code id="data-path"></code><p class="info-small">.jetlet 完整保留事件、记录、日程、颜色与关联关系；JSON、MD 和 TXT 仍可导入。导入后选择一个没有 Jotlet 数据的文件夹作为新的保存位置。</p><p class="info-small">导入成功后使用备份中的数据，原文件夹中的数据保留；取消或导入失败时继续使用原位置。备份未加密，删除事件会同时删除其中所有节点。</p><p class="info-small">可在设置中更改数据保存文件夹。日程单独存于 calendar.json，.jetlet 导出会一并打包；兼容 JSON 与 Markdown 导出仅包含事件和记录。</p><button id="close-info" class="primary">知道了</button></dialog>
`;

let events: EventRecord[] = [];
let selectedId: string | null = null;
let filter = 'all';
let query = '';
let ready = false;
let actionBusy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let savePromise: Promise<void> | null = null;
let allowClose = false;
let editingEntryId: string | null = null;
let deleteTarget: { eventId: string; entryId?: string } | null = null;
const pending = new Map<string, EventRecord>();
const api = window.jotlet;
const current = () => events.find((event) => event.id === selectedId);
const longDate = (date: string) =>
  new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
const shortDate = (date: string) =>
  new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
function localInput(date: string): string {
  const value = new Date(date);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
}
function fromInput(selector: string): string {
  const value = $<HTMLInputElement>(selector).value;
  if (!value || !Number.isFinite(new Date(value).getTime()))
    throw new Error('请输入有效的日期和时间。');
  return new Date(value).toISOString();
}
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
function toast(text: string, error = false) {
  $('#toast').textContent = text;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      $('#toast').hidden = true;
    },
    error ? 9000 : 4500,
  );
}
function status(text: string, error = false) {
  $('#save-state').textContent = text;
  $('#save-state').classList.toggle('save-error', error);
}
function setControls() {
  document
    .querySelectorAll<HTMLButtonElement>(
      '.new-event, .import-button, [data-export], #pin-event, #delete-event, #finish-event, #event-dates, #add-entry, .entry-edit, .entry-delete, .add-timeline, #save-entry, #save-dates, #confirm-delete',
    )
    .forEach((button) => {
      button.disabled = !ready || actionBusy;
    });
  $<HTMLInputElement>('#event-title').disabled = actionBusy;
}
async function action(operation: () => Promise<void>) {
  if (!ready || actionBusy) return;
  actionBusy = true;
  setControls();
  try {
    await operation();
  } catch (error) {
    toast(message(error), true);
  } finally {
    actionBusy = false;
    setControls();
  }
}
function visibleEvents() {
  return events
    .filter((event) => {
      const match =
        filter === 'all' ||
        (filter === 'active'
          ? !event.endedAt
          : filter === 'finished'
            ? !!event.endedAt
            : event.pinned);
      return (
        match &&
        [event.title, ...event.entries.map((entry) => entry.content)]
          .join('\n')
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())
      );
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
}
function renderList() {
  $('#count-all').textContent = String(events.length);
  $('#count-active').textContent = String(
    events.filter((event) => !event.endedAt).length,
  );
  $('#count-finished').textContent = String(
    events.filter((event) => !!event.endedAt).length,
  );
  $('#count-pinned').textContent = String(
    events.filter((event) => event.pinned).length,
  );
  const visible = visibleEvents();
  $('.header-count').textContent = String(visible.length);
  $('#result-count').textContent = query
    ? `找到 ${visible.length} 个事件`
    : `共 ${visible.length} 个事件`;
  const list = $('#event-list');
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = query
      ? '没有找到相关事件\n也可以搜索节点中的文字'
      : '这里还没有事件\n从一件正在发生的事开始';
    list.append(empty);
  }
  for (const event of visible) {
    const button = document.createElement('button');
    button.className = `note-card${event.id === selectedId ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(event.id === selectedId));
    const heading = document.createElement('div');
    heading.className = 'card-heading';
    const title = document.createElement('strong');
    title.textContent = event.title.trim() || '未命名事件';
    heading.append(title);
    if (event.pinned) {
      const pin = document.createElement('span');
      pin.innerHTML = icon('pin');
      pin.title = '已置顶';
      heading.append(pin);
    }
    const preview = document.createElement('p');
    const latest = chronological(event.entries).at(-1);
    preview.textContent = latest?.content.trim() || '还没有进展，记下第一步吧…';
    const range = document.createElement('div');
    range.className = 'card-range';
    const start = document.createElement('span');
    start.textContent = `开始于 ${shortDate(event.startedAt)}`;
    const end = document.createElement('span');
    end.textContent = event.endedAt
      ? `结束于 ${shortDate(event.endedAt)}`
      : '结束于 —';
    range.append(start, end);
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    const badge = document.createElement('span');
    badge.className = event.endedAt ? 'card-status finished' : 'card-status';
    badge.textContent = event.endedAt ? '已结束' : '进行中';
    const count = document.createElement('span');
    count.textContent = `${event.entries.length} 个节点`;
    footer.append(badge, count);
    button.append(heading, preview, range, footer);
    button.addEventListener('click', () => {
      void action(async () => {
        await flush();
        selectEvent(event.id);
      });
    });
    list.append(button);
  }
}
function layoutTimeline() {
  const timeline = $('#timeline');
  const width = timeline.clientWidth;
  const columns = Math.max(1, Math.min(4, Math.floor((width + 28) / 216)));
  timeline.style.setProperty('--timeline-columns', String(columns));
  timeline.dataset.columns = String(columns);
  const nodes = [...timeline.querySelectorAll<HTMLElement>('.timeline-node')];
  nodes.forEach((node, index) => {
    node.classList.toggle('row-end', (index + 1) % columns === 0);
    node.classList.toggle('last-node', index === nodes.length - 1);
  });
}
function renderTimeline() {
  const event = current();
  if (!event) return;
  const entries = chronological(event.entries);
  const timeline = $('#timeline');
  timeline.replaceChildren();
  $('#entry-count').textContent = `${entries.length} 个节点`;
  $('#timeline-empty').hidden = !!entries.length;
  for (const [index, entry] of entries.entries()) {
    const node = document.createElement('article');
    node.className = 'timeline-node';
    node.setAttribute('role', 'listitem');
    const step = document.createElement('div');
    step.className = 'timeline-step';
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const time = document.createElement('time');
    time.dateTime = entry.occurredAt;
    time.textContent = longDate(entry.occurredAt);
    step.append(number, time);
    const body = document.createElement('div');
    body.className = 'timeline-card';
    const content = document.createElement('p');
    content.className = 'timeline-content';
    content.textContent = entry.content || '（原始空白记录）';
    const footer = document.createElement('div');
    footer.className = 'timeline-card-footer';
    const label = document.createElement('span');
    label.textContent = index === 0 ? '最初的进展' : '事件进展';
    const actions = document.createElement('div');
    const edit = document.createElement('button');
    edit.className = 'entry-edit';
    edit.textContent = '编辑';
    edit.setAttribute('aria-label', `编辑第 ${index + 1} 个节点`);
    edit.addEventListener('click', () => openEntry(entry.id));
    const remove = document.createElement('button');
    remove.className = 'entry-delete icon-button danger';
    remove.innerHTML = icon('trash');
    remove.setAttribute('aria-label', `删除第 ${index + 1} 个节点`);
    remove.title = '删除节点';
    remove.addEventListener('click', () => askDelete(entry.id));
    actions.append(edit, remove);
    footer.append(label, actions);
    body.append(content, footer);
    node.append(step, body);
    timeline.append(node);
  }
  if (!event.endedAt) {
    const add = document.createElement('button');
    add.className = 'add-timeline';
    add.innerHTML = `${icon('plus')}<strong>接下来，发生了什么？</strong><span>追加一个新的时间节点</span>`;
    add.addEventListener('click', () => openEntry());
    timeline.append(add);
  }
  layoutTimeline();
  setControls();
}
function renderMetadata() {
  const event = current();
  if (!event) return;
  $('#event-dates').textContent =
    `开始于 ${longDate(event.startedAt)}  →  ${event.endedAt ? `结束于 ${longDate(event.endedAt)}` : '仍在进行中'}`;
  $('#event-status').textContent = event.endedAt ? '已结束' : '进行中';
  $('#event-status').classList.toggle('finished', !!event.endedAt);
  $('#finish-event').textContent = event.endedAt ? '重新开启' : '标记结束';
  $('#timeline-caption').textContent = event.endedAt
    ? '事件已结束 · 仍可补录期间的进展'
    : '每一次进展，都在延续这条时间线';
  $('#pin-event').classList.toggle('is-pinned', event.pinned);
  $('#pin-event').setAttribute('aria-pressed', String(event.pinned));
  $('#pin-event').setAttribute(
    'aria-label',
    event.pinned ? '取消置顶' : '置顶事件',
  );
  $('#pin-event').title = event.pinned ? '取消置顶' : '置顶事件';
}
function selectEvent(id: string | null) {
  selectedId = id;
  const event = current();
  $('#event-detail').hidden = !event;
  $('#empty-state').hidden = !!event;
  if (event) {
    $<HTMLInputElement>('#event-title').value = event.title;
    status(pending.has(event.id) ? '有未保存的修改' : '已保存到本机');
    renderMetadata();
    renderTimeline();
    $('.timeline-scroll').scrollTop = 0;
  }
  renderList();
  setControls();
}
function edit(patch: Partial<EventRecord>) {
  const event = current();
  if (!event) return;
  const changed = parseEvent({
    ...event,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  events = events.map((item) => (item.id === event.id ? changed : item));
  pending.set(event.id, changed);
  status('正在保存…');
  renderList();
  renderMetadata();
  clearTimeout(timer);
  timer = setTimeout(() => {
    void flush().catch(() => {});
  }, 450);
}
function flush(): Promise<void> {
  clearTimeout(timer);
  if (savePromise) return savePromise;
  savePromise = (async () => {
    while (pending.size) {
      const [id, snapshot] = pending.entries().next().value!;
      try {
        const saved = unwrap(await api.save(snapshot));
        if (pending.get(id) === snapshot) {
          pending.delete(id);
          events = events.map((event) => (event.id === id ? saved : event));
        }
      } catch (error) {
        status('保存失败 · 点击重试', true);
        toast(message(error), true);
        throw error;
      }
    }
    status('已保存到本机');
    renderList();
  })().finally(() => {
    savePromise = null;
  });
  return savePromise;
}
async function newEvent() {
  await flush();
  const now = new Date().toISOString();
  const event = unwrap(
    await api.save({
      id: crypto.randomUUID(),
      title: '',
      pinned: false,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      entries: [],
    }),
  );
  events.push(event);
  query = '';
  $<HTMLInputElement>('#search').value = '';
  changeFilter('all');
  selectEvent(event.id);
  setTimeout(() => $('#event-title').focus(), 0);
}
function changeFilter(value: string) {
  filter = value;
  document
    .querySelectorAll<HTMLElement>('[data-filter]')
    .forEach((item) =>
      item.classList.toggle('active', item.dataset.filter === filter),
    );
  const title = (
    {
      all: '所有事件',
      active: '进行中的事件',
      finished: '已结束的事件',
      pinned: '已置顶的事件',
    } as Record<string, string>
  )[filter];
  $('#view-title').firstChild!.textContent = `${title} `;
  if (!visibleEvents().some((event) => event.id === selectedId))
    selectEvent(visibleEvents()[0]?.id ?? null);
  else renderList();
}
function openEntry(id: string | null = null) {
  if (!ready || actionBusy) return;
  const event = current();
  if (!event) return;
  const entry = event.entries.find((item) => item.id === id);
  editingEntryId = entry?.id ?? null;
  $('#entry-dialog-title').textContent = entry ? '编辑记录' : '添加记录';
  $<HTMLInputElement>('#entry-time').value = localInput(
    entry?.occurredAt ?? event.endedAt ?? new Date().toISOString(),
  );
  $<HTMLTextAreaElement>('#entry-content').value = entry?.content ?? '';
  $('#entry-error').hidden = true;
  $<HTMLDialogElement>('#entry-dialog').showModal();
  $('#entry-content').focus();
}
function openDates(ending = false) {
  const event = current();
  if (!event || actionBusy) return;
  $<HTMLInputElement>('#event-start').value = localInput(event.startedAt);
  const end =
    event.endedAt ??
    (ending
      ? new Date(
          Math.max(
            Date.now(),
            Date.parse(event.startedAt),
            ...event.entries.map((entry) => Date.parse(entry.occurredAt)),
          ),
        ).toISOString()
      : null);
  $<HTMLInputElement>('#event-end').value = end
    ? localInput(
        new Date(Math.ceil(Date.parse(end) / 1000) * 1000).toISOString(),
      )
    : '';
  $('#dates-error').hidden = true;
  $<HTMLDialogElement>('#dates-dialog').showModal();
}
function askDelete(entryId?: string) {
  if (!current() || actionBusy) return;
  deleteTarget = { eventId: selectedId!, entryId };
  $('#delete-title').textContent = entryId
    ? '删除这个时间节点？'
    : '删除整个事件？';
  $('#delete-description').textContent = entryId
    ? '只删除这次进展，其他时间节点会保留。此操作无法撤销。'
    : `事件和其中的 ${current()!.entries.length} 个时间节点会一并删除。此操作无法撤销，重要内容请先导出备份。`;
  $<HTMLDialogElement>('#delete-dialog').showModal();
}

document.querySelectorAll('.new-event').forEach((button) =>
  button.addEventListener('click', () => {
    void action(newEvent);
  }),
);
document.querySelectorAll<HTMLElement>('[data-filter]').forEach((button) =>
  button.addEventListener('click', () => {
    void action(async () => {
      await flush();
      changeFilter(button.dataset.filter!);
    });
  }),
);
$('#search').addEventListener('input', () => {
  query = $<HTMLInputElement>('#search').value.trim();
  renderList();
});
$('#event-title').addEventListener('input', () =>
  edit({ title: $<HTMLInputElement>('#event-title').value }),
);
$('#save-state').addEventListener('click', () => {
  void flush().catch(() => {});
});
$('#pin-event').addEventListener('click', () => {
  void action(async () => {
    if (current()) {
      edit({ pinned: !current()!.pinned });
      await flush();
    }
  });
});
$('#event-dates').addEventListener('click', () => openDates());
$('#finish-event').addEventListener('click', () => {
  if (current()?.endedAt)
    void action(async () => {
      edit({ endedAt: null });
      await flush();
      renderTimeline();
    });
  else openDates(true);
});
$('#add-entry').addEventListener('click', () => openEntry());
$('#cancel-entry').addEventListener('click', () =>
  $<HTMLDialogElement>('#entry-dialog').close(),
);
$('#cancel-dates').addEventListener('click', () =>
  $<HTMLDialogElement>('#dates-dialog').close(),
);
$('#entry-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void action(async () => {
    try {
      const parent = current();
      if (!parent) return;
      const content = $<HTMLTextAreaElement>('#entry-content').value;
      if (!content.trim()) throw new Error('先写一点这次发生的事吧。');
      const occurredAt = fromInput('#entry-time');
      const now = new Date().toISOString();
      const previous = parent.entries.find(
        (entry) => entry.id === editingEntryId,
      );
      const entry: TimelineEntry = {
        id: previous?.id ?? crypto.randomUUID(),
        content,
        occurredAt,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      // A backdated entry extends the beginning of the event automatically.
      edit({
        startedAt:
          occurredAt < parent.startedAt ? occurredAt : parent.startedAt,
        entries: [
          ...parent.entries.filter((item) => item.id !== entry.id),
          entry,
        ],
      });
      editingEntryId = entry.id;
      await flush();
      renderTimeline();
      $<HTMLDialogElement>('#entry-dialog').close();
    } catch (error) {
      $('#entry-error').textContent = message(error);
      $('#entry-error').hidden = false;
    }
  });
});
$('#dates-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void action(async () => {
    try {
      edit({
        startedAt: fromInput('#event-start'),
        endedAt: $<HTMLInputElement>('#event-end').value
          ? fromInput('#event-end')
          : null,
      });
      await flush();
      renderTimeline();
      $<HTMLDialogElement>('#dates-dialog').close();
    } catch (error) {
      $('#dates-error').textContent = message(error);
      $('#dates-error').hidden = false;
    }
  });
});
$('#delete-event').addEventListener('click', () => askDelete());
$('#cancel-delete').addEventListener('click', () =>
  $<HTMLDialogElement>('#delete-dialog').close(),
);
$('#confirm-delete').addEventListener('click', () => {
  $<HTMLDialogElement>('#delete-dialog').close();
  const target = deleteTarget;
  deleteTarget = null;
  void action(async () => {
    await flush();
    if (!target || target.eventId !== selectedId) return;
    if (target.entryId) {
      edit({
        entries: current()!.entries.filter(
          (entry) => entry.id !== target.entryId,
        ),
      });
      await flush();
      renderTimeline();
      toast('时间节点已删除');
    } else {
      unwrap(await api.remove(target.eventId));
      events = events.filter((event) => event.id !== target.eventId);
      selectEvent(visibleEvents()[0]?.id ?? null);
      toast('事件及其时间节点已删除');
    }
  });
});
$('.import-button').addEventListener('click', () => {
  void action(async () => {
    await flush();
    const summary = unwrap(await api.importEvents());
    if (!summary) return;
    events = summary.events;
    if (summary.dataPath) $('#data-path').textContent = summary.dataPath;
    if (summary.schedules) calendar.replaceSchedules(summary.schedules);
    changeFilter('all');
    selectEvent(visibleEvents()[0]?.id ?? null);
    toast(
      summary.directory
        ? `已导入 ${summary.events.length} 个事件、${summary.schedules?.length ?? 0} 个日程，保存位置已切换到 ${summary.directory}`
        : `导入完成：新增 ${summary.added} 个事件，跳过 ${summary.skipped} 个重复事件`,
    );
  });
});
document.querySelectorAll<HTMLElement>('[data-export]').forEach((button) =>
  button.addEventListener('click', () => {
    $<HTMLDetailsElement>('.export-menu').open = false;
    void action(async () => {
      await flush();
      const output = unwrap(
        await api.exportEvents(
          button.dataset.export as 'jetlet' | 'json' | 'markdown',
        ),
      );
      if (output) toast(`已导出到 ${output}`);
    });
  }),
);
$('.data-info').addEventListener('click', () =>
  $<HTMLDialogElement>('#info-dialog').showModal(),
);
$('#close-info').addEventListener('click', () =>
  $<HTMLDialogElement>('#info-dialog').close(),
);
document.addEventListener('click', (event) => {
  if (!(event.target as Element).closest('.export-menu'))
    $<HTMLDetailsElement>('.export-menu').open = false;
});
document.addEventListener('keydown', (event) => {
  if (
    $('#app').hidden ||
    document.querySelector('dialog[open]') ||
    !(event.ctrlKey || event.metaKey)
  )
    return;
  if (event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#search').focus();
  }
  if (event.key.toLowerCase() === 'n') {
    event.preventDefault();
    void action(newEvent);
  }
  if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    void flush().catch(() => {});
  }
});
window.addEventListener('beforeunload', (event) => {
  if (allowClose || (!pending.size && !savePromise)) return;
  event.preventDefault();
  event.returnValue = '';
  void flush()
    .then(() => {
      allowClose = true;
      window.close();
    })
    .catch(() => {});
});
new ResizeObserver(layoutTimeline).observe($('.editor-panel'));
const calendar = createCalendar({
  getEvents: () => events,
  createEvent: async (title, startedAt, initialContent) => {
    if (!ready || actionBusy) throw new Error('事件数据暂不可用，请稍后重试。');
    await flush();
    const event = unwrap(
      await api.save(createCalendarEvent(title, startedAt, initialContent)),
    );
    events.push(event);
    renderList();
    return event;
  },
  beforeNavigate: flush,
  openEvent: async (id) => {
    await flush();
    query = '';
    $<HTMLInputElement>('#search').value = '';
    changeFilter('all');
    selectEvent(id);
  },
  notify: toast,
});
async function initialize() {
  try {
    if (!api) throw new Error('本地存储未连接，请通过 Jotlet 桌面应用打开。');
    const data = unwrap(await api.load());
    events = data.events;
    $('#data-path').textContent = data.dataPath;
    ready = true;
    setControls();
    selectEvent(visibleEvents()[0]?.id ?? null);
    calendar.refresh();
  } catch (error) {
    $('#result-count').textContent = '数据加载失败';
    $('#empty-state h2').textContent = '暂时无法读取本地事件';
    $('#empty-state p').textContent = message(error);
    $('.empty-hint').textContent =
      '原有数据不会被覆盖。修复文件后，请重新打开应用。';
    toast(message(error), true);
  }
}
void initialize();
