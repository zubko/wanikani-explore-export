import type { LocalStudyMaterial, LocalStudyMaterialPatch } from "@/model/wanikani.ts";
import { applyLocalStudyMaterialPatch } from "@/model/subject-utils.ts";
import { createSaveQueue, saveJsonWithRetry } from "@server/utils/json-utils.ts";
import { LOCAL_STUDY_MATERIALS_PATH } from "./data-paths.ts";
import { readLocalStudyMaterials } from "./data-loader.ts";

export const LOCAL_STUDY_MATERIAL_SAVE_ATTEMPTS = 3;

const runInQueue = createSaveQueue();

export function upsertLocalStudyMaterial(
  subjectId: number,
  patch: LocalStudyMaterialPatch
): Promise<LocalStudyMaterial | null> {
  const key = String(subjectId);
  return runInQueue(() =>
    saveJsonWithRetry({
      path: LOCAL_STUDY_MATERIALS_PATH,
      attempts: LOCAL_STUDY_MATERIAL_SAVE_ATTEMPTS,
      label: `subject ${key}`,
      step: async () => {
        // Not the getter: its subject check would let a bad record of another subject fail this write
        const next = await readLocalStudyMaterials();
        const record = applyLocalStudyMaterialPatch(next[key] ?? null, patch);
        if (record) next[key] = record;
        else delete next[key];
        return { data: next, result: record };
      },
    })
  );
}
