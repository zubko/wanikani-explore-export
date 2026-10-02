import type { LocalStudyMaterial, LocalStudyMaterialPatch } from "@/model/wanikani.ts";
import { applyLocalStudyMaterialPatch } from "@/model/subject-utils.ts";
import { readFileVersion } from "@server/utils/file-utils.ts";
import { saveJsonAtomicIfUnchanged } from "@server/utils/json-utils.ts";
import { LOCAL_STUDY_MATERIALS_PATH } from "./data-paths.ts";
import { readLocalStudyMaterials } from "./data-loader.ts";

export const LOCAL_STUDY_MATERIAL_SAVE_ATTEMPTS = 3;

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

/**
 * The queue only orders the saves of this server. A hand edit or a git pull can still land between
 * the read and the rename, so a save that finds the file changed starts again from the read.
 */
async function saveLocalStudyMaterial(
  subjectId: number,
  patch: LocalStudyMaterialPatch
): Promise<LocalStudyMaterial | null> {
  const key = String(subjectId);
  for (let attempt = 1; attempt <= LOCAL_STUDY_MATERIAL_SAVE_ATTEMPTS; attempt++) {
    // Taken before the read, so a change during the read counts as a change too
    const fileVersion = await readFileVersion(LOCAL_STUDY_MATERIALS_PATH);
    // Not the getter: its subject check would let a bad record of another subject fail this write
    const next = await readLocalStudyMaterials();
    const record = applyLocalStudyMaterialPatch(next[key] ?? null, patch);
    if (record) next[key] = record;
    else delete next[key];

    const saved = await saveJsonAtomicIfUnchanged({
      path: LOCAL_STUDY_MATERIALS_PATH,
      data: next,
      fileVersion,
    });
    if (saved) return record;
    console.warn(
      `[Repository] ${LOCAL_STUDY_MATERIALS_PATH} changed during save attempt ${attempt} of ${LOCAL_STUDY_MATERIAL_SAVE_ATTEMPTS} for subject ${key}`
    );
  }
  throw new Error(
    `${LOCAL_STUDY_MATERIALS_PATH} changed during each of ${LOCAL_STUDY_MATERIAL_SAVE_ATTEMPTS} save attempts. Nothing was saved.`
  );
}
