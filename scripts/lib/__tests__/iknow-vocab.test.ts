import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  createInitialStatus,
  listFilesToWalk,
  listNewRadicals,
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

describe("listFilesToWalk", () => {
  const status: VocabStatus = {
    current: "step-02.json",
    files: { "step-01.json": { index: 100, done: true }, "step-02.json": { index: 40 } },
    problems: [],
  };

  it("walks only the current file from its saved index", () => {
    expect(listFilesToWalk({ status, courseFiles: COURSE_FILES, acrossFiles: false })).toEqual([
      { file: "step-02.json", startIndex: 40 },
    ]);
  });

  it("walks on into every later file from 0 and never back", () => {
    expect(listFilesToWalk({ status, courseFiles: COURSE_FILES, acrossFiles: true })).toEqual([
      { file: "step-02.json", startIndex: 40 },
      { file: "step-03.json", startIndex: 0 },
    ]);
  });

  it("starts the current file at 0 when it has no entry", () => {
    const fresh = createInitialStatus("step-01.json");
    expect(
      listFilesToWalk({ status: fresh, courseFiles: COURSE_FILES, acrossFiles: false })
    ).toEqual([{ file: "step-01.json", startIndex: 0 }]);
  });

  it("throws when the current file is not in the series", () => {
    const stray: VocabStatus = { ...status, current: "step-99.json" };
    expect(() =>
      listFilesToWalk({ status: stray, courseFiles: COURSE_FILES, acrossFiles: true })
    ).toThrow("is not in the series");
  });
});

describe("listNewRadicals", () => {
  const radical = (id: number, name: string) => ({
    id,
    meanings: [
      { meaning: `${name} alias`, primary: false, accepted_answer: true },
      { meaning: name, primary: true, accepted_answer: true },
    ],
  });
  const thread = radical(86, "Thread");
  const goodLuck = radical(253, "Good Luck");
  const woman = radical(19, "Woman");
  const sun = radical(22, "Sun");

  it("keeps the kanji and radical order and skips names already in Anki", () => {
    const componentKanji = [
      { componentRadicals: [thread, goodLuck] },
      { componentRadicals: [woman, sun] },
    ];
    expect(
      listNewRadicals({ componentKanji, knownRadicalNames: new Set(["Good Luck", "Sun"]) })
    ).toEqual([thread, woman]);
  });

  it("lists a radical of two kanji once", () => {
    const componentKanji = [{ componentRadicals: [sun] }, { componentRadicals: [sun, woman] }];
    expect(listNewRadicals({ componentKanji, knownRadicalNames: new Set() })).toEqual([sun, woman]);
  });

  it("lists two radicals with one primary name once", () => {
    const roof = radical(37, "Roof");
    const otherRoof = radical(8762, "Roof");
    const componentKanji = [{ componentRadicals: [roof] }, { componentRadicals: [otherRoof] }];
    expect(listNewRadicals({ componentKanji, knownRadicalNames: new Set() })).toEqual([roof]);
  });

  it("answers no radical for a word with no kanji", () => {
    expect(listNewRadicals({ componentKanji: [], knownRadicalNames: new Set() })).toEqual([]);
  });

  it("leaves the known names untouched", () => {
    const knownRadicalNames = new Set(["Sun"]);
    listNewRadicals({ componentKanji: [{ componentRadicals: [woman] }], knownRadicalNames });
    expect([...knownRadicalNames]).toEqual(["Sun"]);
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
