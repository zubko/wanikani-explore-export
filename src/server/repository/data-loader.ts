import type {
  RadicalData,
  KanjiData,
  VocabularyData,
  KanaVocabularyData,
  StudyMaterial,
  VerbConjugations,
} from "@/model/wanikani.ts";
import type { MnemonicImageFetcher } from "./mnemonic-image-fetcher.ts";
import { createMnemonicImageFetcher } from "./mnemonic-image-fetcher.ts";
import { readJson } from "@server/utils/json-utils.ts";

type RawVerbConjugations = Omit<VerbConjugations, "type">;

export type SentenceReadingEntry = { ja: string; reading: string };

export let radicals: RadicalData[];
export let kanji: KanjiData[];
export let vocabulary: VocabularyData[];
export let kanaVocabulary: KanaVocabularyData[];
export let studyMaterials: StudyMaterial[];
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
    verbConjugations,
    sentenceReadings,
    imageFetcher,
  ] = await Promise.all([
    readJson<RadicalData[]>("./data/userdata/radicals.json"),
    readJson<KanjiData[]>("./data/userdata/kanji.json"),
    readJson<VocabularyData[]>("./data/userdata/vocabulary.json"),
    readJson<KanaVocabularyData[]>("./data/userdata/kana_vocabulary.json"),
    readJson<StudyMaterial[]>("./data/userdata/study_materials.json"),
    readJson<Record<string, RawVerbConjugations>>("./data/verb_conjugations.json"),
    readJson<Record<string, SentenceReadingEntry>>("./data/sentence_readings.json"),
    createMnemonicImageFetcher(),
  ]);
}

export async function saveCache(): Promise<void> {
  await imageFetcher.saveIfNeeded();
}
