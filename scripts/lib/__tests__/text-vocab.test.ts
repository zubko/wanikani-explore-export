import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { KanaVocabulary, Vocabulary } from "@/model/wanikani.ts";
import { resetFsMock, setFileContent, setFsError } from "@/test/preload.ts";
import type { SearchResponse } from "../dev-server-api.ts";
import {
  addRunFailed,
  classifyWord,
  formatWordList,
  parseWordList,
  readWordList,
  RUNS_DIR,
  runDir,
  splitClassifiedWords,
  toVocabularyHit,
  type ClassifiedWord,
  type VocabularyHit,
  type WordEntry,
} from "../text-vocab.ts";

const TOSHOKAN_HIT: VocabularyHit = {
  id: 2467,
  object: "vocabulary",
  characters: "図書館",
  meaning: "Library",
  isCustom: false,
};

const HOTONDO_HIT: VocabularyHit = {
  id: 9213,
  object: "kana_vocabulary",
  characters: "ほとんど",
  meaning: "Most",
  isCustom: false,
};

const DOUZO_HIT: VocabularyHit = {
  id: 1000001,
  object: "kana_vocabulary",
  characters: "どうぞ",
  meaning: "Please",
  isCustom: true,
};

const MOU_HIT: VocabularyHit = {
  id: 9224,
  object: "kana_vocabulary",
  characters: "もう",
  meaning: "Already",
  isCustom: false,
};

const BENKYOU_HIT: VocabularyHit = {
  id: 3320,
  object: "vocabulary",
  characters: "勉強",
  meaning: "Studies",
  isCustom: false,
};

const BENKYOU_SURU_HIT: VocabularyHit = {
  id: 3886,
  object: "vocabulary",
  characters: "勉強する",
  meaning: "To Study",
  isCustom: false,
};

const UNTEN_SURU_HIT: VocabularyHit = {
  id: 3174,
  object: "vocabulary",
  characters: "運転する",
  meaning: "To Drive",
  isCustom: false,
};

const RUN_PATH = "tmp/text-vocab/text-vocab-test/2-dictionary.tsv";

describe("runDir", () => {
  it("puts the run under the runs folder", () => {
    expect(runDir("20261107-1432-図書館")).toBe(`${RUNS_DIR}/20261107-1432-図書館`);
  });

  it.each([undefined, ""])("refuses a missing name (%p)", (name) => {
    expect(() => runDir(name)).toThrow(`--run <name> is missing, name a folder in ${RUNS_DIR}`);
  });

  it.each(["..", ".", "../data", "a/b", "a\\b", "/tmp"])("refuses %s", (name) => {
    expect(() => runDir(name)).toThrow(
      `--run ${name} must be the name of one folder in ${RUNS_DIR}`
    );
  });
});

describe("readWordList", () => {
  beforeEach(resetFsMock);
  afterEach(resetFsMock);

  it("reads and parses the file", async () => {
    setFileContent(RUN_PATH, "図書館\tとしょかん\n");

    expect(await readWordList({ path: RUN_PATH, missingHint: null })).toEqual([
      { word: "図書館", reading: "としょかん" },
    ]);
  });

  it("names the path of a missing file, with the hint", async () => {
    await expect(readWordList({ path: RUN_PATH, missingHint: "run split first" })).rejects.toThrow(
      `${RUN_PATH} is missing, run split first`
    );
  });

  it("names the path of a missing file, with no hint", async () => {
    const promise = readWordList({ path: RUN_PATH, missingHint: null });
    await expect(promise).rejects.toThrow(new Error(`${RUN_PATH} is missing`));
  });

  it("puts the path in front of a bad line", async () => {
    setFileContent(RUN_PATH, "図書館\tとしょかん\n飲む のむ\n");

    await expect(readWordList({ path: RUN_PATH, missingHint: null })).rejects.toThrow(
      `${RUN_PATH} line 2: has no tab`
    );
  });

  it("passes any other read error through", async () => {
    setFileContent(RUN_PATH, "図書館\tとしょかん\n");
    setFsError("readFile", new Error("EACCES: permission denied"));

    await expect(readWordList({ path: RUN_PATH, missingHint: null })).rejects.toThrow(
      new Error("EACCES: permission denied")
    );
  });
});

