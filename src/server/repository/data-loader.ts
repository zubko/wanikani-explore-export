import type {
  RadicalData,
  KanjiData,
  VocabularyData,
  KanaVocabularyData,
  StudyMaterial,
  LocalStudyMaterial,
  SubjectType,
  VerbConjugations,
  CustomSubject,
} from "@/model/wanikani.ts";
import { LOCAL_STUDY_MATERIAL_FIELDS } from "@/model/wanikani.ts";
import {
  isVisibleSubject,
  validateLocalStudyMaterialValue,
  validateReadingNote,
} from "@/model/subject-utils.ts";
import {
  buildCustomWordsByKanji,
  findCustomSubject,
  findWaniKaniClash,
  isCustomSubjectId,
  validateCustomSubjects,
} from "@/model/custom-subject-utils.ts";
import { ValidationError } from "@/model/validation-error.ts";
import { readFile } from "fs/promises";
import { CUSTOM_SUBJECTS_PATH, LOCAL_STUDY_MATERIALS_PATH } from "./data-paths.ts";
import { loadMnemonicImageRegistry } from "./mnemonic-image-fetcher.ts";
import { isMissingFile } from "@server/utils/file-utils.ts";
import { readJson, saveJsonIfMissing } from "@server/utils/json-utils.ts";
import { createReloadingFile } from "@server/utils/reloading-file.ts";

type RawVerbConjugations = Omit<VerbConjugations, "type">;

export type SentenceReadingEntry = { ja: string; reading: string };

type CustomSubjects = { records: CustomSubject[]; wordsByKanji: Map<number, number[]> };

export let radicals: RadicalData[];
export let kanji: KanjiData[];
export let vocabulary: VocabularyData[];
export let kanaVocabulary: KanaVocabularyData[];
export let studyMaterials: StudyMaterial[];
export let verbConjugations: Record<string, RawVerbConjugations>;
export let sentenceReadings: Record<string, SentenceReadingEntry>;

// The other server writes these two files too, and a git pull brings its changes while this
// server runs
const customSubjectsFile = createReloadingFile<CustomSubjects>({
  path: CUSTOM_SUBJECTS_PATH,
  parse: (content) => {
    const records = parseCustomSubjectsFile(content);
    warnAboutCustomSubjects(records);
    return { records, wordsByKanji: buildCustomWordsByKanji(records) };
  },
});

const localStudyMaterialsFile = createReloadingFile({
  path: LOCAL_STUDY_MATERIALS_PATH,
  parse: async (content) => {
    const records = parseLocalStudyMaterialsFile(content);
    // The subject arrays are read once at start, and the other machine may hold a newer download
    checkLocalStudyMaterialSubjects({
      records,
      unknownSubject: "skip",
      customSubjects: await getCustomSubjects(),
    });
    return records;
  },
});

export async function initRepository(): Promise<void> {
  [
    radicals,
    kanji,
    vocabulary,
    kanaVocabulary,
    studyMaterials,
    verbConjugations,
    sentenceReadings,
  ] = await Promise.all([
    readJson<RadicalData[]>("./data/userdata/radicals.json"),
    readJson<KanjiData[]>("./data/userdata/kanji.json"),
    readJson<VocabularyData[]>("./data/userdata/vocabulary.json"),
    readJson<KanaVocabularyData[]>("./data/userdata/kana_vocabulary.json"),
    readJson<StudyMaterial[]>("./data/userdata/study_materials.json"),
    readJson<Record<string, RawVerbConjugations>>("./data/verb_conjugations.json"),
    readJson<Record<string, SentenceReadingEntry>>("./data/sentence_readings.json"),
  ]);
  checkWaniKaniIdsBelowCustomFloor();
  await ensureCustomSubjectsFile();
  // Read once here, so a bad file fails the start
  const customSubjects = await getCustomSubjects();
  await ensureLocalStudyMaterialsFile();
  // Read once here, so a bad file or a record of an unknown subject fails the start
  checkLocalStudyMaterialSubjects({
    records: await readLocalStudyMaterials(),
    unknownSubject: "fail",
    customSubjects,
  });
  await loadMnemonicImageRegistry();
}

export function getLocalStudyMaterials(): Promise<Record<string, LocalStudyMaterial>> {
  return localStudyMaterialsFile.get();
}

/** Every record of the custom subjects file, hidden ones included. */
export async function getCustomSubjects(): Promise<CustomSubject[]> {
  return (await customSubjectsFile.get()).records;
}

