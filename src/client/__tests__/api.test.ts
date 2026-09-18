import { describe, expect, it, beforeEach, afterAll } from "bun:test";

import { createFetchMock, resolveUrl, type FetchHandler } from "@/test/fetch-utils.ts";
import { api } from "@client/api.ts";
import { HttpStatusError } from "@client/utils/http-error.ts";

type RecordedRequest = { url: string; method?: string; body?: string };

const noHandler: FetchHandler = () => Promise.reject(new Error("no handler set"));

// other test files install their own fetch mock and never restore it, so this is whichever
// mock was in place when this file loaded, not the real fetch
const previousFetch = globalThis.fetch;

let requests: RecordedRequest[] = [];
let handler: FetchHandler = noHandler;

globalThis.fetch = createFetchMock((input, init) => {
  requests.push({
    url: resolveUrl(input),
    method: init?.method,
    body: typeof init?.body === "string" ? init.body : undefined,
  });
  return handler(input, init);
});

afterAll(() => {
  globalThis.fetch = previousFetch;
});

function answerWithJson(value: unknown, status: number): void {
  answerWithText(JSON.stringify(value), status, "application/json");
}

function answerWithText(body: string, status: number, contentType = "text/plain"): void {
  handler = () =>
    Promise.resolve(new Response(body, { status, headers: { "content-type": contentType } }));
}

describe("api.search", () => {
  beforeEach(() => {
    requests = [];
    handler = noHandler;
  });

  it("returns the parsed body of a 200 answer", async () => {
    answerWithJson({ found: true, data: { id: 809 } }, 200);

    const result = await api.search("kanji", "働");

    expect(result as unknown).toEqual({ found: true, data: { id: 809 } });
    expect(requests.map((request) => request.url)).toEqual(["/api/search?type=kanji&q=%E5%83%8D"]);
  });

  it("returns a 404 answer instead of throwing", async () => {
    answerWithJson({ found: false }, 404);

    const result = await api.search("kanji", "zzz");

    expect(result).toEqual({ found: false });
  });

  it("throws an HttpStatusError on a 500 answer", async () => {
    answerWithJson({ error: "boom" }, 500);

    const err = await api.search("kanji", "働").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).status).toBe(500);
    expect((err as HttpStatusError).message).toBe("Server error (500)");
  });

  it("lets the fetch TypeError of an unreachable server through", async () => {
    const networkError = new TypeError("Failed to fetch");
    handler = () => Promise.reject(networkError);

    const err = await api.search("kanji", "働").catch((e: unknown) => e);

    expect(err).toBe(networkError);
  });

  it("throws a SyntaxError when a 200 answer is not JSON", async () => {
    answerWithText("<!doctype html>", 200);

    const err = await api.search("kanji", "働").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SyntaxError);
  });
});

describe("api.addToAnki", () => {
  beforeEach(() => {
    requests = [];
    handler = noHandler;
  });

  it("keeps the message the server sends with a bad status", async () => {
    answerWithJson({ ok: false, error: "Invalid type: nope" }, 400);

    const err = await api.addToAnki(809, "kanji").catch((e: unknown) => e);

    expect((err as Error).message).toBe("Invalid type: nope");
  });

  it("throws an HttpStatusError when the answer is not JSON", async () => {
    answerWithText("Internal Server Error", 500);

    const err = await api.addToAnki(809, "kanji").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).message).toBe("Server error (500)");
  });
});

describe("api.saveStudyMaterial", () => {
  beforeEach(() => {
    requests = [];
    handler = noHandler;
  });

  it("sends a PATCH with the id in the body and returns the saved record", async () => {
    answerWithJson({ ok: true, data: { meaning_note: "Chi + kara" } }, 200);

    const result = await api.saveStudyMaterial(2484, { meaning_note: "Chi + kara" });

    expect(result).toEqual({ meaning_note: "Chi + kara" });
    expect(requests).toEqual([
      {
        url: "/api/study-materials",
        method: "PATCH",
        body: JSON.stringify({ id: 2484, meaning_note: "Chi + kara" }),
      },
    ]);
  });

  it("returns null when the server removed the entry", async () => {
    answerWithJson({ ok: true, data: null }, 200);

    const result = await api.saveStudyMaterial(2484, { meaning_note: "" });

    expect(result).toBeNull();
  });

  it("keeps the message the server sends with a bad status", async () => {
    answerWithJson({ ok: false, error: "Subject not found" }, 404);

    const err = await api.saveStudyMaterial(1, { meaning_note: "x" }).catch((e: unknown) => e);

    expect((err as Error).message).toBe("Subject not found");
  });

  it("throws an HttpStatusError when the answer is not JSON", async () => {
    answerWithText("Internal Server Error", 500);

    const err = await api.saveStudyMaterial(1, { meaning_note: "x" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).message).toBe("Server error (500)");
  });

  it("lets the fetch TypeError of an unreachable server through", async () => {
    const networkError = new TypeError("Failed to fetch");
    handler = () => Promise.reject(networkError);

    const err = await api.saveStudyMaterial(1, { meaning_note: "x" }).catch((e: unknown) => e);

    expect(err).toBe(networkError);
  });
});
