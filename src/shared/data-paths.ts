// Must stay free of imports, so it can load before `fs/promises` is mocked

export const USERDATA_DIR = "./data/userdata";
export const RADICALS_PATH = "./data/userdata/radicals.json";
export const KANJI_PATH = "./data/userdata/kanji.json";
export const VOCABULARY_PATH = "./data/userdata/vocabulary.json";
export const KANA_VOCABULARY_PATH = "./data/userdata/kana_vocabulary.json";
export const SUBJECT_FILE_PATHS = {
  radical: RADICALS_PATH,
  kanji: KANJI_PATH,
  vocabulary: VOCABULARY_PATH,
  kana_vocabulary: KANA_VOCABULARY_PATH,
} as const;
export const STUDY_MATERIALS_PATH = "./data/userdata/study_materials.json";
export const LOCAL_STUDY_MATERIALS_PATH = "./data/userdata/study_materials_extra.json";
export const MNEMONIC_IMAGES_PATH = "./data/userdata/mnemonic-images.jsonl";
export const MEDIA_ROOT_PATH = "./data/userdata/media";
export const CUSTOM_SUBJECTS_PATH = "./data/userdata/custom_subjects.json";
export const IKNOW_DIR = "./data/userdata/iknow";
export const IKNOW_STATUS_PATH = "./data/userdata/iknow-vocabulary-status.json";
export const VERB_CONJUGATIONS_PATH = "./data/verb_conjugations.json";
export const SENTENCE_READINGS_PATH = "./data/sentence_readings.json";
export const WANIKANI_FIXES_PATH = "./data/wanikani-fixes.yaml";
