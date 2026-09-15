import { useSyncExternalStore } from "react";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { applyLocalStudyMaterialPatch } from "@/model/subject-utils.ts";
import { api } from "../api.ts";

type SavedRecords = Record<number, LocalStudyMaterial | null>;

/** Builds the patch to send from the record the server last confirmed. */
type BuildPatch = (confirmed: LocalStudyMaterial | null) => LocalStudyMaterial;

type PendingSave = { build: BuildPatch };

type SaveParams = {
  subjectId: number;
  /** The record the page was rendered with. Used until the first save of this subject answers. */
  fromServer: LocalStudyMaterial | null;
  /**
   * A whole-list field must pass a function: it runs when the request starts, so the payload is
   * built from the last confirmed record and never carries a change that failed before it.
   */
  patch: LocalStudyMaterial | BuildPatch;
};

type RunParams = {
  subjectId: number;
  fromServer: LocalStudyMaterial | null;
  save: PendingSave;
};

// One subject can render on several cards at once, for example a radical under two kanji
// of the same word. Per-card state would let one card save a list the other card never saw.
let shown: SavedRecords = {};
// The answer of the last finished save per subject. A Map and not an object, because a write
// after an await cannot then carry a stale copy of the other subjects with it.
const confirmed = new Map<number, LocalStudyMaterial | null>();
// The record the page was rendered with when the subject's session started. A later render with
// another value means the file changed outside this tab, so the session record is dropped.
const origins = new Map<number, string>();
const pendingSaves = new Map<number, PendingSave[]>();
const listeners = new Set<() => void>();
// Two saves for one subject must not run at once: the slower answer would land on top of the
// newer one, and a queued save builds its payload from the answer of the save before it
const queues = new Map<number, Promise<unknown>>();

export function useLocalStudyMaterial(
  subjectId: number,
  fromServer: LocalStudyMaterial | null
): LocalStudyMaterial | null {
  const records = useSyncExternalStore(subscribe, getShown, getShown);
  if (serverRecordChanged(subjectId, fromServer)) return fromServer;
  return Object.hasOwn(records, subjectId) ? (records[subjectId] ?? null) : fromServer;
}

export function saveLocalStudyMaterial({
  subjectId,
  fromServer,
  patch,
}: SaveParams): Promise<void> {
  if (serverRecordChanged(subjectId, fromServer)) confirmed.delete(subjectId);
  origins.set(subjectId, recordKey(fromServer));

  const save: PendingSave = { build: typeof patch === "function" ? patch : () => patch };
  pendingSaves.set(subjectId, [...(pendingSaves.get(subjectId) ?? []), save]);
  // published before the queue, so a second edit of the same subject is on screen at once
  // instead of waiting for the first request
  refresh(subjectId, fromServer);

  const queued = queues.get(subjectId) ?? Promise.resolve();
  // The caller's promise stays out of the chain, so a rejection reaches the caller
  // and the next save still starts from the last good state
  const run = queued.then(() => runSave({ subjectId, fromServer, save }));
  queues.set(
    subjectId,
    run.catch(() => {})
  );
  return run;
}

/** Test hook: drops the whole store, so one test file cannot see the records of another. */
export function resetLocalStudyMaterials(): void {
  queues.clear();
  pendingSaves.clear();
  confirmed.clear();
  origins.clear();
  publish({});
}

async function runSave({ subjectId, fromServer, save }: RunParams): Promise<void> {
  try {
    const patch = save.build(confirmedRecord(subjectId, fromServer));
    const saved = await api.saveStudyMaterial(subjectId, patch);
    confirmed.set(subjectId, saved);
  } finally {
    dropPending(subjectId, save);
    refresh(subjectId, fromServer);
  }
}

function refresh(subjectId: number, fromServer: LocalStudyMaterial | null): void {
  const saves = pendingSaves.get(subjectId) ?? [];
  if (saves.length === 0 && !confirmed.has(subjectId)) {
    const next = { ...shown };
    delete next[subjectId];
    publish(next);
    return;
  }

  let record = confirmedRecord(subjectId, fromServer);
  for (const save of saves) record = applyLocalStudyMaterialPatch(record, save.build(record));
  publish({ ...shown, [subjectId]: record });
}

function confirmedRecord(
  subjectId: number,
  fromServer: LocalStudyMaterial | null
): LocalStudyMaterial | null {
  return confirmed.has(subjectId) ? (confirmed.get(subjectId) ?? null) : fromServer;
}

function serverRecordChanged(subjectId: number, fromServer: LocalStudyMaterial | null): boolean {
  const origin = origins.get(subjectId);
  return origin !== undefined && origin !== recordKey(fromServer);
}

/** By value, so the key order of a hand-edited file makes no difference. */
function recordKey(record: LocalStudyMaterial | null): string {
  if (!record) return "";
  return JSON.stringify([
    record.meaning_note ?? "",
    record.reading_note ?? "",
    record.meaning_synonyms ?? [],
  ]);
}

function dropPending(subjectId: number, save: PendingSave): void {
  const rest = (pendingSaves.get(subjectId) ?? []).filter((item) => item !== save);
  if (rest.length > 0) pendingSaves.set(subjectId, rest);
  else pendingSaves.delete(subjectId);
}

function getShown(): SavedRecords {
  return shown;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: SavedRecords): void {
  shown = next;
  for (const listener of listeners) listener();
}
