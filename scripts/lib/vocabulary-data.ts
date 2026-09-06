import { readFile } from "fs/promises";
import { getPrimaryReading } from "../../src/model/subject-utils.ts";
import type { ContextSentence, VocabularyReading } from "../../src/model/wanikani.ts";

export type VocabularyItem = {
  id: number;
  data: {
    characters: string;
    readings?: VocabularyReading[];
    parts_of_speech: string[];
    context_sentences: ContextSentence[];
  };
};

const VOCABULARY_FILE = "./data/userdata/vocabulary.json";
const KANA_VOCABULARY_FILE = "./data/userdata/kana_vocabulary.json";

export async function loadVocabulary(): Promise<VocabularyItem[]> {
  const [vocabContent, kanaContent] = await Promise.all([
    readFile(VOCABULARY_FILE, "utf-8"),
    readFile(KANA_VOCABULARY_FILE, "utf-8"),
  ]);
  const vocabulary = JSON.parse(vocabContent) as VocabularyItem[];
  const kanaVocabulary = JSON.parse(kanaContent) as VocabularyItem[];
  return [...vocabulary, ...kanaVocabulary];
}

export function getVocabularyReading(item: VocabularyItem): string {
  return item.data.readings ? getPrimaryReading(item.data.readings) : item.data.characters;
}
