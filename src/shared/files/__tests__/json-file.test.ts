import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { resetFsMock, setFileContent, setFsError, writeCalls } from "@/test/preload.ts";
import { readJson, saveJsonAtomic } from "../json-file.ts";

const PATH = "./data/userdata/json-file-test.json";
const TEMP_NAME_PATTERN = /\.[0-9a-f-]{36}\.tmp$/;

beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("readJson", () => {
  test("parses the file", async () => {
    setFileContent(PATH, '{ "a": [1, 2] }');

    expect(await readJson<{ a: number[] }>(PATH)).toEqual({ a: [1, 2] });
  });

  test("throws the ENOENT error of a missing file", async () => {
    setFsError("readFile", Object.assign(new Error("no such file"), { code: "ENOENT" }));

    await expect(readJson(PATH)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("throws a SyntaxError on bad JSON", async () => {
    setFileContent(PATH, "{ not json");

    await expect(readJson(PATH)).rejects.toBeInstanceOf(SyntaxError);
  });
});

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
