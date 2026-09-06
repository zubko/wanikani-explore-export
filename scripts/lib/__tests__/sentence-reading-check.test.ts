import { describe, expect, it } from "bun:test";
import { getReadingProblem } from "../sentence-reading-check.ts";

describe("getReadingProblem", () => {
  it("accepts a reading that keeps every kana and symbol in order", () => {
    expect(getReadingProblem("レベル一です。", "レベルいちです。")).toBeNull();
  });

  it("skips kanji, repeat marks, counters, digits and whitespace", () => {
    expect(getReadingProblem("人々は3ヶ月\n待った。", "ひとびとはさんかげつまった。")).toBeNull();
  });

  it("rejects kanji in the reading", () => {
    expect(getReadingProblem("レベル一です。", "レベル一です。")).toBe("contains kanji");
    expect(getReadingProblem("人々", "ひと々")).toBe("contains kanji");
  });

  it("rejects katakana turned into hiragana", () => {
    expect(getReadingProblem("フランス人です。", "ふらんすじんです。")).toBe(
      "does not follow the sentence"
    );
  });

  it("rejects the reading of another sentence", () => {
    expect(getReadingProblem("水を下さい。", "レベルいちです。")).toBe(
      "does not follow the sentence"
    );
  });

  it("rejects changed punctuation", () => {
    expect(getReadingProblem("はい、そうです。", "はい,そうです.")).toBe(
      "does not follow the sentence"
    );
  });
});
