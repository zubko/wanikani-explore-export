import type {
  Vocabulary,
  KanaVocabulary,
  VocabularyData,
  KanaVocabularyData,
  ContextSentence,
  Conjugations,
} from "@/model/wanikani.ts";
import { findStudyMaterial, getPrimaryMeaning } from "@/model/subject-utils.ts";
import {
  vocabulary,
  kanaVocabulary,
  studyMaterials,
  localStudyMaterials,
  verbConjugations,
  sentenceReadings,
} from "./data-loader.ts";
import { getKanjis } from "./kanji.ts";

function getConjugations(subjectId: number): Conjugations | null {
  const raw = verbConjugations[subjectId];
  return raw ? { type: "verb", ...raw } : null;
}

function enrichContextSentencesWithReadings(
  subjectId: number,
  sentences: ContextSentence[]
): ContextSentence[] {
  const entry = sentenceReadings[subjectId];
  if (!entry) return sentences;
  return sentences.map((s) => (s.ja === entry.ja ? { ...s, reading: entry.reading } : s));
}

async function mapVocabularyDataToVocabulary(data: VocabularyData): Promise<Vocabulary> {
  const componentKanji = await getKanjis(data.data.component_subject_ids);

  return {
    object: "vocabulary" as const,
    id: data.id,
    characters: data.data.characters ?? "",
    slug: data.data.slug,
    level: data.data.level,
    documentUrl: data.data.document_url,
    meanings: data.data.meanings,
    auxiliaryMeanings: data.data.auxiliary_meanings,
    meaningMnemonic: data.data.meaning_mnemonic,
    readings: data.data.readings,
    readingMnemonic: data.data.reading_mnemonic,
    partsOfSpeech: data.data.parts_of_speech,
    componentSubjectIds: data.data.component_subject_ids,
    contextSentences: enrichContextSentencesWithReadings(data.id, data.data.context_sentences),
    pronunciationAudios: data.data.pronunciation_audios,
    studyMaterial: findStudyMaterial(studyMaterials, data.id, "vocabulary"),
    localStudyMaterial: localStudyMaterials[String(data.id)] ?? null,
    componentKanji,
    conjugations: getConjugations(data.id),
  };
}

function mapKanaVocabularyDataToKanaVocabulary(data: KanaVocabularyData): KanaVocabulary {
  return {
    object: "kana_vocabulary" as const,
    id: data.id,
    characters: data.data.characters ?? "",
    slug: data.data.slug,
    level: data.data.level,
    documentUrl: data.data.document_url,
    meanings: data.data.meanings,
    auxiliaryMeanings: data.data.auxiliary_meanings,
    meaningMnemonic: data.data.meaning_mnemonic,
    partsOfSpeech: data.data.parts_of_speech,
    contextSentences: enrichContextSentencesWithReadings(data.id, data.data.context_sentences),
    pronunciationAudios: data.data.pronunciation_audios,
    studyMaterial: findStudyMaterial(studyMaterials, data.id, "kana_vocabulary"),
    localStudyMaterial: localStudyMaterials[String(data.id)] ?? null,
  };
}

async function findAndBuildVocabulary(
  predicate: (v: VocabularyData | KanaVocabularyData) => boolean
): Promise<Vocabulary | KanaVocabulary | null> {
  const vocabData = vocabulary.find(predicate);
  if (vocabData) {
    return mapVocabularyDataToVocabulary(vocabData);
  }

  const kanaVocabData = kanaVocabulary.find(predicate);
  if (kanaVocabData) {
    return mapKanaVocabularyDataToKanaVocabulary(kanaVocabData);
  }

  return null;
}

export async function getVocabulary(id: number): Promise<Vocabulary | null> {
  const data = vocabulary.find((v) => v.id === id);
  if (!data) return null;
  return mapVocabularyDataToVocabulary(data);
}

export function getKanaVocabulary(id: number): KanaVocabulary | null {
  const data = kanaVocabulary.find((v) => v.id === id);
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
