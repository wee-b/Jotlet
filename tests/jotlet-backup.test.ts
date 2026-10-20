import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { readBackupFile } from '../src/main/storage/backup-file.ts';
import { DataLocationManager } from '../src/main/storage/data-location.ts';
import { makeJotletBackup, parseJotletBackup } from '../src/shared/backup.ts';
import type { EventRecord } from '../src/shared/events.ts';
import type { Schedule } from '../src/shared/schedules.ts';
const stamp = '2026-10-19T02:00:00.000Z';
const event: EventRecord = {
  id: 'event',
  title: '项目 🌿',
  pinned: true,
  startedAt: stamp,
  endedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
  entries: [
    {
      id: 'record',
      content: '讨论\n与决定',
      occurredAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ],
};
const schedule: Schedule = {
  id: 'schedule',
  title: '讨论',
  start: stamp,
  end: '2026-10-19T03:00:00.000Z',
  allDay: false,
  color: 'lavender',
  eventId: event.id,
  description: '<b>纯文本</b>',
  createdAt: stamp,
  updatedAt: stamp,
};
test('.jotlet round-trips events, records, schedules, colors and optional associations', () => {
  const archive = makeJotletBackup(
    [event],
    [schedule, { ...schedule, id: 'independent', eventId: null }],
  );
  const restored = parseJotletBackup('\uFEFF' + JSON.stringify(archive));
  assert.deepEqual(restored, archive);
  assert.deepEqual(restored.events, [event]);
  assert.deepEqual(restored.schedules[0], schedule);
  assert.equal(restored.schedules[1].eventId, null);
  assert.deepEqual(
    parseJotletBackup(JSON.stringify(makeJotletBackup([], []))).events,
    [],
  );
});
test('.jotlet rejects malformed data, unsupported versions and duplicate IDs before restoring', () => {
  const archive = makeJotletBackup([event], [schedule]);
  for (const patch of [
    { format: 'other' },
    { version: 9 },
    { exportedAt: 'invalid' },
    { events: [event, event] },
    { schedules: [schedule, schedule] },
    { schedules: [{ ...schedule, end: 'invalid' }] },
    {
      events: [
        { ...event, entries: [{ ...event.entries[0], occurredAt: 'invalid' }] },
      ],
    },
  ])
    assert.throws(() =>
      parseJotletBackup(JSON.stringify({ ...archive, ...patch })),
    );
  for (const text of ['broken', 'null', '[]', '{}'])
    assert.throws(() => parseJotletBackup(text));
});

test('backups larger than 20 MiB import and restore with all records intact', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jotlet-large-backup-'));
  try {
    const events = Array.from({ length: 24 }, (_, index) => ({
      ...event,
      id: `large-${index}`,
      entries: [{ ...event.entries[0], content: '中'.repeat(320_000) }],
    }));
    const archive = makeJotletBackup(events, [
      { ...schedule, eventId: events[0].id },
    ]);
    const file = path.join(root, 'large.JOTLET');
    await writeFile(file, JSON.stringify(archive));
    assert.ok((await stat(file)).size > 20 * 1024 * 1024);
    const imported = await readBackupFile(file);
    assert.deepEqual(imported, archive);
    const manager = new DataLocationManager(path.join(root, 'profile'));
    const target = path.join(root, 'restored');
    await mkdir(target);
    await manager.restore(target, imported);
    const restarted = new DataLocationManager(path.join(root, 'profile'));
    await restarted.initialize();
    assert.deepEqual(await restarted.events.load(), events);
    assert.deepEqual(await restarted.schedules.load(), archive.schedules);
    const exported = makeJotletBackup(
      await restarted.events.load(),
      await restarted.schedules.load(),
    );
    assert.deepEqual(exported.events, archive.events);
    assert.deepEqual(exported.schedules, archive.schedules);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backup file imports still reject wrong extensions, directories and invalid contents', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jotlet-backup-file-'));
  try {
    const wrongExtension = path.join(root, 'backup.json');
    await writeFile(wrongExtension, JSON.stringify(makeJotletBackup([], [])));
    await assert.rejects(readBackupFile(wrongExtension), /仅支持导入/);
    const directory = path.join(root, 'directory.jotlet');
    await mkdir(directory);
    await assert.rejects(readBackupFile(directory), /请选择/);
    const file = path.join(root, 'broken.jotlet');
    await writeFile(file, '{broken');
    await assert.rejects(readBackupFile(file));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
