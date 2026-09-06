export type ReadingProblem = "contains kanji" | "does not follow the sentence";

const KANJI = /[㐀-䶿一-鿿々〆]/;
const NOT_KEPT_IN_READING = /[㐀-䶿一-鿿々〆ヶヵ0-9０-９\s]/;

export function getReadingProblem(sentence: string, reading: string): ReadingProblem | null {
  if (KANJI.test(reading)) return "contains kanji";
  if (!followsSentence(sentence, reading)) return "does not follow the sentence";
  return null;
}

function followsSentence(sentence: string, reading: string): boolean {
  let position = 0;
  for (const char of sentence) {
    if (NOT_KEPT_IN_READING.test(char)) continue;
    const index = reading.indexOf(char, position);
    if (index === -1) return false;
    position = index + char.length;
  }
  return true;
}
