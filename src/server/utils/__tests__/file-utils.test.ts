import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFile } from "fs/promises";
import { resetFsMock, setFileContent, writeCalls } from "@/test/preload.ts";
import {
  isMissingFile,
  MISSING_FILE_VERSION,
  readFileVersion,
  writeFileAtomic,
  writeFileAtomicIfUnchanged,
} from "../file-utils.ts";

const PATH = "./data/userdata/file-utils-test.bin";

beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("writeFileAtomic", () => {
  test("keeps the bytes of a Buffer", async () => {
    // 0xff is no valid UTF-8, so a round trip through a string would change it
    const data = Buffer.from([0xff, 0x00, 0x10]);

    await writeFileAtomic(PATH, data);

    expect(writeCalls).toEqual([{ path: PATH, data }]);
    expect(await readFile(PATH)).toEqual(data);
  });
});

describe("writeFileAtomicIfUnchanged", () => {
  test("writes when the file still has the version", async () => {
    setFileContent(PATH, "old");
    const fileVersion = await readFileVersion(PATH);

    expect(await writeFileAtomicIfUnchanged({ path: PATH, data: "new", fileVersion })).toBe(true);

    expect(await readFile(PATH, "utf-8")).toBe("new");
  });

  test("a changed file is kept and no temp file stays", async () => {
    setFileContent(PATH, "old");
    const fileVersion = await readFileVersion(PATH);
    setFileContent(PATH, "changed outside");

    expect(await writeFileAtomicIfUnchanged({ path: PATH, data: "new", fileVersion })).toBe(false);

    expect(await readFile(PATH, "utf-8")).toBe("changed outside");
    expect(writeCalls).toHaveLength(0);
  });

  test("a file created after the version was read is kept", async () => {
    const fileVersion = await readFileVersion(PATH);
    expect(fileVersion).toBe(MISSING_FILE_VERSION);
    setFileContent(PATH, "created outside");

    expect(await writeFileAtomicIfUnchanged({ path: PATH, data: "new", fileVersion })).toBe(false);

    expect(await readFile(PATH, "utf-8")).toBe("created outside");
  });
});

describe("isMissingFile", () => {
  test("is true only for an ENOENT error", () => {
    expect(isMissingFile(Object.assign(new Error("no file"), { code: "ENOENT" }))).toBe(true);
    expect(isMissingFile(Object.assign(new Error("denied"), { code: "EACCES" }))).toBe(false);
    expect(isMissingFile(new Error("no code"))).toBe(false);
    expect(isMissingFile(null)).toBe(false);
  });
});
