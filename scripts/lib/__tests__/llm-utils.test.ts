import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { resetFsMock, setFsError, writeCalls } from "@/test/preload.ts";
import { chunk, loadJsonFile, parseJsonObject, saveJsonAtomic } from "../llm-utils.ts";

const SAVE_PATH = "./data/llm-utils-test.json";
const TEMP_NAME_PATTERN = /\.[0-9a-f-]{36}\.tmp$/;

describe("chunk", () => {
  it("splits the items into groups of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no groups for no items", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("parseJsonObject", () => {
  it("reads the object out of a fenced answer", () => {
    expect(parseJsonObject('Here it is:\n```json\n{"1": "a"}\n```')).toEqual({ "1": "a" });
  });

  it("returns null when the answer has no valid object", () => {
    expect(parseJsonObject("no json here")).toBeNull();
    expect(parseJsonObject('{"1": }')).toBeNull();
    expect(parseJsonObject('["a"]')).toBeNull();
  });
});

describe("loadJsonFile", () => {
  it("returns an empty record for a missing file", async () => {
    expect(await loadJsonFile(join(import.meta.dir, "missing.json"))).toEqual({});
  });

  it("throws on a file that is not valid JSON", async () => {
    await expect(loadJsonFile(import.meta.path)).rejects.toThrow();
  });

  it("throws on a file that holds a JSON array", async () => {
    await expect(loadJsonFile(join(import.meta.dir, "fixtures/json-array.json"))).rejects.toThrow(
      "must hold a JSON object"
    );
  });
});

// The same cases as the server copy in json-utils.test.ts, the two copies must stay alike
describe("saveJsonAtomic", () => {
  beforeEach(resetFsMock);
  afterEach(resetFsMock);

  it("writes a temp file and renames it over the real one", async () => {
    await saveJsonAtomic(SAVE_PATH, { a: 1 });

    expect(writeCalls).toEqual([{ path: SAVE_PATH, data: '{\n  "a": 1\n}\n' }]);
  });

  it("removes the temp file when the rename fails", async () => {
    setFsError("rename", new Error("rename failed"));

    await expect(saveJsonAtomic(SAVE_PATH, { a: 1 })).rejects.toThrow("rename failed");

    expect(writeCalls).toHaveLength(0);
  });

  it("reports the write error even when the cleanup fails", async () => {
    setFsError("rename", new Error("rename failed"));
    setFsError("unlink", new Error("unlink failed"));

    await expect(saveJsonAtomic(SAVE_PATH, { a: 1 })).rejects.toThrow("rename failed");

    expect(writeCalls).toEqual([
      { path: expect.stringMatching(TEMP_NAME_PATTERN), data: '{\n  "a": 1\n}\n' },
    ]);
    expect(writeCalls[0]?.path.startsWith(`${SAVE_PATH}.`)).toBe(true);
  });

  it("gives every write its own temp file", async () => {
    setFsError("rename", new Error("rename failed"));
    setFsError("unlink", new Error("unlink failed"));

    await expect(saveJsonAtomic(SAVE_PATH, { a: 1 })).rejects.toThrow("rename failed");
    await expect(saveJsonAtomic(SAVE_PATH, { a: 2 })).rejects.toThrow("rename failed");

    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0]?.path).not.toBe(writeCalls[1]?.path);
  });
});
