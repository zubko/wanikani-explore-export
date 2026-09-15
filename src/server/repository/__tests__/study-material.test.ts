import { describe, test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { writeCalls, resetWriteCalls, setFsError } from "@/test/preload.ts";
import { readJson } from "@server/utils/json-utils.ts";
import {
  localStudyMaterials,
  setLocalStudyMaterials,
  LOCAL_STUDY_MATERIALS_PATH,
} from "../data-loader.ts";
import { getKanji } from "../kanji.ts";
import { findSubjectTypeById, upsertLocalStudyMaterial } from "../study-material.ts";
import { ensureRepositoryInitialized, installFetchMock } from "./setup.ts";

installFetchMock();

const FIXTURE_PATH = "src/test/fixtures/study_materials_extra.json";

let fixture: Record<string, LocalStudyMaterial>;

function lastWrite(): Record<string, LocalStudyMaterial> {
  const call = writeCalls.at(-1);
  if (!call) throw new Error("no write recorded");
  return JSON.parse(call.data) as Record<string, LocalStudyMaterial>;
}

function resetState() {
  resetWriteCalls();
  setLocalStudyMaterials(structuredClone(fixture));
}

function expectNoBlankValues(file: Record<string, LocalStudyMaterial>) {
  for (const record of Object.values(file)) {
    expect(Object.keys(record).length).toBeGreaterThan(0);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        expect(value.length).toBeGreaterThan(0);
        for (const item of value) expect(item.trim()).not.toBe("");
      } else {
        expect(value.trim()).not.toBe("");
      }
    }
  }
}

beforeAll(async () => {
  await ensureRepositoryInitialized();
  fixture = await readJson<Record<string, LocalStudyMaterial>>(FIXTURE_PATH);
});

beforeEach(resetState);
afterEach(resetState);

describe("findSubjectTypeById", () => {
  test("finds each subject type", () => {
    expect(findSubjectTypeById(1)).toBe("radical");
    expect(findSubjectTypeById(456)).toBe("kanji");
    expect(findSubjectTypeById(3766)).toBe("vocabulary");
    expect(findSubjectTypeById(9176)).toBe("kana_vocabulary");
  });

  test("returns null for an unknown id", () => {
    expect(findSubjectTypeById(999999)).toBeNull();
  });
});