describe("parseWordList", () => {
  it.each<[string, string, WordEntry[]]>([
    [
      "a kanji word with a reading",
      "図書館\tとしょかん",
      [{ word: "図書館", reading: "としょかん" }],
    ],
    ["a kana word with the same value twice", "すぐ\tすぐ", [{ word: "すぐ", reading: "すぐ" }]],
    ["a katakana word", "コーヒー\tコーヒー", [{ word: "コーヒー", reading: "コーヒー" }]],
    ["a counter with 〜 at the start", "〜冊\tさつ", [{ word: "〜冊", reading: "さつ" }]],
    ["a prefix with 〜 at the end", "各〜\tかく", [{ word: "各〜", reading: "かく" }]],
    ["trimmed columns", "  食べる \t たべる  ", [{ word: "食べる", reading: "たべる" }]],
    ["a word with 々", "人々\tひとびと", [{ word: "人々", reading: "ひとびと" }]],
    ["a kanji word with ー", "ビール瓶\tビールびん", [{ word: "ビール瓶", reading: "ビールびん" }]],
    [
      "CRLF lines",
      "食べる\tたべる\r\n\r\n飲む\tのむ\r\n",
      [
        { word: "食べる", reading: "たべる" },
        { word: "飲む", reading: "のむ" },
      ],
    ],
  ])("reads %s", (_name, text, expected) => {
    expect(parseWordList(text)).toEqual(expected);
  });

  it("skips blank lines and a trailing newline", () => {
    expect(parseWordList("\n食べる\tたべる\n\n  \n飲む\tのむ\n")).toEqual([
      { word: "食べる", reading: "たべる" },
      { word: "飲む", reading: "のむ" },
    ]);
  });

  it("answers no entry for an empty file", () => {
    expect(parseWordList("")).toEqual([]);
  });

  it.each([
    ["no tab", "食べる\tたべる\n飲む のむ", "line 2: has no tab"],
    ["an empty column", "食べる\t ", "line 1: has an empty column"],
    ["three columns", "食べる\tたべる\teat", "line 1: has more than two columns"],
    ["a U+3000 inside a column", "図書　館\tとしょかん", "line 1: has a space inside a column"],
    ["a Latin word", "\ntaberu\tたべる", "line 2: taberu must hold only kana and kanji"],
    [
      "a full-width ～",
      "～冊\tさつ",
      "line 1: ～冊 holds a full-width ～ (U+FF5E), write 〜 (U+301C)",
    ],
    ["〜 in the middle", "食〜る\tたべる", "line 1: 食〜る must hold only kana and kanji"],
    ["〜 twice", "〜冊〜\tさつ", "line 1: 〜冊〜 must hold only kana and kanji"],
    ["a bare 〜", "〜\tさつ", "line 1: 〜 must hold only kana and kanji"],
    ["a kanji in the reading", "図書館\tとしょ館", "line 1: reading としょ館 must hold only kana"],
    ["a 〜 in the reading", "〜冊\t〜さつ", "line 1: reading 〜さつ must hold only kana"],
  ])("refuses %s", (_name, text, message) => {
    expect(() => parseWordList(text)).toThrow(message);
  });

  it("refuses a repeated word and names both lines", () => {
    const text = "食べる\tたべる\n飲む\tのむ\n\n食べる\tたべる\n";
    expect(() => parseWordList(text)).toThrow("line 4: 食べる is already on line 1");
  });
});

