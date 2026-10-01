import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { resetFsMock, setFileContent, setFsError, writeCalls } from "@/test/preload.ts";
import {
  extensionOfContentType,
  getOrFetchMedia,
  MEDIA_ROOT_PATH,
  type FetchedMedia,
} from "../media-cache.ts";

const NAME = "barb_ab12cd34";
const FILE_PATH = `${MEDIA_ROOT_PATH}/radicals/${NAME}.svg`;
// 0xff is no valid UTF-8, so a round trip through a string would change it
const BYTES = Buffer.from([0x3c, 0xff, 0x3e]);

beforeEach(resetFsMock);
afterEach(resetFsMock);

function createFetch(media: FetchedMedia = { data: BYTES, extension: "svg" }) {
  const calls: number[] = [];
  const fetch = async () => {
    calls.push(1);
    return media;
  };
  return { fetch, calls };
}

function getBarb(fetch: () => Promise<FetchedMedia>) {
  return getOrFetchMedia({ folder: "radicals", nameWithoutExtension: NAME, fetch });
}

describe("getOrFetchMedia", () => {
  test("a miss fetches once and writes the file under its real name", async () => {
    const { fetch, calls } = createFetch();

    expect(await getBarb(fetch)).toEqual({ fileName: `${NAME}.svg`, data: BYTES });

    expect(calls).toHaveLength(1);
    expect(writeCalls).toEqual([{ path: FILE_PATH, data: BYTES }]);
  });

  test("a second call is a hit with the same bytes and no fetch", async () => {
    const { fetch, calls } = createFetch();
    await getBarb(fetch);

    expect(await getBarb(fetch)).toEqual({ fileName: `${NAME}.svg`, data: BYTES });

    expect(calls).toHaveLength(1);
    expect(writeCalls).toHaveLength(1);
  });

  test("a temp file next to the name is no hit", async () => {
    setFileContent(`${FILE_PATH}.0d6f2b8e-4c1a-4f3e-9b7d-2a5c8e1f0b3d.tmp`, "half");
    const { fetch, calls } = createFetch();

    expect(await getBarb(fetch)).toEqual({ fileName: `${NAME}.svg`, data: BYTES });

    expect(calls).toHaveLength(1);
  });

  test("a file that only starts with the name is no hit", async () => {
    setFileContent(`${MEDIA_ROOT_PATH}/radicals/${NAME}_mnemonic.svg`, "other");
    const { fetch, calls } = createFetch();

    await getBarb(fetch);

    expect(calls).toHaveLength(1);
  });

  test("two files with the same name and different extensions throw", async () => {
    setFileContent(FILE_PATH, "<svg></svg>");
    setFileContent(`${MEDIA_ROOT_PATH}/radicals/${NAME}.png`, "png");
    const { fetch, calls } = createFetch();

    await expect(getBarb(fetch)).rejects.toThrow(
      `Two cached files for ${MEDIA_ROOT_PATH}/radicals/${NAME}`
    );

    expect(calls).toHaveLength(0);
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
    const { fetch, calls } = createFetch();

    await expect(getBarb(fetch)).rejects.toThrow("permission denied");

    expect(calls).toHaveLength(0);
  });

  test("a folder read error other than a missing folder throws and does not fetch", async () => {
    setFsError("readdir", Object.assign(new Error("permission denied"), { code: "EACCES" }));
    const { fetch, calls } = createFetch();

    await expect(getBarb(fetch)).rejects.toThrow("permission denied");

    expect(calls).toHaveLength(0);
  });
});

describe("extensionOfContentType", () => {
  test("maps the four known types", () => {
    expect(extensionOfContentType("image/svg+xml")).toBe("svg");
    expect(extensionOfContentType("image/png")).toBe("png");
    expect(extensionOfContentType("image/jpeg")).toBe("jpg");
    expect(extensionOfContentType("image/gif")).toBe("gif");
  });

  test("drops the parameters after the semicolon", () => {
    expect(extensionOfContentType("image/svg+xml; charset=utf-8")).toBe("svg");
  });

  test("throws on an unknown type", () => {
    expect(() => extensionOfContentType("text/html")).toThrow(
      "Unknown media content type: text/html"
    );
  });

  test("throws on a missing header", () => {
    expect(() => extensionOfContentType(null)).toThrow("Unknown media content type: null");
  });
});
