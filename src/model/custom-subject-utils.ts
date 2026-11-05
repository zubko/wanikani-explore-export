import { CUSTOM_SUBJECT_ID_FLOOR } from "./wanikani.ts";
import type { CustomSubject, CustomSubjectInput } from "./wanikani.ts";
import { isVisibleSubject } from "./subject-utils.ts";
import { ValidationError } from "./validation-error.ts";

export type WaniKaniClash = { customId: number; wanikaniId: number; characters: string };

export type WordForClash = {
  id: number;
  data: { characters: string | null; hidden_at: string | null };
};

const VERB_PARTS_OF_SPEECH = ["ichidan verb", "godan verb"];
const COMMON_INPUT_FIELDS = [
  "characters",
  "meanings",
  "auxiliary_meanings",
  "parts_of_speech",
  "meaning_mnemonic",
  "context_sentences",
  "conjugations",
];
const VOCABULARY_ONLY_INPUT_FIELDS = ["readings", "reading_mnemonic", "component_subject_ids"];
const RECORD_FIELDS = ["id", "object", "url", "data_updated_at", "data"];
const CONJUGATION_FIELDS = ["dictionary", "masu", "te", "nai"];
// `characters` becomes `slug`, and `slug` is part of the media file names
const CHARACTERS_PATTERN = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]+$/u;
// 々 is in the Han script too, but it only repeats the kanji before it
const KANJI_PATTERN = /(?!々)\p{Script=Han}/u;
// Azure TTS reads the reading of a custom word, so a kanji or romaji reading gives a wrong clip
const KANA_PATTERN = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;

export function isCustomSubjectId(id: number): boolean {
  return Number.isInteger(id) && id >= CUSTOM_SUBJECT_ID_FLOOR;
}

/** WaniKani has no tag for an irregular verb, so only these two need conjugations. */
export function needsConjugations(partsOfSpeech: string[]): boolean {
  return partsOfSpeech.some((part) => VERB_PARTS_OF_SPEECH.includes(part));
}

/**
 * Throws a `ValidationError` on the first bad value of the body an agent sends. `kanjiIds` holds
 * the visible WaniKani kanji ids, `null` skips that rule.
 */
export function validateCustomSubjectInput(params: {
  input: unknown;
  kanjiIds: ReadonlySet<number> | null;
}): void {
  const { input, kanjiIds } = params;
  const root = requireObject(input, "the body");
  requireKnownKeys({ value: root, path: "", allowed: ["object", "data"] });

  const object = root.object;
  if (object !== "vocabulary" && object !== "kana_vocabulary") {
    throw new ValidationError("object must be vocabulary or kana_vocabulary");
  }
  const data = requireObject(root.data, "data");

  for (const key of Object.keys(data)) {
    if (VOCABULARY_ONLY_INPUT_FIELDS.includes(key)) {
      if (object === "kana_vocabulary") {
        throw new ValidationError(`data.${key} is not allowed on a kana_vocabulary`);
      }
    } else if (!COMMON_INPUT_FIELDS.includes(key)) {
      throw new ValidationError(`data.${key} is not a known field`);
    }
  }

  const characters = requireString(data.characters, "data.characters");
  if (!CHARACTERS_PATTERN.test(characters)) {
    throw new ValidationError("data.characters must hold only kana, kanji, ー and 々");
  }
  validatePrimaryList({ value: data.meanings, field: "meaning" });
  validateAuxiliaryMeanings(data.auxiliary_meanings);
  const partsOfSpeech = requireArray({
    value: data.parts_of_speech,
    path: "data.parts_of_speech",
    nonEmpty: true,
  });
  partsOfSpeech.forEach((part, index) => requireString(part, `data.parts_of_speech[${index}]`));
  requireString(data.meaning_mnemonic, "data.meaning_mnemonic");
  validateContextSentences(data.context_sentences);

  if (object === "vocabulary") {
    validatePrimaryList({ value: data.readings, field: "reading" });
    requireString(data.reading_mnemonic, "data.reading_mnemonic");
    validateKanjiIds({ value: data.component_subject_ids, kanjiIds });
    if (!KANJI_PATTERN.test(characters)) {
      throw new ValidationError("data.characters must hold at least one kanji");
    }
  } else if (KANJI_PATTERN.test(characters)) {
    throw new ValidationError("data.characters must hold no kanji on a kana_vocabulary");
  }

  if (data.conjugations !== undefined) {
    validateConjugations(data.conjugations);
  } else if (needsConjugations(partsOfSpeech as string[])) {
    throw new ValidationError("data.conjugations is required for an ichidan or godan verb");
  }
}

