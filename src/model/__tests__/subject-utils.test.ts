import { describe, expect, it } from "bun:test";
import {
  applyLocalStudyMaterialPatch,
  findStudyMaterial,
  mergeStudyMaterial,
} from "../subject-utils.ts";
import type { StudyMaterial, StudyMaterialData } from "../wanikani.ts";

function studyMaterial(data: Partial<StudyMaterialData>): StudyMaterial {
  return {
    id: 1,
    object: "study_material",
    url: "https://api.wanikani.com/v2/study_materials/1",
    data_updated_at: "2026-01-01T00:00:00.000000Z",
    data: {
      created_at: "2026-01-01T00:00:00.000000Z",
      subject_id: 456,
      subject_type: "kanji",
      meaning_note: "",
      reading_note: "",
      meaning_synonyms: [],
      hidden: false,
      ...data,
    },
  };
}

describe("mergeStudyMaterial", () => {
  it("returns empty values when there is no record at all", () => {
    expect(mergeStudyMaterial(null, null)).toEqual({
      meaningNote: "",
      readingNote: "",
      meaningSynonyms: [],
    });
  });

  it("returns the WaniKani values when there is no local record", () => {
    const wanikani = studyMaterial({
      meaning_note: "river bank",
      reading_note: "Kawai",
      meaning_synonyms: ["stream"],
    });

    expect(mergeStudyMaterial(wanikani, null)).toEqual({
      meaningNote: "river bank",
      readingNote: "Kawai",
      meaningSynonyms: ["stream"],
    });
  });

  it("returns the local values when there is no WaniKani record", () => {
    const local = {
      meaning_note: "my meaning",
      reading_note: "my reading",
      meaning_synonyms: ["mine"],
    };

    expect(mergeStudyMaterial(null, local)).toEqual({
      meaningNote: "my meaning",
      readingNote: "my reading",
      meaningSynonyms: ["mine"],
    });
  });

  it("lets a local note win over the WaniKani note", () => {
    const wanikani = studyMaterial({ meaning_note: "river bank", reading_note: "Kawai" });
    const local = { meaning_note: "my meaning", reading_note: "my reading" };

    expect(mergeStudyMaterial(wanikani, local)).toEqual({
      meaningNote: "my meaning",
      readingNote: "my reading",
      meaningSynonyms: [],
    });
  });

  it("falls back to the WaniKani note when the local field is empty", () => {
    const wanikani = studyMaterial({ meaning_note: "river bank", reading_note: "Kawai" });
    const local = { meaning_note: "", reading_note: "" };

    expect(mergeStudyMaterial(wanikani, local)).toEqual({
      meaningNote: "river bank",
      readingNote: "Kawai",
      meaningSynonyms: [],
    });
  });

  it("appends the local synonyms after the WaniKani ones and drops duplicates", () => {
    const wanikani = studyMaterial({ meaning_synonyms: ["usa person", "american"] });
    const local = { meaning_synonyms: ["american", "yankee"] };

    expect(mergeStudyMaterial(wanikani, local).meaningSynonyms).toEqual([
      "usa person",
      "american",
      "yankee",
    ]);
  });

  it("takes a partial local record over a full WaniKani one", () => {
    const wanikani = studyMaterial({
      meaning_note: "river bank",
      reading_note: "Kawai",
      meaning_synonyms: ["stream"],
    });

    expect(mergeStudyMaterial(wanikani, { meaning_synonyms: ["brook"] })).toEqual({
      meaningNote: "river bank",
      readingNote: "Kawai",
      meaningSynonyms: ["stream", "brook"],
    });
    expect(mergeStudyMaterial(wanikani, { reading_note: "my reading" })).toEqual({
      meaningNote: "river bank",
      readingNote: "my reading",
      meaningSynonyms: ["stream"],
    });
  });
});

describe("findStudyMaterial", () => {
  const kanjiRecord = studyMaterial({ subject_id: 9176, subject_type: "kanji" });
  const kanaRecord = studyMaterial({ subject_id: 9176, subject_type: "kana_vocabulary" });

  it("matches on the subject type, not only on the id", () => {
    const records = [kanjiRecord, kanaRecord];

    expect(findStudyMaterial(records, 9176, "kana_vocabulary")).toBe(kanaRecord);
    expect(findStudyMaterial(records, 9176, "kanji")).toBe(kanjiRecord);
    expect(findStudyMaterial(records, 9176, "vocabulary")).toBeNull();
  });
});

describe("applyLocalStudyMaterialPatch", () => {
  it("keeps the fields the patch does not name", () => {
    const current = { meaning_note: "mine", meaning_synonyms: ["one"] };

    expect(applyLocalStudyMaterialPatch(current, { reading_note: "reading" })).toEqual({
      meaning_note: "mine",
      reading_note: "reading",
      meaning_synonyms: ["one"],
    });
  });

  it("trims the notes and drops blank synonyms", () => {
    const patch = { meaning_note: "  mine  ", meaning_synonyms: ["", " one ", "  "] };

    expect(applyLocalStudyMaterialPatch(null, patch)).toEqual({
      meaning_note: "mine",
      meaning_synonyms: ["one"],
    });
  });

  it("cleans a value that is already in the record", () => {
    const current = { meaning_note: "  ", meaning_synonyms: ["one", "one", " "] };

    expect(applyLocalStudyMaterialPatch(current, { reading_note: "reading" })).toEqual({
      reading_note: "reading",
      meaning_synonyms: ["one"],
    });
  });

  it("drops a field that the patch empties", () => {
    const current = { meaning_note: "mine", reading_note: "reading" };

    expect(applyLocalStudyMaterialPatch(current, { reading_note: "" })).toEqual({
      meaning_note: "mine",
    });
  });

  it("returns null when no field is left", () => {
    expect(applyLocalStudyMaterialPatch({ meaning_note: "mine" }, { meaning_note: "" })).toBeNull();
    expect(applyLocalStudyMaterialPatch(null, { meaning_synonyms: [] })).toBeNull();
  });
});
