import type { LocalStudyMaterial, SubjectType } from "@/model/wanikani.ts";
import { applyLocalStudyMaterialPatch } from "@/model/subject-utils.ts";
import { saveJsonAtomic } from "@server/utils/json-utils.ts";
import {
  radicals,
  kanji,
  vocabulary,
  kanaVocabulary,
  localStudyMaterials,
  setLocalStudyMaterials,
  LOCAL_STUDY_MATERIALS_PATH,
} from "./data-loader.ts";

let queue: Promise<unknown> = Promise.resolve();

export function findSubjectTypeById(id: number): SubjectType | null {
  if (radicals.some((item) => item.id === id)) return "radical";
  if (kanji.some((item) => item.id === id)) return "kanji";
  if (vocabulary.some((item) => item.id === id)) return "vocabulary";
  if (kanaVocabulary.some((item) => item.id === id)) return "kana_vocabulary";
  return null;
}

export function upsertLocalStudyMaterial(
  subjectId: number,
  patch: LocalStudyMaterial
): Promise<LocalStudyMaterial | null> {
  // The caller's promise stays out of the chain, so a rejection reaches the caller
  // and the next save still starts from the last good state
  const run = queue.then(() => saveLocalStudyMaterial(subjectId, patch));
  queue = run.catch(() => {});
  return run;
}

async function saveLocalStudyMaterial(
  subjectId: number,
  patch: LocalStudyMaterial
): Promise<LocalStudyMaterial | null> {
  const key = String(subjectId);
  const next = { ...localStudyMaterials };
  const record = applyLocalStudyMaterialPatch(next[key] ?? null, patch);
  if (record) next[key] = record;
  else delete next[key];

  await saveJsonAtomic(LOCAL_STUDY_MATERIALS_PATH, next);
  setLocalStudyMaterials(next);
  return record;
}
