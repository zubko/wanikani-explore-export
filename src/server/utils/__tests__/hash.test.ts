import { describe, test, expect } from "bun:test";
import { hashNumber, shortHash } from "../hash.ts";

describe("shortHash", () => {
  test("gives the first 8 hex chars of the SHA-1", () => {
    expect(shortHash("ひと")).toMatch(/^[0-9a-f]{8}$/);
    expect(shortHash("abc")).toBe("a9993e36");
  });

  test("gives the same hash for the same text", () => {
    expect(shortHash("ground")).toBe(shortHash("ground"));
  });
});

describe("hashNumber", () => {
  test("is the short hash read as a number", () => {
    expect(hashNumber("abc")).toBe(0xa9993e36);
  });

  test("gives the same number for the same text", () => {
    expect(hashNumber("ground")).toBe(hashNumber("ground"));
  });

  test("gives different numbers for two slugs", () => {
    expect(hashNumber("ground")).not.toBe(hashNumber("fins"));
  });
});
