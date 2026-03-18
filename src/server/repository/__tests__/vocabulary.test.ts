import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { resetMockState, installFetchMock, ensureRepositoryInitialized } from "./setup.ts";
import {
  getVocabulary,
  getKanaVocabulary,
  findVocabularyByCharacters,
  findVocabularyByMeaning,
} from "../vocabulary.ts";

installFetchMock();
beforeAll(() => ensureRepositoryInitialized());

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
});

describe("getKanaVocabulary", () => {
  beforeEach(resetMockState);

  test("returns enriched kana vocabulary (ここ, id=9209)", () => {
    const v = getKanaVocabulary(9209);

    expect(v).toMatchSnapshot();
  });

  test("returns null for regular vocabulary id", () => {
    const v = getKanaVocabulary(3766);
    expect(v).toBeNull();
  });

  test("returns null for non-existent id", () => {
    const v = getKanaVocabulary(999999);
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
});
