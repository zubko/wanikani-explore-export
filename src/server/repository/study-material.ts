import type { LocalStudyMaterial, SubjectType } from "@/model/wanikani.ts";
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
  const record = applyPatch(next[key] ?? {}, patch);
  if (record) next[key] = record;
  else delete next[key];

  await saveJsonAtomic(LOCAL_STUDY_MATERIALS_PATH, next);
  setLocalStudyMaterials(next);
  return record;
}

function applyPatch(
  current: LocalStudyMaterial,
  patch: LocalStudyMaterial
): LocalStudyMaterial | null {
  const next: LocalStudyMaterial = {
    meaning_note: patch.meaning_note?.trim() ?? current.meaning_note,
    reading_note: patch.reading_note?.trim() ?? current.reading_note,
    meaning_synonyms: cleanSynonyms(patch.meaning_synonyms) ?? current.meaning_synonyms,
  };
  if (!next.meaning_note) delete next.meaning_note;
  if (!next.reading_note) delete next.reading_note;
  if (!next.meaning_synonyms?.length) delete next.meaning_synonyms;
  return Object.keys(next).length > 0 ? next : null;
}

function cleanSynonyms(synonyms: string[] | undefined): string[] | undefined {
  return synonyms?.map((item) => item.trim()).filter((item) => item !== "");
}
