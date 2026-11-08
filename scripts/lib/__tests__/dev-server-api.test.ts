import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import type { AnkiAddResult } from "@/model/wanikani.ts";
import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";
import {
  addToAnki,
  fetchAnkiNotes,
  fetchVocabularyInAnki,
  searchVocabulary,
  syncAnkiWeb,
} from "../dev-server-api.ts";

type RecordedRequest = { url: string; method?: string; headers: Headers; body?: BodyInit | null };

const BASE_URL = "http://localhost:5173";

// Other test files install their own fetch mock, so this is not the real fetch
const previousFetch = globalThis.fetch;

let requests: RecordedRequest[] = [];
let answer: () => Response = () => jsonResponse({ ok: true });

globalThis.fetch = createFetchMock(async (input, init) => {
  requests.push({
    url: resolveUrl(input),
    method: init?.method,
    headers: new Headers(init?.headers),
    body: init?.body,
  });
  return answer();
});

beforeEach(() => {
  requests = [];
  answer = () => jsonResponse({ ok: true });
});

afterAll(() => {
  globalThis.fetch = previousFetch;
});

describe("searchVocabulary", () => {
  it("asks for the vocabulary type with the encoded word", async () => {
    const hit = { found: true, data: { id: 2467, object: "vocabulary" } };
    answer = () => jsonResponse(hit);

    expect(await searchVocabulary(BASE_URL, "図書館")).toEqual(hit as never);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      `${BASE_URL}/api/search?type=vocabulary&q=%E5%9B%B3%E6%9B%B8%E9%A4%A8`
    );
    expect(requests[0]!.method).toBeUndefined();
  });

  it("answers found: false on a 404", async () => {
    answer = () => jsonResponse({ found: false }, 404);

    expect(await searchVocabulary(BASE_URL, "そう")).toEqual({ found: false });
  });

  it("throws with the word and the status on a 500", async () => {
    answer = () => new Response("Internal Server Error", { status: 500 });

    await expect(searchVocabulary(BASE_URL, "そう")).rejects.toThrow(
      "Search そう failed with status 500"
    );
  });
});

describe("fetchAnkiNotes", () => {
  it("asks for the deck type and answers the notes", async () => {
    const notes = [{ characters: "山", meaning: "Mountain", wkId: 455, wkType: "kanji" }];
    answer = () => jsonResponse({ ok: true, data: notes });

    expect(await fetchAnkiNotes(BASE_URL, "kanji")).toEqual(notes as never);
    expect(requests.map((request) => request.url)).toEqual([
      `${BASE_URL}/api/anki-notes?type=kanji`,
    ]);
  });

  it("throws with the error text on ok: false", async () => {
    answer = () => jsonResponse({ ok: false, error: "AnkiConnect is not running" });

    await expect(fetchAnkiNotes(BASE_URL, "vocabulary")).rejects.toThrow(
      "AnkiConnect is not running"
    );
  });

  it("throws with the deck and the status on a plain-text answer", async () => {
    answer = () => new Response("Internal Server Error", { status: 500 });

    await expect(fetchAnkiNotes(BASE_URL, "vocabulary")).rejects.toThrow(
      "Reading the vocabulary deck failed with status 500"
    );
  });
});

describe("addToAnki", () => {
  it("posts the id and type as JSON with sync: false", async () => {
    const data: AnkiAddResult = {
      subject: { name: "To Do", characters: "する", created: true },
      kanji: [],
      radicals: [],
    };
    answer = () => jsonResponse({ ok: true, data });

    expect(await addToAnki({ baseUrl: BASE_URL, id: 9180, type: "kana_vocabulary" })).toEqual({
      ok: true,
      data,
    });
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe(`${BASE_URL}/api/add-to-anki`);
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(request.body))).toEqual({
      id: 9180,
      type: "kana_vocabulary",
      sync: false,
    });
  });

  it("answers the fields reason of a failed add", async () => {
    const failure = { ok: false, error: "Fields do not match", reason: "fields" };
    answer = () => jsonResponse(failure);

    expect(await addToAnki({ baseUrl: BASE_URL, id: 1, type: "radical" })).toEqual(
      failure as never
    );
  });

  it("answers ok: false on a JSON 404", async () => {
    answer = () => jsonResponse({ ok: false, error: "Subject not found" }, 404);

    expect(await addToAnki({ baseUrl: BASE_URL, id: 42, type: "vocabulary" })).toEqual({
      ok: false,
      error: "Subject not found",
    });
  });

  it("throws with the type, id and status on a plain-text answer", async () => {
    answer = () => new Response("Internal Server Error", { status: 500 });

    await expect(addToAnki({ baseUrl: BASE_URL, id: 42, type: "vocabulary" })).rejects.toThrow(
      "Add vocabulary 42 failed with status 500"
    );
  });
});

describe("syncAnkiWeb", () => {
  it("posts to the sync route with no body", async () => {
    expect(await syncAnkiWeb(BASE_URL)).toEqual({ ok: true });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`${BASE_URL}/api/anki-sync`);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.body).toBeUndefined();
  });

  it("answers the error of a failed sync", async () => {
    answer = () => jsonResponse({ ok: false, error: "AnkiWeb login needed" });

    expect(await syncAnkiWeb(BASE_URL)).toEqual({ ok: false, error: "AnkiWeb login needed" });
  });

  it("throws with the status on a plain-text answer", async () => {
    answer = () => new Response("Internal Server Error", { status: 500 });

    await expect(syncAnkiWeb(BASE_URL)).rejects.toThrow("Sync with AnkiWeb failed with status 500");
  });
});

describe("fetchVocabularyInAnki", () => {
  it("answers the characters of the vocabulary notes", async () => {
    const notes = [
      { characters: "図書館", meaning: "Library", wkId: 2467, wkType: "vocabulary" },
      { characters: "そう", meaning: "So", wkId: null, wkType: null },
    ];
    answer = () => jsonResponse({ ok: true, data: notes });

    expect(await fetchVocabularyInAnki(BASE_URL)).toEqual(new Set(["図書館", "そう"]));
    expect(requests.map((request) => request.url)).toEqual([
      `${BASE_URL}/api/anki-notes?type=vocabulary`,
    ]);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
