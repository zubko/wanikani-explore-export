import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { CUSTOM_SUBJECT_ID_FLOOR } from "@/model/wanikani.ts";
import type { CustomSubject, CustomSubjectInput } from "@/model/wanikani.ts";
import { holdFsOp, resetFsMock, setFileContent, setFsError, writeCalls } from "@/test/preload.ts";
import {
  CUSTOM_VERB_KANJI_ID,
  customKanaWord,
  customSubjectFixture,
  customVerb,
  hiddenCustomWord,
  setCustomSubjectsFile,
} from "@/test/custom-subject-fixture.ts";
import { getCustomSubjects, getCustomWordsByKanji } from "../data-loader.ts";
import { CUSTOM_SUBJECTS_PATH } from "../data-paths.ts";
import {
  CUSTOM_SUBJECT_SAVE_ATTEMPTS,
  CustomSubjectWriteError,
  createCustomSubject,
  deleteCustomSubject,
  updateCustomSubject,
} from "../custom-subject.ts";
import { ensureRepositoryInitialized } from "./setup.ts";

// 口 and 毎晩 in the real WaniKani data
const OTHER_KANJI_ID = 452;
const WANIKANI_WORD_ID = 3766;
const FIXED_DATA_FIELDS = [
  "slug",
  "level",
  "hidden_at",
  "document_url",
  "created_at",
  "pronunciation_audios",
  "lesson_position",
  "spaced_repetition_system_id",
];

function inputOf(record: CustomSubject): CustomSubjectInput {
  const data: Record<string, unknown> = { ...record.data };
  for (const field of FIXED_DATA_FIELDS) delete data[field];
  return { object: record.object, data } as unknown as CustomSubjectInput;
}

function lastWrittenRecords(): CustomSubject[] {
  const call = writeCalls.at(-1);
  if (!call) throw new Error("no write recorded");
  return JSON.parse(String(call.data)) as CustomSubject[];
}

async function writeError(promise: Promise<unknown>): Promise<CustomSubjectWriteError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  );
  if (!(error instanceof CustomSubjectWriteError)) {
    throw new Error(`expected a CustomSubjectWriteError, got ${String(error)}`);
  }
  return error;
}

const kanaWordInput = inputOf(customKanaWord);
const verbInput = inputOf(customVerb);

beforeAll(ensureRepositoryInitialized);

// The fs mock is process-global, so a saved record must not reach the next test or file
beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("createCustomSubject", () => {
  test("the first record gets the floor id and the next one floor + 1", async () => {
    const first = await createCustomSubject(kanaWordInput);
    const second = await createCustomSubject(verbInput);

    expect(first.id).toBe(CUSTOM_SUBJECT_ID_FLOOR);
    expect(second.id).toBe(CUSTOM_SUBJECT_ID_FLOOR + 1);
    expect(first.data).toMatchObject({ slug: "どうぞ", level: 0, hidden_at: null });
    expect(first.data.created_at).toBe(first.data_updated_at);
    expect(await getCustomSubjects()).toEqual([first, second]);
  });

  test("the save lands as JSON under the real path only", async () => {
    const saved = await createCustomSubject(kanaWordInput);

    expect(writeCalls.map((call) => call.path)).toEqual([CUSTOM_SUBJECTS_PATH]);
    expect(String(writeCalls[0]!.data).endsWith("\n")).toBe(true);
    expect(lastWrittenRecords()).toEqual([saved]);
  });

  test("a create after a delete of the newest word gets a new id", async () => {
    setCustomSubjectsFile([customKanaWord, customVerb]);
    await deleteCustomSubject(customVerb.id);

    const saved = await createCustomSubject(verbInput);

    expect(saved.id).toBe(customVerb.id + 1);
  });

  test("the characters of a hidden word are free again", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const saved = await createCustomSubject(inputOf(hiddenCustomWord));

    expect(saved.id).toBe(hiddenCustomWord.id + 1);
    expect(saved.data.hidden_at).toBeNull();
    expect(lastWrittenRecords().filter((record) => record.data.characters === "下記")).toHaveLength(
      2
    );
  });

  test("two creates at the same time both land with two ids", async () => {
    const [first, second] = await Promise.all([
      createCustomSubject(kanaWordInput),
      createCustomSubject(verbInput),
    ]);

    expect([first.id, second.id]).toEqual([CUSTOM_SUBJECT_ID_FLOOR, CUSTOM_SUBJECT_ID_FLOOR + 1]);
    expect(lastWrittenRecords().map((record) => record.data.characters)).toEqual([
      "どうぞ",
      "下す",
    ]);
  });

  test("a create after a refused create still works", async () => {
    const refused = createCustomSubject({ object: "radical", data: {} });
    const next = createCustomSubject(kanaWordInput);

    expect((await writeError(refused)).status).toBe(400);
    expect((await next).id).toBe(CUSTOM_SUBJECT_ID_FLOOR);
  });
});

