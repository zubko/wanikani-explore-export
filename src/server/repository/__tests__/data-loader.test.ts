import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { unlink } from "fs/promises";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { holdFsOp, resetFsMock, setFileContent, setFsError, writeCalls } from "@/test/preload.ts";
import { setStudyMaterialFile, studyMaterialFixture } from "@/test/study-material-fixture.ts";
import {
  checkLocalStudyMaterialSubjects,
  ensureLocalStudyMaterialsFile,
  getLocalStudyMaterials,
  initRepository,
  readLocalStudyMaterials,
} from "../data-loader.ts";
import { LOCAL_STUDY_MATERIALS_PATH, MNEMONIC_IMAGES_PATH } from "../data-paths.ts";
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

  test("a missing file is refused and not created", async () => {
    await unlink(LOCAL_STUDY_MATERIALS_PATH);

    expect(await readError()).toContain(`${LOCAL_STUDY_MATERIALS_PATH} is missing`);
    expect(writeCalls).toHaveLength(0);
  });

  test("broken JSON reports the parse error and not the create hint", async () => {
    setFile("{ broken");

    const error = await readError();
    expect(error).toContain(`Cannot read ${LOCAL_STUDY_MATERIALS_PATH}`);
    expect(error).toContain("JSON");
    expect(error).not.toContain("is missing");
  });
});

describe("ensureLocalStudyMaterialsFile", () => {
  test("a missing file is created with an empty object", async () => {
    await unlink(LOCAL_STUDY_MATERIALS_PATH);

    await ensureLocalStudyMaterialsFile();

    expect(writeCalls).toEqual([{ path: LOCAL_STUDY_MATERIALS_PATH, data: "{}\n" }]);
    expect(await readLocalStudyMaterials()).toEqual({});
  });

  test("an existing file is left as it is", async () => {
    await ensureLocalStudyMaterialsFile();

    expect(writeCalls).toHaveLength(0);
  });

  test("a file that a pull creates during the call is kept", async () => {
    await unlink(LOCAL_STUDY_MATERIALS_PATH);
    const write = holdFsOp("writeFile");

    const ensure = ensureLocalStudyMaterialsFile();
    await write.reached;
    setStudyMaterialFile(studyMaterialFixture);
    write.release();
    await ensure;

    expect(writeCalls).toHaveLength(0);
    expect(await readLocalStudyMaterials()).toEqual(studyMaterialFixture);
  });

  test("a write error other than an existing file throws and creates nothing", async () => {
    await unlink(LOCAL_STUDY_MATERIALS_PATH);
    setFsError("writeFile", Object.assign(new Error("permission denied"), { code: "EACCES" }));

    await expect(ensureLocalStudyMaterialsFile()).rejects.toThrow("permission denied");

    expect(writeCalls).toHaveLength(0);
  });
});

describe("checkLocalStudyMaterialSubjects", () => {
  beforeAll(ensureRepositoryInitialized);

  function subjectError(
    records: Record<string, LocalStudyMaterial>,
    unknownSubject: "fail" | "skip" = "fail"
  ): string {
    try {
      checkLocalStudyMaterialSubjects({ records, unknownSubject });
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

  test("a record of a hidden subject passes (亼, id=225)", () => {
    expect(subjectError({ "225": { meaning_note: "An old roof" } })).toBe("no error");
  });

  test("an id that is no WaniKani subject is refused", () => {
    expect(subjectError({ "999999": { meaning_note: "Typo" } })).toContain(
      "subject 999999 is not a WaniKani subject"
    );
  });

  test("an unknown id passes with skip, the other rules still apply", () => {
    expect(subjectError({ "999999": { reading_note: "Newer" } }, "skip")).toBe("no error");
    expect(subjectError({ "1": { reading_note: "Ichi" } }, "skip")).toContain(
      "subject 1 field reading_note a radical has no reading"
    );
    expect(subjectError({ ground: { meaning_note: "Typo" } }, "skip")).toContain(
      "key ground is not a subject id"
    );
  });

  test("a key that is not a number is refused", () => {
    expect(subjectError({ ground: { meaning_note: "Typo" } })).toContain(
      "key ground is not a subject id"
    );
  });

  // every lookup uses `String(id)`, so a record under another spelling of the number sits unused
  test("a key that is not the plain number is refused", () => {
    for (const key of ["01", " 1", "1e0", "+1", "1.0"]) {
      expect(subjectError({ [key]: { meaning_note: "Flat ground" } })).toContain(
        `key ${key} is not a subject id`
      );
    }
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

describe("getLocalStudyMaterials", () => {
  beforeAll(ensureRepositoryInitialized);

  test("a reread runs the subject rules", async () => {
    setStudyMaterialFile({ ...studyMaterialFixture, "1": { reading_note: "Ichi" } });

    await expect(getLocalStudyMaterials()).rejects.toThrow(
      "subject 1 field reading_note a radical has no reading"
    );
  });

  // The other machine may have downloaded newer subjects than the arrays loaded at start
  test("a reread keeps a record of a subject the loaded data does not know", async () => {
    const file = { ...studyMaterialFixture, "999999": { meaning_note: "Newer subject" } };
    setStudyMaterialFile(file);

    expect(await getLocalStudyMaterials()).toEqual(file);
  });
});

describe("initRepository", () => {
  // Each call loads the same subject files again, so the other tests keep the same arrays
  test("creates a missing study materials file before it reads it", async () => {
    await unlink(LOCAL_STUDY_MATERIALS_PATH);

    await initRepository();

    expect(writeCalls).toEqual([{ path: LOCAL_STUDY_MATERIALS_PATH, data: "{}\n" }]);
  });

  test("a broken study materials file fails the start", async () => {
    setFileContent(LOCAL_STUDY_MATERIALS_PATH, "{ broken");

    await expect(initRepository()).rejects.toThrow(`Cannot read ${LOCAL_STUDY_MATERIALS_PATH}`);
  });

  test("a record of an unknown subject fails the start", async () => {
    setStudyMaterialFile({ ...studyMaterialFixture, "999999": { meaning_note: "Typo" } });

    await expect(initRepository()).rejects.toThrow("subject 999999 is not a WaniKani subject");
  });

  test("a broken registry line fails the start", async () => {
    setFileContent(MNEMONIC_IMAGES_PATH, "{ broken\n");

    await expect(initRepository()).rejects.toThrow(`Invalid ${MNEMONIC_IMAGES_PATH} line 1`);
  });
});
