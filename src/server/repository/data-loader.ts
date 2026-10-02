import type {
  RadicalData,
  KanjiData,
  VocabularyData,
  KanaVocabularyData,
  StudyMaterial,
  LocalStudyMaterial,
  SubjectType,
  VerbConjugations,
} from "@/model/wanikani.ts";
import { LOCAL_STUDY_MATERIAL_FIELDS } from "@/model/wanikani.ts";
import { localStudyMaterialValueProblem, readingNoteProblem } from "@/model/subject-utils.ts";
import { readFile } from "fs/promises";
import { LOCAL_STUDY_MATERIALS_PATH } from "./data-paths.ts";
import { loadMnemonicImageRegistry } from "./mnemonic-image-fetcher.ts";
import { isMissingFile } from "@server/utils/file-utils.ts";
import { readJson, saveJsonIfMissing } from "@server/utils/json-utils.ts";
import { createReloadingFile } from "@server/utils/reloading-file.ts";

type RawVerbConjugations = Omit<VerbConjugations, "type">;

export type SentenceReadingEntry = { ja: string; reading: string };

export let radicals: RadicalData[];
export let kanji: KanjiData[];
export let vocabulary: VocabularyData[];
export let kanaVocabulary: KanaVocabularyData[];
export let studyMaterials: StudyMaterial[];
export let verbConjugations: Record<string, RawVerbConjugations>;
export let sentenceReadings: Record<string, SentenceReadingEntry>;

// The other server writes this file too, and a git pull brings its changes while this server runs
const localStudyMaterialsFile = createReloadingFile({
  path: LOCAL_STUDY_MATERIALS_PATH,
  parse: (content) => {
    const records = parseLocalStudyMaterialsFile(content);
    // The subject arrays are read once at start, and the other machine may hold a newer download
    checkLocalStudyMaterialSubjects({ records, unknownSubject: "skip" });
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
  await ensureLocalStudyMaterialsFile();
  // Read once here, so a bad file or a record of an unknown subject fails the start
  checkLocalStudyMaterialSubjects({
    records: await readLocalStudyMaterials(),
    unknownSubject: "fail",
  });
  await loadMnemonicImageRegistry();
}

export function getLocalStudyMaterials(): Promise<Record<string, LocalStudyMaterial>> {
  return localStudyMaterialsFile.get();
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
 * restart that loads the newer subjects finds it.
 */
export function checkLocalStudyMaterialSubjects(params: {
  records: Record<string, LocalStudyMaterial>;
  unknownSubject: "fail" | "skip";
}): void {
  const { records, unknownSubject } = params;
  for (const [subjectId, record] of Object.entries(records)) {
    const id = subjectIdOfKey(subjectId);
    if (id === null) throw invalidFile(`key ${subjectId} is not a subject id`);

    const type = findSubjectTypeById(id);
    if (!type) {
      if (unknownSubject === "fail") {
        throw invalidFile(`subject ${subjectId} is not a WaniKani subject`);
      }
      console.warn(
        `[Repository] ${LOCAL_STUDY_MATERIALS_PATH}: subject ${subjectId} is not in the WaniKani data loaded at start. A restart loads the newer data.`
      );
      continue;
    }

    const problem = "reading_note" in record ? readingNoteProblem(type) : null;
    if (problem) throw invalidFile(`subject ${subjectId} field reading_note ${problem}`);
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
  let content: string | null;
  try {
    content = await readFile(LOCAL_STUDY_MATERIALS_PATH, "utf-8");
  } catch (error) {
    if (!isMissingFile(error)) throw cannotReadError(error);
    content = null;
  }
  return parseLocalStudyMaterialsFile(content);
}

function parseLocalStudyMaterialsFile(content: string | null): Record<string, LocalStudyMaterial> {
  // The file exists from the start, and a git pull never deletes it. So a missing file was deleted
  // by hand, and a new file would drop every record.
  if (content === null) throw new Error(`${LOCAL_STUDY_MATERIALS_PATH} is missing`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw cannotReadError(error);
  }
  return parseLocalStudyMaterials(parsed);
}

// The file also comes from the other server through git, so a wrong shape must fail loudly and
// never reach the browser
function parseLocalStudyMaterials(value: unknown): Record<string, LocalStudyMaterial> {
  if (!isRecord(value)) throw invalidFile("the root must be a JSON object");

  const knownFields: readonly string[] = LOCAL_STUDY_MATERIAL_FIELDS;
  for (const [subjectId, record] of Object.entries(value)) {
    if (!isRecord(record)) throw invalidFile(`subject ${subjectId} must be a JSON object`);

    const fields = Object.entries(record);
    // the app deletes an entry that has no field left, so an empty one would sit there unused
    if (fields.length === 0) throw invalidFile(`subject ${subjectId} has no field`);

    for (const [field, fieldValue] of fields) {
      if (!knownFields.includes(field)) {
        throw invalidFile(`subject ${subjectId} field ${field} is not a known field`);
      }
      const problem = localStudyMaterialValueProblem(field, fieldValue);
      if (problem) throw invalidFile(`subject ${subjectId} field ${field} ${problem}`);
    }
  }
  return value as Record<string, LocalStudyMaterial>;
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

function cannotReadError(error: unknown): Error {
  return new Error(`Cannot read ${LOCAL_STUDY_MATERIALS_PATH}. ${String(error)}`);
}

function invalidFile(problem: string): Error {
  return new Error(`Invalid ${LOCAL_STUDY_MATERIALS_PATH}: ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
