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
import { DataLocationManager } from '../src/main/storage/data-location.ts';
import { BackupImport } from '../src/main/storage/backup-import.ts';
import { makeJotletBackup } from '../src/shared/backup.ts';
import { createCalendarEvent } from '../src/shared/events.ts';
import { planMerge } from '../src/shared/import.ts';
import { backupFromArguments } from '../src/main/open-backup.ts';
import type { Schedule } from '../src/shared/schedules.ts';

const start = '2026-10-20T01:00:00.000Z';
const event = (id = 'event', title = '项目') => ({
  ...createCalendarEvent(title, start, title),
  id,
});
const schedule = (
  id = 'schedule',
  eventId: string | null = 'event',
): Schedule => ({
  id,
  title: '讨论',
  start,
  end: '2026-10-20T02:00:00.000Z',
  color: 'sage',
  allDay: false,
  eventId,
  description: '',
  createdAt: start,
  updatedAt: start,
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'jotlet-import-'));
  const directory = path.join(root, 'data');
  const manager = new DataLocationManager(directory);
  await manager.initialize();
  const file = path.join(root, '备份 空格.jotlet');
  const service = new BackupImport(manager);
  return {
    root,
    directory,
    manager,
    file,
    service,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}

test('merge skips duplicates, preserves ID conflicts and remaps schedule associations without mutating inputs', () => {
  const original = event();
  const incoming = event('event', '不同内容');
  const local = schedule();
  const backup = makeJotletBackup(
    [incoming],
    [local, schedule('orphan', 'missing')],
  );
  const before = structuredClone(backup);
  const merged = planMerge([original], [local], backup);
  assert.deepEqual(merged.eventMerge, { added: 1, skipped: 0, conflicts: 1 });
  assert.deepEqual(merged.scheduleMerge, {
    added: 2,
    skipped: 0,
    conflicts: 1,
  });
  assert.equal(merged.events[0], original);
  assert.notEqual(merged.events[1].id, original.id);
  assert.equal(merged.schedules[1].eventId, merged.events[1].id);
  assert.notEqual(merged.schedules[1].id, local.id);
  assert.equal(merged.schedules[2].eventId, null);
  assert.deepEqual(backup, before);
  const again = planMerge(merged.events, merged.schedules, backup);
  assert.equal(again.eventMerge.added, 0);
  assert.equal(again.scheduleMerge.added, 0);
  const duplicateWithDifferentId = { ...original, id: 'same-content' };
  const dedup = planMerge(
    [original],
    [local],
    makeJotletBackup(
      [duplicateWithDifferentId],
      [schedule('other', 'same-content')],
    ),
  );
  assert.equal(dedup.eventMerge.skipped, 1);
  assert.equal(dedup.scheduleMerge.skipped, 1);
  assert.deepEqual(dedup.events, [original]);
});

test('analysis and cancellation never modify data; merge commits both datasets and survives restart', async () => {
  const f = await fixture();
  try {
    await f.manager.events.save(event());
    await f.manager.schedules.save(schedule());
    const oldPath = f.manager.events.filePath;
    const original = await readFile(`${oldPath}.journal`);
    await writeFile(
      f.file,
      JSON.stringify(
        makeJotletBackup([event('event', '冲突事件')], [schedule()]),
      ),
    );
    const preview = await f.service.analyze(f.file);
    assert.equal(preview.eventMerge.conflicts, 1);
    assert.equal(preview.scheduleMerge.conflicts, 1);
    assert.equal(preview.entries, 1);
    assert.deepEqual(await readFile(`${oldPath}.journal`), original);
    assert.equal((await f.manager.events.load()).length, 1);
    f.service.discard(preview.token);
    await assert.rejects(f.service.commit(preview.token, 'merge'), /已失效/);
    const next = await f.service.analyze(f.file);
    const result = await f.service.commit(next.token, 'merge');
    assert.equal(result.events.length, 2);
    assert.equal(result.schedules!.length, 2);
    assert.equal(result.schedules![1].eventId, result.events[1].id);
    assert.equal(f.manager.location.directory, f.directory);
    assert.deepEqual(await readFile(`${oldPath}.journal`), original);
    const restarted = new DataLocationManager(f.directory);
    await restarted.initialize();
    assert.deepEqual(await restarted.events.load(), result.events);
    assert.deepEqual(await restarted.schedules.load(), result.schedules);
    await assert.rejects(f.service.commit(next.token, 'merge'), /已失效/);
    const noOp = await f.service.analyze(f.file);
    const pointer = await readFile(
      path.join(f.directory, 'active-dataset.json'),
    );
    await f.service.commit(noOp.token, 'merge');
    assert.deepEqual(
      await readFile(path.join(f.directory, 'active-dataset.json')),
      pointer,
    );
  } finally {
    await f.dispose();
  }
});

