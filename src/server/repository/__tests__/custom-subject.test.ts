import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { CUSTOM_SUBJECT_ID_FLOOR } from "@/model/wanikani.ts";
import type { CustomSubject } from "@/model/wanikani.ts";
import { holdFsOp, resetFsMock, setFileContent, setFsError, writeCalls } from "@/test/preload.ts";
import {
  CUSTOM_VERB_KANJI_ID,
  customKanaWord,
  customKanaVerb,
  customSubjectFixture,
  customKanaWordInput,
  customVerbInput,
  hiddenCustomWordInput,
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
// ちょっと in the real WaniKani data
const WANIKANI_KANA_WORD_ID = 9176;

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

beforeAll(ensureRepositoryInitialized);

// The fs mock is process-global, so a saved record must not reach the next test or file
beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("createCustomSubject", () => {
  test("the first record gets the floor id and the next one floor + 1", async () => {
    const first = await createCustomSubject(customKanaWordInput);
    const second = await createCustomSubject(customVerbInput);

    expect(first.id).toBe(CUSTOM_SUBJECT_ID_FLOOR);
    expect(second.id).toBe(CUSTOM_SUBJECT_ID_FLOOR + 1);
    expect(first.data).toMatchObject({ slug: "どうぞ", level: 0, hidden_at: null });
    expect(first.data.created_at).toBe(first.data_updated_at);
    expect(await getCustomSubjects()).toEqual([first, second]);
  });

  test("the save lands as JSON under the real path only", async () => {
    const saved = await createCustomSubject(customKanaWordInput);

    expect(writeCalls.map((call) => call.path)).toEqual([CUSTOM_SUBJECTS_PATH]);
    expect(String(writeCalls[0]!.data).endsWith("\n")).toBe(true);
    expect(lastWrittenRecords()).toEqual([saved]);
  });

  test("a create after a delete of the newest word gets a new id", async () => {
    setCustomSubjectsFile([customKanaWord, customVerb]);
    await deleteCustomSubject(customVerb.id);

    const saved = await createCustomSubject(customVerbInput);

    expect(saved.id).toBe(customVerb.id + 1);
  });

  test("the characters of a hidden word are free again", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const saved = await createCustomSubject(hiddenCustomWordInput);

    expect(saved.id).toBe(hiddenCustomWord.id + 1);
    expect(saved.data.hidden_at).toBeNull();
    expect(lastWrittenRecords().filter((record) => record.data.characters === "下記")).toHaveLength(
      2
    );
  });

  test("two creates at the same time both land with two ids", async () => {
    const [first, second] = await Promise.all([
      createCustomSubject(customKanaWordInput),
      createCustomSubject(customVerbInput),
    ]);

    expect([first.id, second.id]).toEqual([CUSTOM_SUBJECT_ID_FLOOR, CUSTOM_SUBJECT_ID_FLOOR + 1]);
    expect(lastWrittenRecords().map((record) => record.data.characters)).toEqual([
      "どうぞ",
      "下す",
    ]);
  });

  test("a create after a refused create still works", async () => {
    const refused = createCustomSubject({ object: "radical", data: {} });
    const next = createCustomSubject(customKanaWordInput);

    expect((await writeError(refused)).status).toBe(400);
    expect((await next).id).toBe(CUSTOM_SUBJECT_ID_FLOOR);
  });
});

