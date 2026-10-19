import { MakerBase } from '@electron-forge/maker-base';
import type { MakerOptions } from '@electron-forge/maker-base';
import type { ForgePlatform } from '@electron-forge/shared-types';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);
const compilerUrl =
  'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis%402.0.1/nsis-bundle-3.12.tar.gz';
const compilerHash =
  'fe36a357f3a220db893498e830fd80e0769768a18a99f4e4d2447b982538feed';
const escape = (text: string) =>
  text.replaceAll('$', '$$').replaceAll('"', '$\\"');

async function compiler(root: string) {
  const cache = path.join(root, '.cache', 'nsis-3.12');
  const archive = path.join(cache, 'nsis.tar.gz');
  const binary = path.join(cache, 'nsis-bundle', 'windows', 'makensis.exe');
  await mkdir(cache, { recursive: true });
  let data: Buffer;
  try {
    data = await readFile(archive);
  } catch {
    const response = await fetch(compilerUrl);
    if (!response.ok)
      throw new Error(`NSIS download failed: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(data).digest('hex') !== compilerHash)
    throw new Error('NSIS compiler checksum mismatch.');
  await writeFile(archive, data);
  try {
    await access(binary);
  } catch {
    await execute('tar', ['-xzf', archive, '-C', cache]);
  }
  return binary;
}

export async function buildInstaller(options: {
  root: string;
  dir: string;
  output: string;
  version: string;
  testId?: string;
}) {
  const { root, dir, output, version, testId } = options;
  const nsis = await compiler(root);
  const work = path.join(root, '.cache', 'installer', testId ?? 'production');
  await mkdir(work, { recursive: true });
  await mkdir(path.dirname(output), { recursive: true });
  const files: string[] = [];
  const directories: string[] = [];
  async function walk(relative = '') {
    for (const entry of await readdir(path.join(dir, relative), {
      withFileTypes: true,
    })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        directories.push(name);
        await walk(name);
      } else if (entry.isFile()) files.push(name);
      else throw new Error(`Unexpected payload entry: ${name}`);
    }
  }
  await walk();
  // Never recursively remove the installation directory: only delete our payload.
  const manifest = path.join(work, 'uninstall-payload.nsh');
  await writeFile(
    manifest,
    [
      ...files.map((name) => `Delete /REBOOTOK "$INSTDIR\\${escape(name)}"`),
      ...directories
        .reverse()
        .map((name) => `RMDir /REBOOTOK "$INSTDIR\\${escape(name)}"`),
    ].join('\n'),
  );
  const args = [
    '/V2',
    '/INPUTCHARSET',
    'UTF8',
    `/DAPP_VERSION=${version}`,
    `/DPAYLOAD_DIR=${dir}`,
    `/DOUTPUT_FILE=${output}`,
    `/DICON_FILE=${path.join(root, 'assets', 'jotlet.ico')}`,
    `/DPROJECT_LICENSE=${path.join(root, 'LICENSE')}`,
    `/DUNINSTALL_MANIFEST=${manifest}`,
  ];
  if (testId) args.push(`/DTEST_ID=${testId}`);
  args.push(path.join(root, 'installer', 'jotlet.nsi'));
  try {
    await execute(nsis, args, {
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NSISDIR: path.dirname(nsis) },
    });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(
      `${failure.message}\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`,
    );
  }
  return output;
}

export class MakerNsis extends MakerBase<Record<string, never>> {
  name = 'nsis';
  defaultPlatforms: ForgePlatform[] = ['win32'];
  isSupportedOnCurrentPlatform() {
    return process.platform === 'win32';
  }
  async make({ dir, makeDir, packageJSON, targetArch }: MakerOptions) {
    if (targetArch !== 'x64')
      throw new Error('Jotlet installer currently supports Windows x64.');
    const output = path.join(
      makeDir,
      'nsis',
      targetArch,
      `Jotlet-${packageJSON.version}-Setup.exe`,
    );
    return [
      await buildInstaller({
        root: process.cwd(),
        dir,
        output,
        version: packageJSON.version,
      }),
    ];
  }
}