describe("upsertLocalStudyMaterial", () => {
  test("creates a new entry and keeps the other entries", async () => {
    const saved = await upsertLocalStudyMaterial(2484, { meaning_note: "Chi + kara = power" });

    expect(saved).toEqual({ meaning_note: "Chi + kara = power" });
    expect(localStudyMaterials["2484"]).toEqual({ meaning_note: "Chi + kara = power" });
    expect(localStudyMaterials["456"]).toEqual(fixture["456"]!);
    expect(lastWrite()["2484"]).toEqual({ meaning_note: "Chi + kara = power" });
  });

  test("updates one field and keeps the others", async () => {
    const saved = await upsertLocalStudyMaterial(958, { reading_note: "Ban like a night ban ban" });

    expect(saved).toEqual({
      meaning_note: "Evening comes after the sun goes down",
      reading_note: "Ban like a night ban ban",
    });
    expect(lastWrite()["958"]).toEqual(saved!);
  });

  test("an empty string clears one field", async () => {
    const saved = await upsertLocalStudyMaterial(958, { reading_note: "" });

    expect(saved).toEqual({ meaning_note: "Evening comes after the sun goes down" });
    expect(lastWrite()["958"]).toEqual(saved!);
  });

  test("an empty list clears the synonyms", async () => {
    const saved = await upsertLocalStudyMaterial(3766, { meaning_synonyms: [] });

    expect(saved).toEqual({ meaning_note: "Every evening, the same routine" });
    expect(lastWrite()["3766"]).toEqual(saved!);
  });

  test("clearing the last field deletes the entry", async () => {
    const saved = await upsertLocalStudyMaterial(456, { reading_note: "" });

    expect(saved).toBeNull();
    expect(localStudyMaterials["456"]).toBeUndefined();
    expect(lastWrite()).not.toHaveProperty("456");
  });

  test("a patch for an unknown entry with empty values writes nothing new", async () => {
    const saved = await upsertLocalStudyMaterial(2484, { meaning_note: "" });

    expect(saved).toBeNull();
    expect(lastWrite()).not.toHaveProperty("2484");
  });

  test("blank values never reach the file", async () => {
    await upsertLocalStudyMaterial(2478, {
      meaning_note: "   ",
      meaning_synonyms: ["", "  ", " yank "],
    });
    await upsertLocalStudyMaterial(958, { reading_note: " \n " });
    await upsertLocalStudyMaterial(1, { meaning_note: "", meaning_synonyms: [" "] });

    expect(localStudyMaterials["2478"]).toEqual({ meaning_synonyms: ["yank"] });
    expect(localStudyMaterials["958"]).toEqual({
      meaning_note: "Evening comes after the sun goes down",
    });
    expect(localStudyMaterials["1"]).toBeUndefined();
    expectNoBlankValues(lastWrite());
  });

  test("a saved note is on the subject at the next read", async () => {
    await upsertLocalStudyMaterial(456, { meaning_note: "Three lines of water" });

    const kanji = await getKanji(456);

    expect(kanji!.localStudyMaterial).toEqual({
      reading_note: "Kawa like a river bank",
      meaning_note: "Three lines of water",
    });
  });

  test("the finished save lands under the real path with a trailing newline", async () => {
    await upsertLocalStudyMaterial(1, { meaning_note: "One line" });

    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]!.path).toBe(LOCAL_STUDY_MATERIALS_PATH);
    expect(writeCalls[0]!.data.endsWith("\n")).toBe(true);
    expect(writeCalls.some((call) => call.path.endsWith(".tmp"))).toBe(false);
  });
});

describe("upsertLocalStudyMaterial write failures", () => {
  test("a writeFile error keeps the memory state and leaves no temp file", async () => {
    setFsError("writeFile", new Error("disk full"));

    await expect(upsertLocalStudyMaterial(1, { meaning_note: "New note" })).rejects.toThrow(
      "disk full"
    );

    expect(localStudyMaterials["1"]).toEqual(fixture["1"]!);
    expect(writeCalls).toHaveLength(0);
  });

  test("a rename error keeps the memory state and removes the temp file", async () => {
    setFsError("rename", new Error("rename failed"));

    await expect(upsertLocalStudyMaterial(1, { meaning_note: "New note" })).rejects.toThrow(
      "rename failed"
    );

    expect(localStudyMaterials["1"]).toEqual(fixture["1"]!);
    expect(writeCalls).toHaveLength(0);
  });

  test("the next save works after the error is cleared", async () => {
    setFsError("writeFile", new Error("disk full"));
    await upsertLocalStudyMaterial(1, { meaning_note: "New note" }).catch(() => {});
    setFsError("writeFile", null);

    const saved = await upsertLocalStudyMaterial(1, { meaning_note: "New note" });

    expect(saved).toEqual({ meaning_note: "New note" });
    expect(lastWrite()["1"]).toEqual({ meaning_note: "New note" });
  });
});

describe("upsertLocalStudyMaterial queue", () => {
  test("two saves for two subjects both land in the file", async () => {
    const first = upsertLocalStudyMaterial(1, { meaning_note: "First" });
    const second = upsertLocalStudyMaterial(2484, { meaning_note: "Second" });
    await Promise.all([first, second]);

    const file = lastWrite();
    expect(file["1"]).toEqual({ meaning_note: "First" });
    expect(file["2484"]).toEqual({ meaning_note: "Second" });
  });

  test("two saves for two fields of one subject both land in the file", async () => {
    const first = upsertLocalStudyMaterial(1, { meaning_note: "First" });
    const second = upsertLocalStudyMaterial(1, { reading_note: "Second" });
    await Promise.all([first, second]);

    expect(lastWrite()["1"]).toEqual({ meaning_note: "First", reading_note: "Second" });
  });
});
