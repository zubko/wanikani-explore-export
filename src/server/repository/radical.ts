import type { Radical, RadicalData } from "@/model/wanikani.ts";
import {
  findStudyMaterial,
  findLocalStudyMaterial,
  findByIds,
  buildSubjectReferences,
  getPrimaryMeaning,
} from "@/model/subject-utils.ts";
import {
  radicals,
  kanji,
  studyMaterials,
  localStudyMaterials,
  imageFetcher,
} from "./data-loader.ts";

async function buildRadical(data: RadicalData): Promise<Radical> {
  const mnemonicImageUrl = await imageFetcher.get(data.data.document_url);

  const foundInKanji = buildSubjectReferences(kanji, data.data.amalgamation_subject_ids);

  return {
    object: "radical" as const,
    id: data.id,
    characters: data.data.characters,
    characterImages: data.data.character_images,
    slug: data.data.slug,
    level: data.data.level,
    documentUrl: data.data.document_url,
    meanings: data.data.meanings,
    auxiliaryMeanings: data.data.auxiliary_meanings,
    meaningMnemonic: data.data.meaning_mnemonic,
    amalgamationSubjectIds: data.data.amalgamation_subject_ids,
    studyMaterial: findStudyMaterial(studyMaterials, data.id, "radical"),
    localStudyMaterial: findLocalStudyMaterial(localStudyMaterials, data.id),
    mnemonicImageUrl,
    foundInKanji,
  };
}

async function findAndBuildRadical(
  predicate: (r: RadicalData) => boolean
): Promise<Radical | null> {
  const data = radicals.find(predicate);
  if (!data) return null;
  return buildRadical(data);
}

export async function getRadical(id: number): Promise<Radical | null> {
  return findAndBuildRadical((r) => r.id === id);
}

export async function getRadicals(ids: number[]): Promise<Radical[]> {
  const radicalDataList = findByIds(radicals, ids);
  return Promise.all(radicalDataList.map((data) => buildRadical(data)));
}

export async function findRadicalByCharacters(chars: string): Promise<Radical | null> {
  return findAndBuildRadical((r) => r.data.characters === chars);
}

export async function findRadicalByName(name: string): Promise<Radical | null> {
  const normalizedName = name.toLowerCase();
  return findAndBuildRadical(
    (r) => getPrimaryMeaning(r.data.meanings).toLowerCase() === normalizedName
  );
}
