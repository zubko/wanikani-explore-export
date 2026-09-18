import type {
  RadicalData,
  KanjiData,
  VocabularyData,
  KanaVocabularyData,
  StudyMaterial,
  LocalStudyMaterial,
  SubjectType,
  VerbConjugations,
} from "@/model/wanikani.ts";
import { LOCAL_STUDY_MATERIAL_FIELDS } from "@/model/wanikani.ts";
import { localStudyMaterialValueProblem, readingNoteProblem } from "@/model/subject-utils.ts";
import type { MnemonicImageFetcher } from "./mnemonic-image-fetcher.ts";
import { createMnemonicImageFetcher } from "./mnemonic-image-fetcher.ts";
import { readJson } from "@server/utils/json-utils.ts";

type RawVerbConjugations = Omit<VerbConjugations, "type">;

export type SentenceReadingEntry = { ja: string; reading: string };

export const LOCAL_STUDY_MATERIALS_PATH = "./data/userdata/study_materials_extra.json";

export let radicals: RadicalData[];
export let kanji: KanjiData[];
export let vocabulary: VocabularyData[];
export let kanaVocabulary: KanaVocabularyData[];
export let studyMaterials: StudyMaterial[];
export let localStudyMaterials: Record<string, LocalStudyMaterial>;
export let verbConjugations: Record<string, RawVerbConjugations>;
export let sentenceReadings: Record<string, SentenceReadingEntry>;
export let imageFetcher: MnemonicImageFetcher;

export async function initRepository(): Promise<void> {
  [
    radicals,
    kanji,
    vocabulary,
    kanaVocabulary,
    studyMaterials,
    localStudyMaterials,
    verbConjugations,
    sentenceReadings,
    imageFetcher,
  ] = await Promise.all([
    readJson<RadicalData[]>("./data/userdata/radicals.json"),
    readJson<KanjiData[]>("./data/userdata/kanji.json"),
    readJson<VocabularyData[]>("./data/userdata/vocabulary.json"),
    readJson<KanaVocabularyData[]>("./data/userdata/kana_vocabulary.json"),
    readJson<StudyMaterial[]>("./data/userdata/study_materials.json"),
    readLocalStudyMaterials(),
    readJson<Record<string, RawVerbConjugations>>("./data/verb_conjugations.json"),
    readJson<Record<string, SentenceReadingEntry>>("./data/sentence_readings.json"),
    createMnemonicImageFetcher(),
  ]);
  checkLocalStudyMaterialSubjects(localStudyMaterials);
}

export function findSubjectTypeById(id: number): SubjectType | null {
  if (radicals.some((item) => item.id === id)) return "radical";
  if (kanji.some((item) => item.id === id)) return "kanji";
  if (vocabulary.some((item) => item.id === id)) return "vocabulary";
  if (kanaVocabulary.some((item) => item.id === id)) return "kana_vocabulary";
  return null;
}

/**
 * The rules that need the subject arrays, so they run after the whole load. `readLocalStudyMaterials`
 * also runs on every save, where a hand-written record of another subject must not fail the write.
 */
export function checkLocalStudyMaterialSubjects(records: Record<string, LocalStudyMaterial>): void {
  for (const [subjectId, record] of Object.entries(records)) {
    const id = subjectIdOfKey(subjectId);
    if (id === null) throw invalidFile(`key ${subjectId} is not a subject id`);

    const type = findSubjectTypeById(id);
    if (!type) throw invalidFile(`subject ${subjectId} is not a WaniKani subject`);

    const problem = "reading_note" in record ? readingNoteProblem(type) : null;
    if (problem) throw invalidFile(`subject ${subjectId} field reading_note ${problem}`);
  }
}

export function setLocalStudyMaterials(next: Record<string, LocalStudyMaterial>): void {
  localStudyMaterials = next;
}

export async function saveCache(): Promise<void> {
  await imageFetcher.saveIfNeeded();
}

export async function readLocalStudyMaterials(): Promise<Record<string, LocalStudyMaterial>> {
  let parsed: unknown;
  try {
    parsed = await readJson<unknown>(LOCAL_STUDY_MATERIALS_PATH);
  } catch (error) {
    // No script creates this file, so a fresh checkout has to be told about it
    if (isMissingFile(error)) {
      throw new Error(`Cannot read ${LOCAL_STUDY_MATERIALS_PATH}. Create it with {} inside.`);
    }
    throw new Error(`Cannot read ${LOCAL_STUDY_MATERIALS_PATH}. ${String(error)}`);
  }
  return parseLocalStudyMaterials(parsed);
}

// The user writes this file by hand, so a wrong shape must stop the start and not the browser
function parseLocalStudyMaterials(value: unknown): Record<string, LocalStudyMaterial> {
  if (!isRecord(value)) throw invalidFile("the root must be a JSON object");

  const knownFields: readonly string[] = LOCAL_STUDY_MATERIAL_FIELDS;
  for (const [subjectId, record] of Object.entries(value)) {
    if (!isRecord(record)) throw invalidFile(`subject ${subjectId} must be a JSON object`);

    const fields = Object.entries(record);
    // the app deletes an entry that has no field left, so an empty one would sit there unused
    if (fields.length === 0) throw invalidFile(`subject ${subjectId} has no field`);

    for (const [field, fieldValue] of fields) {
      if (!knownFields.includes(field)) {
        throw invalidFile(`subject ${subjectId} field ${field} is not a known field`);
      }
      const problem = localStudyMaterialValueProblem(field, fieldValue);
      if (problem) throw invalidFile(`subject ${subjectId} field ${field} ${problem}`);
    }
  }
  return value as Record<string, LocalStudyMaterial>;
}

/**
 * The id of a record key, or null when the key is not the plain number. Every lookup uses
 * `String(id)`, so a record under `"01"` or `" 1"` would never be found again.
 */
function subjectIdOfKey(key: string): number | null {
  const id = Number(key);
  if (!Number.isInteger(id) || id <= 0) return null;
  return String(id) === key ? id : null;
}

function invalidFile(problem: string): Error {
  return new Error(`Invalid ${LOCAL_STUDY_MATERIALS_PATH}: ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
