import { describe, expect, it } from "bun:test";
import type { Radical, StudyMaterial } from "@/model/wanikani.ts";
import { click, mountCard, pressKey, settle, typeInto } from "@/test/render.tsx";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import { RadicalCard } from "@client/components/RadicalCard.tsx";

const apiMock: ApiMock = installApiMock();

const studyMaterial: StudyMaterial = {
  id: 100,
  object: "study_material",
  url: "https://api.wanikani.com/v2/study_materials/100",
  data_updated_at: "2026-01-01T00:00:00.000000Z",
  data: {
    created_at: "2026-01-01T00:00:00.000000Z",
    subject_id: 1,
    subject_type: "radical",
    meaning_note: "From WaniKani",
    reading_note: "",
    meaning_synonyms: ["floor"],
    hidden: false,
  },
};

const radical: Radical = {
  object: "radical",
  id: 1,
  characters: "一",
  characterImages: [],
  slug: "ground",
  level: 1,
  documentUrl: "https://www.wanikani.com/radicals/ground",
  meanings: [{ meaning: "Ground", primary: true, accepted_answer: true }],
  auxiliaryMeanings: [],
  meaningMnemonic: "This radical is the ground.",
  amalgamationSubjectIds: [],
  studyMaterial,
  localStudyMaterial: null,
  mnemonicImageUrl: null,
  foundInKanji: [],
};

describe("RadicalCard editors", () => {
  it("shows the WaniKani note and synonym of the radical", () => {
    const view = mountCard(<RadicalCard radical={radical} />);

    expect(view.html()).toContain("From WaniKani");
    expect(view.html()).toContain("floor");
    expect(view.findAllByLabel("Edit note")).toHaveLength(1);
  });

  it("saves the meaning note under the radical id", async () => {
    apiMock.answerWith({ meaning_note: "My own" });
    const view = mountCard(<RadicalCard radical={radical} />);

    click(view.findByLabel("Edit note"));
    typeInto(view.find("textarea"), "My own");
    click(view.findByLabel("Save note"));
    await settle();

    expect(apiMock.requests).toEqual([{ id: 1, meaning_note: "My own" }]);
  });

  it("saves a synonym under the radical id", async () => {
    apiMock.answerWith({ meaning_synonyms: ["flat"] });
    const view = mountCard(<RadicalCard radical={radical} />);

    click(view.findByLabel("+ Add Synonym"));
    typeInto(view.find("input"), "flat");
    pressKey({ node: view.find("input"), key: "Enter" });
    await settle();

    expect(apiMock.requests).toEqual([{ id: 1, meaning_synonyms: ["flat"] }]);
  });
});
