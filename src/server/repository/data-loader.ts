import type {
  RadicalData,
  KanjiData,
  VocabularyData,
  KanaVocabularyData,
  StudyMaterial,
  LocalStudyMaterial,
  VerbConjugations,
} from "@/model/wanikani.ts";
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

// No script creates this file, so a fresh checkout has to be told about it
async function readLocalStudyMaterials(): Promise<Record<string, LocalStudyMaterial>> {
  try {
    return await readJson<Record<string, LocalStudyMaterial>>(LOCAL_STUDY_MATERIALS_PATH);
  } catch (error) {
    throw new Error(
      `Cannot read ${LOCAL_STUDY_MATERIALS_PATH}. Create it with {} inside. ${String(error)}`
    );
  }
}
