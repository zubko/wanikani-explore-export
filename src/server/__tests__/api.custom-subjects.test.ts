import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { CUSTOM_SUBJECT_ID_FLOOR } from "@/model/wanikani.ts";
import { buildCustomRecord } from "@/model/custom-subject-utils.ts";
import type { CustomSubject, CustomSubjectInput } from "@/model/wanikani.ts";
import { installFetchInterceptor, resetFetchInterceptor } from "@/test/fetch-interceptor.ts";
import {
  ensureRepositoryInitialized,
  resetFsMock,
  setFsError,
  writeCalls,
} from "@/test/preload.ts";
import {
  customKanaWord,
  customSubjectFixture,
  customKanaWordInput,
  customVerbInput,
  hiddenCustomWordInput,
  customVerb,
  hiddenCustomWord,
  setCustomSubjectsFile,
} from "@/test/custom-subject-fixture.ts";
import { CUSTOM_SUBJECTS_PATH } from "../repository/data-paths.ts";
import { api } from "../api.ts";

// 毎晩 and its kanji 毎 and 晩 in the real WaniKani data
const WANIKANI_WORD_ID = 3766;
const WANIKANI_WORD_KANJI_IDS = [572, 958];
// 一 in the real WaniKani data
const WANIKANI_KANJI_ID = 440;
const UNKNOWN_CUSTOM_ID = 1_000_999;
// ちょっと, a WaniKani kana word
const WANIKANI_KANA_WORD_ID = 9176;
// 下 and 記 in the real WaniKani data
const DOWN_KANJI_ID = 451;
const RECORD_KANJI_ID = 664;
// 繁 and 昌, a kanji that WaniKani hides
const VISIBLE_KANJI_ID = 1764;
const HIDDEN_KANJI_ID = 2285;

async function request(params: { method: string; path: string; body?: unknown; rawBody?: string }) {
  const { method, path, body, rawBody } = params;
  const hasBody = body !== undefined || rawBody !== undefined;
  const response = await api.request(path, {
    method,
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  return { status: response.status, json: await response.json() };
}

function listCustomSubjects() {
  return request({ method: "GET", path: "/custom-subjects" });
}

function getCustomSubject(id: number | string) {
  return request({ method: "GET", path: `/custom-subjects/${id}` });
}

function createCustomSubject(body: unknown) {
  return request({ method: "POST", path: "/custom-subjects", body });
}

function updateCustomSubject(id: number | string, body: unknown) {
  return request({ method: "PUT", path: `/custom-subjects/${id}`, body });
}

function deleteCustomSubject(id: number | string) {
  return request({ method: "DELETE", path: `/custom-subjects/${id}` });
}

function searchVocabulary(characters: string) {
  return request({
    method: "GET",
    path: `/search?type=vocabulary&q=${encodeURIComponent(characters)}`,
  });
}

function wordWithKanji(characters: string, kanjiIds: number[]): CustomSubjectInput {
  return {
    ...hiddenCustomWordInput,
    data: { ...hiddenCustomWordInput.data, characters, component_subject_ids: kanjiIds },
  } as CustomSubjectInput;
}

function lastWrittenRecords(): CustomSubject[] {
  const call = writeCalls.at(-1);
  if (!call) throw new Error("no write recorded");
  return JSON.parse(String(call.data)) as CustomSubject[];
}

installFetchInterceptor();
beforeAll(ensureRepositoryInitialized);
// A saved record must not reach the next test or file
beforeEach(() => {
  resetFetchInterceptor();
  resetFsMock();
});
afterEach(resetFsMock);

describe("custom-subjects API reads", () => {
  test("GET lists every record, the hidden one too", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const { status, json } = await listCustomSubjects();

    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, data: customSubjectFixture });
  });

  test("GET shows a change made outside the app", async () => {
    expect((await listCustomSubjects()).json).toEqual({ ok: true, data: [] });

    setCustomSubjectsFile([customKanaWord]);

    expect((await listCustomSubjects()).json).toEqual({ ok: true, data: [customKanaWord] });
  });

  test("GET by id answers one record, also a hidden one", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const visible = await getCustomSubject(customVerb.id);
    const hidden = await getCustomSubject(hiddenCustomWord.id);

    expect(visible).toEqual({ status: 200, json: { ok: true, data: customVerb } });
    expect(hidden).toEqual({ status: 200, json: { ok: true, data: hiddenCustomWord } });
  });

  test("GET by id of an unknown id is a 404", async () => {
    const { status, json } = await getCustomSubject(UNKNOWN_CUSTOM_ID);

    expect(status).toBe(404);
    expect(json).toEqual({ ok: false, error: `Custom subject ${UNKNOWN_CUSTOM_ID} not found` });
  });

  test("a read error of the file is a 500 for every route", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    setFsError("readFile", new Error("disk gone"));

    const answers = [
      await listCustomSubjects(),
      await getCustomSubject(customKanaWord.id),
      await createCustomSubject(customKanaWordInput),
      await updateCustomSubject(customKanaWord.id, customKanaWordInput),
      await deleteCustomSubject(customKanaWord.id),
    ];

    for (const { status, json } of answers) {
      expect(status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.error).toContain("disk gone");
    }
    expect(writeCalls).toHaveLength(0);
  });
});

