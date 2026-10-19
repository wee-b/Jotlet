import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventsStore } from '../src/main/storage/event-store.ts';
import { createCalendarEvent, parseBackup } from '../src/shared/events.ts';
import type { EventRecord } from '../src/shared/events.ts';
const start = '2026-10-01T02:00:00.000Z';
const makeEvent = (id: string): EventRecord => ({
  id,
  title: `事件 ${id}`,
  pinned: false,
  startedAt: start,
  endedAt: null,
  createdAt: start,
  updatedAt: start,
  entries: [
    {
      id: 'first',
      content: '事情开始了',
      occurredAt: start,
      createdAt: start,
      updatedAt: start,
    },
  ],
});
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'jotlet-test-'));
  return {
    directory,
    file: path.join(directory, 'data', 'notes.json'),
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}

test('calendar-created events persist one editable initial record with the selected time', async () => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    await store.load();
    const event = createCalendarEvent(
      '上班',
      start,
      '项目讨论\n\n准备本周计划',
    );
    await store.save(event);
    let [saved] = await new EventsStore(context.file).load();
    assert.equal(saved.entries.length, 1);
    assert.equal(saved.entries[0].occurredAt, start);
    assert.equal(saved.entries[0].content, '项目讨论\n\n准备本周计划');
    await store.save({
      ...saved,
      entries: [{ ...saved.entries[0], content: '已记录讨论结果' }],
    });
    [saved] = await new EventsStore(context.file).load();
    assert.equal(saved.entries.length, 1);
    assert.equal(saved.entries[0].content, '已记录讨论结果');
    assert.equal(
      createCalendarEvent('上班', start, '  ').entries[0].content,
      '上班',
    );
    assert.throws(() => createCalendarEvent('上班', 'invalid', '记录'));
  } finally {
    await context.dispose();
  }
});

test('serializes concurrent events and preserves metadata and timelines across restart', async () => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    assert.deepEqual(await store.load(), []);
    await Promise.all(
      Array.from({ length: 15 }, (_, i) => store.save(makeEvent(String(i)))),
    );
    assert.equal((await new EventsStore(context.file).load()).length, 15);
    assert.equal(
      parseBackup(await readFile(`${context.file}.bak`, 'utf8')).length,
      14,
    );
    const original = makeEvent('0');
    const edited = await store.save({
      ...original,
      entries: [
        ...original.entries,
        { ...original.entries[0], id: 'second', content: '后来有了新进展' },
      ],
      createdAt: new Date().toISOString(),
    });
    assert.equal(edited.createdAt, original.createdAt);
    assert.equal(edited.entries.length, 2);
    await store.remove('1');
    assert.equal((await new EventsStore(context.file).load()).length, 14);
  } finally {
    await context.dispose();
  }
});
test('corrupt local data blocks all writes without replacing the original', async () => {
  const context = await fixture();
  try {
    await mkdir(path.dirname(context.file), { recursive: true });
    await writeFile(context.file, '{broken');
    const store = new EventsStore(context.file);
    await assert.rejects(store.load(), /原文件已保留/);
    await assert.rejects(store.save(makeEvent('1')));
    assert.equal(await readFile(context.file, 'utf8'), '{broken');
  } finally {
    await context.dispose();
  }
});
test('failed disk writes leave memory and the committed file unchanged and can be retried', async () => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    await store.save(makeEvent('1'));
    await mkdir(`${context.file}.tmp`);
    await assert.rejects(store.save(makeEvent('2')));
    assert.equal((await store.load()).length, 1);
    assert.equal((await new EventsStore(context.file).load()).length, 1);
    await rm(`${context.file}.tmp`, { recursive: true });
    await store.save(makeEvent('2'));
    assert.equal((await store.load()).length, 2);
  } finally {
    await context.dispose();
  }
});
test('invalid import is atomic, conflicts preserve entire events, and load deeply isolates nested nodes', async () => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    await store.save(makeEvent('1'));
    await assert.rejects(
      store.importEvents([
        makeEvent('2'),
        { ...makeEvent('3'), title: 99 } as unknown as EventRecord,
      ]),
    );
    assert.equal((await store.load()).length, 1);
    const changed = makeEvent('1');
    changed.entries[0].content = '冲突内容';
    assert.equal((await store.importEvents([changed])).conflicts, 1);
    assert.equal((await new EventsStore(context.file).load()).length, 2);
    const snapshot = await store.load();
    snapshot[0].entries[0].content = '外部篡改';
    assert.notEqual((await store.load())[0].entries[0].content, '外部篡改');
  } finally {
    await context.dispose();
  }
});
test('legacy migration preserves an exact permanent v1 backup before the first write', async () => {
  const context = await fixture();
  try {
    await mkdir(path.dirname(context.file), { recursive: true });
    const legacy = JSON.stringify({
      app: 'jotlet',
      version: 1,
      notes: [
        {
          id: 'old',
          title: '旧记录',
          content: '保留的正文',
          pinned: true,
          createdAt: start,
          updatedAt: start,
        },
      ],
    });
    await writeFile(context.file, legacy);
    const store = new EventsStore(context.file);
    const migrated = (await store.load())[0];
    assert.equal(migrated.entries[0].content, '保留的正文');
    assert.equal(await readFile(context.file, 'utf8'), legacy);
    await store.save({ ...migrated, title: '迁移后更新' });
    assert.equal(JSON.parse(await readFile(context.file, 'utf8')).version, 2);
    assert.equal(await readFile(`${context.file}.v1.bak`, 'utf8'), legacy);
    await store.save({ ...migrated, title: '第二次更新' });
    assert.equal(await readFile(`${context.file}.v1.bak`, 'utf8'), legacy);
    assert.equal(
      (await new EventsStore(context.file).load())[0].entries[0].content,
      '保留的正文',
    );
  } finally {
    await context.dispose();
  }
});
