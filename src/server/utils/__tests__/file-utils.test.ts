import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFile } from "fs/promises";
import { resetFsMock, writeCalls } from "@/test/preload.ts";
import { isMissingFile, writeFileAtomic } from "../file-utils.ts";

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

describe("isMissingFile", () => {
  test("is true only for an ENOENT error", () => {
    expect(isMissingFile(Object.assign(new Error("no file"), { code: "ENOENT" }))).toBe(true);
    expect(isMissingFile(Object.assign(new Error("denied"), { code: "EACCES" }))).toBe(false);
    expect(isMissingFile(new Error("no code"))).toBe(false);
    expect(isMissingFile(null)).toBe(false);
  });
});
