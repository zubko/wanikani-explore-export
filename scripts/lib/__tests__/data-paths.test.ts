import { describe, expect, it } from "bun:test";
import { normalize } from "path";
import { CUSTOM_SUBJECTS_PATH } from "@server/repository/data-paths.ts";
import { CUSTOM_SUBJECTS_FILE } from "../data-paths.ts";

describe("CUSTOM_SUBJECTS_FILE", () => {
  it("is the file the server writes", () => {
    expect(normalize(CUSTOM_SUBJECTS_FILE)).toBe(normalize(CUSTOM_SUBJECTS_PATH));
  });
});
