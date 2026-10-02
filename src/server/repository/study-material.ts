import type { LocalStudyMaterial, LocalStudyMaterialPatch } from "@/model/wanikani.ts";
import { applyLocalStudyMaterialPatch } from "@/model/subject-utils.ts";
import { saveJsonAtomic } from "@server/utils/json-utils.ts";
import { LOCAL_STUDY_MATERIALS_PATH } from "./data-paths.ts";
import { readLocalStudyMaterials } from "./data-loader.ts";

let queue: Promise<unknown> = Promise.resolve();

export function upsertLocalStudyMaterial(
  subjectId: number,
  patch: LocalStudyMaterialPatch
): Promise<LocalStudyMaterial | null> {
  // The caller's promise stays out of the chain, so a rejection reaches the caller
  // and the next save still starts from the last good state
  const run = queue.then(() => saveLocalStudyMaterial(subjectId, patch));
  queue = run.catch(() => {});
  return run;
}

async function saveLocalStudyMaterial(
  subjectId: number,
  patch: LocalStudyMaterialPatch
): Promise<LocalStudyMaterial | null> {
  const key = String(subjectId);
  // Read inside the queue, so the patch lands on the file as it is now, with every hand edit and
  // pull in it. Not the getter: its subject check would let a bad record of another subject fail
  // this write.
  const next = await readLocalStudyMaterials();
  const record = applyLocalStudyMaterialPatch(next[key] ?? null, patch);
  if (record) next[key] = record;
  else delete next[key];

  await saveJsonAtomic(LOCAL_STUDY_MATERIALS_PATH, next);
  return record;
}
