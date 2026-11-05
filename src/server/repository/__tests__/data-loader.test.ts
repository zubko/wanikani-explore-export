import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "fs";
import { unlink } from "fs/promises";
import { CUSTOM_SUBJECT_ID_FLOOR } from "@/model/wanikani.ts";
import type { LocalStudyMaterial, RadicalData } from "@/model/wanikani.ts";
import { holdFsOp, resetFsMock, setFileContent, setFsError, writeCalls } from "@/test/preload.ts";
import { setStudyMaterialFile, studyMaterialFixture } from "@/test/study-material-fixture.ts";
import {
  CUSTOM_VERB_KANJI_ID,
  customKanaVerb,
  customKanaWord,
  customSubjectFixture,
  customVerb,
  hiddenCustomWord,
  setCustomSubjectsFile,
} from "@/test/custom-subject-fixture.ts";
import {
  checkLocalStudyMaterialSubjects,
  ensureLocalStudyMaterialsFile,
  getCustomSubjects,
  getCustomWordsByKanji,
  getKanaVocabularyData,
  getLocalStudyMaterials,
  getVocabularyData,
  initRepository,
  readLocalStudyMaterials,
} from "../data-loader.ts";
import {
  CUSTOM_SUBJECTS_PATH,
  LOCAL_STUDY_MATERIALS_PATH,
  MNEMONIC_IMAGES_PATH,
} from "../data-paths.ts";
import { ensureRepositoryInitialized } from "./setup.ts";

const UNKNOWN_CUSTOM_ID = CUSTOM_SUBJECT_ID_FLOOR + 99;

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
      checkLocalStudyMaterialSubjects({
        records,
        unknownSubject,
        customSubjects: customSubjectFixture,
      });
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

  test("a custom id and a hidden custom id pass", () => {
    expect(
      subjectError({
        [customVerb.id]: { reading_note: "Kudasu" },
        [hiddenCustomWord.id]: { meaning_note: "Below" },
      })
    ).toBe("no error");
  });

  test("an unknown custom id is refused, and passes with skip", () => {
    expect(subjectError({ [UNKNOWN_CUSTOM_ID]: { meaning_note: "Typo" } })).toContain(
      `subject ${UNKNOWN_CUSTOM_ID} is not a custom subject`
    );
    expect(subjectError({ [UNKNOWN_CUSTOM_ID]: { meaning_note: "Newer" } }, "skip")).toBe(
      "no error"
    );
  });

  test("a reading note on a custom kana word is refused in both modes", () => {
    for (const mode of ["fail", "skip"] as const) {
      expect(subjectError({ [customKanaWord.id]: { reading_note: "Douzo" } }, mode)).toContain(
        `subject ${customKanaWord.id} field reading_note a kana_vocabulary has no reading`
      );
    }
  });
});

