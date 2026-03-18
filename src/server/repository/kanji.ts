import type { Kanji, KanjiData } from "@/model/wanikani.ts";
import {
  findStudyMaterial,
  findByIds,
  buildSubjectReferences,
  getPrimaryMeaning,
} from "@/model/subject-utils.ts";
import { kanji, vocabulary, studyMaterials } from "./data-loader.ts";
import { getRadicals } from "./radical.ts";

async function mapKanjiDataToKanji(data: KanjiData): Promise<Kanji> {
  const componentRadicals = await getRadicals(data.data.component_subject_ids);

  const visuallySimilarKanji = buildSubjectReferences(
    kanji,
    data.data.visually_similar_subject_ids
  );
  const foundInVocabulary = buildSubjectReferences(vocabulary, data.data.amalgamation_subject_ids);

  return {
    object: "kanji" as const,
    id: data.id,
    characters: data.data.characters ?? "",
    slug: data.data.slug,
    level: data.data.level,
    documentUrl: data.data.document_url,
    meanings: data.data.meanings,
    auxiliaryMeanings: data.data.auxiliary_meanings,
    meaningMnemonic: data.data.meaning_mnemonic,
    meaningHint: data.data.meaning_hint,
    readings: data.data.readings,
    readingMnemonic: data.data.reading_mnemonic,
    readingHint: data.data.reading_hint,
    componentSubjectIds: data.data.component_subject_ids,
    amalgamationSubjectIds: data.data.amalgamation_subject_ids,
    visuallySimilarSubjectIds: data.data.visually_similar_subject_ids,
    studyMaterial: findStudyMaterial(studyMaterials, data.id, "kanji"),
    componentRadicals,
    visuallySimilarKanji,
    foundInVocabulary,
  };
}

async function findAndBuildKanji(predicate: (k: KanjiData) => boolean): Promise<Kanji | null> {
  const data = kanji.find(predicate);
  if (!data) return null;
  return mapKanjiDataToKanji(data);
}

export async function getKanji(id: number): Promise<Kanji | null> {
  return findAndBuildKanji((k) => k.id === id);
}

export async function getKanjis(ids: number[]): Promise<Kanji[]> {
  const kanjiDataList = findByIds(kanji, ids);
  return Promise.all(kanjiDataList.map((data) => mapKanjiDataToKanji(data)));
}

export async function findKanjiByCharacters(chars: string): Promise<Kanji | null> {
  return findAndBuildKanji((k) => k.data.characters === chars);
}

export async function findKanjiByMeaning(meaning: string): Promise<Kanji | null> {
  const normalizedMeaning = meaning.toLowerCase();
  return findAndBuildKanji(
    (k) => getPrimaryMeaning(k.data.meanings).toLowerCase() === normalizedMeaning
  );
}
