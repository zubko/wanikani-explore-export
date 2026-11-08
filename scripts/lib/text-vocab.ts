import { readFile } from "fs/promises";
import { join } from "path";
import { CHARACTERS_PATTERN, KANA_PATTERN } from "../../src/model/custom-subject-utils.ts";
import { getPrimaryMeaning } from "../../src/model/subject-utils.ts";
import type { SearchResponse } from "./dev-server-api.ts";

export type WordEntry = { word: string; reading: string };

export type VocabularyHit = {
  id: number;
  object: "vocabulary" | "kana_vocabulary";
  characters: string;
  meaning: string;
  isCustom: boolean;
};

export type ClassifiedWord = WordEntry &
  (
    | { group: "in-anki" | "not-in-wanikani" }
    | { group: "in-wanikani"; hits: VocabularyHit[] }
    | { group: "found-by-reading"; hit: VocabularyHit }
  );

export type WordGroup = ClassifiedWord["group"];

export const RUNS_DIR = "tmp/text-vocab";
export const DICTIONARY_FILE = "2-dictionary.tsv";
export const NOT_IN_ANKI_FILE = "3-not-in-anki.tsv";
export const NOT_IN_WANIKANI_FILE = "4-not-in-wanikani.tsv";

// WaniKani writes the number or the stem of a counter, prefix or suffix as 〜 (U+301C)
const WAVE_DASH = "〜";
const FULL_WIDTH_TILDE = "～";
const SURU = "する";
const ENDS_WITH_KANJI = /[\p{Script=Han}々]$/u;

export function runDir(name: string | undefined): string {
  if (!name) throw new Error(`--run <name> is missing, name a folder in ${RUNS_DIR}`);
  if (name === "." || name === ".." || /[/\\]/.test(name)) {
    throw new Error(`--run ${name} must be the name of one folder in ${RUNS_DIR}`);
  }
  return join(RUNS_DIR, name);
}

export async function readWordList(params: {
  path: string;
  missingHint: string | null;
}): Promise<WordEntry[]> {
  const { path, missingHint } = params;
  let text: string;
  try {
    text = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    throw new Error(`${path} is missing${missingHint ? `, ${missingHint}` : ""}`);
  }
  try {
    return parseWordList(text);
  } catch (err) {
    throw new Error(`${path} ${(err as Error).message}`);
  }
}

export function parseWordList(text: string): WordEntry[] {
  const entries: WordEntry[] = [];
  const lineByWord = new Map<string, number>();
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const lineNumber = index + 1;
    const entry = parseWordLine(line, lineNumber);
    const earlierLine = lineByWord.get(entry.word);
    if (earlierLine !== undefined) {
      throw new Error(`line ${lineNumber}: ${entry.word} is already on line ${earlierLine}`);
    }
    lineByWord.set(entry.word, lineNumber);
    entries.push(entry);
  });
  return entries;
}

export function formatWordList(entries: WordEntry[]): string {
  return entries.map(({ word, reading }) => `${word}\t${reading}\n`).join("");
}

export function toVocabularyHit(response: SearchResponse): VocabularyHit | null {
  if (!response.found) return null;
  const { id, object, characters, meanings, isCustom } = response.data;
  return { id, object, characters, meaning: getPrimaryMeaning(meanings), isCustom };
}

export async function classifyWord(params: {
  entry: WordEntry;
  charactersInAnki: Set<string>;
  search: (spelling: string) => Promise<SearchResponse>;
}): Promise<ClassifiedWord> {
  const { entry, charactersInAnki, search } = params;
  const lookUp = async (spelling: string): Promise<VocabularyHit | "in-anki" | null> =>
    charactersInAnki.has(spelling) ? "in-anki" : toVocabularyHit(await search(spelling));
  const inAnki: ClassifiedWord = { ...entry, group: "in-anki" };

  // WaniKani teaches many する verbs and their nouns as two words, and often only one of the two
  const noun = entry.word.endsWith(SURU) ? entry.word.slice(0, -SURU.length) : null;
  if (noun !== null && isSuruNoun(noun)) {
    const results = [await lookUp(entry.word), await lookUp(noun)];
    const hits = results.filter(
      (result): result is VocabularyHit => result !== null && result !== "in-anki"
    );
    if (hits.length > 0) return { ...entry, group: "in-wanikani", hits };
    if (results.includes("in-anki")) return inAnki;
  } else {
    const spellings = isSuruNoun(entry.word) ? [entry.word, entry.word + SURU] : [entry.word];
    for (const spelling of spellings) {
      const result = await lookUp(spelling);
      if (result === "in-anki") return inAnki;
      if (result) return { ...entry, group: "in-wanikani", hits: [result] };
    }
  }

  // the reading of a 〜 word holds only the kana of its kanji part, so it finds unrelated words
  if (entry.reading !== entry.word && !entry.word.includes(WAVE_DASH)) {
    const readingHit = toVocabularyHit(await search(entry.reading));
    if (readingHit) return { ...entry, group: "found-by-reading", hit: readingHit };
  }
  return { ...entry, group: "not-in-wanikani" };
}

export function splitClassifiedWords(words: ClassifiedWord[]): {
  notInAnki: ClassifiedWord[];
  notInWaniKani: ClassifiedWord[];
} {
  const notInAnki = words.filter((word) => word.group !== "in-anki");
  const notInWaniKani = notInAnki.filter((word) => word.group !== "in-wanikani");
  return { notInAnki, notInWaniKani };
}

export function addRunFailed(params: {
  stopped: boolean;
  errors: number;
  added: number;
  dryRun: boolean;
  synced: boolean;
}): boolean {
  const { stopped, errors, added, dryRun, synced } = params;
  const endSyncFailed = added > 0 && !dryRun && !synced;
  return stopped || errors > 0 || endSyncFailed;
}

function parseWordLine(line: string, lineNumber: number): WordEntry {
  const fail = (reason: string) => new Error(`line ${lineNumber}: ${reason}`);
  const columns = line.split("\t").map((column) => column.trim());
  const [word, reading] = columns;
  if (word === undefined || reading === undefined) throw fail("has no tab");
  if (columns.length > 2) throw fail("has more than two columns");
  if (columns.some((column) => column === "")) throw fail("has an empty column");
  if (columns.some((column) => /\s/u.test(column))) throw fail("has a space inside a column");

  if (word.includes(FULL_WIDTH_TILDE)) {
    throw fail(`${word} holds a full-width ～ (U+FF5E), write 〜 (U+301C)`);
  }
  if (!isWordSpelling(word)) {
    throw fail(`${word} must hold only kana and kanji, with at most one 〜 at its start or end`);
  }
  if (!KANA_PATTERN.test(reading)) throw fail(`reading ${reading} must hold only kana`);
  return { word, reading };
}

// a one-kanji stem like 愛 or 関 is often not the same word as its する verb
function isSuruNoun(spelling: string): boolean {
  return (
    [...spelling].length >= 2 && !spelling.includes(WAVE_DASH) && ENDS_WITH_KANJI.test(spelling)
  );
}

function isWordSpelling(word: string): boolean {
  let stem = word;
  if (word.startsWith(WAVE_DASH)) stem = word.slice(WAVE_DASH.length);
  else if (word.endsWith(WAVE_DASH)) stem = word.slice(0, -WAVE_DASH.length);
  return CHARACTERS_PATTERN.test(stem);
}
