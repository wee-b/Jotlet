import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface InstallationData {
  directory: string;
  token: string;
}

export async function writeInstallationHint(file: string, directory: string) {
  await writeFile(
    `${file}.tmp`,
    `\uFEFF[Jotlet]\r\nDataDirectory=${directory}\r\n`,
    { encoding: 'utf16le', flush: true },
  );
  await rename(`${file}.tmp`, file);
}

// NSIS WriteINIStr creates UTF-16LE files on Windows; keep non-ASCII paths intact.
export async function readInstallation(
  file: string,
): Promise<InstallationData | null> {
  let buffer: Buffer;
  try {
    buffer = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (buffer.length > 64 * 1024) throw new Error('安装数据位置配置过大。');
  const text = (
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.toString('utf16le')
      : buffer.toString('utf8')
  ).replace(/^\uFEFF/, '');
  const values = new Map<string, string>();
  let inSection = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('[')) {
      inSection = line.toLowerCase() === '[jotlet]';
      continue;
    }
    const equal = line.indexOf('=');
    if (inSection && equal > 0)
      values.set(
        line.slice(0, equal).trim().toLowerCase(),
        line.slice(equal + 1).trim(),
      );
  }
  const directory = values.get('datadirectory') ?? '';
  const token = values.get('token') ?? '';
  if (
    values.get('version') !== '1' ||
    !path.isAbsolute(directory) ||
    !token ||
    token.length > 200
  )
    throw new Error('安装时指定的数据保存位置无效。');
  const installDirectory = path.dirname(file);
  const within = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return (
      relative === '' ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== '..' &&
        !path.isAbsolute(relative))
    );
  };
  if (
    within(installDirectory, directory) ||
    within(directory, installDirectory)
  )
    throw new Error('程序安装目录与数据保存目录不能互相包含。');
  return { directory, token };
}
