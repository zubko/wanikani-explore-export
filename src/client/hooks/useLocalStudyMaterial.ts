import { useSyncExternalStore } from "react";
import type { LocalStudyMaterial, LocalStudyMaterialPatch } from "@/model/wanikani.ts";
import { applyLocalStudyMaterialPatch } from "@/model/subject-utils.ts";
import { api } from "../api.ts";

type SavedRecords = Record<number, LocalStudyMaterial | null>;

type PendingSave = { patch: LocalStudyMaterialPatch };

type SaveParams = {
  subjectId: number;
  /** The record the page was rendered with. Used until the first save of this subject answers. */
  fromServer: LocalStudyMaterial | null;
  patch: LocalStudyMaterialPatch;
};

export type SaveHandle = {
  done: Promise<void>;
  /** False once a later save of the same subject and fields started. */
  isLatest: () => boolean;
};

type RunParams = {
  subjectId: number;
  fromServer: LocalStudyMaterial | null;
  save: PendingSave;
};

export const SAVE_FAILED_MESSAGE = "A note save failed, so Anki would get the old text";

// One subject can render on several cards at once, for example a radical under two kanji
// of the same word. Per-card state would let one card show what the other card saved.
let shown: SavedRecords = {};
// The answer of the last finished save per subject. A Map and not an object, because a write
// after an await cannot then carry a stale copy of the other subjects with it.
const confirmed = new Map<number, LocalStudyMaterial | null>();
// The record the page was rendered with when the subject's session started. A later render with
// another value means the file changed outside this tab, so the session record is dropped.
const origins = new Map<number, string>();
const pendingSaves = new Map<number, PendingSave[]>();
// The number of the last save started per subject and field, so an editor can ask whether its
// own save is still the newest one. Per instance it could not: two cards show the same field.
const saveNumbers = new Map<string, number>();
const listeners = new Set<() => void>();
// Two saves for one subject must not run at once: the slower answer would land on top of the
// newer one, and the server merges each patch onto the file as the save before it left it
const queues = new Map<number, Promise<unknown>>();
// Every save that has not answered yet, of every subject. Add to Anki waits for all of them.
const running = new Set<Promise<void>>();

export function useLocalStudyMaterial(
  subjectId: number,
  fromServer: LocalStudyMaterial | null
): LocalStudyMaterial | null {
  const records = useSyncExternalStore(subscribe, getShown, getShown);
  if (serverRecordChanged(subjectId, fromServer)) return fromServer;
  return Object.hasOwn(records, subjectId) ? (records[subjectId] ?? null) : fromServer;
}

export function saveLocalStudyMaterial({ subjectId, fromServer, patch }: SaveParams): SaveHandle {
  if (serverRecordChanged(subjectId, fromServer)) confirmed.delete(subjectId);
  origins.set(subjectId, recordKey(fromServer));

  const isLatest = countSave(subjectId, patch);
  const save: PendingSave = { patch };
  pendingSaves.set(subjectId, [...(pendingSaves.get(subjectId) ?? []), save]);
  // published before the queue, so a second edit of the same subject is on screen at once
  // instead of waiting for the first request
  refresh(subjectId, fromServer);

  const queued = queues.get(subjectId) ?? Promise.resolve();
  // The caller's promise stays out of the chain, so a rejection reaches the caller
  // and the next save still starts from the last good state
  const done = queued.then(() => runSave({ subjectId, fromServer, save }));
  queues.set(
    subjectId,
    done.catch(() => {})
  );
  track(done);
  return { done, isLatest };
}

/**
 * Resolves once every save of every subject has answered, and rejects when one of them failed.
 * Adding one subject to Anki rewrites its components too, so waiting for one id is not enough.
 */
export async function waitForLocalStudyMaterialSaves(): Promise<void> {
  while (running.size > 0) {
    const results = await Promise.allSettled([...running]);
    if (results.some((result) => result.status === "rejected")) {
      throw new Error(SAVE_FAILED_MESSAGE);
    }
  }
}

/** Test hook: drops the whole store, so one test file cannot see the records of another. */
export function resetLocalStudyMaterials(): void {
  queues.clear();
  running.clear();
  pendingSaves.clear();
  saveNumbers.clear();
  confirmed.clear();
  origins.clear();
  publish({});
}

async function runSave({ subjectId, fromServer, save }: RunParams): Promise<void> {
  try {
    const saved = await api.saveStudyMaterial(subjectId, save.patch);
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

  let record = confirmed.has(subjectId) ? (confirmed.get(subjectId) ?? null) : fromServer;
  for (const save of saves) record = applyLocalStudyMaterialPatch(record, save.patch);
  publish({ ...shown, [subjectId]: record });
}

/**
 * True when the page was rendered with a record this session never produced, so the file changed
 * outside the tab. That record wins: the store drops its own, and the save that follows sends a
 * patch the server merges onto the file, so a change made outside is never overwritten.
 */
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

function countSave(subjectId: number, patch: LocalStudyMaterialPatch): () => boolean {
  const counted = Object.keys(patch).map((field) => {
    const key = `${subjectId}:${field}`;
    const number = (saveNumbers.get(key) ?? 0) + 1;
    saveNumbers.set(key, number);
    return { key, number };
  });
  return () => counted.every((item) => saveNumbers.get(item.key) === item.number);
}

function track(done: Promise<void>): void {
  running.add(done);
  const forget = () => {
    running.delete(done);
  };
  done.then(forget, forget);
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
