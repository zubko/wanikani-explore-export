import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { unlink } from "fs/promises";
import {
  mockState,
  resetMockState,
  setFetchResponse,
  installFetchMock,
  restoreFetchMock,
} from "./setup.ts";
import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";
import { holdFsOp, setFileContent, setFsError } from "@/test/preload.ts";
import {
  getMnemonicImageUrl,
  MNEMONIC_IMAGES_PATH,
  parseMnemonicImageLines,
} from "../mnemonic-image-fetcher.ts";

const PAGE = "https://www.wanikani.com/radicals/barb";
const IMAGE = "https://files.wanikani.com/barb-mnemonic.png";
const OTHER_IMAGE = "https://files.wanikani.com/barb-mnemonic-new.png";
const FIXTURE_PAGE = "https://www.wanikani.com/radicals/ground";
const FIXTURE_IMAGE = "https://files.wanikani.com/test-ground-mnemonic-image";

function buildMnemonicImageHtml(imageUrl: string): string {
  return `<html><body><wk-mnemonic-image src="${imageUrl}"></wk-mnemonic-image></body></html>`;
}

function registryLine(page: string, image: string | null): string {
  return JSON.stringify({ page, image }) + "\n";
}

function answerEveryFetch(answer: () => Promise<Response>): void {
  globalThis.fetch = createFetchMock(async (input) => {
    mockState.fetchCalls.push(resolveUrl(input));
    return answer();
  });
}

function parseError(content: string): string {
  try {
    parseMnemonicImageLines(content);
    return "no error";
  } catch (error) {
    return String(error);
  }
}

afterAll(() => restoreFetchMock());

// The bad-line test leaves a broken registry in the shared fs mock, so it must not reach the next file
beforeEach(() => {
  installFetchMock();
  resetMockState();
});
afterEach(resetMockState);

describe("getMnemonicImageUrl", () => {
  test("a known page answers without a fetch", async () => {
    expect(await getMnemonicImageUrl(FIXTURE_PAGE)).toBe(FIXTURE_IMAGE);
    expect(mockState.fetchCalls).toEqual([]);
  });

  test("an unknown page is scraped once and appended as one line", async () => {
    setFetchResponse(PAGE, buildMnemonicImageHtml(IMAGE));

    expect(await getMnemonicImageUrl(PAGE)).toBe(IMAGE);
    expect(await getMnemonicImageUrl(PAGE)).toBe(IMAGE);

    expect(mockState.fetchCalls).toEqual([PAGE]);
    expect(mockState.writeCalls).toEqual([
      { path: MNEMONIC_IMAGES_PATH, data: registryLine(PAGE, IMAGE) },
    ]);
  });

  test("a page with no picture is recorded as null", async () => {
    setFetchResponse(PAGE, "<html><body>No image here</body></html>");

    expect(await getMnemonicImageUrl(PAGE)).toBeNull();
    expect(await getMnemonicImageUrl(PAGE)).toBeNull();

    expect(mockState.fetchCalls).toEqual([PAGE]);
    expect(mockState.writeCalls).toEqual([
      { path: MNEMONIC_IMAGES_PATH, data: registryLine(PAGE, null) },
    ]);
  });

  test("two lookups at once scrape once", async () => {
    setFetchResponse(PAGE, buildMnemonicImageHtml(IMAGE));

    const results = await Promise.all([getMnemonicImageUrl(PAGE), getMnemonicImageUrl(PAGE)]);

    expect(results).toEqual([IMAGE, IMAGE]);
    expect(mockState.fetchCalls).toEqual([PAGE]);
    expect(mockState.writeCalls).toHaveLength(1);
  });

  test("a lookup while the line is appended waits and does not scrape again", async () => {
    setFetchResponse(PAGE, buildMnemonicImageHtml(IMAGE));
    const append = holdFsOp("appendFile");

    const first = getMnemonicImageUrl(PAGE);
    await append.reached;
    const second = getMnemonicImageUrl(PAGE);
    // One macrotask, so the second lookup is past its check before the append ends
    await new Promise((resolve) => setTimeout(resolve, 0));
    append.release();

    expect(await Promise.all([first, second])).toEqual([IMAGE, IMAGE]);
    expect(mockState.fetchCalls).toEqual([PAGE]);
  });

  test("a registry with no final newline gets a new line of its own", async () => {
    setFileContent(MNEMONIC_IMAGES_PATH, registryLine(FIXTURE_PAGE, FIXTURE_IMAGE).trimEnd());
    setFetchResponse(PAGE, buildMnemonicImageHtml(IMAGE));

    expect(await getMnemonicImageUrl(PAGE)).toBe(IMAGE);

    expect(mockState.writeCalls).toEqual([
      { path: MNEMONIC_IMAGES_PATH, data: "\n" + registryLine(PAGE, IMAGE) },
    ]);
    expect(await getMnemonicImageUrl(FIXTURE_PAGE)).toBe(FIXTURE_IMAGE);
    expect(await getMnemonicImageUrl(PAGE)).toBe(IMAGE);
    expect(mockState.fetchCalls).toEqual([PAGE]);
  });

  test("a failed scrape appends nothing, answers null and is retried", async () => {
    answerEveryFetch(() => Promise.reject(new Error("Network error")));

    expect(await getMnemonicImageUrl(PAGE)).toBeNull();
    expect(mockState.writeCalls).toEqual([]);

    installFetchMock();
    setFetchResponse(PAGE, buildMnemonicImageHtml(IMAGE));

    expect(await getMnemonicImageUrl(PAGE)).toBe(IMAGE);
    expect(mockState.fetchCalls).toEqual([PAGE, PAGE]);
  });

  test("a bad status appends nothing and answers null", async () => {
    answerEveryFetch(async () => new Response(buildMnemonicImageHtml(IMAGE), { status: 503 }));

    expect(await getMnemonicImageUrl(PAGE)).toBeNull();

    expect(mockState.fetchCalls).toEqual([PAGE]);
    expect(mockState.writeCalls).toEqual([]);
  });

  test("a failed append fails the lookup, the next lookup scrapes again", async () => {
    setFetchResponse(PAGE, buildMnemonicImageHtml(IMAGE));
    setFsError("appendFile", new Error("disk full"));

    await expect(getMnemonicImageUrl(PAGE)).rejects.toThrow("disk full");

    setFsError("appendFile", null);
    expect(await getMnemonicImageUrl(PAGE)).toBe(IMAGE);
    expect(mockState.fetchCalls).toEqual([PAGE, PAGE]);
  });

  test("a line pulled from the other machine is found without a scrape", async () => {
    expect(await getMnemonicImageUrl(FIXTURE_PAGE)).toBe(FIXTURE_IMAGE);

    setFileContent(
      MNEMONIC_IMAGES_PATH,
      registryLine(FIXTURE_PAGE, FIXTURE_IMAGE) + registryLine(PAGE, IMAGE)
    );

    expect(await getMnemonicImageUrl(PAGE)).toBe(IMAGE);
    expect(mockState.fetchCalls).toEqual([]);
  });

  test("a missing registry scrapes and the append creates the file", async () => {
    await unlink(MNEMONIC_IMAGES_PATH);
    setFetchResponse(PAGE, buildMnemonicImageHtml(IMAGE));

    expect(await getMnemonicImageUrl(PAGE)).toBe(IMAGE);
    expect(mockState.writeCalls).toEqual([
      { path: MNEMONIC_IMAGES_PATH, data: registryLine(PAGE, IMAGE) },
    ]);
  });

  test("a bad line fails the lookup with its line number", async () => {
    setFileContent(MNEMONIC_IMAGES_PATH, registryLine(FIXTURE_PAGE, FIXTURE_IMAGE) + "{ broken\n");

    await expect(getMnemonicImageUrl(FIXTURE_PAGE)).rejects.toThrow(
      `Invalid ${MNEMONIC_IMAGES_PATH} line 2`
    );
    expect(mockState.fetchCalls).toEqual([]);
  });
});

