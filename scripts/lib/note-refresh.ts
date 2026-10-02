import type { AnkiAddResult } from "../../src/model/wanikani.ts";

export function takeLimit<T>(items: T[], limit: number | undefined): T[] {
  return limit === undefined ? items : items.slice(0, Math.max(0, limit));
}

export function remainingLimit(limit: number | undefined, used: number): number | undefined {
  return limit === undefined ? undefined : Math.max(0, limit - used);
}

export function pickNotesToRefresh<Note extends { characters: string }>(params: {
  notes: Note[];
  refreshed: ReadonlySet<string>;
  remaining: number | undefined;
}): Note[] {
  const { notes, refreshed, remaining } = params;
  return takeLimit(
    notes.filter((note) => !refreshed.has(note.characters)),
    remaining
  );
}

/** A word add also writes its kanji. */
export function refreshedKanjiCharacters(results: AnkiAddResult[]): Set<string> {
  return new Set(results.flatMap((result) => result.kanji.map((kanji) => kanji.character)));
}

/** A word or kanji add also writes its radicals. A radical note holds its name in `characters`. */
export function refreshedRadicalNames(results: AnkiAddResult[]): Set<string> {
  return new Set(results.flatMap((result) => result.radicals.map((radical) => radical.name)));
}
