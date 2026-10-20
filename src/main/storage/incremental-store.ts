import {
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';
const compactAfterBytes = 4 * 1024 * 1024;

interface Snapshot<T> {
  records: T[];
  migrationBackup?: string;
}

// A newline commits one transaction. Snapshot sequence numbers make replay safe
// even if the process stops between replacing a snapshot and clearing its log.
export class IncrementalStore<T extends { id: string }> {
  readonly filePath: string;
  readonly journalPath: string;
  protected records = new Map<string, T>();
  private parseSnapshot: (text: string) => Snapshot<T>;
  private makeSnapshot: (records: T[]) => object;
  private parseRecord: (value: unknown) => T;
  private ready: Promise<void> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private sequence = 0;
  private journalBytes = 0;
  private snapshotBytes = 0;
  private hasSnapshot = false;
  private migrationBackup: string | undefined;
  private writeError: unknown;

  constructor(
    filePath: string,
    parseSnapshot: (text: string) => Snapshot<T>,
    makeSnapshot: (records: T[]) => object,
    parseRecord: (value: unknown) => T,
  ) {
    this.filePath = filePath;
    this.journalPath = `${filePath}.journal`;
    this.parseSnapshot = parseSnapshot;
    this.makeSnapshot = makeSnapshot;
    this.parseRecord = parseRecord;
  }

  private initialize(): Promise<void> {
    this.ready ??= this.read().catch((error) => {
      throw new Error(
        `本地数据读取失败，原文件已保留。请检查 ${this.filePath} 和 ${this.journalPath}。`,
        { cause: error },
      );
    });
    return this.ready;
  }

  private async read() {
    try {
      const text = await readFile(this.filePath, 'utf8');
      const snapshot = this.parseSnapshot(text);
      const sequence =
        JSON.parse(text.replace(/^\uFEFF/, '')).journalSequence ?? 0;
      if (!Number.isSafeInteger(sequence) || sequence < 0)
        throw new Error('快照序号无效。');
      this.sequence = sequence;
      this.records = new Map(
        snapshot.records.map((record) => [record.id, record]),
      );
      this.migrationBackup = snapshot.migrationBackup;
      this.snapshotBytes = Buffer.byteLength(text);
      this.hasSnapshot = true;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    let journal: Buffer;
    try {
      journal = await readFile(this.journalPath);
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    if (!this.hasSnapshot) throw new Error('增量日志缺少对应的快照。');
    const checkpoint = this.sequence;
    let previous = 0;
    let offset = 0;
    while (offset < journal.length) {
      const end = journal.indexOf(10, offset);
      // An interrupted final append is uncommitted; preserve it until the next write.
      if (end === -1) break;
      const transaction = JSON.parse(
        journal.subarray(offset, end).toString('utf8'),
      );
      if (
        transaction?.version !== 1 ||
        !Number.isSafeInteger(transaction.sequence) ||
        transaction.sequence <= previous ||
        (previous > 0 && transaction.sequence !== previous + 1) ||
        !Array.isArray(transaction.upserts) ||
        !Array.isArray(transaction.removed) ||
        !transaction.removed.every(
          (id: unknown) => typeof id === 'string' && id.trim(),
        )
      )
        throw new Error('增量日志格式或序号无效。');
      const upserts: T[] = transaction.upserts.map(this.parseRecord);
      previous = transaction.sequence;
      if (transaction.sequence > checkpoint) {
        if (transaction.sequence !== this.sequence + 1)
          throw new Error('增量日志不完整。');
        this.apply(upserts, transaction.removed);
        this.sequence = transaction.sequence;
      }
      offset = end + 1;
    }
    this.journalBytes = offset;
  }

  protected change<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.queue.then(async () => {
      await this.initialize();
      if (this.writeError) throw this.writeError;
      return operation();
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async load(): Promise<T[]> {
    await this.queue;
    await this.initialize();
    return structuredClone([...this.records.values()]);
  }

  private apply(upserts: T[], removed: string[]) {
    for (const id of removed) this.records.delete(id);
    for (const record of upserts) {
      this.records.delete(record.id);
      this.records.set(record.id, record);
    }
  }

  private async checkpoint() {
    const text = JSON.stringify({
      ...this.makeSnapshot([...this.records.values()]),
      journalSequence: this.sequence,
    });
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(`${this.filePath}.tmp`, text, {
      encoding: 'utf8',
      flush: true,
    });
    if (this.migrationBackup) {
      try {
        await copyFile(
          this.filePath,
          this.migrationBackup,
          constants.COPYFILE_EXCL,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    await rename(`${this.filePath}.tmp`, this.filePath);
    this.hasSnapshot = true;
    this.migrationBackup = undefined;
    this.snapshotBytes = Buffer.byteLength(text);
    // Both replacements are atomic. Old transactions are harmless after a crash
    // because they are already included in the snapshot's journalSequence.
    await writeFile(`${this.journalPath}.tmp`, '', { flush: true });
    await rename(`${this.journalPath}.tmp`, this.journalPath);
    this.journalBytes = 0;
  }

  protected async commit(upserts: T[], removed: string[] = []) {
    if (!upserts.length && !removed.length) return;
    if (
      !this.hasSnapshot ||
      this.migrationBackup ||
      (this.journalBytes >= compactAfterBytes &&
        this.journalBytes >= this.snapshotBytes)
    )
      await this.checkpoint();
    const sequence = this.sequence + 1;
    if (!Number.isSafeInteger(sequence))
      throw new Error('增量日志序号已超出范围。');
    const bytes = Buffer.from(
      JSON.stringify({ version: 1, sequence, upserts, removed }) + '\n',
    );
    // Windows append-only handles cannot truncate a torn transaction on recovery.
    const file = await open(
      this.journalPath,
      constants.O_RDWR | constants.O_CREAT,
    );
    let changed = false;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size < this.journalBytes)
        throw new Error('增量日志已被外部修改，请检查数据文件。');
      // Remove only the incomplete tail discovered during startup or a failed append.
      await file.truncate(this.journalBytes);
      changed = true;
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesWritten } = await file.write(
          bytes,
          offset,
          bytes.length - offset,
          this.journalBytes + offset,
        );
        if (!bytesWritten) throw new Error('增量日志写入未完成。');
        offset += bytesWritten;
      }
      await file.sync();
    } catch (error) {
      if (changed) {
        try {
          await file.truncate(this.journalBytes);
          await file.sync();
        } catch (rollbackError) {
          this.writeError = new Error(
            '增量写入恢复失败，请重启应用后检查数据文件。',
            { cause: rollbackError },
          );
        }
      }
      throw error;
    } finally {
      await file.close();
    }
    this.journalBytes += bytes.length;
    this.sequence = sequence;
    this.apply(upserts, removed);
  }
}
