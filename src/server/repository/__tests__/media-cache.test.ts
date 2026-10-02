import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readdir } from "fs/promises";
import { mkdirCalls, resetFsMock, setFileContent, setFsError, writeCalls } from "@/test/preload.ts";
import { MEDIA_ROOT_PATH } from "../data-paths.ts";
import { extensionOfContentType, getOrFetchMedia, type FetchedMedia } from "../media-cache.ts";

const NAME = "barb_ab12cd34";
const FOLDER_PATH = `${MEDIA_ROOT_PATH}/radicals`;
const FILE_PATH = `${FOLDER_PATH}/${NAME}.svg`;
const PICTURE_URL = "https://files.wanikani.com/barb-mnemonic";
// 0xff is no valid UTF-8, so a round trip through a string would change it
const BYTES = Buffer.from([0x3c, 0xff, 0x3e]);

beforeEach(resetFsMock);
afterEach(resetFsMock);

function createFetch(media: FetchedMedia = { data: BYTES, extension: "svg" }) {
  let callCount = 0;
  const fetch = async () => {
    callCount += 1;
    return media;
  };
  return { fetch, callCount: () => callCount };
}

function getBarb(fetch: () => Promise<FetchedMedia>) {
  return getOrFetchMedia({ folder: "radicals", nameWithoutExtension: NAME, fetch });
}

describe("getOrFetchMedia", () => {
  test("a miss fetches once and writes the file under its real name", async () => {
    const { fetch, callCount } = createFetch();

    expect(await getBarb(fetch)).toEqual({ fileName: `${NAME}.svg`, data: BYTES });

    expect(callCount()).toBe(1);
    expect(writeCalls).toEqual([{ path: FILE_PATH, data: BYTES }]);
  });

  // A fresh clone has no media folder
  test("a miss creates the folder first", async () => {
    await getBarb(createFetch().fetch);

    expect(mkdirCalls).toEqual([{ path: FOLDER_PATH, recursive: true }]);
  });

  test("a folder create error throws and does not fetch", async () => {
    setFsError("mkdir", Object.assign(new Error("permission denied"), { code: "EACCES" }));
    const { fetch, callCount } = createFetch();

    await expect(getBarb(fetch)).rejects.toThrow("permission denied");

    expect(callCount()).toBe(0);
  });

  test("an empty answer throws and writes nothing", async () => {
    const { fetch } = createFetch({ data: Buffer.alloc(0), extension: "svg" });

    await expect(getBarb(fetch)).rejects.toThrow(`Empty media answer for radicals/${NAME}.svg`);

    expect(writeCalls).toHaveLength(0);
  });

  test("two misses of one name at the same time both answer the file and leave no temp file", async () => {
    const { fetch, callCount } = createFetch();

    const results = await Promise.all([getBarb(fetch), getBarb(fetch)]);

    expect(results).toEqual([
      { fileName: `${NAME}.svg`, data: BYTES },
      { fileName: `${NAME}.svg`, data: BYTES },
    ]);
    expect(callCount()).toBe(2);
    expect(await readdir(FOLDER_PATH)).toEqual([`${NAME}.svg`]);
  });

  test("a second call is a hit with the same bytes and no fetch", async () => {
    const { fetch, callCount } = createFetch();
    await getBarb(fetch);

    expect(await getBarb(fetch)).toEqual({ fileName: `${NAME}.svg`, data: BYTES });

    expect(callCount()).toBe(1);
    expect(writeCalls).toHaveLength(1);
  });

  test("a temp file next to the name is no hit", async () => {
    setFileContent(`${FILE_PATH}.0d6f2b8e-4c1a-4f3e-9b7d-2a5c8e1f0b3d.tmp`, "half");
    const { fetch, callCount } = createFetch();

    expect(await getBarb(fetch)).toEqual({ fileName: `${NAME}.svg`, data: BYTES });

    expect(callCount()).toBe(1);
  });

  test("a file that only starts with the name is no hit", async () => {
    setFileContent(`${FOLDER_PATH}/${NAME}_mnemonic.svg`, "other");
    const { fetch, callCount } = createFetch();

    await getBarb(fetch);

    expect(callCount()).toBe(1);
  });

  test("two files with the same name and different extensions throw", async () => {
    setFileContent(FILE_PATH, "<svg></svg>");
    setFileContent(`${FOLDER_PATH}/${NAME}.png`, "png");
    const { fetch, callCount } = createFetch();

    await expect(getBarb(fetch)).rejects.toThrow(`Two cached files for ${FOLDER_PATH}/${NAME}`);

    expect(callCount()).toBe(0);
  });

  test("a failed fetch writes nothing and throws", async () => {
    const fetch = async (): Promise<FetchedMedia> => {
      throw new Error("Failed to download media (500)");
    };

    await expect(getBarb(fetch)).rejects.toThrow("Failed to download media (500)");

    expect(writeCalls).toHaveLength(0);
  });

  test.each(["writeFile", "rename"] as const)(
    "a %s error leaves no temp file and throws",
    async (op) => {
      setFsError(op, new Error("disk full"));
      const { fetch } = createFetch();

      await expect(getBarb(fetch)).rejects.toThrow("disk full");

      expect(writeCalls).toHaveLength(0);
    }
  );

  test("a read error on a hit throws and does not fetch", async () => {
    setFileContent(FILE_PATH, "<svg></svg>");
    setFsError("readFile", new Error("permission denied"));
    const { fetch, callCount } = createFetch();

    await expect(getBarb(fetch)).rejects.toThrow("permission denied");

    expect(callCount()).toBe(0);
  });

  test("a folder read error other than a missing folder throws and does not fetch", async () => {
    setFsError("readdir", Object.assign(new Error("permission denied"), { code: "EACCES" }));
    const { fetch, callCount } = createFetch();

    await expect(getBarb(fetch)).rejects.toThrow("permission denied");

    expect(callCount()).toBe(0);
  });
});

describe("extensionOfContentType", () => {
  function extensionOf(contentType: string | null): string {
    return extensionOfContentType({ contentType, url: PICTURE_URL });
  }

  test("maps the four known types", () => {
    expect(extensionOf("image/svg+xml")).toBe("svg");
    expect(extensionOf("image/png")).toBe("png");
    expect(extensionOf("image/jpeg")).toBe("jpg");
    expect(extensionOf("image/gif")).toBe("gif");
  });

  test("drops the parameters after the semicolon", () => {
    expect(extensionOf("image/svg+xml; charset=utf-8")).toBe("svg");
  });

  test("throws on an unknown type with the URL", () => {
    expect(() => extensionOf("text/html")).toThrow(
      `Unknown media content type (text/html): ${PICTURE_URL}`
    );
  });

  test("throws on a missing header with the URL", () => {
    expect(() => extensionOf(null)).toThrow(`Unknown media content type (null): ${PICTURE_URL}`);
  });
});
