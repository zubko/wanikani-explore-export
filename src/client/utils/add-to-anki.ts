import type { SubjectType } from "@/model/wanikani.ts";
import { waitForLocalStudyMaterialSaves } from "../hooks/useLocalStudyMaterial.ts";
import { api } from "../api.ts";

// A note saved a moment ago is only optimistic on screen. Without the wait the server builds the
// Anki fields from the file as it was before that save.
export async function addToAnkiAfterSaves(subjectId: number, type: SubjectType) {
  await waitForLocalStudyMaterialSaves(subjectId);
  return api.addToAnki(subjectId, type);
}
