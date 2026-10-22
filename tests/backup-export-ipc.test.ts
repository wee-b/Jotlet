import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { DataLocationManager } from '../src/main/storage/data-location.ts';
import { BackupImport } from '../src/main/storage/backup-import.ts';
import {
  readBackupFile,
  writeBackupFile,
} from '../src/main/storage/backup-file.ts';
import { createCalendarEvent, parseEvent } from '../src/shared/events.ts';
import { parseSchedule } from '../src/shared/schedules.ts';
import { makeJotletBackup } from '../src/shared/backup.ts';
import type { Result } from '../src/shared/api.ts';

// Exercise the real IPC handlers with native file dialogs replaced by a test
// double. No Electron window, installed application, or user data is touched.
const source = await fs.readFile(
  new URL('../src/main/ipc.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
async function fixture(outputName = 'backup.jotlet') {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'jotlet-export-ipc-'));
  const manager = new DataLocationManager(path.join(directory, 'data'));
  await manager.initialize();
  const event = await manager.events.save(
    createCalendarEvent('IPC 备份', '2026-10-22T01:00:00.000Z', '备份记录'),
  );
  await manager.schedules.save({
    id: 'schedule',
    title: '关联日程',
    start: event.startedAt,
    end: '2026-10-22T02:00:00.000Z',
    allDay: false,
    color: 'sage',
    eventId: event.id,
    description: '描述',
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  });
  const handlers = new Map<string, Function>();
  const dialogs: {
    options: { filters: { extensions: string[] }[]; defaultPath: string };
  }[] = [];
  const selected = {
    canceled: false,
    filePath: path.join(directory, outputName),
  };
  const contents = { mainFrame: {} };
  const window = { webContents: contents };
  const imports: Record<string, unknown> = {
    electron: {
      ipcMain: {
        handle: (channel: string, handler: Function) =>
          handlers.set(channel, handler),
      },
      dialog: {
        showSaveDialog: async (
          _window: unknown,
          options: (typeof dialogs)[number]['options'],
        ) => {
          dialogs.push({ options: structuredClone(options) });
          return selected;
        },
      },
    },
    'node:path': path,
    '../shared/events': { parseEvent },
    '../shared/schedules': { parseSchedule },
    '../shared/backup': { makeJotletBackup },
    './storage/backup-import': { BackupImport },
    './storage/backup-file': { writeBackupFile },
  };
  const module = { exports: {} as { registerHandlers: Function } };
  vm.runInNewContext(
    `(function(require,module,exports){${compiled}\n})`,
    { setImmediate, Error },
    { filename: 'ipc.ts' },
  )(
    (name: string) => {
      assert.ok(name in imports, `Unexpected module: ${name}`);
      return imports[name];
    },
    module,
    module.exports,
  );
  module.exports.registerHandlers(
    () => window,
    manager,
    async () => {},
    () => {},
  );
  return {
    directory,
    manager,
    selected,
    dialogs,
    invoke: async (...args: unknown[]): Promise<Result<string | null>> =>
      structuredClone(
        await handlers.get('events:export')!(
          { sender: contents, senderFrame: contents.mainFrame },
          ...args,
        ),
      ),
    dispose: () => fs.rm(directory, { recursive: true, force: true }),
  };
}

test('IPC exports only a complete .jotlet backup containing the current events and calendar', async () => {
  const f = await fixture();
  try {
    const result = await f.invoke();
    assert.equal(result.ok, true);
    assert.deepEqual(
      (await readBackupFile(f.selected.filePath)).events,
      await f.manager.events.load(),
    );
    assert.deepEqual(
      (await readBackupFile(f.selected.filePath)).schedules,
      await f.manager.schedules.load(),
    );
    assert.deepEqual(f.dialogs[0].options.filters, [
      { name: 'Jotlet 专属备份', extensions: ['jotlet'] },
    ]);
    assert.ok(f.dialogs[0].options.defaultPath.endsWith('.jotlet'));
  } finally {
    await f.dispose();
  }
});

test('IPC rejects legacy export formats and non-.jotlet destinations without changing existing files', async () => {
  const f = await fixture('backup.json');
  try {
    await fs.writeFile(f.selected.filePath, 'existing bytes');
    for (const format of ['json', 'markdown', 'txt']) {
      const result = await f.invoke(format);
      assert.equal(result.ok, false);
      assert.equal(f.dialogs.length, 0);
    }
    const result = await f.invoke();
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /仅支持导出/);
    assert.equal(
      await fs.readFile(f.selected.filePath, 'utf8'),
      'existing bytes',
    );
  } finally {
    await f.dispose();
  }
});

test('IPC blocks a .jotlet hard link to the active calendar journal, including through a directory junction', async () => {
  const f = await fixture();
  try {
    const original = await fs.readFile(f.manager.schedules.journalPath);
    await fs.link(f.manager.schedules.journalPath, f.selected.filePath);
    const alias = path.join(f.directory, 'alias');
    await fs.symlink(
      f.directory,
      alias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    f.selected.filePath = path.join(alias, 'backup.jotlet');
    const result = await f.invoke();
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /不能覆盖/);
    assert.deepEqual(
      await fs.readFile(f.manager.schedules.journalPath),
      original,
    );
    const restart = new DataLocationManager(path.join(f.directory, 'data'));
    await restart.initialize();
    assert.deepEqual(
      await restart.schedules.load(),
      await f.manager.schedules.load(),
    );
  } finally {
    await f.dispose();
  }
});

test('canceling the export dialog creates no backup and leaves the data intact', async () => {
  const f = await fixture();
  try {
    f.selected.canceled = true;
    assert.deepEqual(await f.invoke(), { ok: true, data: null });
    await assert.rejects(fs.access(f.selected.filePath));
    assert.equal((await f.manager.events.load()).length, 1);
  } finally {
    await f.dispose();
  }
});