/** The visible custom `vocabulary` ids by the kanji they use. */
export async function getCustomWordsByKanji(): Promise<Map<number, number[]>> {
  return (await customSubjectsFile.get()).wordsByKanji;
}

/** The WaniKani and the custom `vocabulary` records, hidden ones included. */
export async function getVocabularyData(): Promise<VocabularyData[]> {
  const customWords = (await getCustomSubjects()).filter(
    (record): record is VocabularyData => record.object === "vocabulary"
  );
  return [...vocabulary, ...customWords];
}

/** The WaniKani and the custom `kana_vocabulary` records, hidden ones included. */
export async function getKanaVocabularyData(): Promise<KanaVocabularyData[]> {
  const customWords = (await getCustomSubjects()).filter(
    (record): record is KanaVocabularyData => record.object === "kana_vocabulary"
  );
  return [...kanaVocabulary, ...customWords];
}

export function findSubjectTypeById(id: number): SubjectType | null {
  if (radicals.some((item) => item.id === id)) return "radical";
  if (kanji.some((item) => item.id === id)) return "kanji";
  if (vocabulary.some((item) => item.id === id)) return "vocabulary";
  if (kanaVocabulary.some((item) => item.id === id)) return "kana_vocabulary";
  return null;
}

/**
 * The rules that need the subject arrays, so they are not part of `readLocalStudyMaterials`. That
 * one runs on every save, where a pulled record of another subject must not fail the write.
 * A record of a subject the arrays do not know is kept with `"skip"`: nothing looks it up, and a
 * restart that loads the newer subjects finds it. A custom id is looked up in `customSubjects`,
 * hidden records included, like a hidden WaniKani id passes.
 */
export function checkLocalStudyMaterialSubjects(params: {
  records: Record<string, LocalStudyMaterial>;
  unknownSubject: "fail" | "skip";
  customSubjects: CustomSubject[];
}): void {
  const { records, unknownSubject, customSubjects } = params;
  for (const [subjectId, record] of Object.entries(records)) {
    const id = subjectIdOfKey(subjectId);
    if (id === null) throw invalidStudyMaterials(`key ${subjectId} is not a subject id`);

    const isCustom = isCustomSubjectId(id);
    const type = isCustom
      ? (findCustomSubject(customSubjects, id)?.object ?? null)
      : findSubjectTypeById(id);
    if (!type) {
      const source = isCustom ? "custom" : "WaniKani";
      if (unknownSubject === "fail") {
        throw invalidStudyMaterials(`subject ${subjectId} is not a ${source} subject`);
      }
      const problem = isCustom
        ? `is not in ${CUSTOM_SUBJECTS_PATH}`
        : "is not in the WaniKani data loaded at start. A restart loads the newer data.";
      console.warn(`[Repository] ${LOCAL_STUDY_MATERIALS_PATH}: subject ${subjectId} ${problem}`);
      continue;
    }

    if ("reading_note" in record) {
      validateField({
        subjectId,
        field: "reading_note",
        validate: () => validateReadingNote(type),
      });
    }
  }
}

/** No script creates this file, so a fresh checkout starts without it. */
export async function ensureLocalStudyMaterialsFile(): Promise<void> {
  // An exclusive create, because a git pull can bring the file at any moment
  if (await saveJsonIfMissing(LOCAL_STUDY_MATERIALS_PATH, {})) {
    console.log(`[Repository] ${LOCAL_STUDY_MATERIALS_PATH} was missing — created it`);
  }
}

export async function readLocalStudyMaterials(): Promise<Record<string, LocalStudyMaterial>> {
  return parseLocalStudyMaterialsFile(await readFileOrNull(LOCAL_STUDY_MATERIALS_PATH));
}

/** No script creates this file, so a fresh checkout starts without it. */
export async function ensureCustomSubjectsFile(): Promise<void> {
  // An exclusive create, because a git pull can bring the file at any moment
  if (await saveJsonIfMissing(CUSTOM_SUBJECTS_PATH, [])) {
    console.log(`[Repository] ${CUSTOM_SUBJECTS_PATH} was missing — created it`);
  }
}

/** A fresh read with the file checks, no kanji check. The write module starts every save with it. */
export async function readCustomSubjects(): Promise<CustomSubject[]> {
  return parseCustomSubjectsFile(await readFileOrNull(CUSTOM_SUBJECTS_PATH));
}

