// The same name is used for the Anki deck and for the Anki note type
export const RADICAL_MODEL_NAME = "Japanese Radicals";
export const KANJI_MODEL_NAME = "Japanese Kanji";
export const VOCABULARY_MODEL_NAME = "Japanese Vocabulary";

export const RADICAL_DECK_NAME = RADICAL_MODEL_NAME;
export const KANJI_DECK_NAME = KANJI_MODEL_NAME;
export const VOCABULARY_DECK_NAME = VOCABULARY_MODEL_NAME;

export const RADICAL_EXPECTED_FIELDS = [
  "character",
  "primary_name",
  "extra_names",
  "user_synonyms",
  "mnemonic_text",
  "mnemonic_image",
  "note",
];

export const KANJI_EXPECTED_FIELDS = [
  "character",
  "radicals",
  "primary_meaning",
  "primary_reading",
  "extra_meanings",
  "meaning_mnemonic",
  "meaning_hint",
  "meaning_note",
  "readings_onyomi",
  "readings_kunyomi",
  "readings_nanori",
  "reading_mnemonic",
  "reading_hint",
  "reading_note",
];

export const VOCABULARY_EXPECTED_FIELDS = [
  "characters",
  "kanji_composition",
  "primary_meaning",
  "extra_meanings",
  "user_synonyms",
  "word_type",
  "conjugations",
  "masu_form",
  "meaning_explanation",
  "meaning_note",
  "reading",
  "reading_audio_female",
  "reading_audio_male",
  "reading_explanation",
  "reading_note",
  "sentence_jap",
  "sentence_jap_furigana",
  "sentence_jap_audio",
  "sentence_eng",
  "sentence_eng_audio",
];
