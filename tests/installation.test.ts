import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  readInstallation,
  writeInstallationHint,
} from '../src/main/storage/installation.ts';
import { DataLocationManager } from '../src/main/storage/data-location.ts';
import { createCalendarEvent } from '../src/shared/events.ts';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'jotlet-installation-'));
  const program = path.join(root, '程序目录');
  const directory = path.join(root, '我的数据 空格');
  const profile = path.join(root, 'profile');
  await mkdir(program);
  const file = path.join(program, 'jotlet-install.ini');
  return { root, program, directory, profile, file };
}

test('installer configuration accepts UTF-16 and UTF-8 Chinese paths, rejects overlapping program/data folders', async () => {
  const f = await fixture();
  try {
    assert.equal(await readInstallation(f.file), null);
    const ini = `[Jotlet]\r\nVersion=1\r\nDataDirectory=${f.directory}\r\nToken=first-install\r\n`;
    for (const encoding of ['utf16le', 'utf8'] as const) {
      await writeFile(f.file, '\uFEFF' + ini, encoding);
      assert.deepEqual(await readInstallation(f.file), {
        directory: f.directory,
        token: 'first-install',
      });
    }
    const hint = path.join(f.program, 'jotlet-data.ini');
    await writeInstallationHint(hint, f.directory);
    assert.ok(
      (await readFile(hint)).subarray(0, 2).equals(Buffer.from([0xff, 0xfe])),
    );
    assert.match(await readFile(hint, 'utf16le'), /我的数据 空格/);
    for (const invalid of [
      f.program,
      path.join(f.program, 'data'),
      f.root,
      'relative',
    ]) {
      await writeFile(f.file, ini.replace(f.directory, invalid));
      await assert.rejects(readInstallation(f.file));
    }
    await writeFile(f.file, ini.replace('Version=1', 'Version=2'));
    await assert.rejects(readInstallation(f.file));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('first launch uses installer data folder, migrates existing records and keeps later Settings changes across restarts', async () => {
  const f = await fixture();
  try {
    const manager = new DataLocationManager(f.profile);
    await manager.initialize();
    const event = createCalendarEvent(
      '原有事件',
      '2026-10-19T02:00:00.000Z',
      '保留记录',
    );
    await manager.events.save(event);
    const original = await readFile(manager.events.filePath);
    const installation = { directory: f.directory, token: 'first-install' };
    await manager.applyInstallation(installation);
    assert.equal(manager.location.directory, f.directory);
    assert.equal(
      (await manager.events.load())[0].entries[0].content,
      '保留记录',
    );
    assert.deepEqual(
      await readFile(path.join(f.profile, 'notes.json')),
      original,
    );
    assert.deepEqual(
      JSON.parse(await readFile(manager.location.calendarPath, 'utf8'))
        .schedules,
      [],
    );
    const changed = path.join(f.root, 'settings-location');
    await mkdir(changed);
    await manager.relocate(changed);
    const restarted = new DataLocationManager(f.profile);
    await restarted.initialize();
    await restarted.applyInstallation(installation);
    assert.equal(restarted.location.directory, changed);
    assert.equal((await restarted.events.load())[0].id, event.id);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('fresh profiles can reopen retained data after uninstall; conflicting or incomplete datasets are preserved and rejected', async () => {
  const f = await fixture();
  try {
    const retained = new DataLocationManager(
      path.join(f.root, 'retained-profile'),
    );
    await retained.initialize();
    const event = createCalendarEvent(
      '保留的数据',
      '2026-10-19T02:00:00.000Z',
      '记录',
    );
    await retained.events.save(event);
    await retained.applyInstallation({ directory: f.directory, token: 'old' });
    const reopened = new DataLocationManager(f.profile);
    await reopened.initialize();
    await reopened.applyInstallation({
      directory: f.directory,
      token: 'reinstall',
    });
    assert.equal((await reopened.events.load())[0].id, event.id);
    const conflictProfile = path.join(f.root, 'conflict');
    const conflict = new DataLocationManager(conflictProfile);
    await conflict.initialize();
    await conflict.events.save(
      createCalendarEvent(
        '另外的数据',
        '2026-10-19T02:00:00.000Z',
        '另一个记录',
      ),
    );
    const retainedBytes = await readFile(retained.events.filePath);
    await assert.rejects(
      conflict.applyInstallation({ directory: f.directory, token: 'conflict' }),
      /无法自动覆盖/,
    );
    assert.equal(conflict.location.directory, conflictProfile);
    assert.deepEqual(await readFile(retained.events.filePath), retainedBytes);
    const partial = path.join(f.root, 'partial');
    await mkdir(partial);
    await writeFile(path.join(partial, 'notes.json'), retainedBytes);
    await assert.rejects(
      conflict.applyInstallation({ directory: partial, token: 'partial' }),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
