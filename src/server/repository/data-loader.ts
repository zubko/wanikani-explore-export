import type {
  RadicalData,
  KanjiData,
  VocabularyData,
  KanaVocabularyData,
  StudyMaterial,
  LocalStudyMaterial,
  VerbConjugations,
} from "@/model/wanikani.ts";
import { LOCAL_STUDY_MATERIAL_NOTE_FIELDS } from "@/model/wanikani.ts";
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

  for (const [subjectId, record] of Object.entries(value)) {
    if (!isRecord(record)) throw invalidFile(`subject ${subjectId} must be a JSON object`);
    for (const [field, fieldValue] of Object.entries(record)) {
      const problem = fieldProblem(field, fieldValue);
      if (problem) throw invalidFile(`subject ${subjectId} field ${field} ${problem}`);
    }
  }
  return value as Record<string, LocalStudyMaterial>;
}

/** The same fields the PATCH route takes, so a hand edit cannot store what the app refuses. */
function fieldProblem(field: string, value: unknown): string | null {
  const noteFields: readonly string[] = LOCAL_STUDY_MATERIAL_NOTE_FIELDS;
  if (noteFields.includes(field)) {
    return typeof value === "string" ? null : "must be a string";
  }
  if (field === "meaning_synonyms") {
    const isStringList = Array.isArray(value) && value.every((item) => typeof item === "string");
    return isStringList ? null : "must be an array of strings";
  }
  return "is not a known field";
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
