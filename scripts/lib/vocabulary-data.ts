import { KANA_VOCABULARY_PATH, VOCABULARY_PATH } from "@shared/data-paths.ts";
import { readJson } from "@shared/files/json-file.ts";
import { getPrimaryReading, isVisibleSubject } from "@shared/wanikani/subject-utils.ts";
import type { ContextSentence, VocabularyReading } from "@shared/wanikani/wanikani.ts";

export type VocabularyItem = {
  id: number;
  data: {
    characters: string;
    hidden_at: string | null;
    readings?: VocabularyReading[];
    parts_of_speech: string[];
    context_sentences: ContextSentence[];
  };
};

export async function loadVocabulary(): Promise<VocabularyItem[]> {
  const [vocabulary, kanaVocabulary] = await Promise.all([
    readJson<VocabularyItem[]>(VOCABULARY_PATH),
    readJson<VocabularyItem[]>(KANA_VOCABULARY_PATH),
  ]);
  return [...vocabulary, ...kanaVocabulary].filter(isVisibleSubject);
}

export function getVocabularyReading(item: VocabularyItem): string {
  return item.data.readings ? getPrimaryReading(item.data.readings) : item.data.characters;
}
