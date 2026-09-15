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
// The answer of the last finished save per subject
let confirmed: SavedRecords = {};
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
  return Object.hasOwn(records, subjectId) ? (records[subjectId] ?? null) : fromServer;
}

export function saveLocalStudyMaterial({
  subjectId,
  fromServer,
  patch,
}: SaveParams): Promise<void> {
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

export function resetLocalStudyMaterials(): void {
  queues.clear();
  pendingSaves.clear();
  confirmed = {};
  publish({});
}

async function runSave({ subjectId, fromServer, save }: RunParams): Promise<void> {
  try {
    const patch = save.build(confirmedRecord(subjectId, fromServer));
    confirmed = { ...confirmed, [subjectId]: await api.saveStudyMaterial(subjectId, patch) };
  } finally {
    dropPending(subjectId, save);
    refresh(subjectId, fromServer);
  }
}

/** Shows the confirmed record with every pending save applied on top, in the order they started. */
function refresh(subjectId: number, fromServer: LocalStudyMaterial | null): void {
  const saves = pendingSaves.get(subjectId) ?? [];
  if (saves.length === 0 && !Object.hasOwn(confirmed, subjectId)) {
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
  return Object.hasOwn(confirmed, subjectId) ? (confirmed[subjectId] ?? null) : fromServer;
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
