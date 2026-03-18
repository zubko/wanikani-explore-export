export const SUBJECT_TYPES = ["radical", "kanji", "vocabulary", "kana_vocabulary"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export function isSubjectType(value: string): value is SubjectType {
  return SUBJECT_TYPES.includes(value as SubjectType);
}

export type Meaning = {
  meaning: string;
  primary: boolean;
  accepted_answer: boolean;
};

export type AuxiliaryMeaning = {
  meaning: string;
  type: "whitelist" | "blacklist";
};

export type CharacterImageMetadata = {
  inline_styles?: boolean;
  color?: string;
  dimensions?: string;
  style_name?: string;
};

export type CharacterImage = {
  url: string;
  metadata: CharacterImageMetadata;
  content_type: "image/svg+xml" | "image/png";
};

export type KanjiReading = {
  reading: string;
  primary: boolean;
  accepted_answer: boolean;
  type: "onyomi" | "kunyomi" | "nanori";
};

export type VocabularyReading = {
  reading: string;
  primary: boolean;
  accepted_answer: boolean;
};

export type ContextSentence = {
  en: string;
  ja: string;
  reading?: string;
};

export type PronunciationAudioMetadata = {
  gender: "male" | "female";
  source_id: number;
  pronunciation: string;
  voice_actor_id: number;
  voice_actor_name: string;
  voice_description: string;
};

export type PronunciationAudio = {
  url: string;
  metadata: PronunciationAudioMetadata;
  content_type: "audio/webm" | "audio/mpeg" | "audio/ogg";
};

export type StudyMaterialData = {
  created_at: string;
  subject_id: number;
  subject_type: "radical" | "kanji" | "vocabulary";
  meaning_note: string;
  reading_note: string;
  meaning_synonyms: string[];
  hidden: boolean;
};

export type StudyMaterial = {
  id: number;
  object: "study_material";
  url: string;
  data_updated_at: string;
  data: StudyMaterialData;
};

export type VerbConjugations = {
  type: "verb";
  dictionary: string;
  masu: string;
  te: string;
  nai: string;
};

export type Conjugations = VerbConjugations;

export type SubjectReference = {
  id: number;
  characters: string;
  reading: string;
  meaning: string;
};

// JSON file types (with nested .data property as from Wanikani API)

type BaseSubjectDataFields = {
  created_at: string;
  level: number;
  slug: string;
  hidden_at: string | null;
  document_url: string;
  characters: string | null;
  meanings: Meaning[];
  auxiliary_meanings: AuxiliaryMeaning[];
  meaning_mnemonic: string;
  lesson_position: number;
  spaced_repetition_system_id: number;
};

type RadicalDataFields = BaseSubjectDataFields & {
  character_images: CharacterImage[];
  amalgamation_subject_ids: number[];
};

type KanjiDataFields = BaseSubjectDataFields & {
  readings: KanjiReading[];
  component_subject_ids: number[];
  amalgamation_subject_ids: number[];
  visually_similar_subject_ids: number[];
  meaning_hint: string;
  reading_mnemonic: string;
  reading_hint: string;
};

type VocabularyDataFields = BaseSubjectDataFields & {
  readings: VocabularyReading[];
  parts_of_speech: string[];
  component_subject_ids: number[];
  context_sentences: ContextSentence[];
  pronunciation_audios: PronunciationAudio[];
  reading_mnemonic: string;
};

type KanaVocabularyDataFields = BaseSubjectDataFields & {
  parts_of_speech: string[];
  context_sentences: ContextSentence[];
  pronunciation_audios: PronunciationAudio[];
};

type BaseSubjectWrapper<T extends SubjectType, D> = {
  id: number;
  object: T;
  url: string;
  data_updated_at: string;
  data: D;
};

export type RadicalData = BaseSubjectWrapper<"radical", RadicalDataFields>;
export type KanjiData = BaseSubjectWrapper<"kanji", KanjiDataFields>;
export type VocabularyData = BaseSubjectWrapper<"vocabulary", VocabularyDataFields>;
export type KanaVocabularyData = BaseSubjectWrapper<"kana_vocabulary", KanaVocabularyDataFields>;

export type SubjectData = RadicalData | KanjiData | VocabularyData | KanaVocabularyData;

// Enriched types (flat, no nested .data property)

export type Radical = {
  object: "radical";
  id: number;
  characters: string | null;
  characterImages: CharacterImage[];
  slug: string;
  level: number;
  documentUrl: string;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  meaningMnemonic: string;
  amalgamationSubjectIds: number[];
  studyMaterial: StudyMaterial | null;
  mnemonicImageUrl: string | null;
  foundInKanji: SubjectReference[];
};

export type Kanji = {
  object: "kanji";
  id: number;
  characters: string;
  slug: string;
  level: number;
  documentUrl: string;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  meaningMnemonic: string;
  meaningHint: string;
  readings: KanjiReading[];
  readingMnemonic: string;
  readingHint: string;
  componentSubjectIds: number[];
  amalgamationSubjectIds: number[];
  visuallySimilarSubjectIds: number[];
  studyMaterial: StudyMaterial | null;
  componentRadicals: Radical[];
  visuallySimilarKanji: SubjectReference[];
  foundInVocabulary: SubjectReference[];
};

export type Vocabulary = {
  object: "vocabulary";
  id: number;
  characters: string;
  slug: string;
  level: number;
  documentUrl: string;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  meaningMnemonic: string;
  readings: VocabularyReading[];
  readingMnemonic: string;
  partsOfSpeech: string[];
  componentSubjectIds: number[];
  contextSentences: ContextSentence[];
  pronunciationAudios: PronunciationAudio[];
  studyMaterial: StudyMaterial | null;
  componentKanji: Kanji[];
  conjugations: Conjugations | null;
};

export type KanaVocabulary = {
  object: "kana_vocabulary";
  id: number;
  characters: string;
  slug: string;
  level: number;
  documentUrl: string;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  meaningMnemonic: string;
  partsOfSpeech: string[];
  contextSentences: ContextSentence[];
  pronunciationAudios: PronunciationAudio[];
  studyMaterial: null;
};

export type Subject = Radical | Kanji | Vocabulary | KanaVocabulary;

export type AnkiAddResult = {
  subject: { name: string; characters: string | null; created: boolean };
  kanji: Array<{ character: string; created: boolean }>;
  radicals: Array<{ name: string; created: boolean }>;
};

export type AnkiNoteItem = {
  characters: string;
  meaning: string;
  wkId: number | null;
  wkType: SubjectType | null;
};
