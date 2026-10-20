import { eventSignature } from './events.ts';
import type { EventRecord } from './events.ts';
import type { Schedule } from './schedules.ts';
import type { JotletBackup } from './backup.ts';

export type ImportMode = 'merge' | 'replace';
export interface MergeCounts {
  added: number;
  skipped: number;
  conflicts: number;
}
export interface BackupPreview {
  token: string;
  filePath: string;
  fileName: string;
  exportedAt: string;
  events: number;
  entries: number;
  schedules: number;
  orphanSchedules: number;
  currentEvents: number;
  currentSchedules: number;
  eventMerge: MergeCounts;
  scheduleMerge: MergeCounts;
  eventSamples: { title: string; entries: number }[];
  scheduleSamples: { title: string; start: string; linked: boolean }[];
}

const scheduleSignature = (schedule: Schedule) =>
  JSON.stringify([
    schedule.title,
    schedule.start,
    schedule.end,
    schedule.color,
    schedule.allDay,
    schedule.eventId,
    schedule.description,
  ]);

export function planMerge(
  events: EventRecord[],
  schedules: Schedule[],
  backup: JotletBackup,
) {
  const result = { events: [...events], schedules: [...schedules] };
  const eventIds = new Set(events.map((event) => event.id));
  const scheduleIds = new Set(schedules.map((schedule) => schedule.id));
  // Reserve incoming IDs as well, including dangling references, so a conflict
  // never makes an unrelated schedule point at a newly generated event.
  const reserved = new Set([
    ...eventIds,
    ...scheduleIds,
    ...backup.events.map((event) => event.id),
    ...backup.schedules.flatMap((schedule) => [
      schedule.id,
      ...(schedule.eventId ? [schedule.eventId] : []),
    ]),
  ]);
  const newId = () => {
    let id: string;
    do {
      id = crypto.randomUUID();
    } while (reserved.has(id));
    reserved.add(id);
    return id;
  };
  const signatures = new Map(
    events.map((event) => [eventSignature(event), event.id]),
  );
  const mapping = new Map<string, string>();
  const eventMerge: MergeCounts = { added: 0, skipped: 0, conflicts: 0 };
  const scheduleMerge: MergeCounts = { added: 0, skipped: 0, conflicts: 0 };
  for (const event of backup.events) {
    const signature = eventSignature(event);
    const duplicate = signatures.get(signature);
    if (duplicate !== undefined) {
      mapping.set(event.id, duplicate);
      eventMerge.skipped++;
      continue;
    }
    const conflict = eventIds.has(event.id);
    const imported = { ...event, id: conflict ? newId() : event.id };
    mapping.set(event.id, imported.id);
    result.events.push(imported);
    eventIds.add(imported.id);
    signatures.set(signature, imported.id);
    eventMerge.added++;
    if (conflict) eventMerge.conflicts++;
  }
  const scheduleSignatures = new Set(schedules.map(scheduleSignature));
  for (const schedule of backup.schedules) {
    const imported = {
      ...schedule,
      eventId: schedule.eventId
        ? (mapping.get(schedule.eventId) ?? null)
        : null,
    };
    const signature = scheduleSignature(imported);
    if (scheduleSignatures.has(signature)) {
      scheduleMerge.skipped++;
      continue;
    }
    if (scheduleIds.has(imported.id)) {
      imported.id = newId();
      scheduleMerge.conflicts++;
    }
    result.schedules.push(imported);
    scheduleIds.add(imported.id);
    scheduleSignatures.add(signature);
    scheduleMerge.added++;
  }
  return { ...result, eventMerge, scheduleMerge };
}
