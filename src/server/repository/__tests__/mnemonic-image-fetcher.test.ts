import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import {
  mockState,
  resetMockState,
  setFetchResponse,
  installFetchMock,
  restoreFetchMock,
} from "./setup.ts";
import { createFetchMock } from "@/test/fetch-utils.ts";
import { MnemonicImageFetcher } from "../mnemonic-image-fetcher.ts";

function buildMnemonicImageHtml(imageUrl: string): string {
  return `<html><body><wk-mnemonic-image src="${imageUrl}"></wk-mnemonic-image></body></html>`;
}

installFetchMock();
afterAll(() => restoreFetchMock());

describe("MnemonicImageFetcher", () => {
  beforeEach(() => resetMockState());

  test("cache hit returns URL without fetching", async () => {
    const fetcher = new MnemonicImageFetcher({
      "https://example.com/doc": "https://files.example.com/image.png",
    });

    const result = await fetcher.get("https://example.com/doc");

    expect(result).toBe("https://files.example.com/image.png");
    expect(mockState.fetchCalls).toEqual([]);
  });

  test("cache hit returns null without fetching", async () => {
    const fetcher = new MnemonicImageFetcher({
      "https://example.com/doc": null,
    });

    const result = await fetcher.get("https://example.com/doc");

    expect(result).toBeNull();
    expect(mockState.fetchCalls).toEqual([]);
  });

  test("cache miss triggers fetch and caches result", async () => {
    const imageUrl = "https://files.example.com/mnemonic.png";
    setFetchResponse("https://example.com/doc", buildMnemonicImageHtml(imageUrl));
    const fetcher = new MnemonicImageFetcher({});

    const result = await fetcher.get("https://example.com/doc");

    expect(result).toBe(imageUrl);
    expect(mockState.fetchCalls).toEqual(["https://example.com/doc"]);

    const cached = await fetcher.get("https://example.com/doc");
    expect(cached).toBe(imageUrl);
    expect(mockState.fetchCalls).toEqual(["https://example.com/doc"]);
  });

  test("cache miss with no image caches null", async () => {
    setFetchResponse("https://example.com/doc", "<html><body>No image here</body></html>");
    const fetcher = new MnemonicImageFetcher({});

    const result = await fetcher.get("https://example.com/doc");

    expect(result).toBeNull();
    expect(mockState.fetchCalls).toEqual(["https://example.com/doc"]);

    const cached = await fetcher.get("https://example.com/doc");
    expect(cached).toBeNull();
    expect(mockState.fetchCalls).toEqual(["https://example.com/doc"]);
  });

  test("concurrent fetches are deduplicated", async () => {
    const imageUrl = "https://files.example.com/mnemonic.png";
    setFetchResponse("https://example.com/doc", buildMnemonicImageHtml(imageUrl));
    const fetcher = new MnemonicImageFetcher({});

    const [result1, result2] = await Promise.all([
      fetcher.get("https://example.com/doc"),
      fetcher.get("https://example.com/doc"),
    ]);

    expect(result1).toBe(imageUrl);
    expect(result2).toBe(imageUrl);
    expect(mockState.fetchCalls).toEqual(["https://example.com/doc"]);
  });

  test("saveIfNeeded writes when changes exist", async () => {
    setFetchResponse("https://example.com/doc", buildMnemonicImageHtml("https://img.png"));
    const fetcher = new MnemonicImageFetcher({});

    await fetcher.get("https://example.com/doc");
    await fetcher.saveIfNeeded();

    expect(mockState.writeCalls).toHaveLength(1);
    expect(mockState.writeCalls[0]!.path).toBe("./data/userdata/mnemonic-images.json");
    const written = JSON.parse(mockState.writeCalls[0]!.data);
    expect(written).toEqual({ "https://example.com/doc": "https://img.png" });
  });

  test("saveIfNeeded skips when no changes", async () => {
    const fetcher = new MnemonicImageFetcher({
      "https://example.com/doc": "https://cached.png",
    });

    await fetcher.get("https://example.com/doc");
    await fetcher.saveIfNeeded();

    expect(mockState.writeCalls).toEqual([]);
  });

  test("fetch failure does not cache result", async () => {
    globalThis.fetch = createFetchMock(async () => {
      throw new Error("Network error");
    });
    const fetcher = new MnemonicImageFetcher({});

    const result = await fetcher.get("https://example.com/doc");

    expect(result).toBeNull();

    installFetchMock();
    const imageUrl = "https://files.example.com/mnemonic.png";
    setFetchResponse("https://example.com/doc", buildMnemonicImageHtml(imageUrl));

    const retried = await fetcher.get("https://example.com/doc");
    expect(retried).toBe(imageUrl);
    expect(mockState.fetchCalls).toEqual(["https://example.com/doc"]);
  });
});
