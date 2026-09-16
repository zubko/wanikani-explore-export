import type { SubjectType } from "@/model/wanikani.ts";
import { waitForLocalStudyMaterialSaves } from "../hooks/useLocalStudyMaterial.ts";
import { api } from "../api.ts";

// A note saved a moment ago is only optimistic on screen. Without the wait the server builds the
// Anki fields from the file as it was before that save. Every open save is waited for, not only
// the ones of this subject: adding a word writes its kanji and radical notes too.
export async function addToAnkiAfterSaves(subjectId: number, type: SubjectType) {
  await waitForLocalStudyMaterialSaves();
  return api.addToAnki(subjectId, type);
}
