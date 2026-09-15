import { useSyncExternalStore } from "react";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { applyLocalStudyMaterialPatch } from "@/model/subject-utils.ts";
import { api } from "../api.ts";

type SavedRecords = Record<number, LocalStudyMaterial | null>;

// One subject can render on several cards at once, for example a radical under two kanji
// of the same word. Per-card state would let one card save a list the other card never saw.
let saved: SavedRecords = {};
const listeners = new Set<() => void>();

export function useLocalStudyMaterial(
  subjectId: number,
  fromServer: LocalStudyMaterial | null
): LocalStudyMaterial | null {
  const records = useSyncExternalStore(subscribe, getSaved, getSaved);
  return Object.hasOwn(records, subjectId) ? (records[subjectId] ?? null) : fromServer;
}

export async function saveLocalStudyMaterial(params: {
  subjectId: number;
  current: LocalStudyMaterial | null;
  patch: LocalStudyMaterial;
}): Promise<void> {
  const { subjectId, current, patch } = params;
  const hadRecord = Object.hasOwn(saved, subjectId);
  const previous = saved[subjectId] ?? null;

  publish({ ...saved, [subjectId]: applyLocalStudyMaterialPatch(current, patch) });
  try {
    publish({ ...saved, [subjectId]: await api.saveStudyMaterial(subjectId, patch) });
  } catch (err) {
    const rolledBack = { ...saved };
    if (hadRecord) rolledBack[subjectId] = previous;
    else delete rolledBack[subjectId];
    publish(rolledBack);
    throw err;
  }
}

export function resetLocalStudyMaterials(): void {
  publish({});
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