describe("custom-subjects API writes", () => {
  test("POST answers 201 with the id and the timestamps, and the file holds the record", async () => {
    const { status, json } = await createCustomSubject(customKanaWordInput);

    expect(status).toBe(201);
    expect(json.ok).toBe(true);
    const created = json.data as CustomSubject;
    expect(created.id).toBe(CUSTOM_SUBJECT_ID_FLOOR);
    expect(created.data.created_at).toBe(created.data_updated_at);
    expect(Number.isNaN(Date.parse(created.data_updated_at))).toBe(false);
    expect(writeCalls.map((call) => call.path)).toEqual([CUSTOM_SUBJECTS_PATH]);
    expect(lastWrittenRecords()).toEqual([created]);
    expect((await listCustomSubjects()).json).toEqual({ ok: true, data: [created] });
  });

  test("PUT answers the new record", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    const meanings = [{ meaning: "Here You Are", primary: true, accepted_answer: true }];

    const { status, json } = await updateCustomSubject(customKanaWord.id, {
      ...customKanaWordInput,
      data: { ...customKanaWordInput.data, meanings },
    });

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    const updated = json.data as CustomSubject;
    expect(updated.id).toBe(customKanaWord.id);
    expect(updated.data.meanings).toEqual(meanings);
    expect(updated.data.created_at).toBe(customKanaWord.data.created_at);
    expect(lastWrittenRecords().find((record) => record.id === customKanaWord.id)).toEqual(updated);
  });

  test("DELETE hides the record, GET still lists it and the search no longer finds it", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const { status, json } = await deleteCustomSubject(customKanaWord.id);

    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
    const listed = (await getCustomSubject(customKanaWord.id)).json.data as CustomSubject;
    expect(listed.data.hidden_at).not.toBeNull();
    expect((await searchVocabulary("どうぞ")).status).toBe(404);
  });

  test("a word goes through create, search, add to Anki, update and delete", async () => {
    const created = await createCustomSubject(customKanaWordInput);
    expect(created.status).toBe(201);
    const id = (created.json.data as CustomSubject).id;

    const found = await searchVocabulary("どうぞ");
    expect(found.status).toBe(200);
    expect(found.json.data).toMatchObject({ id, isCustom: true });

    const added = await request({
      method: "POST",
      path: "/add-to-anki",
      body: { id, type: "kana_vocabulary", sync: false },
    });
    expect(added.status).toBe(200);
    expect(added.json.ok).toBe(true);

    const meanings = [{ meaning: "Here You Are", primary: true, accepted_answer: true }];
    const updated = await updateCustomSubject(id, {
      ...customKanaWordInput,
      data: { ...customKanaWordInput.data, meanings },
    });
    expect(updated.status).toBe(200);
    expect((await searchVocabulary("どうぞ")).json.data.meanings).toEqual(meanings);

    expect((await deleteCustomSubject(id)).status).toBe(200);

    expect((await searchVocabulary("どうぞ")).status).toBe(404);
    const addAfterDelete = await request({
      method: "POST",
      path: "/add-to-anki",
      body: { id, type: "kana_vocabulary", sync: false },
    });
    expect(addAfterDelete.status).toBe(404);
    const noteAfterDelete = await request({
      method: "PATCH",
      path: "/study-materials",
      body: { id, meaning_note: "A note" },
    });
    expect(noteAfterDelete.status).toBe(404);
  });
});