describe("formatWordList", () => {
  it("writes one tab line per entry", () => {
    expect(
      formatWordList([
        { word: "図書館", reading: "としょかん" },
        { word: "〜冊", reading: "さつ" },
      ])
    ).toBe("図書館\tとしょかん\n〜冊\tさつ\n");
  });

  it("writes an empty file for no entries", () => {
    expect(formatWordList([])).toBe("");
  });

  it("is the inverse of parseWordList", () => {
    const entries: WordEntry[] = [
      { word: "図書館", reading: "としょかん" },
      { word: "すぐ", reading: "すぐ" },
      { word: "各〜", reading: "かく" },
    ];
    expect(parseWordList(formatWordList(entries))).toEqual(entries);
    const text = "食べる\tたべる\nコーヒー\tコーヒー\n";
    expect(formatWordList(parseWordList(text))).toBe(text);
  });

  it("normalizes a line it read", () => {
    expect(formatWordList(parseWordList("  食べる \t たべる \r\n"))).toBe("食べる\tたべる\n");
  });
});

describe("toVocabularyHit", () => {
  it("answers null when nothing was found", () => {
    expect(toVocabularyHit({ found: false })).toBeNull();
  });

  it("keeps the id, the type, the characters, the primary meaning and isCustom", () => {
    const data = {
      id: 9213,
      object: "kana_vocabulary",
      characters: "ほとんど",
      isCustom: false,
      meanings: [
        { meaning: "Almost All", primary: false, accepted_answer: true },
        { meaning: "Most", primary: true, accepted_answer: true },
      ],
    } as KanaVocabulary;
    expect(toVocabularyHit({ found: true, data })).toEqual(HOTONDO_HIT);
  });

  it("reads a vocabulary hit the same way", () => {
    const data = {
      id: 2467,
      object: "vocabulary",
      characters: "図書館",
      isCustom: false,
      meanings: [{ meaning: "Library", primary: true, accepted_answer: true }],
    } as Vocabulary;
    expect(toVocabularyHit({ found: true, data })).toEqual(TOSHOKAN_HIT);
  });

  it("keeps isCustom of a saved custom word", () => {
    expect(toVocabularyHit(searchResponseOf(DOUZO_HIT))).toEqual(DOUZO_HIT);
  });
});

