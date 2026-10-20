import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  rename,
  readdir,
  appendFile,
  open,
} from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventsStore } from '../src/main/storage/event-store.ts';
import { createCalendarEvent, makeBackup } from '../src/shared/events.ts';
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
    const snapshot = await readFile(context.file, 'utf8');
    const journal = await readFile(store.journalPath, 'utf8');
    assert.equal(journal.trim().split('\n').length, 15);
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
    assert.equal(await readFile(context.file, 'utf8'), snapshot);
    assert.ok((await readFile(store.journalPath, 'utf8')).startsWith(journal));
    assert.deepEqual((await readdir(path.dirname(context.file))).sort(), [
      'notes.json',
      'notes.json.journal',
    ]);
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
    await rename(store.journalPath, `${store.journalPath}.held`);
    await mkdir(store.journalPath);
    await assert.rejects(store.save(makeEvent('2')));
    assert.equal((await store.load()).length, 1);
    await rm(store.journalPath, { recursive: true });
    await rename(`${store.journalPath}.held`, store.journalPath);
    assert.equal((await new EventsStore(context.file).load()).length, 1);
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

test('editing an existing JSON dataset appends only the changed record and leaves snapshots and backups untouched', async () => {
  const context = await fixture();
  try {
    await mkdir(path.dirname(context.file), { recursive: true });
    const original = JSON.stringify(
      makeBackup(Array.from({ length: 30 }, (_, i) => makeEvent(String(i)))),
    );
    await writeFile(context.file, original);
    await writeFile(`${context.file}.bak`, 'retained backup');
    const store = new EventsStore(context.file);
    await store.save({ ...makeEvent('4'), title: '只修改这一条' });
    await store.remove('7');
    const journal = await readFile(store.journalPath, 'utf8');
    const transactions = journal
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      transactions.map((item) =>
        item.upserts.map((record: EventRecord) => record.id),
      ),
      [['4'], []],
    );
    assert.deepEqual(transactions[1].removed, ['7']);
    await store.remove('missing');
    assert.equal(await readFile(store.journalPath, 'utf8'), journal);
    assert.equal(await readFile(context.file, 'utf8'), original);
    assert.equal(
      await readFile(`${context.file}.bak`, 'utf8'),
      'retained backup',
    );
    const restarted = await new EventsStore(context.file).load();
    assert.equal(restarted.length, 29);
    assert.equal(
      restarted.find((item) => item.id === '4')!.title,
      '只修改这一条',
    );
    assert.equal(
      restarted.some((item) => item.id === '7'),
      false,
    );
  } finally {
    await context.dispose();
  }
});

test('bulk imports commit only added records in one transaction and a torn transaction never imports partially', async () => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    await store.save(makeEvent('existing'));
    const before = await readFile(store.journalPath, 'utf8');
    await store.importEvents([
      makeEvent('existing'),
      makeEvent('new-1'),
      makeEvent('new-2'),
    ]);
    const after = await readFile(store.journalPath, 'utf8');
    const added = JSON.parse(after.slice(before.length));
    assert.deepEqual(
      added.upserts.map((item: EventRecord) => item.id),
      ['new-1', 'new-2'],
    );
    assert.equal((await new EventsStore(context.file).load()).length, 3);
    // Simulate a process ending in the middle of that import, before its newline.
    await writeFile(
      store.journalPath,
      before + after.slice(before.length, -20),
    );
    const restarted = new EventsStore(context.file);
    assert.deepEqual(
      (await restarted.load()).map((item) => item.id),
      ['existing'],
    );
    await restarted.save(makeEvent('retry'));
    assert.deepEqual(
      (await new EventsStore(context.file).load()).map((item) => item.id),
      ['existing', 'retry'],
    );
  } finally {
    await context.dispose();
  }
});

test('an interrupted UTF-8 append is ignored on load and removed before the next durable write', async () => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    await store.save(makeEvent('1'));
    const committed = await readFile(store.journalPath);
    const tail = Buffer.concat([
      Buffer.from('{"未完成":"'),
      Buffer.from([0xe4, 0xb8]),
    ]);
    await appendFile(store.journalPath, tail);
    const restarted = new EventsStore(context.file);
    assert.equal((await restarted.load()).length, 1);
    assert.deepEqual(
      await readFile(store.journalPath),
      Buffer.concat([committed, tail]),
    );
    await restarted.save(makeEvent('2'));
    assert.equal((await new EventsStore(context.file).load()).length, 2);
    assert.equal(
      (await readFile(store.journalPath, 'utf8')).includes('未完成'),
      false,
    );
  } finally {
    await context.dispose();
  }
});