describe("custom-subjects API refusals", () => {
  test("POST with a WaniKani spelling is a 409 that names the WaniKani id and the characters", async () => {
    const { status, json } = await createCustomSubject({
      ...customVerbInput,
      data: {
        ...customVerbInput.data,
        characters: "毎晩",
        component_subject_ids: WANIKANI_WORD_KANJI_IDS,
      },
    });

    expect(status).toBe(409);
    expect(json).toEqual({
      ok: false,
      error: `characters 毎晩 are used by WaniKani subject ${WANIKANI_WORD_ID}`,
    });
    expect(writeCalls).toHaveLength(0);
  });

  test("POST of the same word twice is a 409", async () => {
    const first = await createCustomSubject(customKanaWordInput);
    const second = await createCustomSubject(customKanaWordInput);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.json).toEqual({
      ok: false,
      error: `characters どうぞ are used by custom subject ${CUSTOM_SUBJECT_ID_FLOOR}`,
    });
    expect(writeCalls).toHaveLength(1);
  });

  test("POST and PUT with a bad body shape are a 400", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    const cases: { body?: unknown; rawBody?: string; error: string }[] = [
      { body: { object: "kana_vocabulary" }, error: "data must be an object" },
      { rawBody: "not json", error: "Invalid body: must be a JSON object" },
      { body: [customKanaWordInput], error: "Invalid body: must be a JSON object" },
      { body: { object: "kana_vocabulary", data: "どうぞ" }, error: "data must be an object" },
    ];
    for (const { body, rawBody, error } of cases) {
      const created = await request({ method: "POST", path: "/custom-subjects", body, rawBody });
      const updated = await request({
        method: "PUT",
        path: `/custom-subjects/${customKanaWord.id}`,
        body,
        rawBody,
      });
      expect(created).toEqual({ status: 400, json: { ok: false, error } });
      expect(updated).toEqual({ status: 400, json: { ok: false, error } });
    }
    expect(writeCalls).toHaveLength(0);
  });

  test("POST with the characters of a WaniKani kana word is a 409 (ちょっと)", async () => {
    const { status, json } = await createCustomSubject({
      ...customKanaWordInput,
      data: { ...customKanaWordInput.data, characters: "ちょっと" },
    });

    expect(status).toBe(409);
    expect(json).toEqual({
      ok: false,
      error: `characters ちょっと are used by WaniKani subject ${WANIKANI_KANA_WORD_ID}`,
    });
    expect(writeCalls).toHaveLength(0);
  });

  test("PUT keeps a kanji id that WaniKani hid after the save, a new hidden id is a 400", async () => {
    const prosperityInput = wordWithKanji("繁昌", [VISIBLE_KANJI_ID, HIDDEN_KANJI_ID]);
    const prosperity = buildCustomRecord({
      id: CUSTOM_SUBJECT_ID_FLOOR,
      input: prosperityInput,
      now: customVerb.data.created_at,
    });
    setCustomSubjectsFile([prosperity]);

    const kept = await updateCustomSubject(prosperity.id, prosperityInput);
    expect(kept.status).toBe(200);

    setCustomSubjectsFile([
      { ...prosperity, data: { ...prosperity.data, component_subject_ids: [VISIBLE_KANJI_ID] } },
    ]);
    const added = await updateCustomSubject(prosperity.id, prosperityInput);
    expect(added).toEqual({
      status: 400,
      json: {
        ok: false,
        error: `data.component_subject_ids[1] ${HIDDEN_KANJI_ID} is not a visible WaniKani kanji`,
      },
    });
  });

  test("POST with kanji ids that do not match the characters is a 400", async () => {
    const cases = [
      { characters: "下す", ids: [WANIKANI_KANJI_ID], got: "一" },
      { characters: "下記", ids: [DOWN_KANJI_ID], got: "下" },
      { characters: "下す", ids: [DOWN_KANJI_ID, RECORD_KANJI_ID], got: "下, 記" },
      { characters: "下記", ids: [RECORD_KANJI_ID, DOWN_KANJI_ID], got: "記, 下" },
    ];
    for (const { characters, ids, got } of cases) {
      const expected = characters === "下記" ? "下, 記" : "下";
      const response = await createCustomSubject(wordWithKanji(characters, ids));
      expect(response).toEqual({
        status: 400,
        json: {
          ok: false,
          error: `data.component_subject_ids must be the ids of ${expected} in this order, but they are the ids of ${got}`,
        },
      });
    }
    expect(writeCalls).toHaveLength(0);
  });

  test("POST that fails the content check is a 400", async () => {
    const slash = await createCustomSubject({
      ...customKanaWordInput,
      data: { ...customKanaWordInput.data, characters: "どう/ぞ" },
    });
    const unknownKanji = await createCustomSubject({
      ...customVerbInput,
      data: { ...customVerbInput.data, component_subject_ids: [1] },
    });

    expect(slash).toEqual({
      status: 400,
      json: { ok: false, error: "data.characters must hold only kana, kanji, ー and 々" },
    });
    expect(unknownKanji).toEqual({
      status: 400,
      json: {
        ok: false,
        error: "data.component_subject_ids[0] 1 is not a visible WaniKani kanji",
      },
    });
    expect(writeCalls).toHaveLength(0);
  });

  test("POST with a primary reading that is not an accepted answer is a 400", async () => {
    const readings = [
      { reading: "くだす", primary: false, accepted_answer: true },
      { reading: "げす", primary: true, accepted_answer: false },
    ];

    const { status, json } = await createCustomSubject({
      ...customVerbInput,
      data: { ...customVerbInput.data, readings },
    });

    expect(status).toBe(400);
    expect(json).toEqual({
      ok: false,
      error: "data.readings[1].accepted_answer must be true on the primary",
    });
    expect(writeCalls).toHaveLength(0);
  });

  test("PUT with two primary meanings is a 400", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    const meanings = [
      { meaning: "Please", primary: true, accepted_answer: true },
      { meaning: "Go Ahead", primary: true, accepted_answer: true },
    ];

    const { status, json } = await updateCustomSubject(customKanaWord.id, {
      ...customKanaWordInput,
      data: { ...customKanaWordInput.data, meanings },
    });

    expect(status).toBe(400);
    expect(json).toEqual({
      ok: false,
      error: "data.meanings must have exactly one primary, it has 2",
    });
    expect(writeCalls).toHaveLength(0);
  });

  test("PUT with a changed object or characters is a 400", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    const changedObject = await updateCustomSubject(customKanaWord.id, {
      ...customKanaWordInput,
      object: "vocabulary",
    });
    const changedCharacters = await updateCustomSubject(customKanaWord.id, {
      ...customKanaWordInput,
      data: { ...customKanaWordInput.data, characters: "どうも" },
    });

    expect(changedObject.status).toBe(400);
    expect(changedObject.json.error).toStartWith("object cannot change from kana_vocabulary");
    expect(changedCharacters.status).toBe(400);
    expect(changedCharacters.json.error).toStartWith("characters cannot change from どうぞ");
    expect(writeCalls).toHaveLength(0);
  });

  test("PUT and DELETE of an unknown or a hidden id are a 404", async () => {
    setCustomSubjectsFile(customSubjectFixture);

    for (const id of [UNKNOWN_CUSTOM_ID, hiddenCustomWord.id]) {
      const error = { ok: false, error: `Custom subject ${id} not found` };
      expect(await updateCustomSubject(id, hiddenCustomWordInput)).toEqual({
        status: 404,
        json: error,
      });
      expect(await deleteCustomSubject(id)).toEqual({ status: 404, json: error });
    }
    expect(writeCalls).toHaveLength(0);
  });

  test("GET by id, PUT and DELETE of a WaniKani id or a non-numeric id are a 400", async () => {
    for (const id of [String(WANIKANI_KANJI_ID), "abc", "1e6"]) {
      const error = { ok: false, error: `Invalid id: ${id} is not a custom subject id` };
      expect(await getCustomSubject(id)).toEqual({ status: 400, json: error });
      expect(await updateCustomSubject(id, customKanaWordInput)).toEqual({
        status: 400,
        json: error,
      });
      expect(await deleteCustomSubject(id)).toEqual({ status: 400, json: error });
    }
    expect(writeCalls).toHaveLength(0);
  });
});
