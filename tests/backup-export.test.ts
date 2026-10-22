import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readBackupFile,
  writeBackupFile,
} from '../src/main/storage/backup-file.ts';
import { createCalendarEvent } from '../src/shared/events.ts';
import { makeJotletBackup } from '../src/shared/backup.ts';

const backup = makeJotletBackup(
  [createCalendarEvent('完整备份 🌿', '2026-10-22T01:00:00.000Z', '记录内容')],
  [],
);
async function fixture() {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'jotlet-export-'));
  return {
    directory,
    output: path.join(directory, 'backup.jotlet'),
    dispose: () => fs.rm(directory, { recursive: true, force: true }),
  };
}
const assertNoTemporary = async (directory: string) =>
  assert.equal(
    (await fs.readdir(directory)).some((file) =>
      file.startsWith('.jotlet-export-'),
    ),
    false,
  );

test('exports a complete .jotlet backup and atomically replaces an existing backup', async () => {
  const f = await fixture();
  try {
    const previous = JSON.stringify(makeJotletBackup([], []));
    await fs.writeFile(f.output, previous);
    const retained = path.join(f.directory, 'retained.jotlet');
    await fs.link(f.output, retained);
    assert.equal(await writeBackupFile(f.output, backup, []), f.output);
    assert.deepEqual(await readBackupFile(f.output), backup);
    // The old inode still has its original bytes: the destination was replaced,
    // rather than opened with truncation (also works with Windows file locking).
    assert.equal(await fs.readFile(retained, 'utf8'), previous);
    await assertNoTemporary(f.directory);
  } finally {
    await f.dispose();
  }
});

test('a partial write failure preserves the previous backup byte for byte and removes temporary files', async (t) => {
  const f = await fixture();
  try {
    const previous = JSON.stringify(makeJotletBackup([], []));
    await fs.writeFile(f.output, previous);
    const originalOpen = fs.open;
    const mocked = t.mock.method(
      fs,
      'open',
      async (...args: Parameters<typeof fs.open>) => {
        const file = await originalOpen(...args);
        const originalWrite = file.writeFile.bind(file);
        t.mock.method(file, 'writeFile', async (content: string) => {
          await originalWrite(content.slice(0, 25), 'utf8');
          throw Object.assign(new Error('simulated disk full'), {
            code: 'ENOSPC',
          });
        });
        return file;
      },
    );
    await assert.rejects(
      writeBackupFile(f.output, backup, []),
      /simulated disk full/,
    );
    mocked.mock.restore();
    assert.equal(await fs.readFile(f.output, 'utf8'), previous);
    assert.deepEqual(await readBackupFile(f.output), JSON.parse(previous));
    await assertNoTemporary(f.directory);
    await writeBackupFile(f.output, backup, []);
    assert.deepEqual(await readBackupFile(f.output), backup);
  } finally {
    await f.dispose();
  }
});

test('flush and rename failures preserve the previous backup and clean up temporary files', async (t) => {
  const f = await fixture();
  try {
    const previous = JSON.stringify(makeJotletBackup([], []));
    await fs.writeFile(f.output, previous);
    const originalOpen = fs.open;
    const openMock = t.mock.method(
      fs,
      'open',
      async (...args: Parameters<typeof fs.open>) => {
        const file = await originalOpen(...args);
        t.mock.method(file, 'sync', async () => {
          throw new Error('simulated flush failure');
        });
        return file;
      },
    );
    await assert.rejects(
      writeBackupFile(f.output, backup, []),
      /flush failure/,
    );
    openMock.mock.restore();
    assert.equal(await fs.readFile(f.output, 'utf8'), previous);
    await assertNoTemporary(f.directory);
    const renameMock = t.mock.method(fs, 'rename', async () => {
      throw Object.assign(new Error('simulated replacement failure'), {
        code: 'EPERM',
      });
    });
    await assert.rejects(
      writeBackupFile(f.output, backup, []),
      /replacement failure/,
    );
    renameMock.mock.restore();
    assert.equal(await fs.readFile(f.output, 'utf8'), previous);
    await assertNoTemporary(f.directory);
  } finally {
    await f.dispose();
  }
});

test('a failed export to a new file leaves no partial backup behind', async (t) => {
  const f = await fixture();
  try {
    t.mock.method(fs, 'rename', async () => {
      throw new Error('cannot replace destination');
    });
    await assert.rejects(
      writeBackupFile(f.output, backup, []),
      /cannot replace/,
    );
    assert.deepEqual(await fs.readdir(f.directory), []);
  } finally {
    await f.dispose();
  }
});

