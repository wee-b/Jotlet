import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DataLocationManager } from '../src/data-location.ts';
import { makeJetletBackup } from '../src/jetlet-backup.ts';
const stamp = '2026-10-19T02:00:00.000Z';
test('restoring .jetlet switches the active dataset and location together, retaining originals', async () => {
  const f = await fixture();
  try {
    await seed(f.manager);
    const original = await readFile(f.manager.events.filePath);
    const events = await f.manager.events.load();
    events[0].title = '备份中的项目';
    const schedules = await f.manager.schedules.load();
    const archive = makeJetletBackup(events, schedules);
    const location = await f.manager.restore(f.target, archive);
    assert.equal(location.directory, f.target);
    assert.equal((await f.manager.events.load())[0].title, '备份中的项目');
    assert.deepEqual(await f.manager.schedules.load(), schedules);
    assert.deepEqual(
      await readFile(path.join(f.source, 'notes.json')),
      original,
    );
    const restart = new DataLocationManager(f.source);
    await restart.initialize();
    assert.equal(restart.location.directory, f.target);
    assert.deepEqual(await restart.events.load(), events);
    assert.equal((await restart.schedules.load())[0].eventId, events[0].id);
    await assert.rejects(
      restart.restore(f.source, archive),
      /已有 Jotlet 数据/,
    );
  } finally {
    await f.dispose();
  }
});
test('failed .jetlet restore never switches location and removes incomplete destination data', async () => {
  const f = await fixture();
  try {
    await seed(f.manager);
    const archive = makeJetletBackup([], []);
    await assert.rejects(
      f.manager.restore(f.target, { ...archive, version: 99 } as never),
    );
    assert.deepEqual(await readdir(f.target), []);
    await mkdir(f.manager.configPath);
    await assert.rejects(f.manager.restore(f.target, archive));
    assert.equal(f.manager.location.directory, f.source);
    assert.equal((await f.manager.events.load())[0].title, '项目');
    assert.deepEqual(await readdir(f.target), []);
  } finally {
    await f.dispose();
  }
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'jotlet-location-'));
  const source = path.join(root, 'original');
  const target = path.join(root, '目标目录');
  await mkdir(source);
  await mkdir(target);
  const manager = new DataLocationManager(source);
  await manager.initialize();
  return {
    root,
    source,
    target,
    manager,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
async function seed(manager: DataLocationManager) {
  await manager.events.save({
    id: 'event',
    title: '项目',
    pinned: false,
    startedAt: stamp,
    endedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    entries: [
      {
        id: 'record',
        content: '记录内容',
        occurredAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
  });
  await manager.schedules.save({
    id: 'schedule',
    title: '讨论',
    start: stamp,
    end: '2026-10-19T03:00:00.000Z',
    allDay: false,
    color: 'sage',
    eventId: 'event',
    description: '',
    createdAt: stamp,
    updatedAt: stamp,
  });
}
test('moving data preserves originals, associations, backup bytes and the persisted location across restart', async () => {
  const f = await fixture();
  try {
    await seed(f.manager);
    const before = await f.manager.events.load();
    const schedules = await f.manager.schedules.load();
    const sourceBytes = await readFile(path.join(f.source, 'notes.json'));
    await writeFile(
      path.join(f.source, 'notes.json.bak'),
      'exact previous backup',
    );
    await writeFile(path.join(f.source, 'notes.json.v1.bak'), 'legacy backup');
    const location = await f.manager.relocate(f.target);
    assert.equal(location.directory, f.target);
    assert.deepEqual(
      await readFile(path.join(f.source, 'notes.json')),
      sourceBytes,
    );
    assert.deepEqual(await readFile(location.eventsPath), sourceBytes);
    assert.equal(
      await readFile(path.join(f.target, 'notes.json.bak'), 'utf8'),
      'exact previous backup',
    );
    assert.equal(
      await readFile(path.join(f.target, 'notes.json.v1.bak'), 'utf8'),
      'legacy backup',
    );
    const restarted = new DataLocationManager(f.source);
    await restarted.initialize();
    assert.equal(restarted.location.directory, f.target);
    assert.deepEqual(await restarted.events.load(), before);
    assert.deepEqual(await restarted.schedules.load(), schedules);
    await restarted.events.save({ ...before[0], title: '新位置的修改' });
    assert.deepEqual(
      await readFile(path.join(f.source, 'notes.json')),
      sourceBytes,
    );
    assert.equal((await restarted.events.load())[0].title, '新位置的修改');
    assert.deepEqual(await restarted.relocate(f.target), restarted.location);
  } finally {
    await f.dispose();
  }
});
test('occupied destinations are never overwritten, including automatic backup files', async () => {
  const f = await fixture();
  try {
    await seed(f.manager);
    await writeFile(path.join(f.target, 'calendar.json.bak'), 'existing data');
    await assert.rejects(f.manager.relocate(f.target), /已有 Jotlet 数据/);
    assert.equal(f.manager.location.directory, f.source);
    assert.deepEqual(await readdir(f.target), ['calendar.json.bak']);
    assert.equal(
      await readFile(path.join(f.target, 'calendar.json.bak'), 'utf8'),
      'existing data',
    );
  } finally {
    await f.dispose();
  }
});
test('failed configuration commit rolls back destination copies and keeps the active stores', async () => {
  const f = await fixture();
  try {
    await seed(f.manager);
    const originalStore = f.manager.events;
    await mkdir(f.manager.configPath);
    await assert.rejects(f.manager.relocate(f.target));
    assert.equal(f.manager.events, originalStore);
    assert.equal((await originalStore.load())[0].title, '项目');
    assert.deepEqual(await readdir(f.target), []);
  } finally {
    await f.dispose();
  }
});
test('fresh installs create both data files; missing custom files and corrupt sources do not silently reset data', async () => {
  const f = await fixture();
  try {
    await f.manager.relocate(f.target);
    assert.deepEqual(await f.manager.events.load(), []);
    assert.deepEqual(await f.manager.schedules.load(), []);
    await rm(path.join(f.target, 'calendar.json'));
    await assert.rejects(new DataLocationManager(f.source).initialize());
    await rm(f.manager.configPath);
    await writeFile(path.join(f.source, 'notes.json'), 'broken json');
    const broken = new DataLocationManager(f.source);
    const empty = path.join(f.root, 'empty');
    await mkdir(empty);
    await assert.rejects(broken.relocate(empty), /读取失败/);
    assert.deepEqual(await readdir(empty), []);
    assert.equal(
      await readFile(path.join(f.source, 'notes.json'), 'utf8'),
      'broken json',
    );
  } finally {
    await f.dispose();
  }
});
