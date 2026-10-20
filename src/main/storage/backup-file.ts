import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseJotletBackup } from '../../shared/backup.ts';

export async function readBackupFile(filePath: string) {
  if (path.extname(filePath).toLowerCase() !== '.jotlet')
    throw new Error('仅支持导入 .jotlet 完整备份文件。');
  if (!(await stat(filePath)).isFile())
    throw new Error('请选择 .jotlet 备份文件。');
  return parseJotletBackup(await readFile(filePath, 'utf8'));
}
