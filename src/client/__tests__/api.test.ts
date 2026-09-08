import { describe, expect, it, beforeEach, afterAll } from "bun:test";

import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";
import { api } from "@client/api.ts";
import { HttpStatusError } from "@client/utils/search-error.ts";

type FetchHandler = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const realFetch = globalThis.fetch;

let requestedUrls: string[] = [];
let handler: FetchHandler = () => Promise.reject(new Error("no handler set"));

globalThis.fetch = createFetchMock((input, init) => {
  requestedUrls.push(resolveUrl(input));
  return handler(input, init);
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function answerWith(body: string, status: number): void {
  handler = () => Promise.resolve(new Response(body, { status }));
}

describe("api.search", () => {
  beforeEach(() => {
    requestedUrls = [];
    handler = () => Promise.reject(new Error("no handler set"));
  });

  it("returns the parsed body of a 200 answer", async () => {
    answerWith(JSON.stringify({ found: true, data: { id: 809 } }), 200);

    const result = await api.search("kanji", "働");

    expect(result as unknown).toEqual({ found: true, data: { id: 809 } });
    expect(requestedUrls).toEqual(["/api/search?type=kanji&q=%E5%83%8D"]);
  });

  it("returns a 404 answer instead of throwing", async () => {
    answerWith(JSON.stringify({ found: false }), 404);

    const result = await api.search("kanji", "zzz");

    expect(result).toEqual({ found: false });
  });

  it("throws an HttpStatusError on a 500 answer", async () => {
    answerWith(JSON.stringify({ error: "boom" }), 500);

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
    answerWith("<!doctype html>", 200);

    const err = await api.search("kanji", "働").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SyntaxError);
  });
});
