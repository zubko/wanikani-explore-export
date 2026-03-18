import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { resetMockState, installFetchMock, ensureRepositoryInitialized } from "./setup.ts";
import { getKanji, getKanjis, findKanjiByCharacters, findKanjiByMeaning } from "../kanji.ts";

installFetchMock();
beforeAll(() => ensureRepositoryInitialized());

describe("getKanji", () => {
  beforeEach(resetMockState);

  test("returns enriched kanji for known id (校, id=658)", async () => {
    const k = await getKanji(658);

    expect(k).toMatchSnapshot();
  });

  test("returns null for non-existent id", async () => {
    const k = await getKanji(999999);
    expect(k).toBeNull();
  });

  test("kanji without visually similar has empty array", async () => {
    // Find a kanji with no visually similar subjects
    const { kanji: kanjiData } = await import("../data-loader.ts");
    const noVisSim = kanjiData.find((k) => k.data.visually_similar_subject_ids.length === 0);
    expect(noVisSim).toBeDefined();

    const k = await getKanji(noVisSim!.id);
    expect(k!.visuallySimilarKanji).toEqual([]);
  });
});

describe("getKanjis", () => {
  beforeEach(resetMockState);

  test("returns multiple kanji preserving input id order", async () => {
    const ids = [658, 440];
    const result = await getKanjis(ids);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(658);
    expect(result[1]!.id).toBe(440);
  });

  test("returns empty array for empty input", async () => {
    const result = await getKanjis([]);
    expect(result).toEqual([]);
  });
});

describe("findKanjiByCharacters", () => {
  beforeEach(resetMockState);

  test("finds kanji by exact character match", async () => {
    const k = await findKanjiByCharacters("校");

    expect(k).not.toBeNull();
    expect(k!.id).toBe(658);
  });

  test("returns null for no match", async () => {
    const k = await findKanjiByCharacters("zzz");
    expect(k).toBeNull();
  });
});

describe("findKanjiByMeaning", () => {
  beforeEach(resetMockState);

  test("finds kanji case-insensitively", async () => {
    const results = await Promise.all([findKanjiByMeaning("school"), findKanjiByMeaning("School")]);

    for (const k of results) {
      expect(k).not.toBeNull();
      expect(k!.id).toBe(658);
    }
  });

  test("returns null for no match", async () => {
    const k = await findKanjiByMeaning("nonexistent_meaning");
    expect(k).toBeNull();
  });
});
