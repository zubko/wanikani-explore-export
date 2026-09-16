import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { resetFsMock, setFileContent, setFsError } from "@/test/preload.ts";
import {
  checkLocalStudyMaterialSubjects,
  LOCAL_STUDY_MATERIALS_PATH,
  readLocalStudyMaterials,
} from "../data-loader.ts";
import { ensureRepositoryInitialized } from "./setup.ts";

function setFile(content: unknown): void {
  setFileContent(
    LOCAL_STUDY_MATERIALS_PATH,
    typeof content === "string" ? content : JSON.stringify(content)
  );
}

async function readError(): Promise<string> {
  return await readLocalStudyMaterials().then(
    () => "no error",
    (error: unknown) => String(error)
  );
}

beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("readLocalStudyMaterials", () => {
  test("reads a file the user typed by hand", async () => {
    const file = {
      "1": { meaning_note: "Flat ground", meaning_synonyms: ["ground"] },
      "456": { reading_note: "Kawa like a river bank" },
    };
    setFile(file);

    expect(await readLocalStudyMaterials()).toEqual(file);
  });

  test("a string where the synonym list belongs names the subject and the field", async () => {
    setFile({ "1": { meaning_synonyms: "ground" } });

    expect(await readError()).toContain("subject 1 field meaning_synonyms must be an array");
  });

  test("a synonym that is not a string is refused", async () => {
    setFile({ "1": { meaning_synonyms: ["ground", 7] } });

    expect(await readError()).toContain("subject 1 field meaning_synonyms must be an array");
  });

  test("a note that is not a string names the subject and the field", async () => {
    setFile({ "456": { meaning_note: ["Two lines"] } });

    expect(await readError()).toContain("subject 456 field meaning_note must be a string");
  });

  test("an unknown field is refused", async () => {
    setFile({ "456": { reading_hint: "Kawa" } });

    expect(await readError()).toContain("subject 456 field reading_hint is not a known field");
  });

  test("an array root is refused", async () => {
    setFile([]);

    expect(await readError()).toContain("the root must be a JSON object");
  });

  test("an entry that is not an object is refused", async () => {
    setFile({ "1": "Flat ground" });

    expect(await readError()).toContain("subject 1 must be a JSON object");
  });

  test("an entry with no field is refused", async () => {
    setFile({ "958": {} });

    expect(await readError()).toContain("subject 958 has no field");
  });

  test("a missing file tells the user to create it", async () => {
    setFsError("readFile", Object.assign(new Error("no such file"), { code: "ENOENT" }));

    expect(await readError()).toContain("Create it with {} inside");
  });

  test("broken JSON reports the parse error and not the create hint", async () => {
    setFile("{ broken");

    const error = await readError();
    expect(error).toContain(`Cannot read ${LOCAL_STUDY_MATERIALS_PATH}`);
    expect(error).toContain("JSON");
    expect(error).not.toContain("Create it with");
  });
});

describe("checkLocalStudyMaterialSubjects", () => {
  beforeAll(ensureRepositoryInitialized);

  function subjectError(records: Record<string, LocalStudyMaterial>): string {
    try {
      checkLocalStudyMaterialSubjects(records);
      return "no error";
    } catch (error) {
      return String(error);
    }
  }

  test("takes a record for every subject type", () => {
    expect(
      subjectError({
        "1": { meaning_note: "Flat ground" },
        "456": { reading_note: "Kawa" },
        "3766": { reading_note: "Maiban" },
        "9176": { meaning_note: "Here" },
      })
    ).toBe("no error");
  });

  test("an id that is no WaniKani subject is refused", () => {
    expect(subjectError({ "999999": { meaning_note: "Typo" } })).toContain(
      "subject 999999 is not a WaniKani subject"
    );
  });

  test("a key that is not a number is refused", () => {
    expect(subjectError({ ground: { meaning_note: "Typo" } })).toContain(
      "subject ground is not a WaniKani subject"
    );
  });

  test("a reading note on a radical is refused", () => {
    expect(subjectError({ "1": { reading_note: "Ichi" } })).toContain(
      "subject 1 field reading_note a radical has no reading"
    );
  });

  test("a reading note on kana vocabulary is refused", () => {
    expect(subjectError({ "9176": { reading_note: "Koko" } })).toContain(
      "subject 9176 field reading_note a kana_vocabulary has no reading"
    );
  });
});
