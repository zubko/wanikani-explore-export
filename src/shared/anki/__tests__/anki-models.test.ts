import { describe, expect, it } from "bun:test";
import { isAnkiDeckType } from "../anki-models.ts";

describe("isAnkiDeckType", () => {
  it.each(["radical", "kanji", "vocabulary"])("accepts %s", (type) => {
    expect(isAnkiDeckType(type)).toBe(true);
  });

  it("refuses kana_vocabulary, which has no deck of its own", () => {
    expect(isAnkiDeckType("kana_vocabulary")).toBe(false);
  });

  it("refuses an empty string", () => {
    expect(isAnkiDeckType("")).toBe(false);
  });
});
