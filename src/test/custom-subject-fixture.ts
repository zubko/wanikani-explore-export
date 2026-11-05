import type {
  CustomSubject,
  CustomSubjectInput,
  KanaVocabularyData,
  VocabularyData,
} from "@/model/wanikani.ts";
import { CUSTOM_SUBJECTS_PATH } from "@server/repository/data-paths.ts";
import { setFileContent } from "./preload.ts";

const CREATED_AT = "2026-11-05T10:00:00.000Z";
const FIXED_DATA_FIELDS = [
  "slug",
  "level",
  "hidden_at",
  "document_url",
  "created_at",
  "pronunciation_audios",
  "lesson_position",
  "spaced_repetition_system_id",
];
// 下 in the real WaniKani data
export const CUSTOM_VERB_KANJI_ID = 451;

export const customKanaWord: KanaVocabularyData = {
  id: 1_000_000,
  object: "kana_vocabulary",
  url: null,
  data_updated_at: CREATED_AT,
  data: {
    ...fixedFields("どうぞ"),
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

export const customKanaVerb: KanaVocabularyData = {
  id: 1_000_001,
  object: "kana_vocabulary",
  url: null,
  data_updated_at: CREATED_AT,
  data: {
    ...fixedFields("くれる"),
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

export const customVerb: VocabularyData = {
  id: 1_000_002,
  object: "vocabulary",
  url: null,
  data_updated_at: CREATED_AT,
  data: {
    ...fixedFields("下す"),
    characters: "下す",
    meanings: [{ meaning: "To Hand Down", primary: true, accepted_answer: true }],
    auxiliary_meanings: [],
    parts_of_speech: ["godan verb", "transitive verb"],
    meaning_mnemonic: "A judge hands <vocabulary>down</vocabulary> a decision.",
    // the primary reading is listed second on purpose
    readings: [
      { reading: "おろす", primary: false, accepted_answer: false },
      { reading: "くだす", primary: true, accepted_answer: true },
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

export const hiddenCustomWord: VocabularyData = {
  id: 1_000_003,
  object: "vocabulary",
  url: null,
  data_updated_at: CREATED_AT,
  data: {
    ...fixedFields("下記"),
    hidden_at: "2026-11-05T12:00:00.000Z",
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

/** The body an agent would send for this record: the record without the fixed fields. */
export function customSubjectInputOf(record: CustomSubject): CustomSubjectInput {
  const data: Record<string, unknown> = { ...record.data };
  for (const field of FIXED_DATA_FIELDS) delete data[field];
  return { object: record.object, data } as unknown as CustomSubjectInput;
}

function fixedFields(characters: string) {
  return {
    created_at: CREATED_AT,
    level: 0,
    slug: characters,
    hidden_at: null,
    document_url: null,
    pronunciation_audios: [],
    lesson_position: 0,
    spaced_repetition_system_id: 0,
  };
}
