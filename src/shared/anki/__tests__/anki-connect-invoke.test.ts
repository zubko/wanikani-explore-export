import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";
import { ANKI_CONNECT_URL, invokeAnkiConnect } from "../anki-connect-invoke.ts";

type RecordedRequest = { url: string; method?: string; headers?: HeadersInit; body: unknown };

// Other test files install their own fetch mock, so this is not the real fetch
const previousFetch = globalThis.fetch;

let requests: RecordedRequest[] = [];
let answer: () => Response = () => Response.json({ result: null, error: null });

globalThis.fetch = createFetchMock(async (input, init) => {
  requests.push({
    url: resolveUrl(input),
    method: init?.method,
    headers: init?.headers,
    body: JSON.parse(String(init?.body)),
  });
  return answer();
});

beforeEach(() => {
  requests = [];
  answer = () => Response.json({ result: null, error: null });
});

afterAll(() => {
  globalThis.fetch = previousFetch;
});

describe("invokeAnkiConnect", () => {
  it("answers the result", async () => {
    answer = () => Response.json({ result: [1, 2], error: null });

    const result = await invokeAnkiConnect<number[]>("findNotes", { query: "deck:Kanji" });

    expect(result).toEqual([1, 2]);
    expect(requests).toEqual([
      {
        url: ANKI_CONNECT_URL,
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: { action: "findNotes", version: 6, params: { query: "deck:Kanji" } },
      },
    ]);
  });

  it("throws the action and the params on an error answer", async () => {
    answer = () => Response.json({ result: null, error: "model was not found" });

    const call = invokeAnkiConnect("modelFieldNames", { modelName: "Kanji" });

    await expect(call).rejects.toEqual({
      message: "model was not found",
      action: "modelFieldNames",
      params: { modelName: "Kanji" },
    });
  });

  it("throws the connect text with the network error of the fetch cause", async () => {
    answer = () => {
      throw new TypeError("fetch failed", { cause: new Error("other side closed") });
    };

    const call = invokeAnkiConnect("sync");

    await expect(call).rejects.toEqual({
      message: "Failed to connect to Anki. Is Anki running? (other side closed)",
      action: "sync",
      params: {},
    });
  });

  it("throws the connect text with the fetch error when it has no cause", async () => {
    answer = () => {
      throw new TypeError("fetch failed");
    };

    const call = invokeAnkiConnect("sync");

    await expect(call).rejects.toEqual({
      message: "Failed to connect to Anki. Is Anki running? (fetch failed)",
      action: "sync",
      params: {},
    });
  });

  it("sends empty params when the call has none", async () => {
    await invokeAnkiConnect("deckNamesAndIds");

    expect(requests.map((request) => request.body)).toEqual([
      { action: "deckNamesAndIds", version: 6, params: {} },
    ]);
  });
});
