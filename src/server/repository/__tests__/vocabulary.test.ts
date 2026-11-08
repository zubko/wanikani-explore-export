import { describe, test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import { resetMockState, installFetchMock, ensureRepositoryInitialized } from "./setup.ts";
import { resetFsMock } from "@/test/preload.ts";
import {
  customKanaVerb,
  customKanaWord,
  customSubjectFixture,
  customVerb,
  hiddenCustomWord,
  setCustomSubjectsFile,
} from "@/test/custom-subject-fixture.ts";
import {
  getVocabulary,
  getKanaVocabulary,
  findVocabularyByCharacters,
  findVocabularyByMeaning,
} from "../vocabulary.ts";

installFetchMock();
beforeAll(() => ensureRepositoryInitialized());
// The custom word tests change the seeded custom subjects file
beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("getVocabulary", () => {
  beforeEach(resetMockState);

  test("returns enriched vocabulary for known id (毎晩, id=3766)", async () => {
    const v = await getVocabulary(3766);

    expect(v).toMatchSnapshot();
  });

  test("verb has conjugations (入る, id=2480)", async () => {
    const v = await getVocabulary(2480);

    expect(v?.conjugations).toMatchInlineSnapshot(`
      {
        "dictionary": "入る",
        "masu": "入ります",
        "nai": "入らない",
        "te": "入って",
        "type": "verb",
      }
    `);
  });

  test("returns null for non-existent id", async () => {
    const v = await getVocabulary(999999);
    expect(v).toBeNull();
  });

  test("returns null for a hidden word (悪女, id=3359)", async () => {
    const v = await getVocabulary(3359);
    expect(v).toBeNull();
  });
});

describe("getKanaVocabulary", () => {
  beforeEach(resetMockState);

  test("returns enriched kana vocabulary (ここ, id=9209)", async () => {
    const v = await getKanaVocabulary(9209);

    expect(v).toMatchSnapshot();
  });

  test("returns null for regular vocabulary id", async () => {
    const v = await getKanaVocabulary(3766);
    expect(v).toBeNull();
  });

  test("returns null for non-existent id", async () => {
    const v = await getKanaVocabulary(999999);
    expect(v).toBeNull();
  });
});

describe("findVocabularyByCharacters", () => {
  beforeEach(resetMockState);

  test("finds regular vocabulary", async () => {
    const v = await findVocabularyByCharacters("毎晩");

    expect(v).not.toBeNull();
    expect(v!.object).toBe("vocabulary");
  });

  test("finds kana vocabulary", async () => {
    const v = await findVocabularyByCharacters("ここ");

    expect(v).not.toBeNull();
    expect(v!.object).toBe("kana_vocabulary");
  });

  test("returns null for no match", async () => {
    const v = await findVocabularyByCharacters("zzzzz");
    expect(v).toBeNull();
  });

  test("never finds a hidden word (悪女, id=3359)", async () => {
    const v = await findVocabularyByCharacters("悪女");
    expect(v).toBeNull();
  });
});

describe("findVocabularyByMeaning", () => {
  beforeEach(resetMockState);

  test("finds regular vocabulary case-insensitively", async () => {
    const v = await findVocabularyByMeaning("every night");

    expect(v).not.toBeNull();
    expect(v!.object).toBe("vocabulary");
    expect(v!.id).toBe(3766);
  });

  test("finds kana vocabulary", async () => {
    const v = await findVocabularyByMeaning("here");

    expect(v).not.toBeNull();
    expect(v!.object).toBe("kana_vocabulary");
    expect(v!.id).toBe(9209);
  });

  test("returns null for no match", async () => {
    const v = await findVocabularyByMeaning("nonexistent_meaning_xyz");
    expect(v).toBeNull();
  });

  test("never finds a hidden word (Evil Woman, id=3359)", async () => {
    const v = await findVocabularyByMeaning("evil woman");
    expect(v).toBeNull();
  });
});

describe("custom words", () => {
  beforeEach(() => setCustomSubjectsFile(customSubjectFixture));

  test("finds the custom kana word by characters and by id", async () => {
    const byCharacters = await findVocabularyByCharacters("どうぞ");
    const byId = await getKanaVocabulary(customKanaWord.id);

    expect(byCharacters).toEqual(byId);
    expect(byId).toMatchObject({
      object: "kana_vocabulary",
      id: customKanaWord.id,
      isCustom: true,
      documentUrl: null,
      level: 0,
      conjugations: null,
      contextSentences: customKanaWord.data.context_sentences,
    });
  });

  test("a custom kana verb takes its conjugations from the record", async () => {
    const v = await getKanaVocabulary(customKanaVerb.id);

    expect(v?.conjugations).toEqual({ type: "verb", ...customKanaVerb.data.conjugations! });
  });

  test("a custom verb takes its conjugations, kanji and sentence readings from the record", async () => {
    const v = await getVocabulary(customVerb.id);

    expect(v).toMatchObject({
      isCustom: true,
      documentUrl: null,
      conjugations: { type: "verb", ...customVerb.data.conjugations! },
      contextSentences: customVerb.data.context_sentences,
      componentSubjectIds: customVerb.data.component_subject_ids,
    });
    expect(v?.componentKanji.map((k) => k.characters)).toEqual(["下"]);
  });

  test("finds a custom word by its primary meaning", async () => {
    const v = await findVocabularyByMeaning("to hand down");
    expect(v?.id).toBe(customVerb.id);
  });

  test("never finds the hidden custom word", async () => {
    expect(await findVocabularyByCharacters("下記")).toBeNull();
    expect(await getVocabulary(hiddenCustomWord.id)).toBeNull();
  });

  test("a WaniKani word still has isCustom false", async () => {
    const v = await findVocabularyByCharacters("毎晩");
    expect(v?.isCustom).toBe(false);
  });
});