describe("createCustomSubject refusals", () => {
  test("a WaniKani spelling is a 409 that names the WaniKani id", async () => {
    const error = await writeError(
      createCustomSubject({
        ...verbInput,
        data: { ...verbInput.data, characters: "毎晩", component_subject_ids: [572, 958] },
      })
    );

    expect(error.status).toBe(409);
    expect(error.message).toBe(`characters 毎晩 are used by WaniKani subject ${WANIKANI_WORD_ID}`);
    expect(writeCalls).toHaveLength(0);
  });

  test("the spelling of a visible custom word is a 409 that names it", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const error = await writeError(createCustomSubject(kanaWordInput));

    expect(error.status).toBe(409);
    expect(error.message).toBe(`characters どうぞ are used by custom subject ${customKanaWord.id}`);
    expect(writeCalls).toHaveLength(0);
  });

  test("a godan verb without conjugations is a 400", async () => {
    const data = { ...verbInput.data };
    delete data.conjugations;

    const error = await writeError(createCustomSubject({ ...verbInput, data }));

    expect(error.status).toBe(400);
    expect(error.message).toBe("data.conjugations is required for an ichidan or godan verb");
    expect(writeCalls).toHaveLength(0);
  });

  test("an unknown kanji id is a 400", async () => {
    const error = await writeError(
      createCustomSubject({ ...verbInput, data: { ...verbInput.data, component_subject_ids: [1] } })
    );

    expect(error.status).toBe(400);
    expect(error.message).toBe("data.component_subject_ids[0] 1 is not a visible WaniKani kanji");
  });
});

describe("updateCustomSubject", () => {
  test("replaces the record and keeps created_at", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    const meanings = [{ meaning: "To Lower", primary: true, accepted_answer: true }];

    const saved = await updateCustomSubject(customVerb.id, {
      ...verbInput,
      data: { ...verbInput.data, meanings },
    });

    expect(saved.data.meanings).toEqual(meanings);
    expect(saved.data.created_at).toBe(customVerb.data.created_at);
    expect(saved.data_updated_at).not.toBe(customVerb.data_updated_at);
    const records = lastWrittenRecords();
    expect(records.map((record) => record.id)).toEqual(
      customSubjectFixture.map((record) => record.id)
    );
    expect(records.find((record) => record.id === customVerb.id)).toEqual(saved);
  });

  test("new kanji ids move the word to the other kanji", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    await updateCustomSubject(customVerb.id, {
      ...verbInput,
      data: { ...verbInput.data, component_subject_ids: [OTHER_KANJI_ID] },
    });

    const wordsByKanji = await getCustomWordsByKanji();
    expect(wordsByKanji.get(CUSTOM_VERB_KANJI_ID)).toBeUndefined();
    expect(wordsByKanji.get(OTHER_KANJI_ID)).toEqual([customVerb.id]);
  });

  test("an unknown id and a hidden id are a 404", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const unknown = await writeError(updateCustomSubject(hiddenCustomWord.id + 1, verbInput));
    const hidden = await writeError(
      updateCustomSubject(hiddenCustomWord.id, inputOf(hiddenCustomWord))
    );

    expect([unknown.status, hidden.status]).toEqual([404, 404]);
    expect(hidden.message).toBe(`custom subject ${hiddenCustomWord.id} not found`);
    expect(writeCalls).toHaveLength(0);
  });

  test("a changed object is a 400", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const error = await writeError(
      updateCustomSubject(customKanaWord.id, { ...kanaWordInput, object: "vocabulary" })
    );

    expect(error.status).toBe(400);
    expect(error.message).toStartWith("object cannot change from kana_vocabulary");
    expect(writeCalls).toHaveLength(0);
  });

  test("changed characters are a 400", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const error = await writeError(
      updateCustomSubject(customKanaWord.id, {
        ...kanaWordInput,
        data: { ...kanaWordInput.data, characters: "どうも" },
      })
    );

    expect(error.status).toBe(400);
    expect(error.message).toStartWith("characters cannot change from どうぞ");
    expect(writeCalls).toHaveLength(0);
  });
});

