import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildInstaller } from '../build/maker-nsis.mts';
import { readInstallation } from '../src/main/storage/installation.ts';

// The fixture uses a private registry key and creates no desktop/start-menu links.
const execute = promisify(execFile);
const root = process.cwd();
const testRoot = await mkdtemp(path.join(tmpdir(), 'jotlet-installer-test-'));
const id = randomUUID();
const payload = path.join(testRoot, 'payload');
const program = path.join(testRoot, '安装程序 空格');
const data = path.join(testRoot, '数据目录 空格');
const output = path.join(testRoot, 'Setup.exe');
const associationKey = `HKCU\\Software\\JotletAssociationTests\\${id}`;
const registry = (...args: string[]) =>
  execute('reg.exe', [...args, '/reg:64'], { windowsHide: true });
const queryAssociation = async (suffix: string, value?: string) => {
  const { stdout } = await execute(
    'reg.exe',
    [
      'query',
      `${associationKey}\\${suffix}`,
      ...(value ? ['/v', value] : ['/ve']),
      '/reg:64',
    ],
    { windowsHide: true, encoding: 'buffer' },
  );
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  } catch {
    return new TextDecoder('gb18030').decode(stdout);
  }
};
await registry(
  'add',
  `${associationKey}\\.jotlet`,
  '/ve',
  '/t',
  'REG_SZ',
  '/d',
  'Other.Backup',
  '/f',
);
await registry(
  'add',
  `${associationKey}\\.jotlet\\OpenWithProgids`,
  '/v',
  'Other.Backup',
  '/t',
  'REG_SZ',
  '/d',
  '',
  '/f',
);
await mkdir(path.join(payload, 'resources'), { recursive: true });
await writeFile(path.join(payload, 'jotlet.exe'), 'isolated test fixture');
await writeFile(path.join(payload, 'resources', '中文.txt'), 'payload');
await buildInstaller({
  root,
  dir: payload,
  output,
  version: '1.0.0',
  testId: id,
});
const runSetup = (installPath: string, dataPath: string) =>
  execute(output, ['/S', `/DATADIR="${dataPath}"`, `/D=${installPath}`], {
    windowsVerbatimArguments: true,
    timeout: 30_000,
    windowsHide: true,
  });
// Directory and registry operations here are confined to the freshly created fixture.
await mkdir(program);
await runSetup(program, data);
assert.ok((await queryAssociation('.jotlet')).includes('Jotlet.Backup'));
assert.ok(
  (await queryAssociation('Jotlet.Backup\\shell\\open\\command')).includes(
    `"${program}\\jotlet.exe" "%1"`,
  ),
);
assert.ok(
  (await queryAssociation('Jotlet.Backup\\DefaultIcon')).includes(
    `"${program}\\jotlet.exe",0`,
  ),
);
assert.equal(
  await readFile(path.join(program, 'jotlet.exe'), 'utf8'),
  'isolated test fixture',
);
const installation = await readInstallation(
  path.join(program, 'jotlet-install.ini'),
);
assert.equal(installation?.directory, data);
await access(path.join(program, 'Uninstall.exe'));
await writeFile(path.join(data, 'notes.json'), 'retained user data');
await writeFile(
  path.join(program, 'personal-file.txt'),
  'not distributed by installer',
);
// Reinstall in place and move the program later without touching retained data.
await runSetup(program, data);
const movedProgram = path.join(testRoot, '新的程序目录');
await runSetup(movedProgram, data);
assert.ok(
  (await queryAssociation('Jotlet.Backup\\shell\\open\\command')).includes(
    `"${movedProgram}\\jotlet.exe" "%1"`,
  ),
);
await access(path.join(movedProgram, 'jotlet.exe'));
await assert.rejects(access(path.join(program, 'jotlet.exe')));
assert.equal(
  (await readInstallation(path.join(movedProgram, 'jotlet-install.ini')))
    ?.directory,
  data,
);
await execute(output, ['/S', '/MODE=uninstall'], {
  windowsHide: true,
  timeout: 30_000,
});
assert.ok((await queryAssociation('.jotlet')).includes('Other.Backup'));
assert.ok(
  (await queryAssociation('.jotlet\\OpenWithProgids', 'Other.Backup')).includes(
    'Other.Backup',
  ),
);
await assert.rejects(queryAssociation('Jotlet.Backup'));
await assert.rejects(
  queryAssociation('.jotlet\\OpenWithProgids', 'Jotlet.Backup'),
);
assert.equal(
  await readFile(path.join(data, 'notes.json'), 'utf8'),
  'retained user data',
);
assert.equal(
  await readFile(path.join(program, 'personal-file.txt'), 'utf8'),
  'not distributed by installer',
);
await assert.rejects(access(path.join(program, 'jotlet.exe')));
await assert.rejects(access(path.join(movedProgram, 'jotlet.exe')));
await assert.rejects(access(path.join(program, 'resources', '中文.txt')));
await assert.rejects(
  execute(
    'reg.exe',
    ['query', `HKCU\\Software\\JotletInstallerTests\\${id}`, '/reg:64'],
    { windowsHide: true },
  ),
);
const unrelated = path.join(testRoot, 'unrelated');
await mkdir(unrelated);
await writeFile(path.join(unrelated, 'keep.txt'), 'preserve');
await assert.rejects(runSetup(unrelated, data));
assert.equal(
  await readFile(path.join(unrelated, 'keep.txt'), 'utf8'),
  'preserve',
);
await assert.rejects(
  runSetup(
    path.join(testRoot, 'overlap'),
    path.join(testRoot, 'overlap', 'data'),
  ),
);
// If the user changes the default after installation, uninstall preserves it.
const associationProgram = path.join(testRoot, 'association-program');
await runSetup(associationProgram, data);
await registry(
  'add',
  `${associationKey}\\.jotlet`,
  '/ve',
  '/t',
  'REG_SZ',
  '/d',
  'Other.AfterInstall',
  '/f',
);
await execute(output, ['/S', '/MODE=uninstall'], {
  windowsHide: true,
  timeout: 30_000,
});
assert.ok((await queryAssociation('.jotlet')).includes('Other.AfterInstall'));
await assert.rejects(queryAssociation('Jotlet.Backup'));
await registry('delete', associationKey, '/f');
console.log(
  `PASS: installation/uninstallation; file association, quoted commands and icons; previous/user-changed defaults; Unicode paths; selected data directory; data retention; unrelated files and overlapping directory protection. Fixture: ${testRoot}`,
);