describe("createCustomSubject refusals", () => {
  test("the spelling of a WaniKani kana word is a 409 (ちょっと)", async () => {
    const error = await writeError(
      createCustomSubject({
        ...customKanaWordInput,
        data: { ...customKanaWordInput.data, characters: "ちょっと" },
      })
    );

    expect(error.status).toBe(409);
    expect(error.message).toBe(
      `characters ちょっと are used by WaniKani subject ${WANIKANI_KANA_WORD_ID}`
    );
    expect(writeCalls).toHaveLength(0);
  });

  test("a WaniKani spelling is a 409 that names the WaniKani id", async () => {
    const error = await writeError(
      createCustomSubject({
        ...customVerbInput,
        data: { ...customVerbInput.data, characters: "毎晩", component_subject_ids: [572, 958] },
      })
    );

    expect(error.status).toBe(409);
    expect(error.message).toBe(`characters 毎晩 are used by WaniKani subject ${WANIKANI_WORD_ID}`);
    expect(writeCalls).toHaveLength(0);
  });

  test("the spelling of a visible custom word is a 409 that names it", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const error = await writeError(createCustomSubject(customKanaWordInput));

    expect(error.status).toBe(409);
    expect(error.message).toBe(`characters どうぞ are used by custom subject ${customKanaWord.id}`);
    expect(writeCalls).toHaveLength(0);
  });

  test("a godan verb without conjugations is a 400", async () => {
    const data = { ...customVerbInput.data };
    delete data.conjugations;

    const error = await writeError(createCustomSubject({ ...customVerbInput, data }));

    expect(error.status).toBe(400);
    expect(error.message).toBe("data.conjugations is required for an ichidan or godan verb");
    expect(writeCalls).toHaveLength(0);
  });

  test("an unknown kanji id is a 400", async () => {
    const error = await writeError(
      createCustomSubject({
        ...customVerbInput,
        data: { ...customVerbInput.data, component_subject_ids: [1] },
      })
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
      ...customVerbInput,
      data: { ...customVerbInput.data, meanings },
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
      ...customVerbInput,
      data: { ...customVerbInput.data, component_subject_ids: [OTHER_KANJI_ID] },
    });

    const wordsByKanji = await getCustomWordsByKanji();
    expect(wordsByKanji.get(CUSTOM_VERB_KANJI_ID)).toBeUndefined();
    expect(wordsByKanji.get(OTHER_KANJI_ID)).toEqual([customVerb.id]);
  });

  test("an unknown id and a hidden id are a 404", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const unknown = await writeError(updateCustomSubject(hiddenCustomWord.id + 1, customVerbInput));
    const hidden = await writeError(
      updateCustomSubject(hiddenCustomWord.id, hiddenCustomWordInput)
    );

    expect([unknown.status, hidden.status]).toEqual([404, 404]);
    expect(hidden.message).toBe(`Custom subject ${hiddenCustomWord.id} not found`);
    expect(writeCalls).toHaveLength(0);
  });

  test("a changed object is a 400", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const error = await writeError(
      updateCustomSubject(customKanaWord.id, { ...customKanaWordInput, object: "vocabulary" })
    );

    expect(error.status).toBe(400);
    expect(error.message).toStartWith("object cannot change from kana_vocabulary");
    expect(writeCalls).toHaveLength(0);
  });

  test("changed characters are a 400", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const error = await writeError(
      updateCustomSubject(customKanaWord.id, {
        ...customKanaWordInput,
        data: { ...customKanaWordInput.data, characters: "どうも" },
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
    const save = createCustomSubject(customVerbInput);
    await write.reached;
    setCustomSubjectsFile([customKanaWord]);
    write.release();

    const saved = await save;

    expect(saved.id).toBe(customKanaWord.id + 1);
    expect(lastWrittenRecords()).toEqual([customKanaWord, saved]);
    expect(writeCalls.map((call) => call.path)).toEqual([CUSTOM_SUBJECTS_PATH]);
  });

  test("an update and a delete start again when the file changed before the rename", async () => {
    const meanings = [{ meaning: "To Pass Down", primary: true, accepted_answer: true }];
    const pulled = [customKanaWord, customVerb, customKanaVerb];
    setCustomSubjectsFile([customKanaWord, customVerb]);

    let write = holdFsOp("writeFile");
    const update = updateCustomSubject(customVerb.id, {
      ...customVerbInput,
      data: { ...customVerbInput.data, meanings },
    });
    await write.reached;
    setCustomSubjectsFile(pulled);
    write.release();
    const updated = await update;
    expect(lastWrittenRecords().map((record) => record.id)).toEqual(pulled.map((r) => r.id));
    expect(lastWrittenRecords()[1]).toEqual(updated);

    write = holdFsOp("writeFile");
    const remove = deleteCustomSubject(customKanaWord.id);
    await write.reached;
    setCustomSubjectsFile([...pulled, hiddenCustomWord]);
    write.release();
    const deleted = await remove;
    expect(lastWrittenRecords()).toEqual([deleted, customVerb, customKanaVerb, hiddenCustomWord]);
  });

  test("an update and a delete of one word at the same time both land", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    const meanings = [{ meaning: "To Pass Down", primary: true, accepted_answer: true }];

    const [updated, deleted] = await Promise.all([
      updateCustomSubject(customVerb.id, {
        ...customVerbInput,
        data: { ...customVerbInput.data, meanings },
      }),
      deleteCustomSubject(customVerb.id),
    ]);

    expect(updated.data.meanings).toEqual(meanings);
    expect(deleted.data.meanings).toEqual(meanings);
    expect(deleted.data.hidden_at).not.toBeNull();
    expect(lastWrittenRecords()[2]).toEqual(deleted);
  });

  test("a file that changes during every attempt fails the save and writes nothing", async () => {
    let write = holdFsOp("writeFile");
    const save = createCustomSubject(customVerbInput);
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

    const error = await createCustomSubject(customKanaWordInput).then(
      () => null,
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CustomSubjectWriteError);
    expect(String(error)).toContain(`Invalid ${CUSTOM_SUBJECTS_PATH}: the root must be an array`);
    expect(writeCalls).toHaveLength(0);
  });
});
