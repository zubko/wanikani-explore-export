import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import {
  mockState,
  resetMockState,
  installFetchMock,
  ensureRepositoryInitialized,
} from "./setup.ts";
import { getRadical, getRadicals, findRadicalByCharacters, findRadicalByName } from "../radical.ts";

installFetchMock();
beforeAll(() => ensureRepositoryInitialized());

describe("getRadical", () => {
  beforeEach(resetMockState);

  test("returns enriched radical for known id (一, id=1)", async () => {
    const radical = await getRadical(1);

    expect(radical).toMatchSnapshot();
    expect(mockState.fetchCalls).toEqual([]);
  });

  test("returns null for non-existent id", async () => {
    const radical = await getRadical(999999);
    expect(radical).toBeNull();
  });

  test("image-only radical has null characters and populated characterImages", async () => {
    const radical = await getRadical(8766);

    expect(radical).not.toBeNull();
    expect(radical!.characters).toBeNull();
    expect(radical!.characterImages).toBeArray();
    expect(radical!.characterImages!.length).toBeGreaterThan(0);
  });
});

describe("getRadicals", () => {
  beforeEach(resetMockState);

  test("returns multiple radicals preserving input id order", async () => {
    const ids = [8, 1, 23];
    const result = await getRadicals(ids);

    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe(8);
    expect(result[1]!.id).toBe(1);
    expect(result[2]!.id).toBe(23);
  });

  test("skips non-existent ids", async () => {
    const result = await getRadicals([1, 999999, 8]);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(1);
    expect(result[1]!.id).toBe(8);
  });

  test("returns empty array for empty input", async () => {
    const result = await getRadicals([]);
    expect(result).toEqual([]);
  });
});

describe("findRadicalByCharacters", () => {
  beforeEach(resetMockState);

  test("finds radical by exact character match", async () => {
    const radical = await findRadicalByCharacters("一");

    expect(radical).not.toBeNull();
    expect(radical!.id).toBe(1);
  });

  test("returns null for no match", async () => {
    const radical = await findRadicalByCharacters("zzz");
    expect(radical).toBeNull();
  });
});

describe("findRadicalByName", () => {
  beforeEach(resetMockState);

  test("finds radical case-insensitively", async () => {
    const results = await Promise.all([
      findRadicalByName("ground"),
      findRadicalByName("Ground"),
      findRadicalByName("GROUND"),
    ]);

    for (const r of results) {
      expect(r).not.toBeNull();
      expect(r!.id).toBe(1);
    }
  });

  test("returns null for no match", async () => {
    const radical = await findRadicalByName("nonexistent_radical_name");
    expect(radical).toBeNull();
  });
});
