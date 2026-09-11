import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  createInitialStatus,
  parseCourseFiles,
  parseGoalItems,
  rollOverToNextFile,
  type VocabStatus,
} from "../iknow-vocab.ts";

const course = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures/iknow-course.json"), "utf-8")
);

const COURSE_FILES = ["step-01.json", "step-02.json", "step-03.json"];

describe("parseGoalItems", () => {
  it("reads the word and the kana reading out of item.cue", () => {
    expect(parseGoalItems(course)).toEqual([
      { word: "行く", reading: "いく" },
      { word: "どこ", reading: "どこ" },
      { word: "ABC", reading: "" },
    ]);
  });

  it("throws when the file has no goal_items", () => {
    expect(() => parseGoalItems({})).toThrow("no goal_items array");
  });

  it("throws when an item has no cue text", () => {
    expect(() => parseGoalItems({ goal_items: [{ item: {} }] })).toThrow(
      "Course item 0 has no item.cue.text"
    );
  });
});

describe("parseCourseFiles", () => {
  it("returns the file names in series order", () => {
    expect(parseCourseFiles({ courses: [{ file: "a.json" }, { file: "b.json" }] })).toEqual([
      "a.json",
      "b.json",
    ]);
  });

  it("throws when the series has no courses", () => {
    expect(() => parseCourseFiles({})).toThrow("no courses array");
  });
});

describe("rollOverToNextFile", () => {
  const status: VocabStatus = {
    current: "step-02.json",
    files: { "step-01.json": { index: 100, done: true }, "step-02.json": { index: 40 } },
    problems: [],
  };

  it("marks the current file done and starts the next one at 0", () => {
    const result = rollOverToNextFile({ status, courseFiles: COURSE_FILES, itemCount: 100 });

    expect(result.nextFile).toBe("step-03.json");
    expect(result.status.current).toBe("step-03.json");
    expect(result.status.files["step-02.json"]).toEqual({ index: 100, done: true });
    expect(result.status.files["step-03.json"]).toEqual({ index: 0 });
  });

  it("resets a stale entry for the next file", () => {
    const stale: VocabStatus = {
      ...status,
      files: { ...status.files, "step-03.json": { index: 70, done: true } },
    };
    const result = rollOverToNextFile({ status: stale, courseFiles: COURSE_FILES, itemCount: 100 });

    expect(result.status.files["step-03.json"]).toEqual({ index: 0 });
  });

  it("keeps the current file when the series is finished", () => {
    const last: VocabStatus = { ...status, current: "step-03.json" };
    const result = rollOverToNextFile({
      status: last,
      courseFiles: COURSE_FILES,
      itemCount: 100,
    });

    expect(result.nextFile).toBeNull();
    expect(result.status.current).toBe("step-03.json");
    expect(result.status.files["step-03.json"]).toEqual({ index: 100, done: true });
  });

  it("throws when the current file is not in the series", () => {
    const stray: VocabStatus = { ...status, current: "step-99.json" };
    expect(() =>
      rollOverToNextFile({ status: stray, courseFiles: COURSE_FILES, itemCount: 100 })
    ).toThrow("is not in the series");
  });
});

describe("createInitialStatus", () => {
  it("starts at the first course file with nothing done", () => {
    expect(createInitialStatus("step-01.json")).toEqual({
      current: "step-01.json",
      files: {},
      problems: [],
    });
  });
});