/** Throws a `ValidationError` when one stored record has a wrong shape. */
export function validateCustomSubjectRecord(record: unknown): void {
  const root = requireObject(record, "the record");
  requireKnownKeys({ value: root, path: "", allowed: RECORD_FIELDS });

  if (typeof root.id !== "number" || !isCustomSubjectId(root.id)) {
    throw new ValidationError(`id must be an integer at or above ${CUSTOM_SUBJECT_ID_FLOOR}`);
  }
  if (root.url !== null) throw new ValidationError("url must be null");
  requireString(root.data_updated_at, "data_updated_at");

  const data = requireObject(root.data, "data");
  const {
    slug,
    level,
    hidden_at,
    document_url,
    created_at,
    pronunciation_audios,
    lesson_position,
    spaced_repetition_system_id,
    ...rest
  } = data;
  requireString(created_at, "data.created_at");
  if (level !== 0) throw new ValidationError("data.level must be 0");
  if (slug !== data.characters) throw new ValidationError("data.slug must equal data.characters");
  if (hidden_at !== null && typeof hidden_at !== "string") {
    throw new ValidationError("data.hidden_at must be null or a string");
  }
  if (document_url !== null) throw new ValidationError("data.document_url must be null");
  if (!Array.isArray(pronunciation_audios) || pronunciation_audios.length > 0) {
    throw new ValidationError("data.pronunciation_audios must be an empty array");
  }
  if (lesson_position !== 0) throw new ValidationError("data.lesson_position must be 0");
  if (spaced_repetition_system_id !== 0) {
    throw new ValidationError("data.spaced_repetition_system_id must be 0");
  }

  // The kanji ids are not checked: a kanji that WaniKani hides later must not fail the start
  validateCustomSubjectInput({ input: { object: root.object, data: rest }, kanjiIds: null });
}

/** Throws a `ValidationError` when the whole custom subjects file has a wrong shape. */
export function validateCustomSubjects(records: unknown): void {
  if (!Array.isArray(records)) throw new ValidationError("the root must be an array");

  records.forEach((record, index) => {
    try {
      validateCustomSubjectRecord(record);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      const id = isRecord(record) && typeof record.id === "number" ? record.id : `[${index}]`;
      throw new ValidationError(`record ${id}: ${error.message}`);
    }
  });

  const subjects = records as CustomSubject[];
  const seenIds = new Set<number>();
  const visibleIdByCharacters = new Map<string, number>();
  for (const subject of subjects) {
    if (seenIds.has(subject.id)) {
      throw new ValidationError(`record ${subject.id}: the id is used twice`);
    }
    seenIds.add(subject.id);

    if (!isVisibleSubject(subject)) continue;
    const characters = subject.data.characters ?? "";
    const otherId = visibleIdByCharacters.get(characters);
    if (otherId !== undefined) {
      throw new ValidationError(
        `record ${subject.id}: characters ${characters} are used by record ${otherId} too`
      );
    }
    visibleIdByCharacters.set(characters, subject.id);
  }
}

/** The visible custom words that have the same characters as a visible WaniKani word. */
export function findWaniKaniClash(params: {
  customSubjects: CustomSubject[];
  wanikaniWords: WordForClash[];
}): WaniKaniClash[] {
  const wanikaniIdByCharacters = new Map<string, number>();
  for (const word of params.wanikaniWords) {
    if (isVisibleSubject(word) && word.data.characters !== null) {
      wanikaniIdByCharacters.set(word.data.characters, word.id);
    }
  }

  const clashes: WaniKaniClash[] = [];
  for (const subject of params.customSubjects.filter(isVisibleSubject)) {
    const characters = subject.data.characters ?? "";
    const wanikaniId = wanikaniIdByCharacters.get(characters);
    if (wanikaniId !== undefined) clashes.push({ customId: subject.id, wanikaniId, characters });
  }
  return clashes;
}

/** The record with this id, hidden ones included, or null. */
export function findCustomSubject(
  customSubjects: CustomSubject[],
  id: number
): CustomSubject | null {
  return customSubjects.find((subject) => subject.id === id) ?? null;
}

/** A delete keeps its record, so the hidden records count too and an id is never given twice. */
export function nextCustomSubjectId(records: CustomSubject[]): number {
  if (records.length === 0) return CUSTOM_SUBJECT_ID_FLOOR;
  return Math.max(...records.map((record) => record.id)) + 1;
}

/** `createdAt` is the time of the first save, an update keeps it. */
export function buildCustomRecord(params: {
  id: number;
  input: CustomSubjectInput;
  now: string;
  createdAt?: string;
}): CustomSubject {
  const { id, input, now, createdAt = now } = params;
  const fixedFields = {
    created_at: createdAt,
    level: 0,
    slug: input.data.characters,
    hidden_at: null,
    document_url: null,
    pronunciation_audios: [],
    lesson_position: 0,
    spaced_repetition_system_id: 0,
  };
  const wrapper = { id, url: null, data_updated_at: now };
  if (input.object === "vocabulary") {
    return { ...wrapper, object: "vocabulary", data: { ...fixedFields, ...input.data } };
  }
  return { ...wrapper, object: "kana_vocabulary", data: { ...fixedFields, ...input.data } };
}

