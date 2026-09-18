import { describe, test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { writeCalls, setFileContent, setFsError } from "@/test/preload.ts";
import {
  lastWrite,
  loadStudyMaterialFixture,
  resetStudyMaterialState,
  setStudyMaterialFile,
  studyMaterialFixture as fixture,
} from "@/test/study-material-fixture.ts";
import {
  findSubjectTypeById,
  localStudyMaterials,
  LOCAL_STUDY_MATERIALS_PATH,
} from "../data-loader.ts";
import { getKanji } from "../kanji.ts";
import { upsertLocalStudyMaterial } from "../study-material.ts";
import { ensureRepositoryInitialized, installFetchMock } from "./setup.ts";

installFetchMock();

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
  await loadStudyMaterialFixture();
});

beforeEach(resetStudyMaterialState);
afterEach(resetStudyMaterialState);

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

  test("removing the last synonym clears the field", async () => {
    const saved = await upsertLocalStudyMaterial(3766, { remove_synonym: "nightly" });

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
    await upsertLocalStudyMaterial(2478, { meaning_note: "   ", remove_synonym: "american" });
    await upsertLocalStudyMaterial(2478, { add_synonym: " yank " });
    await upsertLocalStudyMaterial(958, { reading_note: " \n " });
    await upsertLocalStudyMaterial(1, {
      meaning_note: "",
      remove_synonym: "flat ground",
      add_synonym: " ",
    });

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

    expect(saved).toEqual({ meaning_note: "New note", meaning_synonyms: ["flat ground"] });
    expect(lastWrite()["1"]).toEqual(saved!);
  });
});

describe("upsertLocalStudyMaterial with the file changed outside the app", () => {
  test("an entry added outside survives the next save", async () => {
    setStudyMaterialFile({ ...fixture, "2484": { meaning_note: "Typed by hand" } });

    const saved = await upsertLocalStudyMaterial(958, { reading_note: "Ban the night curfew" });

    const file = lastWrite();
    expect(file["2484"]).toEqual({ meaning_note: "Typed by hand" });
    expect(file["958"]).toEqual(saved!);
    expect(localStudyMaterials["2484"]).toEqual({ meaning_note: "Typed by hand" });
  });

  test("a synonym added outside survives an add from a client with an old list", async () => {
    setStudyMaterialFile({ ...fixture, "2478": { meaning_synonyms: ["american", "by hand"] } });

    const saved = await upsertLocalStudyMaterial(2478, { add_synonym: "yank" });

    expect(saved).toEqual({ meaning_synonyms: ["american", "by hand", "yank"] });
  });

  test("a change outside to the saved subject is the base of the patch", async () => {
    setStudyMaterialFile({ ...fixture, "958": { meaning_note: "Rewritten by hand" } });

    const saved = await upsertLocalStudyMaterial(958, { reading_note: "Ban the night curfew" });

    expect(saved).toEqual({
      meaning_note: "Rewritten by hand",
      reading_note: "Ban the night curfew",
    });
  });

  test("an unreadable file fails the save and writes nothing", async () => {
    setFileContent(LOCAL_STUDY_MATERIALS_PATH, "{ broken");

    await expect(upsertLocalStudyMaterial(1, { meaning_note: "New note" })).rejects.toThrow(
      "Cannot read"
    );

    expect(writeCalls).toHaveLength(0);
    expect(localStudyMaterials["1"]).toEqual(fixture["1"]!);
  });
});

describe("upsertLocalStudyMaterial queue", () => {
  test("two saves for two subjects both land in the file", async () => {
    const first = upsertLocalStudyMaterial(1, { meaning_note: "First" });
    const second = upsertLocalStudyMaterial(2484, { meaning_note: "Second" });
    await Promise.all([first, second]);

    const file = lastWrite();
    expect(file["1"]!.meaning_note).toBe("First");
    expect(file["2484"]).toEqual({ meaning_note: "Second" });
  });

  test("two saves for two fields of one subject both land in the file", async () => {
    const first = upsertLocalStudyMaterial(1, { meaning_note: "First" });
    const second = upsertLocalStudyMaterial(1, { reading_note: "Second" });
    await Promise.all([first, second]);

    expect(lastWrite()["1"]).toEqual({
      meaning_note: "First",
      reading_note: "Second",
      meaning_synonyms: ["flat ground"],
    });
  });
});
