import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  beginTimeSelection,
  selectedTimeRange,
} from '../src/calendar-selection.ts';

test('clicking either half of an hour selects exactly thirty minutes', () => {
  assert.deepEqual(selectedTimeRange(9 * 60 + 10), { start: 540, end: 570 });
  assert.deepEqual(selectedTimeRange(9 * 60 + 45), { start: 570, end: 600 });
});

test('dragging snaps to half hours without adding time at an exact boundary', () => {
  assert.deepEqual(selectedTimeRange(540, 600), { start: 540, end: 600 });
  assert.deepEqual(selectedTimeRange(550, 601), { start: 540, end: 630 });
  assert.deepEqual(selectedTimeRange(550, 690), { start: 540, end: 690 });
  assert.deepEqual(selectedTimeRange(550, 485), { start: 480, end: 570 });
});

test('selection stays inside the day, including the last half hour', () => {
  assert.deepEqual(selectedTimeRange(1439), { start: 1410, end: 1440 });
  assert.deepEqual(selectedTimeRange(1410, 1600), { start: 1410, end: 1440 });
  assert.deepEqual(selectedTimeRange(20, -100), { start: 0, end: 30 });
});

test('pointer gestures commit once, cancel cleanly and ignore small movement', () => {
  // Small DOM doubles exercise gesture lifecycle without a desktop session.
  class Element extends EventTarget {
    style: Record<string, string> = {};
    textContent = '';
    className = '';
    removed = false;
    captured = false;
    clientHeight = 1536;
    scrollTop = 0;
    classes = new Set<string>();
    classList = {
      add: (name: string) => this.classes.add(name),
      remove: (name: string) => this.classes.delete(name),
    };
    append() {}
    setAttribute() {}
    remove() {
      this.removed = true;
    }
    getBoundingClientRect() {
      return { top: 0, bottom: 1536, height: 1536 };
    }
    setPointerCapture() {
      this.captured = true;
    }
    hasPointerCapture() {
      return this.captured;
    }
    releasePointerCapture() {
      this.captured = false;
      this.dispatchEvent(new Event('lostpointercapture'));
    }
  }
  const doc = Object.assign(new EventTarget(), {
    createElement: () => new Element(),
  });
  const win = new EventTarget();
  const frameCallbacks = new Map<number, FrameRequestCallback>();
  const names = [
    'document',
    'window',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ] as const;
  const original = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  let frameId = 0;
  Object.assign(globalThis, {
    document: doc,
    window: win,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frameCallbacks.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frameCallbacks.delete(id),
  });
  const pointer = (type: string, minute: number) =>
    Object.assign(new Event(type), {
      pointerId: 1,
      clientY: (minute / 1440) * 1536,
    });
  const committed: number[][] = [];
  const column = new Element();
  const scroller = new Element();
  const begin = (minute: number) =>
    beginTimeSelection(
      column as unknown as HTMLElement,
      scroller as unknown as HTMLElement,
      pointer('pointerdown', minute) as PointerEvent,
      (start, end) => committed.push([start, end]),
    );
  try {
    begin(568);
    column.dispatchEvent(pointer('pointerup', 571));
    assert.deepEqual(
      committed,
      [[540, 570]],
      'tiny motion should remain a click',
    );
    column.dispatchEvent(pointer('pointerup', 600));
    assert.equal(committed.length, 1);
    assert.equal(column.captured, false);
    assert.equal(frameCallbacks.size, 0);

    begin(550);
    column.dispatchEvent(pointer('pointermove', 660));
    column.dispatchEvent(pointer('pointerup', 660));
    assert.deepEqual(committed.at(-1), [540, 660]);

    for (const cancel of [
      () =>
        doc.dispatchEvent(
          Object.assign(new Event('keydown'), { key: 'Escape' }),
        ),
      () => column.dispatchEvent(new Event('pointercancel')),
      () => win.dispatchEvent(new Event('blur')),
      () => column.dispatchEvent(new Event('lostpointercapture')),
    ]) {
      begin(600);
      cancel();
      column.dispatchEvent(pointer('pointerup', 720));
      assert.equal(committed.length, 2);
      assert.equal(frameCallbacks.size, 0);
      assert.equal(scroller.classes.has('is-selecting'), false);
    }
    const dispose = begin(600);
    dispose();
    dispose();
    column.dispatchEvent(pointer('pointerup', 720));
    assert.equal(committed.length, 2);
  } finally {
    names.forEach((name, index) => {
      if (original[index])
        Object.defineProperty(globalThis, name, original[index]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