describe("parseMnemonicImageLines", () => {
  test("a missing file is an empty registry", () => {
    expect(parseMnemonicImageLines(null)).toEqual(new Map());
  });

  test("a blank line is skipped", () => {
    const images = parseMnemonicImageLines(
      registryLine(FIXTURE_PAGE, FIXTURE_IMAGE) + "\n  \n" + registryLine(PAGE, IMAGE)
    );

    expect(images).toEqual(
      new Map([
        [FIXTURE_PAGE, FIXTURE_IMAGE],
        [PAGE, IMAGE],
      ])
    );
  });

  test("two identical lines for a page are fine", () => {
    const images = parseMnemonicImageLines(registryLine(PAGE, IMAGE) + registryLine(PAGE, IMAGE));

    expect(images).toEqual(new Map([[PAGE, IMAGE]]));
  });

  test("a URL line beats a null line in both orders", () => {
    const urlFirst = parseMnemonicImageLines(registryLine(PAGE, IMAGE) + registryLine(PAGE, null));
    const nullFirst = parseMnemonicImageLines(registryLine(PAGE, null) + registryLine(PAGE, IMAGE));

    expect(urlFirst).toEqual(new Map([[PAGE, IMAGE]]));
    expect(nullFirst).toEqual(new Map([[PAGE, IMAGE]]));
  });

  test("two different URL lines for a page fail with the page", () => {
    const error = parseError(registryLine(PAGE, IMAGE) + registryLine(PAGE, OTHER_IMAGE));

    expect(error).toContain(`line 2: page ${PAGE} has two images, delete one line`);
  });

  test("a line with the wrong shape fails with its line number", () => {
    expect(parseError('{"page": 7, "image": null}\n')).toContain("line 1: expected");
    expect(parseError(`{"page": "${PAGE}"}\n`)).toContain("line 1: expected");
    expect(parseError("[]\n")).toContain("line 1: expected");
  });
});