describe("classifyWord", () => {
  it("answers in-anki for a spelling in the deck, with no search", async () => {
    const search = createSearchStub([TOSHOKAN_HIT]);
    const result = await classifyWord({
      entry: { word: "図書館", reading: "としょかん" },
      charactersInAnki: new Set(["図書館"]),
      search: search.run,
    });
    expect(result).toEqual({ word: "図書館", reading: "としょかん", group: "in-anki" });
    expect(search.calls).toEqual([]);
  });

  it("answers in-wanikani with the hit after one search", async () => {
    const search = createSearchStub([TOSHOKAN_HIT]);
    const result = await classifyWord({
      entry: { word: "図書館", reading: "としょかん" },
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result).toEqual({
      word: "図書館",
      reading: "としょかん",
      group: "in-wanikani",
      hits: [TOSHOKAN_HIT],
    });
    expect(search.calls).toEqual(["図書館"]);
  });

  it("answers in-wanikani for a saved custom word", async () => {
    const search = createSearchStub([DOUZO_HIT]);
    const result = await classifyWord({
      entry: { word: "どうぞ", reading: "どうぞ" },
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result).toEqual({
      word: "どうぞ",
      reading: "どうぞ",
      group: "in-wanikani",
      hits: [DOUZO_HIT],
    });
  });

  it("answers found-by-reading with the reading hit after two searches", async () => {
    const search = createSearchStub([HOTONDO_HIT]);
    const result = await classifyWord({
      entry: { word: "殆ど", reading: "ほとんど" },
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result).toEqual({
      word: "殆ど",
      reading: "ほとんど",
      group: "found-by-reading",
      hit: HOTONDO_HIT,
    });
    expect(search.calls).toEqual(["殆ど", "ほとんど"]);
  });

  it("does not skip a word whose reading is a deck note of another word", async () => {
    const search = createSearchStub([]);
    const result = await classifyWord({
      entry: { word: "要る", reading: "いる" },
      charactersInAnki: new Set(["いる"]),
      search: search.run,
    });
    expect(result.group).toBe("not-in-wanikani");
    expect(search.calls).toEqual(["要る", "いる"]);
  });

  it("answers not-in-wanikani when both searches miss", async () => {
    const search = createSearchStub([]);
    const result = await classifyWord({
      entry: { word: "変な", reading: "へんな" },
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result).toEqual({
      word: "変な",
      reading: "へんな",
      group: "not-in-wanikani",
    });
    expect(search.calls).toEqual(["変な", "へんな"]);
  });

  it.each([
    ["at the start", "〜冊", "さつ"],
    ["at the end", "猛〜", "もう"],
  ])("does not search the reading of a word with 〜 %s", async (_name, word, reading) => {
    const search = createSearchStub([MOU_HIT]);
    const result = await classifyWord({
      entry: { word, reading },
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result).toEqual({ word, reading, group: "not-in-wanikani" });
    expect(search.calls).toEqual([word]);
  });

  it("searches a kana word once when it misses", async () => {
    const search = createSearchStub([]);
    const result = await classifyWord({
      entry: { word: "どうぞ", reading: "どうぞ" },
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result.group).toBe("not-in-wanikani");
    expect(search.calls).toEqual(["どうぞ"]);
  });

  it("passes a thrown error of the first search through", async () => {
    const promise = classifyWord({
      entry: { word: "図書館", reading: "としょかん" },
      charactersInAnki: new Set(),
      search: async () => {
        throw new Error("Search 図書館 failed with status 500");
      },
    });
    await expect(promise).rejects.toThrow("Search 図書館 failed with status 500");
  });

  it("passes a thrown error of the reading search through", async () => {
    const promise = classifyWord({
      entry: { word: "殆ど", reading: "ほとんど" },
      charactersInAnki: new Set(),
      search: async (spelling) => {
        if (spelling === "殆ど") return { found: false };
        throw new Error("Search ほとんど failed with status 500");
      },
    });
    await expect(promise).rejects.toThrow("Search ほとんど failed with status 500");
  });
});

describe("classifyWord with a する verb or a noun", () => {
  const benkyouSuru = { word: "勉強する", reading: "べんきょうする" };
  const unten = { word: "運転", reading: "うんてん" };

  it("adds the する verb and its noun when WaniKani teaches both", async () => {
    const search = createSearchStub([BENKYOU_SURU_HIT, BENKYOU_HIT]);
    const result = await classifyWord({
      entry: benkyouSuru,
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result).toEqual({
      ...benkyouSuru,
      group: "in-wanikani",
      hits: [BENKYOU_SURU_HIT, BENKYOU_HIT],
    });
    expect(search.calls).toEqual(["勉強する", "勉強"]);
  });

  it("finds the noun of a する verb that WaniKani does not teach", async () => {
    const search = createSearchStub([BENKYOU_HIT]);
    const result = await classifyWord({
      entry: benkyouSuru,
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result).toEqual({ ...benkyouSuru, group: "in-wanikani", hits: [BENKYOU_HIT] });
  });

  it("adds only the noun when the する verb is in Anki", async () => {
    const search = createSearchStub([BENKYOU_SURU_HIT, BENKYOU_HIT]);
    const result = await classifyWord({
      entry: benkyouSuru,
      charactersInAnki: new Set(["勉強する"]),
      search: search.run,
    });
    expect(result).toEqual({ ...benkyouSuru, group: "in-wanikani", hits: [BENKYOU_HIT] });
    expect(search.calls).toEqual(["勉強"]);
  });

  it("answers in-anki when one is in Anki and WaniKani does not teach the other", async () => {
    const search = createSearchStub([]);
    const result = await classifyWord({
      entry: benkyouSuru,
      charactersInAnki: new Set(["勉強"]),
      search: search.run,
    });
    expect(result).toEqual({ ...benkyouSuru, group: "in-anki" });
    expect(search.calls).toEqual(["勉強する"]);
  });

  it("answers in-anki with no search when both are in Anki", async () => {
    const search = createSearchStub([]);
    const result = await classifyWord({
      entry: benkyouSuru,
      charactersInAnki: new Set(["勉強する", "勉強"]),
      search: search.run,
    });
    expect(result.group).toBe("in-anki");
    expect(search.calls).toEqual([]);
  });

  it("finds the する verb of a noun that WaniKani does not teach", async () => {
    const search = createSearchStub([UNTEN_SURU_HIT]);
    const result = await classifyWord({
      entry: unten,
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(result).toEqual({ ...unten, group: "in-wanikani", hits: [UNTEN_SURU_HIT] });
    expect(search.calls).toEqual(["運転", "運転する"]);
  });

  it("answers in-anki when the noun misses and its する verb is in Anki", async () => {
    const search = createSearchStub([]);
    const result = await classifyWord({
      entry: unten,
      charactersInAnki: new Set(["運転する"]),
      search: search.run,
    });
    expect(result).toEqual({ ...unten, group: "in-anki" });
    expect(search.calls).toEqual(["運転"]);
  });

  it("searches the する verb before the reading when a kanji noun misses", async () => {
    const search = createSearchStub([]);
    const entry = { word: "日本人", reading: "にほんじん" };
    const result = await classifyWord({ entry, charactersInAnki: new Set(), search: search.run });
    expect(result.group).toBe("not-in-wanikani");
    expect(search.calls).toEqual(["日本人", "日本人する", "にほんじん"]);
  });

  it.each([
    ["a one-kanji する verb", "愛する", "あいする"],
    ["a する verb whose stem ends in kana", "口にする", "くちにする"],
  ])("does not look up the stem of %s", async (_name, word, reading) => {
    const search = createSearchStub([]);
    await classifyWord({
      entry: { word, reading },
      charactersInAnki: new Set(),
      search: search.run,
    });
    expect(search.calls).toEqual([word, reading]);
  });
});

describe("splitClassifiedWords", () => {
  const inAnki: ClassifiedWord = { word: "山", reading: "やま", group: "in-anki" };
  const inWaniKani: ClassifiedWord = {
    word: "図書館",
    reading: "としょかん",
    group: "in-wanikani",
    hits: [TOSHOKAN_HIT],
  };
  const foundByReading: ClassifiedWord = {
    word: "殆ど",
    reading: "ほとんど",
    group: "found-by-reading",
    hit: HOTONDO_HIT,
  };
  const notInWaniKani: ClassifiedWord = {
    word: "〜冊",
    reading: "さつ",
    group: "not-in-wanikani",
  };

  it("puts every group but in-anki into file 3, and the two misses into file 4, in order", () => {
    expect(splitClassifiedWords([notInWaniKani, inAnki, foundByReading, inWaniKani])).toEqual({
      notInAnki: [notInWaniKani, foundByReading, inWaniKani],
      notInWaniKani: [notInWaniKani, foundByReading],
    });
  });

  it("answers two empty lists when every word is in Anki", () => {
    expect(splitClassifiedWords([inAnki])).toEqual({ notInAnki: [], notInWaniKani: [] });
  });
});

describe("addRunFailed", () => {
  const clean = { stopped: false, errors: 0, added: 2, dryRun: false, synced: true };

  it.each<[string, Partial<typeof clean>, boolean]>([
    ["a clean run", {}, false],
    ["a stop", { stopped: true }, true],
    ["an error", { errors: 1 }, true],
    ["a failed end sync after an add", { synced: false }, true],
    ["no end sync when nothing was added", { added: 0, synced: false }, false],
    ["no end sync in a dry run", { dryRun: true, synced: false }, false],
  ])("answers for %s", (_name, change, expected) => {
    expect(addRunFailed({ ...clean, ...change })).toBe(expected);
  });
});

function createSearchStub(hits: VocabularyHit[]) {
  const calls: string[] = [];
  return {
    calls,
    run: async (spelling: string): Promise<SearchResponse> => {
      calls.push(spelling);
      const hit = hits.find((candidate) => candidate.characters === spelling);
      return hit ? searchResponseOf(hit) : { found: false };
    },
  };
}

function searchResponseOf(hit: VocabularyHit): SearchResponse {
  const { id, object, characters, meaning, isCustom } = hit;
  const meanings = [{ meaning, primary: true, accepted_answer: true }];
  return { found: true, data: { id, object, characters, isCustom, meanings } as Vocabulary };
}
