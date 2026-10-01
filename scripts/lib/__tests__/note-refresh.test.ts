import { describe, expect, it } from "bun:test";
import { pickNotesToRefresh } from "../note-refresh.ts";

const notes = [
  { characters: "Ground", meaning: "Ground" },
  { characters: "Mouth", meaning: "Mouth" },
  { characters: "Tree", meaning: "Tree" },
];

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

  it("keeps every note when there is no limit", () => {
    expect(pickNotesToRefresh({ notes, refreshed: new Set(), remaining: undefined })).toEqual(
      notes
    );
  });
});
