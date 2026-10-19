export interface TimelineEntry {
  id: string;
  content: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  title: string;
  pinned: boolean;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  entries: TimelineEntry[];
}

export interface Backup {
  app: 'jotlet';
  version: 2;
  exportedAt: string;
  events: EventRecord[];
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export interface ImportSummary {
  added: number;
  skipped: number;
  conflicts: number;
  events: EventRecord[];
}
export interface EventsAPI {
  load(): Promise<Result<{ events: EventRecord[]; dataPath: string }>>;
  save(event: EventRecord): Promise<Result<EventRecord>>;
  remove(id: string): Promise<Result<void>>;
  importEvents(): Promise<Result<ImportSummary | null>>;
  exportEvents(format: 'json' | 'markdown'): Promise<Result<string | null>>;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 200;
}
function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function iso(value: string): string {
  return new Date(value).toISOString();
}

export function parseEntry(value: unknown): TimelineEntry {
  if (
    !object(value) ||
    !identifier(value.id) ||
    typeof value.content !== 'string' ||
    value.content.length > 1_000_000 ||
    !date(value.occurredAt) ||
    !date(value.createdAt) ||
    !date(value.updatedAt)
  ) {
    throw new Error('时间节点格式不正确，请检查内容、日期和文字长度。');
  }
  return {
    id: value.id,
    content: value.content,
    occurredAt: iso(value.occurredAt),
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}
export function chronological(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}
export function createCalendarEvent(
  title: string,
  startedAt: string,
  initialContent: string,
): EventRecord {
  const now = new Date().toISOString();
  return parseEvent({
    id: crypto.randomUUID(),
    title,
    startedAt,
    endedAt: null,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    entries: [
      {
        id: crypto.randomUUID(),
        content: initialContent.trim() || title,
        occurredAt: startedAt,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
}
export function parseEvent(value: unknown): EventRecord {
  if (
    !object(value) ||
    !identifier(value.id) ||
    typeof value.title !== 'string' ||
    value.title.length > 500 ||
    typeof value.pinned !== 'boolean' ||
    !date(value.startedAt) ||
    !(value.endedAt === null || date(value.endedAt)) ||
    !date(value.createdAt) ||
    !date(value.updatedAt) ||
    !Array.isArray(value.entries)
  ) {
    throw new Error('事件格式不正确，请检查标题、时间和节点。');
  }
  const entries = chronological(value.entries.map(parseEntry));
  const startedAt = iso(value.startedAt);
  const endedAt = value.endedAt === null ? null : iso(value.endedAt as string);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    throw new Error('同一事件中不能有重复的节点 ID。');
  if (endedAt && endedAt < startedAt)
    throw new Error('结束时间不能早于开始时间。');
  if (entries.some((entry) => entry.occurredAt < startedAt))
    throw new Error('开始时间不能晚于已有节点，请先调整事件的开始时间。');
  if (endedAt && entries.some((entry) => entry.occurredAt > endedAt))
    throw new Error('节点不能晚于事件结束时间，请调整结束时间或重新开启事件。');
  return {
    id: value.id,
    title: value.title,
    pinned: value.pinned,
    startedAt,
    endedAt,
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
    entries,
  };
}

function migrateNote(value: unknown): EventRecord {
  if (
    !object(value) ||
    !identifier(value.id) ||
    typeof value.content !== 'string' ||
    !date(value.createdAt) ||
    !date(value.updatedAt)
  )
    throw new Error('旧版记录格式不正确，无法迁移。');
  return parseEvent({
    id: value.id,
    title: value.title,
    pinned: value.pinned,
    startedAt: value.createdAt,
    endedAt: null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    entries: [
      {
        id: value.id,
        content: value.content,
        occurredAt: value.createdAt,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      },
    ],
  });
}
export function parseData(text: string): {
  events: EventRecord[];
  migrated: boolean;
} {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('无法读取 JSON，请选择 Jotlet 导出的完整备份。');
  }
  if (!object(value) || value.app !== 'jotlet')
    throw new Error('不支持此备份格式，请选择 Jotlet JSON 备份。');
  let events: EventRecord[];
  if (value.version === 1 && Array.isArray(value.notes))
    events = value.notes.map(migrateNote);
  else if (value.version === 2 && Array.isArray(value.events))
    events = value.events.map(parseEvent);
  else
    throw new Error('不支持此备份版本，需要 Jotlet 版本 1 或 2 的 JSON 备份。');
  if (new Set(events.map((event) => event.id)).size !== events.length)
    throw new Error('备份中含有重复的事件 ID。');
  return { events, migrated: value.version === 1 };
}
export function parseBackup(text: string): EventRecord[] {
  return parseData(text).events;
}
export function makeBackup(events: EventRecord[]): Backup {
  return {
    app: 'jotlet',
    version: 2,
    exportedAt: new Date().toISOString(),
    events,
  };
}
function signature(event: EventRecord): string {
  return JSON.stringify([
    event.title,
    event.pinned,
    event.startedAt,
    event.endedAt,
    chronological(event.entries).map((entry) => [
      entry.occurredAt,
      entry.content,
    ]),
  ]);
}
export function mergeEvents(
  existing: EventRecord[],
  incoming: EventRecord[],
): ImportSummary {
  const events = structuredClone(existing);
  const ids = new Set(events.map((event) => event.id));
  const signatures = new Set(events.map(signature));
  let skipped = 0;
  let conflicts = 0;
  for (const event of incoming) {
    const key = signature(event);
    if (signatures.has(key)) {
      skipped++;
      continue;
    }
    const conflict = ids.has(event.id);
    const imported = structuredClone(event);
    if (conflict) {
      imported.id = crypto.randomUUID();
      conflicts++;
    }
    events.push(imported);
    ids.add(imported.id);
    signatures.add(key);
  }
  return { events, added: events.length - existing.length, skipped, conflicts };
}
export function toMarkdown(events: EventRecord[]): string {
  return events
    .map((event) => {
      const title = event.title.trim().replace(/[\r\n]+/g, ' ') || '未命名事件';
      const nodes = chronological(event.entries)
        .map(
          (entry, index) =>
            `## ${index + 1}. ${entry.occurredAt}\n\n${entry.content}\n`,
        )
        .join('\n');
      return `# ${title}\n\n开始时间：${event.startedAt}\n结束时间：${event.endedAt ?? '进行中'}\n\n${nodes}`;
    })
    .join('\n---\n\n');
}
