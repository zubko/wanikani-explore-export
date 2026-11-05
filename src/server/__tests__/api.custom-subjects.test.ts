import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { CUSTOM_SUBJECT_ID_FLOOR } from "@/model/wanikani.ts";
import type { CustomSubject } from "@/model/wanikani.ts";
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
  customSubjectInputOf,
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

const kanaWordInput = customSubjectInputOf(customKanaWord);
const verbInput = customSubjectInputOf(customVerb);

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
    expect(json).toEqual({ ok: false, error: `custom subject ${UNKNOWN_CUSTOM_ID} not found` });
  });

  test("a read error of the file is a 500 for a read and a write", async () => {
    setFsError("readFile", new Error("disk gone"));

    const list = await listCustomSubjects();
    const create = await createCustomSubject(kanaWordInput);

    expect(list.status).toBe(500);
    expect(list.json.ok).toBe(false);
    expect(list.json.error).toContain("disk gone");
    expect(create.status).toBe(500);
    expect(create.json.ok).toBe(false);
    expect(create.json.error).toContain("disk gone");
    expect(writeCalls).toHaveLength(0);
  });
});

describe("custom-subjects API writes", () => {
  test("POST answers 201 with the id and the timestamps, and the file holds the record", async () => {
    const { status, json } = await createCustomSubject(kanaWordInput);

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
      ...kanaWordInput,
      data: { ...kanaWordInput.data, meanings },
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
    const created = await createCustomSubject(kanaWordInput);
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
      ...kanaWordInput,
      data: { ...kanaWordInput.data, meanings },
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
      ...verbInput,
      data: {
        ...verbInput.data,
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
    const first = await createCustomSubject(kanaWordInput);
    const second = await createCustomSubject(kanaWordInput);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.json).toEqual({
      ok: false,
      error: `characters どうぞ are used by custom subject ${CUSTOM_SUBJECT_ID_FLOOR}`,
    });
    expect(writeCalls).toHaveLength(1);
  });

  test("POST with a bad body shape is a 400", async () => {
    const cases: { body?: unknown; rawBody?: string; error: string }[] = [
      {
        body: { object: "kana_vocabulary" },
        error: "Missing required parameters: object and data",
      },
      { rawBody: "not json", error: "Invalid body: must be a JSON object" },
      { body: [kanaWordInput], error: "Invalid body: must be a JSON object" },
      {
        body: { object: "kana_vocabulary", data: "どうぞ" },
        error: "Invalid data: must be an object",
      },
    ];
    for (const { body, rawBody, error } of cases) {
      const answer = await request({ method: "POST", path: "/custom-subjects", body, rawBody });
      expect(answer).toEqual({ status: 400, json: { ok: false, error } });
    }
    expect(writeCalls).toHaveLength(0);
  });

  test("POST that fails the content check is a 400", async () => {
    const slash = await createCustomSubject({
      ...kanaWordInput,
      data: { ...kanaWordInput.data, characters: "どう/ぞ" },
    });
    const unknownKanji = await createCustomSubject({
      ...verbInput,
      data: { ...verbInput.data, component_subject_ids: [1] },
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

  test("PUT with two primary meanings is a 400", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    const meanings = [
      { meaning: "Please", primary: true, accepted_answer: true },
      { meaning: "Go Ahead", primary: true, accepted_answer: true },
    ];

    const { status, json } = await updateCustomSubject(customKanaWord.id, {
      ...kanaWordInput,
      data: { ...kanaWordInput.data, meanings },
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
      ...kanaWordInput,
      object: "vocabulary",
    });
    const changedCharacters = await updateCustomSubject(customKanaWord.id, {
      ...kanaWordInput,
      data: { ...kanaWordInput.data, characters: "どうも" },
    });

    expect(changedObject.status).toBe(400);
    expect(changedObject.json.error).toStartWith("object cannot change from kana_vocabulary");
    expect(changedCharacters.status).toBe(400);
    expect(changedCharacters.json.error).toStartWith("characters cannot change from どうぞ");
    expect(writeCalls).toHaveLength(0);
  });

  test("PUT and DELETE of an unknown or a hidden id are a 404", async () => {
    setCustomSubjectsFile(customSubjectFixture);
    const hiddenInput = customSubjectInputOf(hiddenCustomWord);

    for (const id of [UNKNOWN_CUSTOM_ID, hiddenCustomWord.id]) {
      const error = { ok: false, error: `custom subject ${id} not found` };
      expect(await updateCustomSubject(id, hiddenInput)).toEqual({ status: 404, json: error });
      expect(await deleteCustomSubject(id)).toEqual({ status: 404, json: error });
    }
    expect(writeCalls).toHaveLength(0);
  });

  test("GET by id, PUT and DELETE of a WaniKani id or a non-numeric id are a 400", async () => {
    for (const id of [String(WANIKANI_KANJI_ID), "abc", "1e6"]) {
      const error = { ok: false, error: `Invalid id: ${id} is not a custom subject id` };
      expect(await getCustomSubject(id)).toEqual({ status: 400, json: error });
      expect(await updateCustomSubject(id, kanaWordInput)).toEqual({ status: 400, json: error });
      expect(await deleteCustomSubject(id)).toEqual({ status: 400, json: error });
    }
    expect(writeCalls).toHaveLength(0);
  });
});
