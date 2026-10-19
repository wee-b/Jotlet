import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeJotletBackup, parseJotletBackup } from '../src/shared/backup.ts';
import type { EventRecord } from '../src/shared/events.ts';
import type { Schedule } from '../src/shared/schedules.ts';
const stamp = '2026-10-19T02:00:00.000Z';
const event: EventRecord = {
  id: 'event',
  title: '项目 🌿',
  pinned: true,
  startedAt: stamp,
  endedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
  entries: [
    {
      id: 'record',
      content: '讨论\n与决定',
      occurredAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ],
};
const schedule: Schedule = {
  id: 'schedule',
  title: '讨论',
  start: stamp,
  end: '2026-10-19T03:00:00.000Z',
  allDay: false,
  color: 'lavender',
  eventId: event.id,
  description: '<b>纯文本</b>',
  createdAt: stamp,
  updatedAt: stamp,
};
test('.jotlet round-trips events, records, schedules, colors and optional associations', () => {
  const archive = makeJotletBackup(
    [event],
    [schedule, { ...schedule, id: 'independent', eventId: null }],
  );
  const restored = parseJotletBackup('\uFEFF' + JSON.stringify(archive));
  assert.deepEqual(restored, archive);
  assert.deepEqual(restored.events, [event]);
  assert.deepEqual(restored.schedules[0], schedule);
  assert.equal(restored.schedules[1].eventId, null);
  assert.deepEqual(
    parseJotletBackup(JSON.stringify(makeJotletBackup([], []))).events,
    [],
  );
});
test('.jotlet rejects malformed data, unsupported versions and duplicate IDs before restoring', () => {
  const archive = makeJotletBackup([event], [schedule]);
  for (const patch of [
    { format: 'other' },
    { version: 9 },
    { exportedAt: 'invalid' },
    { events: [event, event] },
    { schedules: [schedule, schedule] },
    { schedules: [{ ...schedule, end: 'invalid' }] },
    {
      events: [
        { ...event, entries: [{ ...event.entries[0], occurredAt: 'invalid' }] },
      ],
    },
  ])
    assert.throws(() =>
      parseJotletBackup(JSON.stringify({ ...archive, ...patch })),
    );
  for (const text of ['broken', 'null', '[]', '{}'])
    assert.throws(() => parseJotletBackup(text));
});