describe("getCustomSubjects", () => {
  beforeAll(ensureRepositoryInitialized);

  async function customError(): Promise<string> {
    return await getCustomSubjects().then(
      () => "no error",
      (error: unknown) => String(error)
    );
  }

  test("the seeded empty file answers no record", async () => {
    expect(await getCustomSubjects()).toEqual([]);
  });

  test("a change from outside shows on the next read", async () => {
    await getCustomSubjects();
    setCustomSubjectsFile(customSubjectFixture);

    expect(await getCustomSubjects()).toEqual(customSubjectFixture);
  });

  test("broken JSON names the path", async () => {
    setFileContent(CUSTOM_SUBJECTS_PATH, "[ broken");

    expect(await customError()).toContain(`Cannot read ${CUSTOM_SUBJECTS_PATH}`);
  });

  test("a bad record names the path and the record", async () => {
    setCustomSubjectsFile([{ ...customVerb, data: { ...customVerb.data, level: 3 } }]);

    expect(await customError()).toContain(
      `Invalid ${CUSTOM_SUBJECTS_PATH}: record ${customVerb.id}: data.level must be 0`
    );
  });

  test("a missing file is refused and not created", async () => {
    await unlink(CUSTOM_SUBJECTS_PATH);

    expect(await customError()).toContain(`${CUSTOM_SUBJECTS_PATH} is missing`);
    expect(writeCalls).toHaveLength(0);
  });

  test("an unknown kanji id logs a warning and keeps the record", async () => {
    const word = { ...customVerb, data: { ...customVerb.data, component_subject_ids: [999999] } };
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      setCustomSubjectsFile([word]);

      expect(await getCustomSubjects()).toEqual([word]);
      expect(warn.mock.calls.map(([line]) => String(line))).toEqual([
        `[Repository] ${CUSTOM_SUBJECTS_PATH}: custom subject ${word.id} uses 999999, which is no visible WaniKani kanji`,
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  // 下手 (id=2538) is a WaniKani word
  test("a WaniKani clash logs a warning and keeps the record", async () => {
    const word = {
      ...customVerb,
      data: { ...customVerb.data, characters: "下手", slug: "下手" },
    };
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      setCustomSubjectsFile([word]);

      expect(await getCustomSubjects()).toEqual([word]);
      expect(warn.mock.calls.map(([line]) => String(line))).toEqual([
        `[Repository] ${CUSTOM_SUBJECTS_PATH}: custom subject ${word.id} "下手" has the same characters as WaniKani 2538`,
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  test("a clash with a WaniKani kana word logs a warning too (ちょっと, id=9176)", async () => {
    const word = {
      ...customKanaWord,
      data: { ...customKanaWord.data, characters: "ちょっと", slug: "ちょっと" },
    };
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      setCustomSubjectsFile([word]);

      expect(await getCustomSubjects()).toEqual([word]);
      expect(warn.mock.calls.map(([line]) => String(line))).toEqual([
        `[Repository] ${CUSTOM_SUBJECTS_PATH}: custom subject ${word.id} "ちょっと" has the same characters as WaniKani 9176`,
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  test("a hidden record and a kana record log no warning", async () => {
    const hiddenWithProblems = {
      ...hiddenCustomWord,
      data: {
        ...hiddenCustomWord.data,
        characters: "下手",
        slug: "下手",
        component_subject_ids: [999999],
      },
    };
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      setCustomSubjectsFile([customKanaWord, hiddenWithProblems]);

      expect(await getCustomSubjects()).toEqual([customKanaWord, hiddenWithProblems]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("the words by kanji list the verb and not the hidden word", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    expect((await getCustomWordsByKanji()).get(CUSTOM_VERB_KANJI_ID)).toEqual([customVerb.id]);
  });

  test("the vocabulary getters append the custom records of their type, hidden ones included", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const vocabularyIds = (await getVocabularyData()).map((item) => item.id);
    const kanaIds = (await getKanaVocabularyData()).map((item) => item.id);

    expect(vocabularyIds.slice(-2)).toEqual([customVerb.id, hiddenCustomWord.id]);
    expect(kanaIds.slice(-2)).toEqual([customKanaWord.id, customKanaVerb.id]);
    expect(vocabularyIds).not.toContain(customKanaWord.id);
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

  test("a pulled reading note on a custom kana word fails until the file is fixed", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    setStudyMaterialFile({
      ...studyMaterialFixture,
      [customKanaWord.id]: { reading_note: "Douzo" },
    });

    await expect(getLocalStudyMaterials()).rejects.toThrow(
      `subject ${customKanaWord.id} field reading_note a kana_vocabulary has no reading`
    );
    await expect(getLocalStudyMaterials()).rejects.toThrow("has no reading");

    const fixed = { ...studyMaterialFixture, [customKanaWord.id]: { meaning_note: "Douzo" } };
    setStudyMaterialFile(fixed);

    expect(await getLocalStudyMaterials()).toEqual(fixed);
  });

  test("a change of only the custom file runs the subject rules again", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    const file = { ...studyMaterialFixture, [customVerb.id]: { reading_note: "Kudasu" } };
    setStudyMaterialFile(file);
    expect(await getLocalStudyMaterials()).toEqual(file);

    setCustomSubjectsFile([{ ...customKanaWord, id: customVerb.id }]);

    await expect(getLocalStudyMaterials()).rejects.toThrow(
      `subject ${customVerb.id} field reading_note a kana_vocabulary has no reading`
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

  test("creates a missing custom subjects file", async () => {
    await unlink(CUSTOM_SUBJECTS_PATH);

    await initRepository();

    expect(writeCalls).toEqual([{ path: CUSTOM_SUBJECTS_PATH, data: "[]\n" }]);
  });

  test("a broken custom subjects file fails the start", async () => {
    setFileContent(CUSTOM_SUBJECTS_PATH, "[ broken");

    await expect(initRepository()).rejects.toThrow(`Cannot read ${CUSTOM_SUBJECTS_PATH}`);
  });

  test("a note on a custom word passes the start, one on an unknown custom id fails it", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    setStudyMaterialFile({
      ...studyMaterialFixture,
      [hiddenCustomWord.id]: { meaning_note: "Below" },
    });

    await initRepository();

    setStudyMaterialFile({
      ...studyMaterialFixture,
      [UNKNOWN_CUSTOM_ID]: { meaning_note: "Typo" },
    });

    await expect(initRepository()).rejects.toThrow(
      `subject ${UNKNOWN_CUSTOM_ID} is not a custom subject`
    );
  });

  test("a WaniKani id at the custom floor fails the start", async () => {
    const radicalsPath = "./data/userdata/radicals.json";
    const radicals = JSON.parse(readFileSync(radicalsPath, "utf-8")) as RadicalData[];
    const id = CUSTOM_SUBJECT_ID_FLOOR;
    setFileContent(radicalsPath, JSON.stringify([...radicals, { ...radicals[0], id }]));
    try {
      await expect(initRepository()).rejects.toThrow(
        `WaniKani id ${id} reached CUSTOM_SUBJECT_ID_FLOOR`
      );
    } finally {
      resetFsMock();
      // the failed start kept the changed radicals, so the next tests need the real ones
      await initRepository();
    }
  });

  test("a broken registry line fails the start", async () => {
    setFileContent(MNEMONIC_IMAGES_PATH, "{ broken\n");

    await expect(initRepository()).rejects.toThrow(`Invalid ${MNEMONIC_IMAGES_PATH} line 1`);
  });
});
