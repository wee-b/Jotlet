import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  addDays,
  dateKey,
  filterSchedules,
  monthDays,
  onDay,
  parseSchedule,
  scheduleColors,
  weekStart,
} from '../src/shared/schedules.ts';
import { ScheduleStore } from '../src/main/storage/schedule-store.ts';
import type { Schedule } from '../src/shared/schedules.ts';

const schedule = (
  id = 'schedule-1',
  eventId: string | null = null,
): Schedule => ({
  id,
  title: '项目讨论',
  start: '2026-10-19T01:00:00.000Z',
  end: '2026-10-19T02:00:00.000Z',
  color: 'sage',
  allDay: false,
  eventId,
  description: '准备事项',
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
});

test('schedules support optional event associations and reject invalid ranges and fields', () => {
  assert.equal(parseSchedule(schedule()).eventId, null);
  assert.equal(parseSchedule(schedule('s', 'event-1')).eventId, 'event-1');
  assert.equal(
    parseSchedule({ ...schedule(), title: '  讨论  ' }).title,
    '讨论',
  );
  for (const patch of [
    { end: schedule().start },
    { end: 'invalid' },
    { title: '  ' },
    { color: 'other' },
    { color: null },
    { eventId: '' },
    { allDay: 'yes' },
  ])
    assert.throws(() => parseSchedule({ ...schedule(), ...patch }));
});

test('five preset colors round-trip and legacy categories migrate without retaining category fields', () => {
  assert.equal(Object.keys(scheduleColors).length, 5);
  for (const color of Object.keys(scheduleColors))
    assert.equal(parseSchedule({ ...schedule(), color }).color, color);
  for (const [calendar, color] of [
    ['work', 'sage'],
    ['personal', 'sand'],
    ['life', 'sage'],
  ]) {
    const legacy: Record<string, unknown> = { ...schedule(), calendar };
    delete legacy.color;
    const migrated = parseSchedule(legacy);
    assert.equal(migrated.color, color);
    assert.equal('calendar' in migrated, false);
    assert.equal(migrated.eventId, null);
  }
});

test('version 1 calendar files preserve their backup when saving the new color schema', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jotlet-calendar-'));
  const file = path.join(directory, 'calendar.json');
  try {
    const legacy: Record<string, unknown> = {
      ...schedule(),
      calendar: 'personal',
    };
    delete legacy.color;
    const original = JSON.stringify({
      app: 'jotlet-calendar',
      version: 1,
      schedules: [legacy],
    });
    await writeFile(file, original);
    const store = new ScheduleStore(file);
    const loaded = await store.load();
    assert.equal(loaded[0].color, 'sand');
    await store.save({ ...loaded[0], color: 'lavender' });
    assert.equal(await readFile(`${file}.bak`, 'utf8'), original);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 2);
    const saved = (await new ScheduleStore(file).load())[0];
    assert.equal(saved.color, 'lavender');
    assert.equal('calendar' in saved, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('linked-only view combines event bindings with search and preserves independent schedules', () => {
  const independent = { ...schedule('independent'), title: '午休' };
  const linked = schedule('linked', 'event-1');
  const orphan = schedule('orphan', 'deleted-event');
  const schedules = [independent, linked, orphan];
  const events = [{ id: 'event-1', title: 'Jotlet 项目' }];
  assert.deepEqual(filterSchedules(schedules, events), schedules);
  assert.deepEqual(filterSchedules(schedules, events, '', true), [linked]);
  assert.deepEqual(filterSchedules(schedules, events, ' JOTLET ', true), [
    linked,
  ]);
  assert.deepEqual(filterSchedules(schedules, events, '准备事项', true), [
    linked,
  ]);
  assert.deepEqual(filterSchedules(schedules, events, '午休', true), []);
  assert.deepEqual(filterSchedules(schedules, events, '午休'), [independent]);
  assert.deepEqual(filterSchedules(schedules, [], '', true), []);
  assert.equal(independent.eventId, null);
  assert.equal(schedules.length, 3);
});

test('month and week grids handle year transitions, leap years and six-row months', () => {
  const october = monthDays(new Date(2026, 9, 19));
  assert.equal(october.length, 35);
  assert.equal(dateKey(october[0]), '2026-09-27');
  assert.equal(dateKey(october.at(-1)!), '2026-10-31');
  assert.equal(monthDays(new Date(2026, 7, 1)).length, 42);
  assert.ok(
    monthDays(new Date(2028, 1, 1)).some(
      (day) => dateKey(day) === '2028-02-29',
    ),
  );
  assert.equal(dateKey(weekStart(new Date(2027, 0, 1))), '2026-12-27');
  assert.equal(dateKey(addDays(new Date(2026, 11, 31), 1)), '2027-01-01');
  assert.equal(monthDays(new Date(2026, 9, 1), true).length, 42);
});

test('cross-day schedules use an exclusive end and do not appear on an extra day', () => {
  const start = new Date(2026, 9, 19);
  const item = {
    ...schedule(),
    start: start.toISOString(),
    end: addDays(start, 2).toISOString(),
    allDay: true,
  };
  assert.equal(onDay(item, addDays(start, -1)), false);
  assert.equal(onDay(item, start), true);
  assert.equal(onDay(item, addDays(start, 1)), true);
  assert.equal(onDay(item, addDays(start, 2)), false);
});

test('calendar persistence serializes writes, preserves optional associations and survives restart', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jotlet-calendar-'));
  const file = path.join(directory, 'calendar.json');
  try {
    const store = new ScheduleStore(file);
    assert.deepEqual(await store.load(), []);
    await Promise.all([
      store.save(schedule('1')),
      store.save(schedule('2', 'event-1')),
    ]);
    const loaded = await new ScheduleStore(file).load();
    assert.equal(loaded.length, 2);
    assert.equal(loaded.find((item) => item.id === '1')!.eventId, null);
    assert.equal(loaded.find((item) => item.id === '2')!.eventId, 'event-1');
    const saved = await store.save({
      ...schedule('2'),
      title: '更新后的日程',
      createdAt: '2027-01-01T00:00:00.000Z',
    });
    assert.equal(saved.createdAt, schedule().createdAt);
    assert.equal(
      JSON.parse(await readFile(`${file}.bak`, 'utf8')).schedules.length,
      2,
    );
    loaded[0].title = '外部修改';
    assert.notEqual((await store.load())[0].title, '外部修改');
    await store.remove('1');
    assert.equal((await new ScheduleStore(file).load()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('corrupt calendar data blocks writes and failed writes leave committed data intact', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jotlet-calendar-'));
  const file = path.join(directory, 'calendar.json');
  try {
    await writeFile(file, '{broken');
    const broken = new ScheduleStore(file);
    await assert.rejects(broken.load(), /原文件已保留/);
    await assert.rejects(broken.save(schedule()));
    assert.equal(await readFile(file, 'utf8'), '{broken');
    await rm(file);
    const store = new ScheduleStore(file);
    await store.save(schedule('1'));
    await mkdir(`${file}.tmp`);
    await assert.rejects(store.save(schedule('2')));
    assert.equal((await store.load()).length, 1);
    assert.equal((await new ScheduleStore(file).load()).length, 1);
    await rm(`${file}.tmp`, { recursive: true });
    await store.save(schedule('2'));
    assert.equal((await store.load()).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
