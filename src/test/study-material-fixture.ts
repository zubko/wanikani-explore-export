import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { readJson } from "@server/utils/json-utils.ts";
import {
  LOCAL_STUDY_MATERIALS_PATH,
  setLocalStudyMaterials,
} from "@server/repository/data-loader.ts";
import { resetFsMock, setFileContent, writeCalls } from "./preload.ts";

const FIXTURE_PATH = "src/test/fixtures/study_materials_extra.json";

/** Filled by `loadStudyMaterialFixture`, so a test can compare against the untouched records. */
export const studyMaterialFixture: Record<string, LocalStudyMaterial> = {};

export async function loadStudyMaterialFixture(): Promise<void> {
  Object.assign(
    studyMaterialFixture,
    await readJson<Record<string, LocalStudyMaterial>>(FIXTURE_PATH)
  );
}

/**
 * Every test file that writes local study materials calls this in `beforeEach` and in `afterEach`,
 * because bun runs all files in one process and the repository state is module level.
 */
export function resetStudyMaterialState(): void {
  resetFsMock();
  setLocalStudyMaterials(structuredClone(studyMaterialFixture));
}

/** Changes the file behind the repository, like a hand edit or a git pull does. */
export function setStudyMaterialFile(file: Record<string, LocalStudyMaterial>): void {
  setFileContent(LOCAL_STUDY_MATERIALS_PATH, JSON.stringify(file, null, 2) + "\n");
}

export function lastWrite(): Record<string, LocalStudyMaterial> {
  const call = writeCalls.at(-1);
  if (!call) throw new Error("no write recorded");
  return JSON.parse(call.data) as Record<string, LocalStudyMaterial>;
}
