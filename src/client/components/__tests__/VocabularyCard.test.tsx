import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CUSTOM_SUBJECT_ID_FLOOR } from "@/model/wanikani.ts";
import type { KanaVocabulary, Vocabulary } from "@/model/wanikani.ts";
import { installApiMock } from "@/test/api-mock.ts";
import { VocabularyCard } from "@client/components/VocabularyCard.tsx";

// the note editors read the client store, which this clears around every test
installApiMock();

const kanaVocabulary: KanaVocabulary = {
  object: "kana_vocabulary",
  id: 9209,
  characters: "ここ",
  slug: "ここ",
  level: 1,
  documentUrl: "https://www.wanikani.com/vocabulary/ここ",
  isCustom: false,
  meanings: [{ meaning: "Here", primary: true, accepted_answer: true }],
  auxiliaryMeanings: [],
  meaningMnemonic: "Here you are.",
  partsOfSpeech: ["pronoun"],
  contextSentences: [],
  pronunciationAudios: [],
  studyMaterial: null,
  localStudyMaterial: null,
  conjugations: null,
};

const vocabulary: Vocabulary = {
  object: "vocabulary",
  id: 3766,
  characters: "毎晩",
  slug: "毎晩",
  level: 1,
  documentUrl: "https://www.wanikani.com/vocabulary/毎晩",
  isCustom: false,
  meanings: [{ meaning: "Every Evening", primary: true, accepted_answer: true }],
  auxiliaryMeanings: [],
  meaningMnemonic: "Every evening.",
  readings: [{ reading: "まいばん", primary: true, accepted_answer: true }],
  readingMnemonic: "Mai ban.",
  partsOfSpeech: ["noun"],
  componentSubjectIds: [],
  contextSentences: [],
  pronunciationAudios: [],
  studyMaterial: null,
  localStudyMaterial: null,
  componentKanji: [],
  conjugations: null,
};

function countAddNoteButtons(html: string): number {
  return html.split("+ Add Note").length - 1;
}

describe("VocabularyCard note editors", () => {
  it("gives kana vocabulary the meaning note only", () => {
    const html = renderToStaticMarkup(<VocabularyCard vocabulary={kanaVocabulary} />);

    expect(countAddNoteButtons(html)).toBe(1);
    expect(html).not.toContain(">Reading<");
  });

  it("gives vocabulary both notes", () => {
    const html = renderToStaticMarkup(<VocabularyCard vocabulary={vocabulary} />);

    expect(countAddNoteButtons(html)).toBe(2);
    expect(html).toContain(">Reading<");
  });

  it("shows the local note in place of the WaniKani one", () => {
    const html = renderToStaticMarkup(
      <VocabularyCard
        vocabulary={{
          ...kanaVocabulary,
          localStudyMaterial: { meaning_note: "Koko is close to me" },
        }}
      />
    );

    expect(html).toContain("Koko is close to me");
    expect(html).toContain(">local<");
    expect(countAddNoteButtons(html)).toBe(0);
  });
});

describe("VocabularyCard header", () => {
  it("shows the custom label and no WaniKani link for a custom word", () => {
    const html = renderToStaticMarkup(
      <VocabularyCard
        vocabulary={{
          ...kanaVocabulary,
          id: CUSTOM_SUBJECT_ID_FLOOR,
          isCustom: true,
          documentUrl: null,
        }}
      />
    );

    expect(html).toContain(">custom<");
    expect(html).not.toContain("wanikani.com");
  });

  it("shows the WaniKani link and no label for a WaniKani word", () => {
    const html = renderToStaticMarkup(<VocabularyCard vocabulary={vocabulary} />);

    expect(html).toContain('href="https://www.wanikani.com/vocabulary/毎晩"');
    expect(html).not.toContain(">custom<");
  });
});

describe("VocabularyCard conjugations", () => {
  it("shows the conjugation row of a kana verb", () => {
    const html = renderToStaticMarkup(
      <VocabularyCard
        vocabulary={{
          ...kanaVocabulary,
          characters: "くれる",
          slug: "くれる",
          partsOfSpeech: ["ichidan verb"],
          conjugations: {
            type: "verb",
            dictionary: "くれる",
            masu: "くれます",
            te: "くれて",
            nai: "くれない",
          },
        }}
      />
    );

    expect(html).toContain("Conjugations");
    expect(html).toContain("くれる, くれます, くれて, くれない");
  });

  it("shows no conjugation row for a kana word with none", () => {
    const html = renderToStaticMarkup(<VocabularyCard vocabulary={kanaVocabulary} />);

    expect(html).not.toContain("Conjugations");
  });
});
