import { useSyncExternalStore } from "react";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { applyLocalStudyMaterialPatch } from "@/model/subject-utils.ts";
import { api } from "../api.ts";

type SavedRecords = Record<number, LocalStudyMaterial | null>;

type SaveParams = {
  subjectId: number;
  current: LocalStudyMaterial | null;
  patch: LocalStudyMaterial;
};

// One subject can render on several cards at once, for example a radical under two kanji
// of the same word. Per-card state would let one card save a list the other card never saw.
let saved: SavedRecords = {};
const listeners = new Set<() => void>();
// Two saves for one subject must not run at once: the slower answer would land on top of the
// newer one, and a failed save would roll back a value the other save already stored
const queues = new Map<number, Promise<unknown>>();

export function useLocalStudyMaterial(
  subjectId: number,
  fromServer: LocalStudyMaterial | null
): LocalStudyMaterial | null {
  const records = useSyncExternalStore(subscribe, getSaved, getSaved);
  return Object.hasOwn(records, subjectId) ? (records[subjectId] ?? null) : fromServer;
}

export function saveLocalStudyMaterial(params: SaveParams): Promise<void> {
  const queued = queues.get(params.subjectId) ?? Promise.resolve();
  // The caller's promise stays out of the chain, so a rejection reaches the caller
  // and the next save still starts from the last good state
  const run = queued.then(() => runSave(params));
  queues.set(
    params.subjectId,
    run.catch(() => {})
  );
  return run;
}

export function resetLocalStudyMaterials(): void {
  queues.clear();
  publish({});
}

async function runSave({ subjectId, current, patch }: SaveParams): Promise<void> {
  const hadRecord = Object.hasOwn(saved, subjectId);
  const previous = hadRecord ? (saved[subjectId] ?? null) : current;

  publish({ ...saved, [subjectId]: applyLocalStudyMaterialPatch(previous, patch) });
  try {
    const data = await api.saveStudyMaterial(subjectId, patch);
    // `saved` is read after the answer, so every entry another subject published meanwhile stays
    publish({ ...saved, [subjectId]: data });
  } catch (err) {
    const rolledBack = { ...saved };
    if (hadRecord) rolledBack[subjectId] = previous;
    else delete rolledBack[subjectId];
    publish(rolledBack);
    throw err;
  }
}

function getSaved(): SavedRecords {
  return saved;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: SavedRecords): void {
  saved = next;
  for (const listener of listeners) listener();
}
