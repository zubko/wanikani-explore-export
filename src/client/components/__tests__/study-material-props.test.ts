import { describe, expect, it } from "bun:test";
import type {
  AuxiliaryMeaning,
  LocalStudyMaterial,
  Meaning,
  StudyMaterial,
} from "@/model/wanikani.ts";
import {
  noteProps,
  synonymProps,
} from "@client/components/card-components/study-material-props.ts";

type Subject = {
  id: number;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  studyMaterial: StudyMaterial | null;
  localStudyMaterial: LocalStudyMaterial | null;
};

function subject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 2478,
    meanings: [
      { meaning: "American Person", primary: true, accepted_answer: true },
      { meaning: "Person From The USA", primary: false, accepted_answer: true },
    ],
    auxiliaryMeanings: [
      { meaning: "US Citizen", type: "whitelist" },
      { meaning: "America", type: "blacklist" },
    ],
    studyMaterial: null,
    localStudyMaterial: null,
    ...overrides,
  };
}

function studyMaterial(data: Partial<StudyMaterial["data"]>): StudyMaterial {
  return {
    id: 1,
    object: "study_material",
    data: {
      subject_id: 2478,
      subject_type: "vocabulary",
      meaning_note: "",
      reading_note: "",
      meaning_synonyms: [],
      ...data,
    },
  } as StudyMaterial;
}

describe("synonymProps", () => {
  it("takes both meaning lists, whitelist and blacklist alike", () => {
    expect(synonymProps(subject()).subjectMeanings).toEqual([
      "American Person",
      "Person From The USA",
      "US Citizen",
      "America",
    ]);
  });

  it("takes the WaniKani synonyms and the local record", () => {
    const local = { meaning_synonyms: ["yank"] };
    const props = synonymProps(
      subject({
        studyMaterial: studyMaterial({ meaning_synonyms: ["usa person"] }),
        localStudyMaterial: local,
      })
    );

    expect(props.subjectId).toBe(2478);
    expect(props.wanikaniSynonyms).toEqual(["usa person"]);
    expect(props.localStudyMaterial).toBe(local);
  });

  it("answers empty lists when the subject has no meanings and no study material", () => {
    const props = synonymProps(subject({ meanings: [], auxiliaryMeanings: [] }));

    expect(props.subjectMeanings).toEqual([]);
    expect(props.wanikaniSynonyms).toEqual([]);
    expect(props.localStudyMaterial).toBeNull();
  });
});

describe("noteProps", () => {
  it("takes the note of the asked field only", () => {
    const props = noteProps(
      subject({
        studyMaterial: studyMaterial({ meaning_note: "mine", reading_note: "Kawai" }),
      }),
      "reading_note"
    );

    expect(props.field).toBe("reading_note");
    expect(props.wanikaniNote).toBe("Kawai");
  });

  it("answers an empty note when there is no study material", () => {
    expect(noteProps(subject(), "meaning_note").wanikaniNote).toBe("");
  });
});
