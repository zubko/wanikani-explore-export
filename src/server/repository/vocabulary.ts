import type {
  Vocabulary,
  KanaVocabulary,
  VocabularyData,
  KanaVocabularyData,
  ContextSentence,
  Conjugations,
} from "@/model/wanikani.ts";
import {
  findStudyMaterial,
  findLocalStudyMaterial,
  getPrimaryMeaning,
  isVisibleSubject,
} from "@/model/subject-utils.ts";
import { isCustomSubjectId } from "@/model/custom-subject-utils.ts";
import {
  studyMaterials,
  getLocalStudyMaterials,
  getVocabularyData,
  getKanaVocabularyData,
  getWords,
  verbConjugations,
  sentenceReadings,
} from "./data-loader.ts";
import { getKanjis } from "./kanji.ts";

async function mapVocabularyDataToVocabulary(data: VocabularyData): Promise<Vocabulary> {
  const componentKanji = await getKanjis(data.data.component_subject_ids);
  const localStudyMaterials = await getLocalStudyMaterials();

  return {
    object: "vocabulary" as const,
    id: data.id,
    characters: data.data.characters ?? "",
    slug: data.data.slug,
    level: data.data.level,
    documentUrl: data.data.document_url,
    isCustom: isCustomSubjectId(data.id),
    meanings: data.data.meanings,
    auxiliaryMeanings: data.data.auxiliary_meanings,
    meaningMnemonic: data.data.meaning_mnemonic,
    readings: data.data.readings,
    readingMnemonic: data.data.reading_mnemonic,
    partsOfSpeech: data.data.parts_of_speech,
    componentSubjectIds: componentKanji.map((kanjiItem) => kanjiItem.id),
    contextSentences: getContextSentences(data),
    pronunciationAudios: data.data.pronunciation_audios,
    studyMaterial: findStudyMaterial(studyMaterials, data.id, "vocabulary"),
    localStudyMaterial: findLocalStudyMaterial(localStudyMaterials, data.id),
    componentKanji,
    conjugations: getConjugations(data),
  };
}

async function mapKanaVocabularyDataToKanaVocabulary(
  data: KanaVocabularyData
): Promise<KanaVocabulary> {
  const localStudyMaterials = await getLocalStudyMaterials();

  return {
    object: "kana_vocabulary" as const,
    id: data.id,
    characters: data.data.characters ?? "",
    slug: data.data.slug,
    level: data.data.level,
    documentUrl: data.data.document_url,
    isCustom: isCustomSubjectId(data.id),
    meanings: data.data.meanings,
    auxiliaryMeanings: data.data.auxiliary_meanings,
    meaningMnemonic: data.data.meaning_mnemonic,
    partsOfSpeech: data.data.parts_of_speech,
    contextSentences: getContextSentences(data),
    pronunciationAudios: data.data.pronunciation_audios,
    studyMaterial: findStudyMaterial(studyMaterials, data.id, "kana_vocabulary"),
    localStudyMaterial: findLocalStudyMaterial(localStudyMaterials, data.id),
    conjugations: getConjugations(data),
  };
}

async function findAndBuildVocabulary(
  predicate: (v: VocabularyData | KanaVocabularyData) => boolean
): Promise<Vocabulary | KanaVocabulary | null> {
  const word = (await getWords()).find((v) => isVisibleSubject(v) && predicate(v));
  if (!word) return null;
  return word.object === "vocabulary"
    ? mapVocabularyDataToVocabulary(word)
    : mapKanaVocabularyDataToKanaVocabulary(word);
}

export async function getVocabulary(id: number): Promise<Vocabulary | null> {
  const data = (await getVocabularyData()).find((v) => v.id === id && isVisibleSubject(v));
  if (!data) return null;
  return mapVocabularyDataToVocabulary(data);
}

export async function getKanaVocabulary(id: number): Promise<KanaVocabulary | null> {
  const data = (await getKanaVocabularyData()).find((v) => v.id === id && isVisibleSubject(v));
  if (!data) return null;
  return mapKanaVocabularyDataToKanaVocabulary(data);
}

export async function findVocabularyByCharacters(
  chars: string
): Promise<Vocabulary | KanaVocabulary | null> {
  return findAndBuildVocabulary((v) => v.data.characters === chars);
}

export async function findVocabularyByMeaning(
  meaning: string
): Promise<Vocabulary | KanaVocabulary | null> {
  const normalizedMeaning = meaning.toLowerCase();
  return findAndBuildVocabulary(
    (v) => getPrimaryMeaning(v.data.meanings).toLowerCase() === normalizedMeaning
  );
}

// A custom record holds its conjugations and sentence readings itself, a WaniKani word gets them
// from the two LLM files
function getConjugations(data: VocabularyData | KanaVocabularyData): Conjugations | null {
  const raw = isCustomSubjectId(data.id) ? data.data.conjugations : verbConjugations[data.id];
  return raw ? { type: "verb", ...raw } : null;
}

function getContextSentences(data: VocabularyData | KanaVocabularyData): ContextSentence[] {
  const sentences = data.data.context_sentences;
  if (isCustomSubjectId(data.id)) return sentences;
  const entry = sentenceReadings[data.id];
  if (!entry) return sentences;
  return sentences.map((s) => (s.ja === entry.ja ? { ...s, reading: entry.reading } : s));
}
