import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chronological,
  makeBackup,
  mergeEvents,
  parseBackup,
  parseData,
  parseEvent,
} from '../src/shared/events.ts';
import type { EventRecord } from '../src/shared/events.ts';

const start = '2026-10-01T02:00:00.000Z';
const later = '2026-10-02T03:00:00.000Z';
const event: EventRecord = {
  id: 'event-1',
  title: '做一个随手记 🌿',
  pinned: true,
  startedAt: start,
  endedAt: null,
  createdAt: start,
  updatedAt: later,
  entries: [
    {
      id: 'node-1',
      content: '最初的想法\n<script>文字不会执行</script>',
      occurredAt: start,
      createdAt: start,
      updatedAt: start,
    },
    {
      id: 'node-2',
      content: '完成第一版',
      occurredAt: later,
      createdAt: later,
      updatedAt: later,
    },
  ],
};

test('version 2 round-trip preserves the whole event, timeline and Unicode', () => {
  assert.deepEqual(parseBackup(JSON.stringify(makeBackup([event]))), [event]);
  assert.deepEqual(parseBackup('\uFEFF' + JSON.stringify(makeBackup([]))), []);
  assert.equal(makeBackup([event]).version, 2);
});
test('version 1 notes migrate losslessly to events with one initial node', () => {
  const note = {
    id: 'legacy',
    title: '原来的记录',
    content: '原文\n和时间',
    pinned: true,
    createdAt: start,
    updatedAt: later,
  };
  const result = parseData(
    JSON.stringify({ app: 'jotlet', version: 1, notes: [note] }),
  );
  assert.equal(result.migrated, true);
  const migrated = result.events[0];
  assert.equal(migrated.id, note.id);
  assert.equal(migrated.title, note.title);
  assert.equal(migrated.pinned, true);
  assert.equal(migrated.startedAt, start);
  assert.equal(migrated.createdAt, start);
  assert.equal(migrated.updatedAt, later);
  assert.equal(migrated.endedAt, null);
  assert.equal(migrated.entries[0].content, note.content);
  assert.equal(migrated.entries[0].occurredAt, start);
  assert.equal(migrated.entries[0].updatedAt, later);
  assert.deepEqual(
    parseBackup(JSON.stringify(makeBackup(result.events))),
    result.events,
  );
});
test('blank legacy notes also survive migration', () => {
  const notes = [
    {
      id: 'blank',
      title: '',
      content: '',
      pinned: false,
      createdAt: start,
      updatedAt: start,
    },
  ];
  const migrated = parseBackup(
    JSON.stringify({ app: 'jotlet', version: 1, notes }),
  )[0];
  assert.equal(migrated.entries.length, 1);
  assert.equal(migrated.entries[0].content, '');
});
test('nodes sort by occurrence time rather than creation or import order', () => {
  const reverse = { ...event, entries: [...event.entries].reverse() };
  assert.deepEqual(
    parseEvent(reverse).entries.map((entry) => entry.id),
    ['node-1', 'node-2'],
  );
  assert.deepEqual(
    chronological(reverse.entries).map((entry) => entry.id),
    ['node-1', 'node-2'],
  );
  assert.equal(reverse.entries[0].id, 'node-2');
});
test('rejects bad dates, duplicate IDs, malformed nodes, and unsupported backup versions', () => {
  for (const patch of [
    { id: '' },
    { title: 'a'.repeat(501) },
    { startedAt: 'wrong' },
    { pinned: 'yes' },
    { endedAt: undefined },
    { entries: [event.entries[0], event.entries[0]] },
    { entries: [{ ...event.entries[0], content: 5 }] },
  ])
    assert.throws(() => parseEvent({ ...event, ...patch }));
  for (const text of [
    '{',
    '{}',
    JSON.stringify({ ...makeBackup([event]), version: 3 }),
    JSON.stringify(makeBackup([event, event])),
    JSON.stringify({ app: 'jotlet', version: 1, notes: [{ id: 'invalid' }] }),
  ])
    assert.throws(() => parseBackup(text));
});
test('event boundaries must include every timeline node', () => {
  assert.throws(
    () => parseEvent({ ...event, endedAt: '2026-09-30T00:00:00Z' }),
    /结束时间/,
  );
  assert.throws(() => parseEvent({ ...event, startedAt: later }), /开始时间/);
  assert.throws(() => parseEvent({ ...event, endedAt: start }), /结束时间/);
  assert.equal(parseEvent({ ...event, endedAt: later }).entries.length, 2);
});
test('import preserves conflicting whole timelines and skips repeated imports', () => {
  const changed = {
    ...event,
    entries: [
      ...event.entries,
      { ...event.entries[1], id: 'node-3', content: '另一台设备上的进展' },
    ],
  };
  const result = mergeEvents([event], [changed, { ...event, id: 'same-copy' }]);
  assert.equal(result.added, 1);
  assert.equal(result.conflicts, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.events[0].entries.length, 2);
  assert.equal(result.events[1].entries.length, 3);
  assert.notEqual(result.events[1].id, event.id);
  assert.equal(mergeEvents(result.events, [changed]).added, 0);
  result.events[0].entries[0].content = 'mutated';
  assert.notEqual(event.entries[0].content, 'mutated');
});
test('two events with the same text but different occurrence times are distinct', () => {
  const changed = parseEvent({
    ...event,
    entries: [
      event.entries[0],
      { ...event.entries[1], occurredAt: '2026-10-03T00:00:00Z' },
    ],
  });
  assert.equal(mergeEvents([event], [changed]).added, 1);
});