/** The visible custom `vocabulary` ids by the kanji they use, in file order. */
export function buildCustomWordsByKanji(records: CustomSubject[]): Map<number, number[]> {
  const wordsByKanji = new Map<number, number[]>();
  for (const record of records) {
    if (record.object !== "vocabulary" || !isVisibleSubject(record)) continue;
    for (const kanjiId of record.data.component_subject_ids) {
      wordsByKanji.set(kanjiId, [...(wordsByKanji.get(kanjiId) ?? []), record.id]);
    }
  }
  return wordsByKanji;
}

function validatePrimaryList(params: { value: unknown; field: "meaning" | "reading" }): void {
  const { value, field } = params;
  const listPath = `data.${field}s`;
  const items = requireArray({ value, path: listPath, nonEmpty: true });
  items.forEach((item, index) => {
    const path = `${listPath}[${index}]`;
    const entry = requireObject(item, path);
    requireKnownKeys({ value: entry, path, allowed: [field, "primary", "accepted_answer"] });
    const text = requireString(entry[field], `${path}.${field}`);
    if (field === "reading" && !KANA_PATTERN.test(text)) {
      throw new ValidationError(`${path}.reading must hold only kana`);
    }
    requireBoolean(entry.primary, `${path}.primary`);
    requireBoolean(entry.accepted_answer, `${path}.accepted_answer`);
  });
  requireOnePrimary(items as { primary: boolean }[], listPath);
}

function validateAuxiliaryMeanings(value: unknown): void {
  const meanings = requireArray({ value, path: "data.auxiliary_meanings", nonEmpty: false });
  meanings.forEach((item, index) => {
    const path = `data.auxiliary_meanings[${index}]`;
    const meaning = requireObject(item, path);
    requireKnownKeys({ value: meaning, path, allowed: ["meaning", "type"] });
    requireString(meaning.meaning, `${path}.meaning`);
    if (meaning.type !== "whitelist" && meaning.type !== "blacklist") {
      throw new ValidationError(`${path}.type must be whitelist or blacklist`);
    }
  });
}

function validateContextSentences(value: unknown): void {
  const sentences = requireArray({ value, path: "data.context_sentences", nonEmpty: false });
  sentences.forEach((item, index) => {
    const path = `data.context_sentences[${index}]`;
    const sentence = requireObject(item, path);
    requireKnownKeys({ value: sentence, path, allowed: ["en", "ja", "reading"] });
    requireString(sentence.en, `${path}.en`);
    requireString(sentence.ja, `${path}.ja`);
    requireString(sentence.reading, `${path}.reading`);
  });
}

function validateKanjiIds(params: { value: unknown; kanjiIds: ReadonlySet<number> | null }): void {
  const path = "data.component_subject_ids";
  const ids = requireArray({ value: params.value, path, nonEmpty: true });
  ids.forEach((id, index) => {
    if (typeof id !== "number" || !Number.isInteger(id)) {
      throw new ValidationError(`${path}[${index}] must be an integer`);
    }
    if (ids.indexOf(id) !== index) {
      throw new ValidationError(`${path}[${index}] ${id} is listed twice`);
    }
    if (params.kanjiIds && !params.kanjiIds.has(id)) {
      throw new ValidationError(`${path}[${index}] ${id} is not a visible WaniKani kanji`);
    }
  });
}

function validateConjugations(value: unknown): void {
  const conjugations = requireObject(value, "data.conjugations");
  requireKnownKeys({ value: conjugations, path: "data.conjugations", allowed: CONJUGATION_FIELDS });
  for (const field of CONJUGATION_FIELDS) {
    requireString(conjugations[field], `data.conjugations.${field}`);
  }
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ValidationError(`${path} must be an object`);
  return value;
}

function requireArray(params: { value: unknown; path: string; nonEmpty: boolean }): unknown[] {
  const { value, path, nonEmpty } = params;
  if (!Array.isArray(value)) throw new ValidationError(`${path} must be an array`);
  if (nonEmpty && value.length === 0) throw new ValidationError(`${path} must not be empty`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${path} must be a non-empty string`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): void {
  if (typeof value !== "boolean") throw new ValidationError(`${path} must be a boolean`);
}

function requireOnePrimary(items: { primary: boolean }[], path: string): void {
  const primaryCount = items.filter((item) => item.primary).length;
  if (primaryCount !== 1) {
    throw new ValidationError(`${path} must have exactly one primary, it has ${primaryCount}`);
  }
}

function requireKnownKeys(params: {
  value: Record<string, unknown>;
  path: string;
  allowed: readonly string[];
}): void {
  const unknown = Object.keys(params.value).find((key) => !params.allowed.includes(key));
  if (unknown !== undefined) {
    const fullPath = params.path === "" ? unknown : `${params.path}.${unknown}`;
    throw new ValidationError(`${fullPath} is not a known field`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
