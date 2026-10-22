// All data IPC shares one queue, including import and relocation. Closing a
// window must wait for the entire queue, not just the last event-title edit.
export class DataOperations {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = new Set<Promise<unknown>>();

  get busy() {
    return this.pending.size > 0;
  }

  run<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.tail.then(action);
    this.tail = operation.catch(() => {});
    this.pending.add(operation);
    void operation.then(
      () => this.pending.delete(operation),
      () => this.pending.delete(operation),
    );
    return operation;
  }

  async drain(): Promise<void> {
    let failure: PromiseRejectedResult | undefined;
    while (this.pending.size) {
      const results = await Promise.allSettled(this.pending);
      failure ??= results.find((result) => result.status === 'rejected');
    }
    if (failure) throw failure.reason;
  }
}

interface ClosableWindow {
  on(
    event: 'close',
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
  isDestroyed(): boolean;
  close(): void;
}

export function guardDataClose(
  window: ClosableWindow,
  operations: DataOperations,
  onError: (error: unknown) => void,
) {
  let waiting = false;
  window.on('close', (event) => {
    if (!operations.busy) return;
    event.preventDefault();
    if (waiting) return;
    waiting = true;
    void operations.drain().then(
      () => {
        waiting = false;
        if (!window.isDestroyed()) window.close();
      },
      (error) => {
        waiting = false;
        if (!window.isDestroyed()) onError(error);
      },
    );
  });
}
