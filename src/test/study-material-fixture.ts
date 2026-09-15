import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { readJson } from "@server/utils/json-utils.ts";
import { setLocalStudyMaterials } from "@server/repository/data-loader.ts";
import { resetWriteCalls, writeCalls } from "./preload.ts";

export const STUDY_MATERIAL_FIXTURE_PATH = "src/test/fixtures/study_materials_extra.json";

/** Filled by `loadStudyMaterialFixture`, so a test can compare against the untouched records. */
export const studyMaterialFixture: Record<string, LocalStudyMaterial> = {};

export async function loadStudyMaterialFixture(): Promise<void> {
  Object.assign(
    studyMaterialFixture,
    await readJson<Record<string, LocalStudyMaterial>>(STUDY_MATERIAL_FIXTURE_PATH)
  );
}

/**
 * Every test file that writes local study materials calls this in `beforeEach` and in `afterEach`,
 * because bun runs all files in one process and the repository state is module level.
 */
export function resetStudyMaterialState(): void {
  resetWriteCalls();
  setLocalStudyMaterials(structuredClone(studyMaterialFixture));
}

export function lastWrite(): Record<string, LocalStudyMaterial> {
  const call = writeCalls.at(-1);
  if (!call) throw new Error("no write recorded");
  return JSON.parse(call.data) as Record<string, LocalStudyMaterial>;
}
