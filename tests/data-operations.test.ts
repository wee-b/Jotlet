import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataOperations, guardDataClose } from '../src/main/data-operations.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture() {
  const operations = new DataOperations();
  const errors: unknown[] = [];
  let listener: (event: { preventDefault(): void }) => void;
  const window = {
    closed: false,
    on(_event: 'close', handler: typeof listener) {
      listener = handler;
    },
    isDestroyed() {
      return this.closed;
    },
    close() {
      let prevented = false;
      listener({
        preventDefault() {
          prevented = true;
        },
      });
      if (!prevented) this.closed = true;
    },
  };
  guardDataClose(window, operations, (error) => errors.push(error));
  return { operations, errors, window };
}

test('window close waits for an in-flight calendar write and all queued data operations', async () => {
  const f = fixture();
  const calendar = deferred();
  const event = deferred();
  const saved: string[] = [];
  const first = f.operations.run(async () => {
    await calendar.promise;
    saved.push('calendar');
  });
  const second = f.operations.run(async () => {
    await event.promise;
    saved.push('event');
  });
  await tick();
  f.window.close();
  f.window.close();
  assert.equal(f.window.closed, false);
  calendar.resolve();
  await first;
  await tick();
  assert.deepEqual(saved, ['calendar']);
  assert.equal(f.window.closed, false);
  event.resolve();
  await second;
  await tick();
  assert.deepEqual(saved, ['calendar', 'event']);
  assert.equal(f.window.closed, true);
  assert.deepEqual(f.errors, []);
});

test('operations arriving while closing are also drained', async () => {
  const f = fixture();
  const first = deferred();
  const later = deferred();
  const a = f.operations.run(() => first.promise);
  f.window.close();
  const b = f.operations.run(() => later.promise);
  first.resolve();
  await a;
  await tick();
  assert.equal(f.window.closed, false);
  later.resolve();
  await b;
  await tick();
  assert.equal(f.window.closed, true);
});

test('a failed write keeps the window open, drains later writes and allows a successful retry', async () => {
  const f = fixture();
  const gate = deferred();
  const failure = new Error('disk full');
  const failed = f.operations.run(async () => {
    await gate.promise;
    throw failure;
  });
  const rejected = assert.rejects(failed, /disk full/);
  const later = deferred();
  const queued = f.operations.run(() => later.promise);
  f.window.close();
  gate.resolve();
  await rejected;
  await tick();
  assert.equal(f.window.closed, false);
  later.resolve();
  await queued;
  await tick();
  assert.equal(f.window.closed, false);
  assert.deepEqual(f.errors, [failure]);
  const retry = deferred();
  const saved = f.operations.run(() => retry.promise);
  f.window.close();
  retry.resolve();
  await saved;
  await tick();
  assert.equal(f.window.closed, true);
});

test('idle windows close immediately and destroyed windows are never closed again', async () => {
  const f = fixture();
  f.window.close();
  assert.equal(f.window.closed, true);
  const active = fixture();
  const gate = deferred();
  const operation = active.operations.run(() => gate.promise);
  active.window.close();
  active.window.closed = true;
  active.window.close = () => {
    throw new Error('closed again');
  };
  gate.resolve();
  await operation;
  await tick();
  assert.deepEqual(active.errors, []);
});
