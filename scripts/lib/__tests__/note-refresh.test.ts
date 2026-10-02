import { describe, expect, it } from "bun:test";
import type { AnkiAddResult } from "@/model/wanikani.ts";
import {
  pickNotesToRefresh,
  refreshedKanjiCharacters,
  refreshedRadicalNames,
  remainingLimit,
  takeLimit,
} from "../note-refresh.ts";

const notes = [
  { characters: "Ground", meaning: "Ground" },
  { characters: "Mouth", meaning: "Mouth" },
  { characters: "Tree", meaning: "Tree" },
];

const wordResult: AnkiAddResult = {
  subject: { name: "School", characters: "学校", created: false },
  kanji: [
    { character: "学", created: false },
    { character: "校", created: true },
  ],
  radicals: [
    { name: "Tree", created: false },
    { name: "Father", created: false },
  ],
};

const kanjiResult: AnkiAddResult = {
  subject: { name: "One", characters: "一", created: false },
  kanji: [{ character: "一", created: false }],
  radicals: [
    { name: "Ground", created: false },
    { name: "Tree", created: false },
  ],
};

describe("pickNotesToRefresh", () => {
  it("skips a refreshed name and keeps an unknown one", () => {
    const picked = pickNotesToRefresh({
      notes,
      refreshed: new Set(["Mouth", "Fins"]),
      remaining: undefined,
    });
    expect(picked.map((note) => note.characters)).toEqual(["Ground", "Tree"]);
  });

  it("takes at most remaining notes after the refreshed ones are dropped", () => {
    const picked = pickNotesToRefresh({ notes, refreshed: new Set(["Ground"]), remaining: 1 });
    expect(picked.map((note) => note.characters)).toEqual(["Mouth"]);
  });

  it("gives an empty list when nothing remains", () => {
    expect(pickNotesToRefresh({ notes, refreshed: new Set(), remaining: 0 })).toEqual([]);
  });

  it("gives an empty list for a negative remaining count", () => {
    expect(pickNotesToRefresh({ notes, refreshed: new Set(), remaining: -1 })).toEqual([]);
  });

  it("keeps every note when there is no limit", () => {
    expect(pickNotesToRefresh({ notes, refreshed: new Set(), remaining: undefined })).toEqual(
      notes
    );
  });
});

describe("takeLimit", () => {
  it("keeps every item with no limit", () => {
    expect(takeLimit([1, 2, 3], undefined)).toEqual([1, 2, 3]);
  });

  it("takes the first items up to the limit", () => {
    expect(takeLimit([1, 2, 3], 2)).toEqual([1, 2]);
  });

  it("takes nothing for a negative limit", () => {
    expect(takeLimit([1, 2, 3], -1)).toEqual([]);
  });
});

describe("remainingLimit", () => {
  it("stays without a limit when there is none", () => {
    expect(remainingLimit(undefined, 5)).toBeUndefined();
  });

  it("subtracts the used count", () => {
    expect(remainingLimit(10, 4)).toBe(6);
  });

  it("never drops below zero", () => {
    expect(remainingLimit(3, 5)).toBe(0);
  });
});

describe("refreshedKanjiCharacters", () => {
  it("collects the kanji of every result", () => {
    expect(refreshedKanjiCharacters([wordResult, kanjiResult])).toEqual(
      new Set(["学", "校", "一"])
    );
  });
});

describe("refreshedRadicalNames", () => {
  it("collects the radical names of every result once", () => {
    expect(refreshedRadicalNames([wordResult, kanjiResult])).toEqual(
      new Set(["Tree", "Father", "Ground"])
    );
  });

  it("is empty with no results", () => {
    expect(refreshedRadicalNames([])).toEqual(new Set());
  });
});
