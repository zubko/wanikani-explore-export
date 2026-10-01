import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFile } from "fs/promises";
import { resetFsMock, setFsError, writeCalls } from "@/test/preload.ts";
import { saveJsonAtomic, writeFileAtomic } from "../json-utils.ts";

const PATH = "./data/userdata/json-utils-test.json";
const TEMP_NAME_PATTERN = /\.[0-9a-f-]{36}\.tmp$/;

beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("saveJsonAtomic", () => {
  test("writes a temp file and renames it over the real one", async () => {
    await saveJsonAtomic(PATH, { a: 1 });

    expect(writeCalls).toEqual([{ path: PATH, data: '{\n  "a": 1\n}\n' }]);
  });

  test("removes the temp file when the rename fails", async () => {
    setFsError("rename", new Error("rename failed"));

    await expect(saveJsonAtomic(PATH, { a: 1 })).rejects.toThrow("rename failed");

    expect(writeCalls).toHaveLength(0);
  });

  test("reports the write error even when the cleanup fails", async () => {
    setFsError("rename", new Error("rename failed"));
    setFsError("unlink", new Error("unlink failed"));

    await expect(saveJsonAtomic(PATH, { a: 1 })).rejects.toThrow("rename failed");

    expect(writeCalls).toEqual([
      { path: expect.stringMatching(TEMP_NAME_PATTERN), data: '{\n  "a": 1\n}\n' },
    ]);
    expect(writeCalls[0]?.path.startsWith(`${PATH}.`)).toBe(true);
  });

  test("gives every write its own temp file", async () => {
    setFsError("rename", new Error("rename failed"));
    setFsError("unlink", new Error("unlink failed"));

    await expect(saveJsonAtomic(PATH, { a: 1 })).rejects.toThrow("rename failed");
    await expect(saveJsonAtomic(PATH, { a: 2 })).rejects.toThrow("rename failed");

    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0]?.path).not.toBe(writeCalls[1]?.path);
  });
});

describe("writeFileAtomic", () => {
  test("keeps the bytes of a Buffer", async () => {
    // 0xff is no valid UTF-8, so a round trip through a string would change it
    const data = Buffer.from([0xff, 0x00, 0x10]);

    await writeFileAtomic(PATH, data);

    expect(writeCalls).toEqual([{ path: PATH, data }]);
    expect(await readFile(PATH)).toEqual(data);
  });
});
