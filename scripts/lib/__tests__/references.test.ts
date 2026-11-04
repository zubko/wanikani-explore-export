import { describe, expect, it } from "bun:test";
import {
  findMentions,
  findMissingReferences,
  resolveMention,
  type ReferenceLookup,
  type SourceNote,
} from "../references.ts";

const lookup: ReferenceLookup = {
  vocabulary: new Map([
    ["一人", 1],
    ["山", 2],
    ["痛い", 3],
  ]),
  kanji: new Map([
    ["山", 10],
    ["午", 11],
    ["力", 12],
  ]),
  radical: new Map([
    ["力", 20],
    ["禾", 21],
  ]),
};

describe("findMentions", () => {
  it("finds the runs that hold a kanji and skips kana-only runs", () => {
    expect(findMentions("You drink <reading>酒</reading> (さけ) with 一人.")).toEqual([
      "酒",
      "一人",
    ]);
  });

  it("ends a run at a tag", () => {
    expect(findMentions("<ja>痛い</ja>の and <kanji>人</kanji>だ")).toEqual(["痛い", "人"]);
  });

  it("keeps okurigana and the wave dash inside a run", () => {
    expect(findMentions("like 代える or 〜才")).toEqual(["代える", "〜才"]);
  });

  it("lists a repeated mention once", () => {
    expect(findMentions("山 and 山")).toEqual(["山"]);
  });
});

describe("resolveMention", () => {
  it("prefers a word, then a kanji, then a radical", () => {
    expect(resolveMention(lookup, "山")).toEqual({ id: 2, type: "vocabulary", characters: "山" });
    expect(resolveMention(lookup, "午")).toEqual({ id: 11, type: "kanji", characters: "午" });
    expect(resolveMention(lookup, "禾")).toEqual({ id: 21, type: "radical", characters: "禾" });
  });

  it("answers null for a phrase that is no item", () => {
    expect(resolveMention(lookup, "病床にふす")).toBeNull();
  });
});

describe("findMissingReferences", () => {
  const note = (overrides: Partial<SourceNote>): SourceNote => ({
    type: "vocabulary",
    label: "二人",
    characters: "二人",
    fields: {},
    ...overrides,
  });

  it("lists each missing item once, with the first note that mentions it", () => {
    const result = findMissingReferences({
      notes: [
        note({ fields: { reading_explanation: "Like 一人 and 午." } }),
        note({ label: "三人", characters: "三人", fields: { meaning_explanation: "Not 一人." } }),
      ],
      lookup,
      idsInAnki: new Set(),
    });
    expect(result.missing).toEqual([
      { id: 1, type: "vocabulary", characters: "一人", mentionedIn: "二人" },
      { id: 11, type: "kanji", characters: "午", mentionedIn: "二人" },
    ]);
  });

  it("skips items in Anki and the note's own characters", () => {
    const result = findMissingReferences({
      notes: [
        note({
          type: "kanji",
          label: "山",
          characters: "山",
          fields: { meaning_mnemonic: "山 is not 力." },
        }),
      ],
      lookup,
      idsInAnki: new Set([12]),
    });
    expect(result.missing).toEqual([]);
  });

  it("reads only the text fields of the note type", () => {
    const result = findMissingReferences({
      notes: [note({ fields: { sentence_jap: "一人で山に行く。", reading_note: "痛い" } })],
      lookup,
      idsInAnki: new Set(),
    });
    expect(result.missing.map((item) => item.characters)).toEqual(["痛い"]);
  });

  it("collects the mentions that match no item", () => {
    const result = findMissingReferences({
      notes: [note({ fields: { meaning_explanation: "As in 病床にふす or 一人." } })],
      lookup,
      idsInAnki: new Set([1]),
    });
    expect(result.unmatched).toEqual(["病床にふす"]);
  });
});
