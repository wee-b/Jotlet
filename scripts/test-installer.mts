import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildInstaller } from '../maker-nsis.mts';
import { readInstallation } from '../src/installation.ts';

// The fixture uses a private registry key and creates no desktop/start-menu links.
const execute = promisify(execFile);
const root = process.cwd();
const testRoot = await mkdtemp(path.join(tmpdir(), 'jotlet-installer-test-'));
const id = randomUUID();
const payload = path.join(testRoot, 'payload');
const program = path.join(testRoot, '安装程序 空格');
const data = path.join(testRoot, '数据目录 空格');
const output = path.join(testRoot, 'Setup.exe');
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
console.log(
  `PASS: installation/uninstallation; Unicode paths; selected data directory; data retention; unrelated files and overlapping directory protection. Fixture: ${testRoot}`,
);
