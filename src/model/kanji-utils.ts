import type { KanjiReading } from "./wanikani.ts";

export type ReadingWithPrimary = { reading: string; primary: boolean };

export function getReadingsByType(
  readings: KanjiReading[],
  type: "onyomi" | "kunyomi" | "nanori"
): ReadingWithPrimary[] {
  return readings
    .filter((r) => r.type === type)
    .map((r) => ({ reading: r.reading, primary: r.primary }));
}
