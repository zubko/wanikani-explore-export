import { CUSTOM_SUBJECT_ID_FLOOR } from "@/model/wanikani.ts";
import type {
  CustomSubject,
  CustomSubjectInput,
  KanaVocabularyData,
  VocabularyData,
} from "@/model/wanikani.ts";
import { buildCustomRecord } from "@/model/custom-subject-utils.ts";
import { CUSTOM_SUBJECTS_PATH } from "@server/repository/data-paths.ts";
import { setFileContent } from "./preload.ts";

const CREATED_AT = "2026-11-05T10:00:00.000Z";
// 下 in the real WaniKani data
export const CUSTOM_VERB_KANJI_ID = 451;

export const customKanaWordInput: CustomSubjectInput = {
  object: "kana_vocabulary",
  data: {
    characters: "どうぞ",
    meanings: [{ meaning: "Please", primary: true, accepted_answer: true }],
    auxiliary_meanings: [{ meaning: "Go ahead", type: "whitelist" }],
    parts_of_speech: ["adverb"],
    meaning_mnemonic: "You hold the door and say <vocabulary>please</vocabulary>, go ahead.",
    context_sentences: [
      { en: "Please come in.", ja: "どうぞ入って。", reading: "どうぞはいって。" },
    ],
  },
};

export const customKanaVerbInput: CustomSubjectInput = {
  object: "kana_vocabulary",
  data: {
    characters: "くれる",
    meanings: [{ meaning: "To Give Me", primary: true, accepted_answer: true }],
    auxiliary_meanings: [],
    parts_of_speech: ["ichidan verb", "transitive verb"],
    meaning_mnemonic: "Someone <vocabulary>gives</vocabulary> something to you.",
    context_sentences: [
      {
        en: "My friend gave me a book.",
        ja: "友達が本をくれた。",
        reading: "ともだちがほんをくれた。",
      },
    ],
    conjugations: { dictionary: "くれる", masu: "くれます", te: "くれて", nai: "くれない" },
  },
};

export const customVerbInput: CustomSubjectInput = {
  object: "vocabulary",
  data: {
    characters: "下す",
    meanings: [{ meaning: "To Hand Down", primary: true, accepted_answer: true }],
    auxiliary_meanings: [],
    parts_of_speech: ["godan verb", "transitive verb"],
    meaning_mnemonic: "A judge hands <vocabulary>down</vocabulary> a decision.",
    // the primary reading is listed second on purpose
    readings: [
      { reading: "おろす", primary: false, accepted_answer: true },
      { reading: "くだす", primary: true, accepted_answer: true },
      { reading: "げす", primary: false, accepted_answer: false },
    ],
    reading_mnemonic: "The judge <reading>くだす</reading> the decision.",
    component_subject_ids: [CUSTOM_VERB_KANJI_ID],
    context_sentences: [
      {
        en: "The judge handed down a decision.",
        ja: "判事が判決を下した。",
        reading: "はんじがはんけつをくだした。",
      },
    ],
    conjugations: { dictionary: "下す", masu: "下します", te: "下して", nai: "下さない" },
  },
};

export const hiddenCustomWordInput: CustomSubjectInput = {
  object: "vocabulary",
  data: {
    characters: "下記",
    meanings: [{ meaning: "The Following", primary: true, accepted_answer: true }],
    auxiliary_meanings: [],
    parts_of_speech: ["noun"],
    meaning_mnemonic: "What is written <vocabulary>below</vocabulary>.",
    readings: [{ reading: "かき", primary: true, accepted_answer: true }],
    reading_mnemonic: "Written <reading>かき</reading> below.",
    component_subject_ids: [CUSTOM_VERB_KANJI_ID],
    context_sentences: [],
  },
};

export const customKanaWord = buildFixture(
  CUSTOM_SUBJECT_ID_FLOOR,
  customKanaWordInput
) as KanaVocabularyData;
export const customKanaVerb = buildFixture(
  CUSTOM_SUBJECT_ID_FLOOR + 1,
  customKanaVerbInput
) as KanaVocabularyData;
export const customVerb = buildFixture(
  CUSTOM_SUBJECT_ID_FLOOR + 2,
  customVerbInput
) as VocabularyData;
export const hiddenCustomWord = hide(
  buildFixture(CUSTOM_SUBJECT_ID_FLOOR + 3, hiddenCustomWordInput) as VocabularyData
);

export const customSubjectFixture: CustomSubject[] = [
  customKanaWord,
  customKanaVerb,
  customVerb,
  hiddenCustomWord,
];

/** Changes the file behind the repository, like a hand edit or a git pull does. */
export function setCustomSubjectsFile(records: unknown[]): void {
  setFileContent(CUSTOM_SUBJECTS_PATH, JSON.stringify(records, null, 2) + "\n");
}

function buildFixture(id: number, input: CustomSubjectInput): CustomSubject {
  return buildCustomRecord({ id, input, now: CREATED_AT });
}

function hide(record: VocabularyData): VocabularyData {
  return { ...record, data: { ...record.data, hidden_at: "2026-11-05T12:00:00.000Z" } };
}
