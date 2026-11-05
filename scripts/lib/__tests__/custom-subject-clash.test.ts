import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import {
  customKanaWord,
  customSubjectFixture,
  customVerb,
  hiddenCustomWord,
} from "@/test/custom-subject-fixture.ts";
import { resetFsMock, setFileContent, setFsError } from "@/test/preload.ts";
import { customSubjectClashWarnings } from "../custom-subject-clash.ts";

const CUSTOM_PATH = "./data/custom-subject-clash-test.json";

function word(id: number, characters: string, hiddenAt: string | null = null) {
  return { id, data: { characters, hidden_at: hiddenAt } };
}

describe("customSubjectClashWarnings", () => {
  beforeEach(resetFsMock);
  afterEach(resetFsMock);

  it("prints one line per custom word that WaniKani also has", async () => {
    setFileContent(CUSTOM_PATH, JSON.stringify(customSubjectFixture));

    const lines = await customSubjectClashWarnings({
      path: CUSTOM_PATH,
      wanikaniWords: [word(9001, "どうぞ"), word(9002, "下す"), word(9003, "ここ")],
    });

    expect(lines).toEqual([
      `Warning: custom subject ${customKanaWord.id} "どうぞ" has the same characters as WaniKani 9001`,
      `Warning: custom subject ${customVerb.id} "下す" has the same characters as WaniKani 9002`,
    ]);
  });

  it("skips a hidden word on either side", async () => {
    setFileContent(CUSTOM_PATH, JSON.stringify(customSubjectFixture));

    const lines = await customSubjectClashWarnings({
      path: CUSTOM_PATH,
      wanikaniWords: [word(9001, "どうぞ", "2026-01-01T00:00:00.000Z"), word(9002, "下記")],
    });

    expect(hiddenCustomWord.data.characters).toBe("下記");
    expect(lines).toEqual([]);
  });

  it("prints one line for a missing file", async () => {
    const path = join(import.meta.dir, "missing-custom-subjects.json");
    const lines = await customSubjectClashWarnings({ path, wanikaniWords: [word(9001, "どうぞ")] });

    expect(lines).toEqual([`No ${path}, skipped the custom subject check`]);
  });

  it("prints one line for a file that is not JSON", async () => {
    setFileContent(CUSTOM_PATH, "[{");

    const lines = await customSubjectClashWarnings({ path: CUSTOM_PATH, wanikaniWords: [] });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith(`Could not read ${CUSTOM_PATH}: `);
  });

  it("prints one line for a file with a bad record", async () => {
    setFileContent(CUSTOM_PATH, JSON.stringify([{ ...customKanaWord, id: 5 }]));

    const lines = await customSubjectClashWarnings({ path: CUSTOM_PATH, wanikaniWords: [] });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith(`Could not read ${CUSTOM_PATH}: record 5: `);
  });

  it("prints one line for a read error", async () => {
    setFileContent(CUSTOM_PATH, "[]");
    setFsError("readFile", new Error("disk gone"));

    const lines = await customSubjectClashWarnings({ path: CUSTOM_PATH, wanikaniWords: [] });

    expect(lines).toEqual([`Could not read ${CUSTOM_PATH}: disk gone`]);
  });
});
