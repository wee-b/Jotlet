import fs from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseJotletBackup } from '../../shared/backup.ts';
import type { JotletBackup } from '../../shared/backup.ts';

const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';
const samePath = (first: string, second: string) =>
  process.platform === 'win32'
    ? first.toLowerCase() === second.toLowerCase()
    : first === second;

// Resolve existing ancestors too, so reserved files are protected even before
// they exist and when their directory is reached through a junction or symlink.
async function canonicalPath(file: string): Promise<string> {
  try {
    return await fs.realpath(file);
  } catch (error) {
    if (!missing(error)) throw error;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    return path.join(await canonicalPath(parent), path.basename(file));
  }
}

async function assertExportTarget(
  output: string,
  protectedPaths: readonly string[],
) {
  let target: BigIntStats | undefined;
  try {
    target = await fs.lstat(output, { bigint: true });
  } catch (error) {
    if (!missing(error)) throw error;
  }
  if (target?.isSymbolicLink())
    throw new Error('导出目标不能是文件链接，请选择普通的 .jotlet 文件。');
  if (target && !target.isFile())
    throw new Error('请选择 .jotlet 备份文件的保存位置。');
  for (const file of protectedPaths) {
    if (samePath(await canonicalPath(path.resolve(file)), output))
      throw new Error('请选择其他导出位置，不能覆盖正在使用的数据文件。');
    if (!target) continue;
    try {
      const protectedFile = await fs.stat(file, { bigint: true });
      // Different filenames can still be hard links to the same file.
      if (
        target.ino !== 0n &&
        target.dev === protectedFile.dev &&
        target.ino === protectedFile.ino
      )
        throw new Error('请选择其他导出位置，不能覆盖正在使用的数据文件。');
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }
}

export async function readBackupFile(filePath: string) {
  if (path.extname(filePath).toLowerCase() !== '.jotlet')
    throw new Error('仅支持导入 .jotlet 完整备份文件。');
  if (!(await fs.stat(filePath)).isFile())
    throw new Error('请选择 .jotlet 备份文件。');
  return parseJotletBackup(await fs.readFile(filePath, 'utf8'));
}

export async function writeBackupFile(
  filePath: string,
  backup: JotletBackup,
  protectedPaths: readonly string[],
): Promise<string> {
  if (path.extname(filePath).toLowerCase() !== '.jotlet')
    throw new Error('仅支持导出 .jotlet 完整备份文件。');
  const requested = path.resolve(filePath);
  // Use the resolved parent for the entire operation, rather than following a
  // directory alias again when committing the finished backup.
  const directory = await fs.realpath(path.dirname(requested));
  const output = path.join(directory, path.basename(requested));
  await assertExportTarget(output, protectedPaths);
  const temporary = path.join(directory, `.jotlet-export-${randomUUID()}.tmp`);
  let created = false;
  try {
    const file = await fs.open(temporary, 'wx', 0o600);
    created = true;
    try {
      await file.writeFile(JSON.stringify(backup, null, 2), 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await assertExportTarget(output, protectedPaths);
    // Replace only after every byte has been flushed. Never unlink or truncate
    // the previous backup when writing or replacing it fails.
    await fs.rename(temporary, output);
    created = false;
    return output;
  } finally {
    if (created) await fs.unlink(temporary).catch(() => {});
  }
}