test('directory aliases cannot bypass protection for existing or not-yet-created reserved files', async () => {
  const f = await fixture();
  try {
    const data = path.join(f.directory, 'data');
    const alias = path.join(f.directory, 'alias');
    await fs.mkdir(data);
    await fs.symlink(
      data,
      alias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const protectedFile = path.join(data, 'active.jotlet');
    await fs.writeFile(protectedFile, 'protected bytes');
    await assert.rejects(
      writeBackupFile(path.join(alias, 'active.jotlet'), backup, [
        protectedFile,
      ]),
      /不能覆盖/,
    );
    const reserved = path.join(data, 'future.jotlet');
    await assert.rejects(
      writeBackupFile(path.join(alias, 'future.jotlet'), backup, [reserved]),
      /不能覆盖/,
    );
    assert.equal(await fs.readFile(protectedFile, 'utf8'), 'protected bytes');
    assert.deepEqual(await fs.readdir(data), ['active.jotlet']);
    const output = await writeBackupFile(
      path.join(alias, 'allowed.jotlet'),
      backup,
      [protectedFile],
    );
    assert.equal(output, path.join(await fs.realpath(data), 'allowed.jotlet'));
    assert.deepEqual(await readBackupFile(output), backup);
  } finally {
    await f.dispose();
  }
});

test('hard links with a .jotlet extension cannot overwrite protected JSON data', async () => {
  const f = await fixture();
  try {
    const protectedFile = path.join(f.directory, 'notes.json');
    await fs.writeFile(protectedFile, 'protected data');
    await fs.link(protectedFile, f.output);
    await assert.rejects(
      writeBackupFile(f.output, backup, [protectedFile]),
      /不能覆盖/,
    );
    assert.equal(await fs.readFile(protectedFile, 'utf8'), 'protected data');
    assert.equal(await fs.readFile(f.output, 'utf8'), 'protected data');
    await assertNoTemporary(f.directory);
  } finally {
    await f.dispose();
  }
});

test('a .jotlet target that is itself a symbolic link is rejected', async () => {
  const f = await fixture();
  try {
    const linkedDirectory = path.join(f.directory, 'linked');
    await fs.mkdir(linkedDirectory);
    await fs.symlink(
      linkedDirectory,
      f.output,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(writeBackupFile(f.output, backup, []), /文件链接/);
    assert.deepEqual(await fs.readdir(linkedDirectory), []);
    assert.ok((await fs.lstat(f.output)).isSymbolicLink());
    await assertNoTemporary(f.directory);
  } finally {
    await f.dispose();
  }
});

test('a destination replaced with a protected hard link during export is checked again before commit', async (t) => {
  const f = await fixture();
  try {
    const protectedFile = path.join(f.directory, 'calendar.json');
    await fs.writeFile(protectedFile, 'protected calendar');
    const originalOpen = fs.open;
    t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
      const file = await originalOpen(...args);
      const originalSync = file.sync.bind(file);
      t.mock.method(file, 'sync', async () => {
        await originalSync();
        await fs.link(protectedFile, f.output);
      });
      return file;
    });
    await assert.rejects(
      writeBackupFile(f.output, backup, [protectedFile]),
      /不能覆盖/,
    );
    assert.equal(
      await fs.readFile(protectedFile, 'utf8'),
      'protected calendar',
    );
    assert.equal(await fs.readFile(f.output, 'utf8'), 'protected calendar');
    await assertNoTemporary(f.directory);
  } finally {
    await f.dispose();
  }
});

test('only .jotlet file extensions can be exported, including uppercase .JOTLET', async () => {
  const f = await fixture();
  try {
    for (const filename of [
      'backup.json',
      'backup.md',
      'backup.txt',
      'backup.jetlet',
      'backup',
      'backup.jotlet.json',
    ]) {
      const output = path.join(f.directory, filename);
      await assert.rejects(writeBackupFile(output, backup, []), /仅支持导出/);
      await assert.rejects(fs.access(output));
    }
    const output = path.join(f.directory, 'backup.JOTLET');
    await writeBackupFile(output, backup, []);
    assert.deepEqual(await readBackupFile(output), backup);
    await assertNoTemporary(f.directory);
  } finally {
    await f.dispose();
  }
});
