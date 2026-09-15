import type {
  LocalStudyMaterial,
  Meaning,
  MergedStudyMaterial,
  StudyMaterial,
  SubjectReference,
  SubjectType,
} from "./wanikani.ts";

export function getPrimaryMeaning(meanings: { meaning: string; primary: boolean }[]): string {
  return meanings.find((m) => m.primary)?.meaning ?? "";
}

export function getPrimaryReading(readings: { reading: string; primary: boolean }[]): string {
  return readings.find((r) => r.primary)?.reading ?? "";
}

export function findByIds<T extends { id: number }>(items: T[], ids: number[]): T[] {
  return ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is T => item !== undefined);
}

export function getExtraMeanings(meanings: Meaning[]): string {
  return meanings
    .filter((m) => !m.primary && m.accepted_answer)
    .map((m) => m.meaning)
    .join(", ");
}

export function findStudyMaterial(
  studyMaterials: StudyMaterial[],
  subjectId: number,
  subjectType: SubjectType
): StudyMaterial | null {
  return (
    studyMaterials.find(
      (sm) => sm.data.subject_id === subjectId && sm.data.subject_type === subjectType
    ) ?? null
  );
}

export function mergeStudyMaterial(
  wanikani: StudyMaterial | null,
  local: LocalStudyMaterial | null
): MergedStudyMaterial {
  return {
    meaningNote: local?.meaning_note || wanikani?.data.meaning_note || "",
    readingNote: local?.reading_note || wanikani?.data.reading_note || "",
    meaningSynonyms: [
      ...new Set([...(wanikani?.data.meaning_synonyms ?? []), ...(local?.meaning_synonyms ?? [])]),
    ],
  };
}

export function buildSubjectReference(params: {
  id: number;
  characters: string | null;
  readings: { reading: string; primary: boolean }[];
  meanings: { meaning: string; primary: boolean }[];
}): SubjectReference {
  return {
    id: params.id,
    characters: params.characters ?? "",
    reading: getPrimaryReading(params.readings),
    meaning: getPrimaryMeaning(params.meanings),
  };
}

type SubjectDataWithReadings = {
  id: number;
  data: {
    characters: string | null;
    readings: { reading: string; primary: boolean }[];
    meanings: { meaning: string; primary: boolean }[];
  };
};

export function buildSubjectReferences(
  allItems: SubjectDataWithReadings[],
  ids: number[]
): SubjectReference[] {
  return findByIds(allItems, ids).map((item) =>
    buildSubjectReference({
      id: item.id,
      characters: item.data.characters,
      readings: item.data.readings,
      meanings: item.data.meanings,
    })
  );
}