describe("deleteCustomSubject", () => {
  test("sets hidden_at, keeps the record and drops it from the back links", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const saved = await deleteCustomSubject(customVerb.id);

    expect(saved.data.hidden_at).not.toBeNull();
    expect(saved).toEqual({
      ...customVerb,
      data_updated_at: saved.data.hidden_at!,
      data: { ...customVerb.data, hidden_at: saved.data.hidden_at },
    });
    expect(lastWrittenRecords()).toHaveLength(customSubjectFixture.length);
    expect((await getCustomWordsByKanji()).get(CUSTOM_VERB_KANJI_ID)).toBeUndefined();
  });

  test("an unknown id and a hidden id are a 404", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const unknown = await writeError(deleteCustomSubject(hiddenCustomWord.id + 1));
    const hidden = await writeError(deleteCustomSubject(hiddenCustomWord.id));

    expect([unknown.status, hidden.status]).toEqual([404, 404]);
    expect(writeCalls).toHaveLength(0);
  });
});

describe("custom subject write failures", () => {
  test("a rename error keeps the old file and leaves no temp file", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    setFsError("rename", new Error("rename failed"));

    await expect(deleteCustomSubject(customVerb.id)).rejects.toThrow("rename failed");

    expect(writeCalls).toHaveLength(0);
    expect(await getCustomSubjects()).toEqual(customSubjectFixture);
  });

  test("a change between the read and the rename makes the save start again", async () => {
    const write = holdFsOp("writeFile");
    const save = createCustomSubject(verbInput);
    await write.reached;
    setCustomSubjectsFile([customKanaWord]);
    write.release();

    const saved = await save;

    expect(saved.id).toBe(customKanaWord.id + 1);
    expect(lastWrittenRecords()).toEqual([customKanaWord, saved]);
    expect(writeCalls.map((call) => call.path)).toEqual([CUSTOM_SUBJECTS_PATH]);
  });

  test("a file that changes during every attempt fails the save and writes nothing", async () => {
    let write = holdFsOp("writeFile");
    const save = createCustomSubject(verbInput);
    for (let attempt = 1; attempt <= CUSTOM_SUBJECT_SAVE_ATTEMPTS; attempt++) {
      await write.reached;
      setCustomSubjectsFile(attempt % 2 === 1 ? [customKanaWord] : []);
      write.release();
      if (attempt < CUSTOM_SUBJECT_SAVE_ATTEMPTS) write = holdFsOp("writeFile");
    }

    await expect(save).rejects.toThrow("Nothing was saved");

    expect(writeCalls).toHaveLength(0);
    expect(await getCustomSubjects()).toEqual([customKanaWord]);
  });

  test("a file with a bad shape fails the write with the path and a plain Error", async () => {
    setFileContent(CUSTOM_SUBJECTS_PATH, JSON.stringify({ not: "an array" }));

    const error = await createCustomSubject(kanaWordInput).then(
      () => null,
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CustomSubjectWriteError);
    expect(String(error)).toContain(`Invalid ${CUSTOM_SUBJECTS_PATH}: the root must be an array`);
    expect(writeCalls).toHaveLength(0);
  });
});
