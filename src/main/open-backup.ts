import path from 'node:path';

export function backupFromArguments(
  argv: string[],
  workingDirectory: string,
): string | undefined {
  // Ignore the executable and Chromium/Electron switches; only an explicit
  // local .jotlet argument can enter the import confirmation flow.
  const candidate = argv
    .slice(1)
    .find(
      (arg) =>
        !arg.startsWith('-') && path.extname(arg).toLowerCase() === '.jotlet',
    );
  return candidate ? path.resolve(workingDirectory, candidate) : undefined;
}
