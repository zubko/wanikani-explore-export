import { describe, expect, it } from "bun:test";
import { join } from "path";
import { chunk, loadJsonFile, parseJsonObject } from "../llm-utils.ts";

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
