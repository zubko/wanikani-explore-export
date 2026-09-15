import { describe, expect, it } from "bun:test";
import type { Kanji } from "@/model/wanikani.ts";
import { click, mountCard, settle, typeInto, type Mounted } from "@/test/render.tsx";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import { KanjiCard } from "@client/components/KanjiCard.tsx";

const apiMock: ApiMock = installApiMock();

const kanji: Kanji = {
  object: "kanji",
  id: 456,
  characters: "川",
  slug: "川",
  level: 2,
  documentUrl: "https://www.wanikani.com/kanji/川",
  meanings: [{ meaning: "River", primary: true, accepted_answer: true }],
  auxiliaryMeanings: [],
  meaningMnemonic: "A river.",
  meaningHint: "",
  readings: [{ reading: "かわ", primary: true, accepted_answer: true, type: "kunyomi" }],
  readingMnemonic: "Kawa.",
  readingHint: "",
  componentSubjectIds: [],
  amalgamationSubjectIds: [],
  visuallySimilarSubjectIds: [],
  studyMaterial: null,
  localStudyMaterial: null,
  componentRadicals: [],
  visuallySimilarKanji: [],
  foundInVocabulary: [],
};

function mountKanjiCard() {
  return mountCard(<KanjiCard kanji={kanji} />);
}

async function addNote(view: Mounted, index: number, text: string) {
  click(view.findAllByLabel("+ Add Note")[index]!);
  typeInto(view.find("textarea"), text);
  click(view.findByLabel("Save note"));
  await settle();
}

describe("KanjiCard editors", () => {
  it("has a note editor for the meaning and one for the readings", () => {
    const view = mountKanjiCard();

    expect(view.findAllByLabel("+ Add Note")).toHaveLength(2);
  });

  it("saves the first note as the meaning note", async () => {
    apiMock.answerWith({ meaning_note: "Water flows" });
    const view = mountKanjiCard();

    await addNote(view, 0, "Water flows");

    expect(apiMock.requests).toEqual([{ id: 456, meaning_note: "Water flows" }]);
  });

  it("saves the second note as the reading note", async () => {
    apiMock.answerWith({ reading_note: "Kawa like a river bank" });
    const view = mountKanjiCard();

    await addNote(view, 1, "Kawa like a river bank");

    expect(apiMock.requests).toEqual([{ id: 456, reading_note: "Kawa like a river bank" }]);
  });

  it("says that kanji synonyms do not reach Anki", () => {
    const view = mountKanjiCard();

    expect(view.html()).toContain("not in Anki");
  });
});