test('replace switches the complete dataset, retains previous files, supports empty backups and relocation', async () => {
  const f = await fixture();
  try {
    await f.manager.events.save(event('old'));
    await f.manager.schedules.save(schedule('old', 'old'));
    const oldEvents = f.manager.events.filePath;
    const oldJournal = await readFile(`${oldEvents}.journal`);
    const backup = makeJotletBackup([event('new')], [schedule('new', 'new')]);
    await writeFile(f.file, JSON.stringify(backup));
    const preview = await f.service.analyze(f.file);
    const result = await f.service.commit(preview.token, 'replace');
    assert.deepEqual(result.events, backup.events);
    assert.deepEqual(result.schedules, backup.schedules);
    assert.deepEqual(await readFile(`${oldEvents}.journal`), oldJournal);
    const newEvents = f.manager.events.filePath;
    const retained = await readFile(newEvents);
    await writeFile(f.file, JSON.stringify(makeJotletBackup([], [])));
    const empty = await f.service.analyze(f.file);
    await f.service.commit(empty.token, 'replace');
    assert.deepEqual(await readFile(newEvents), retained);
    const restarted = new DataLocationManager(f.directory);
    await restarted.initialize();
    assert.deepEqual(await restarted.events.load(), []);
    assert.deepEqual(await restarted.schedules.load(), []);
    await restarted.events.save(event('after'));
    const target = path.join(f.root, 'moved');
    await mkdir(target);
    await restarted.relocate(target);
    const moved = new DataLocationManager(f.directory);
    await moved.initialize();
    assert.equal(moved.location.directory, target);
    assert.equal((await moved.events.load())[0].id, 'after');
  } finally {
    await f.dispose();
  }
});

test('failed generation commit preserves both active stores and the old pointer, and can be retried', async () => {
  const f = await fixture();
  try {
    await f.manager.replaceData(
      makeJotletBackup([event('old')], [schedule('old', 'old')]),
    );
    const oldStore = f.manager.events;
    const oldPointer = await readFile(
      path.join(f.directory, 'active-dataset.json'),
    );
    const oldGenerations = await readdir(
      path.join(f.directory, '.jotlet-datasets'),
    );
    await mkdir(path.join(f.directory, 'active-dataset.json.tmp'));
    await assert.rejects(
      f.manager.replaceData(makeJotletBackup([event('new')], [])),
    );
    assert.equal(f.manager.events, oldStore);
    assert.deepEqual(
      await readFile(path.join(f.directory, 'active-dataset.json')),
      oldPointer,
    );
    assert.deepEqual(
      await readdir(path.join(f.directory, '.jotlet-datasets')),
      oldGenerations,
    );
    const restarted = new DataLocationManager(f.directory);
    await restarted.initialize();
    assert.equal((await restarted.events.load())[0].id, 'old');
    assert.equal((await restarted.schedules.load())[0].id, 'old');
    await rm(path.join(f.directory, 'active-dataset.json.tmp'), {
      recursive: true,
    });
    await f.manager.replaceData(makeJotletBackup([event('new')], []));
    assert.equal((await f.manager.events.load())[0].id, 'new');
    assert.deepEqual(await f.manager.schedules.load(), []);
  } finally {
    await f.dispose();
  }
});

test('stale previews, invalid modes, changed or corrupt files never silently import', async () => {
  const f = await fixture();
  try {
    await writeFile(
      f.file,
      JSON.stringify(makeJotletBackup([event('incoming')], [])),
    );
    const preview = await f.service.analyze(f.file);
    await f.manager.events.save(event('new-local'));
    await assert.rejects(
      f.service.commit(preview.token, 'replace'),
      /数据已变化/,
    );
    await assert.rejects(
      f.service.commit(preview.token, 'invalid' as 'merge'),
      /方式无效/,
    );
    await writeFile(f.file, '{broken');
    await assert.rejects(f.service.analyze(f.file));
    await assert.rejects(f.service.commit(preview.token, 'replace'), /已失效/);
    assert.equal((await f.manager.events.load())[0].id, 'new-local');
    await assert.rejects(f.service.analyze('relative.jotlet'), /本机/);
  } finally {
    await f.dispose();
  }
});

test('missing or invalid active dataset pointers never silently fall back to old files', async () => {
  const f = await fixture();
  try {
    await f.manager.events.save(event('old'));
    await f.manager.replaceData(makeJotletBackup([event('new')], []));
    await rm(f.manager.events.filePath);
    await assert.rejects(new DataLocationManager(f.directory).initialize());
    await writeFile(
      path.join(f.directory, 'active-dataset.json'),
      JSON.stringify({ version: 1, generation: '../escape' }),
    );
    await assert.rejects(
      new DataLocationManager(f.directory).initialize(),
      /位置记录无效/,
    );
  } finally {
    await f.dispose();
  }
});

test('file launch arguments support spaces, Unicode, relative paths and uppercase extensions while ignoring switches', () => {
  const cwd = path.resolve('launch-directory');
  assert.equal(
    backupFromArguments(['jotlet.exe', '中文 备份.JOTLET'], cwd),
    path.join(cwd, '中文 备份.JOTLET'),
  );
  assert.equal(
    backupFromArguments(
      ['jotlet.exe', '--inspect=backup.jotlet', 'file.txt'],
      cwd,
    ),
    undefined,
  );
  assert.equal(backupFromArguments(['jotlet.exe'], cwd), undefined);
});

test('imported generations reopen from custom locations and from a fresh reinstall profile', async () => {
  const f = await fixture();
  try {
    const target = path.join(f.root, 'custom');
    await mkdir(target);
    await f.manager.relocate(target);
    const backup = makeJotletBackup(
      [event('retained')],
      [schedule('retained', 'retained')],
    );
    await f.manager.replaceData(backup);
    const restarted = new DataLocationManager(f.directory);
    await restarted.initialize();
    assert.equal(restarted.location.directory, target);
    assert.deepEqual(await restarted.events.load(), backup.events);
    const reinstalled = new DataLocationManager(
      path.join(f.root, 'fresh-profile'),
    );
    await reinstalled.initialize();
    await reinstalled.applyInstallation({
      directory: target,
      token: 'reinstall',
    });
    assert.deepEqual(await reinstalled.events.load(), backup.events);
    assert.deepEqual(await reinstalled.schedules.load(), backup.schedules);
  } finally {
    await f.dispose();
  }
});