test('committed journal corruption, sequence gaps and orphan logs block writes and preserve the files', async () => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    await store.save(makeEvent('1'));
    const original = await readFile(store.journalPath, 'utf8');
    for (const tail of [
      '{broken}\n',
      JSON.stringify({
        version: 1,
        sequence: 3,
        upserts: [makeEvent('3')],
        removed: [],
      }) + '\n',
      JSON.stringify({
        version: 1,
        sequence: 2,
        upserts: [{ id: 'invalid' }],
        removed: [],
      }) + '\n',
    ]) {
      await writeFile(store.journalPath, original + tail);
      const broken = new EventsStore(context.file);
      await assert.rejects(broken.load(), /原文件已保留/);
      await assert.rejects(broken.save(makeEvent('2')));
      assert.equal(await readFile(store.journalPath, 'utf8'), original + tail);
    }
    await writeFile(store.journalPath, original);
    await rm(context.file);
    await assert.rejects(new EventsStore(context.file).load(), /原文件已保留/);
    assert.equal(await readFile(store.journalPath, 'utf8'), original);
  } finally {
    await context.dispose();
  }
});

test('large journals compact occasionally and recover if interrupted between the two atomic replacements', async () => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    const event = makeEvent('large');
    event.entries[0].content = 'x'.repeat(900_000);
    for (let i = 0; i < 5; i++)
      await store.save({ ...event, title: `版本 ${i}` });
    const journal = await readFile(store.journalPath, 'utf8');
    assert.ok(Buffer.byteLength(journal) > 4 * 1024 * 1024);
    assert.equal(
      JSON.parse(await readFile(context.file, 'utf8')).journalSequence,
      0,
    );
    await mkdir(`${store.journalPath}.tmp`);
    await assert.rejects(store.save(makeEvent('next')));
    const snapshot = JSON.parse(await readFile(context.file, 'utf8'));
    assert.equal(snapshot.journalSequence, 5);
    assert.equal(snapshot.events[0].title, '版本 4');
    assert.equal(await readFile(store.journalPath, 'utf8'), journal);
    const restarted = new EventsStore(context.file);
    assert.deepEqual(await restarted.load(), await store.load());
    await rm(`${store.journalPath}.tmp`, { recursive: true });
    await restarted.save(makeEvent('next'));
    const compacted = (await readFile(store.journalPath, 'utf8'))
      .trim()
      .split('\n');
    assert.equal(compacted.length, 1);
    assert.equal(JSON.parse(compacted[0]).sequence, 6);
    assert.equal((await new EventsStore(context.file).load()).length, 2);
    await restarted.remove('large');
    assert.deepEqual(
      (await new EventsStore(context.file).load()).map((item) => item.id),
      ['next'],
    );
  } finally {
    await context.dispose();
  }
});

test('partial append failures roll back disk bytes and memory, then allow retry', async (t) => {
  const context = await fixture();
  try {
    const store = new EventsStore(context.file);
    await store.save(makeEvent('1'));
    const before = await readFile(store.journalPath);
    const probe = await open(store.journalPath, 'r+');
    const prototype = Object.getPrototypeOf(probe);
    const originalWrite = prototype.write;
    await probe.close();
    const mocked = t.mock.method(
      prototype,
      'write',
      async function (
        this: FileHandle,
        bytes: Buffer,
        offset: number,
        length: number,
        position: number,
      ) {
        await originalWrite.call(
          this,
          bytes,
          offset,
          Math.min(20, length),
          position,
        );
        throw new Error('simulated disk full after a partial write');
      },
    );
    await assert.rejects(store.save(makeEvent('2')), /simulated disk full/);
    mocked.mock.restore();
    assert.deepEqual(await readFile(store.journalPath), before);
    assert.equal((await store.load()).length, 1);
    assert.equal((await new EventsStore(context.file).load()).length, 1);
    await store.save(makeEvent('2'));
    assert.equal((await new EventsStore(context.file).load()).length, 2);
  } finally {
    await context.dispose();
  }
});
