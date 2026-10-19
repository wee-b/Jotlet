import {
  chronological,
  createCalendarEvent,
  parseEvent,
} from '../../../shared/events';
import type { EventRecord, TimelineEntry } from '../../../shared/events';
import { unwrap, errorText as message } from '../../utils/result';
import { eventsTemplate } from './template';
import { createTimeline } from './timeline';
import { notify as toast } from '../../components/overlays';

import { eventIcon as icon } from '../../components/icons';

export function createEventsPage(options: { changed(): void }) {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    document.querySelector<T>(selector)!;

  document.querySelector('#app')!.innerHTML = eventsTemplate();

  let events: EventRecord[] = [];
  let selectedId: string | null = null;
  let filter = 'all';
  let query = '';
  let ready = false;
  let actionBusy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

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
      button.className = `event-card${event.id === selectedId ? ' selected' : ''}`;
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
      preview.textContent =
        latest?.content.trim() || '还没有进展，记下第一步吧…';
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
  const timeline = createTimeline($('.editor-panel'), {
    add: () => openEntry(),
    edit: openEntry,
    remove: askDelete,
    formatDate: longDate,
  });
  function renderTimeline() {
    const event = current();
    if (!event) return;
    timeline.render(event);
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
    $('.event-list-panel').setAttribute('aria-label', `${title}列表`);
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
  async function initialize() {
    try {
      if (!api) throw new Error('本地存储未连接，请通过 Jotlet 桌面应用打开。');
      const data = unwrap(await api.load());
      events = data.events;
      $('#data-path').textContent = data.dataPath;
      ready = true;
      setControls();
      selectEvent(visibleEvents()[0]?.id ?? null);
      options.changed();
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

  return {
    root: $('#app'),
    getEvents: () => events,
    flush,
    run: action,
    createLinkedEvent: async (
      title: string,
      startedAt: string,
      initialContent: string,
    ) => {
      if (!ready || actionBusy)
        throw new Error('事件数据暂不可用，请稍后重试。');
      await flush();
      const event = unwrap(
        await api.save(createCalendarEvent(title, startedAt, initialContent)),
      );
      events.push(event);
      renderList();
      return event;
    },

    openEvent: async (id: string) => {
      await flush();
      query = '';
      $<HTMLInputElement>('#search').value = '';
      changeFilter('all');
      selectEvent(id);
    },

    replaceEvents(items: EventRecord[], dataPath?: string) {
      events = items;
      if (dataPath) $('#data-path').textContent = dataPath;
      changeFilter('all');
      selectEvent(visibleEvents()[0]?.id ?? null);
    },
  };
}