function checkWaniKaniIdsBelowCustomFloor(): void {
  for (const subjects of [radicals, kanji, vocabulary, kanaVocabulary]) {
    const subject = subjects.find((item) => isCustomSubjectId(item.id));
    if (subject) throw new Error(`WaniKani id ${subject.id} reached CUSTOM_SUBJECT_ID_FLOOR`);
  }
}

function parseCustomSubjectsFile(content: string | null): CustomSubject[] {
  const parsed = parseJsonFile(CUSTOM_SUBJECTS_PATH, content);
  try {
    validateCustomSubjects(parsed);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw invalidFile(CUSTOM_SUBJECTS_PATH, error.message);
  }
  return parsed as CustomSubject[];
}

// A broken kanji id or a clash must not stop the server, the enrich step drops a hidden or unknown
// kanji id
function warnAboutCustomSubjects(records: CustomSubject[]): void {
  const visibleKanjiIds = new Set(kanji.filter(isVisibleSubject).map((item) => item.id));
  for (const record of records) {
    if (record.object !== "vocabulary" || !isVisibleSubject(record)) continue;
    const unknownIds = record.data.component_subject_ids.filter((id) => !visibleKanjiIds.has(id));
    if (unknownIds.length > 0) {
      console.warn(
        `[Repository] ${CUSTOM_SUBJECTS_PATH}: custom subject ${record.id} uses ${unknownIds.join(", ")}, which is no visible WaniKani kanji`
      );
    }
  }

  const clashes = findWaniKaniClash({
    customSubjects: records,
    wanikaniWords: [...vocabulary, ...kanaVocabulary],
  });
  for (const { customId, wanikaniId, characters } of clashes) {
    console.warn(
      `[Repository] ${CUSTOM_SUBJECTS_PATH}: custom subject ${customId} "${characters}" has the same characters as WaniKani ${wanikaniId}`
    );
  }
}

function parseLocalStudyMaterialsFile(content: string | null): Record<string, LocalStudyMaterial> {
  return parseLocalStudyMaterials(parseJsonFile(LOCAL_STUDY_MATERIALS_PATH, content));
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch (error) {
    if (!isMissingFile(error)) throw cannotReadError(path, error);
    return null;
  }
}

// Both files exist from the start, and a git pull never deletes them. So a missing file was
// deleted by hand, and a new file would drop every record.
function parseJsonFile(path: string, content: string | null): unknown {
  if (content === null) throw new Error(`${path} is missing`);
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw cannotReadError(path, error);
  }
}

// The file also comes from the other server through git, so a wrong shape must fail loudly and
// never reach the browser
function parseLocalStudyMaterials(value: unknown): Record<string, LocalStudyMaterial> {
  if (!isRecord(value)) throw invalidStudyMaterials("the root must be a JSON object");

  const knownFields: readonly string[] = LOCAL_STUDY_MATERIAL_FIELDS;
  for (const [subjectId, record] of Object.entries(value)) {
    if (!isRecord(record))
      throw invalidStudyMaterials(`subject ${subjectId} must be a JSON object`);

    const fields = Object.entries(record);
    // the app deletes an entry that has no field left, so an empty one would sit there unused
    if (fields.length === 0) throw invalidStudyMaterials(`subject ${subjectId} has no field`);

    for (const [field, fieldValue] of fields) {
      if (!knownFields.includes(field)) {
        throw invalidStudyMaterials(`subject ${subjectId} field ${field} is not a known field`);
      }
      validateField({
        subjectId,
        field,
        validate: () => validateLocalStudyMaterialValue(field, fieldValue),
      });
    }
  }
  return value as Record<string, LocalStudyMaterial>;
}

function validateField(params: { subjectId: string; field: string; validate: () => void }): void {
  try {
    params.validate();
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw invalidStudyMaterials(
      `subject ${params.subjectId} field ${params.field} ${error.message}`
    );
  }
}

/**
 * The id of a record key, or null when the key is not the plain number. Every lookup uses
 * `String(id)`, so a record under `"01"` or `" 1"` would never be found again.
 */
function subjectIdOfKey(key: string): number | null {
  const id = Number(key);
  if (!Number.isInteger(id) || id <= 0) return null;
  return String(id) === key ? id : null;
}

function cannotReadError(path: string, error: unknown): Error {
  return new Error(`Cannot read ${path}. ${String(error)}`);
}

function invalidStudyMaterials(problem: string): Error {
  return invalidFile(LOCAL_STUDY_MATERIALS_PATH, problem);
}

function invalidFile(path: string, problem: string): Error {
  return new Error(`Invalid ${path}: ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
