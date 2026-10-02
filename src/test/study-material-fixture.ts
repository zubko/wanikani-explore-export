import { readFileSync } from "fs";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { LOCAL_STUDY_MATERIALS_PATH } from "@server/repository/data-loader.ts";
import { setFileContent, STUDY_MATERIALS_FIXTURE_PATH, writeCalls } from "./preload.ts";

/** The untouched records, so a test can compare against them. */
export const studyMaterialFixture = JSON.parse(
  readFileSync(STUDY_MATERIALS_FIXTURE_PATH, "utf-8")
) as Record<string, LocalStudyMaterial>;

/** Changes the file behind the repository, like a hand edit or a git pull does. */
export function setStudyMaterialFile(file: Record<string, LocalStudyMaterial>): void {
  setFileContent(LOCAL_STUDY_MATERIALS_PATH, JSON.stringify(file, null, 2) + "\n");
}

export function lastWrite(): Record<string, LocalStudyMaterial> {
  const call = writeCalls.at(-1);
  if (!call) throw new Error("no write recorded");
  return JSON.parse(String(call.data)) as Record<string, LocalStudyMaterial>;
}
