import type {
  LocalStudyMaterial,
  LocalStudyMaterialPatch,
  Meaning,
  MergedStudyMaterial,
  StudyMaterial,
  SubjectReference,
  SubjectType,
} from "./wanikani.ts";

const SUBJECT_TYPES_WITHOUT_READING: SubjectType[] = ["radical", "kana_vocabulary"];

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

export function findLocalStudyMaterial(
  localStudyMaterials: Record<string, LocalStudyMaterial>,
  subjectId: number
): LocalStudyMaterial | null {
  return localStudyMaterials[String(subjectId)] ?? null;
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

export function applyLocalStudyMaterialPatch(
  current: LocalStudyMaterial | null,
  patch: LocalStudyMaterialPatch
): LocalStudyMaterial | null {
  const meaningNote = (patch.meaning_note ?? current?.meaning_note)?.trim();
  const readingNote = (patch.reading_note ?? current?.reading_note)?.trim();
  const synonyms = patchSynonyms(current?.meaning_synonyms, patch);

  const next: LocalStudyMaterial = {};
  if (meaningNote) next.meaning_note = meaningNote;
  if (readingNote) next.reading_note = readingNote;
  if (synonyms.length > 0) next.meaning_synonyms = synonyms;
  return Object.keys(next).length > 0 ? next : null;
}

/** The problem with the value of a study material field, or null. The field name is not checked. */
export function localStudyMaterialValueProblem(field: string, value: unknown): string | null {
  if (field === "meaning_synonyms") {
    const isStringList = Array.isArray(value) && value.every((item) => typeof item === "string");
    return isStringList ? null : "must be an array of strings";
  }
  return typeof value === "string" ? null : "must be a string";
}

/** The problem with a `reading_note` on this subject type, or null. */
export function readingNoteProblem(type: SubjectType): string | null {
  return SUBJECT_TYPES_WITHOUT_READING.includes(type) ? `a ${type} has no reading` : null;
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

// A patch names one word to add or to remove, never the whole list. So a client that holds an
// old record cannot delete a synonym it never saw, and the file is always the base of the change.
function patchSynonyms(current: string[] | undefined, patch: LocalStudyMaterialPatch): string[] {
  const kept = cleanSynonyms(current).filter((item) => item !== patch.remove_synonym?.trim());
  const added = patch.add_synonym?.trim();
  if (!added || kept.includes(added)) return kept;
  return [...kept, added];
}

function cleanSynonyms(synonyms: string[] | undefined): string[] {
  return [...new Set((synonyms ?? []).map((item) => item.trim()).filter((item) => item !== ""))];
}
