import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultPreferences,
  loadPreferences,
  parsePreferences,
  savePreferences,
} from '../src/preferences.ts';

test('settings fall back per field and validate defaults without changing valid choices', () => {
  assert.deepEqual(parsePreferences(null), defaultPreferences);
  assert.deepEqual(parsePreferences([]), defaultPreferences);
  assert.deepEqual(
    parsePreferences({
      defaultView: 'day',
      defaultDuration: -1,
      defaultColor: 'other',
      weekStartHour: 24,
    }),
    defaultPreferences,
  );
  const selected = {
    defaultView: 'month',
    defaultDuration: 90,
    defaultColor: 'rose',
    weekStartHour: 0,
  } as const;
  assert.deepEqual(parsePreferences(selected), selected);
  assert.equal(
    parsePreferences({ ...selected, weekStartHour: 8.5 }).weekStartHour,
    8,
  );
  assert.equal(
    parsePreferences({ ...selected, defaultDuration: '60' }).defaultDuration,
    30,
  );
});

test('settings persist across reads, recover from corrupt data and report write failures', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  try {
    assert.deepEqual(loadPreferences(), defaultPreferences);
    const selected = {
      defaultView: 'month',
      defaultDuration: 60,
      defaultColor: 'sky',
      weekStartHour: 10,
    } as const;
    savePreferences(selected);
    assert.deepEqual(loadPreferences(), selected);
    const key = [...data.keys()][0];
    data.set(key, '{broken');
    assert.deepEqual(loadPreferences(), defaultPreferences);
    storage.setItem = () => {
      throw new Error('Storage unavailable');
    };
    assert.throws(() => savePreferences(selected), /Storage unavailable/);
    assert.deepEqual(defaultPreferences, {
      defaultView: 'week',
      defaultDuration: 30,
      defaultColor: 'sage',
      weekStartHour: 8,
    });
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
