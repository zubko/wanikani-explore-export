import type { CustomSubject, CustomSubjectInput } from "@/model/wanikani.ts";
import { isVisibleSubject } from "@/model/subject-utils.ts";
import {
  buildCustomRecord,
  findCustomSubject,
  findWaniKaniClash,
  nextCustomSubjectId,
  validateCustomSubjectInput,
} from "@/model/custom-subject-utils.ts";
import { ValidationError } from "@/model/validation-error.ts";
import { readFileVersion } from "@server/utils/file-utils.ts";
import { saveJsonAtomicIfUnchanged } from "@server/utils/json-utils.ts";
import { CUSTOM_SUBJECTS_PATH } from "./data-paths.ts";
import { getWaniKaniWords, kanji, readCustomSubjects } from "./data-loader.ts";

type SaveStep = (records: CustomSubject[]) => { records: CustomSubject[]; saved: CustomSubject };

export const CUSTOM_SUBJECT_SAVE_ATTEMPTS = 3;

/** A refused write. A read or write error of the file stays a plain `Error`. */
export class CustomSubjectWriteError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "CustomSubjectWriteError";
    this.status = status;
  }
}

let queue: Promise<unknown> = Promise.resolve();

export function createCustomSubject(input: unknown): Promise<CustomSubject> {
  return runInQueue(async () => {
    const checkedInput = validateInput(input);
    return saveWithRetry(`create of ${checkedInput.data.characters}`, (records) => {
      const record = buildCustomRecord({
        id: nextCustomSubjectId(records),
        input: checkedInput,
        now: new Date().toISOString(),
      });
      refuseClash({ records, record });
      return { records: [...records, record], saved: record };
    });
  });
}

/** `object` and `characters` never change: the Anki note is found by its characters. */
export function updateCustomSubject(id: number, input: unknown): Promise<CustomSubject> {
  return runInQueue(() =>
    saveWithRetry(`update of ${id}`, (records) => {
      const current = findVisibleRecord(records, id);
      refuseIdentityChange({ current, input });
      const record = buildCustomRecord({
        id,
        input: validateInput(input),
        now: new Date().toISOString(),
        createdAt: current.data.created_at,
      });
      return { records: replaceRecord(records, record), saved: record };
    })
  );
}

/** Keeps the record with `hidden_at` set, so the id is never given again. */
export function deleteCustomSubject(id: number): Promise<CustomSubject> {
  return runInQueue(() =>
    saveWithRetry(`delete of ${id}`, (records) => {
      const current = findVisibleRecord(records, id);
      const now = new Date().toISOString();
      const record = {
        ...current,
        data_updated_at: now,
        data: { ...current.data, hidden_at: now },
      } as CustomSubject;
      return { records: replaceRecord(records, record), saved: record };
    })
  );
}

// The caller's promise stays out of the chain, so a rejection reaches the caller and the next
// save still starts from the last good state
function runInQueue<T>(step: () => Promise<T>): Promise<T> {
  const run = queue.then(step);
  queue = run.catch(() => {});
  return run;
}

/**
 * The queue only orders the saves of this server. A git pull of the other server's saves can still
 * land between the read and the rename, so a save that finds the file changed starts again from
 * the read.
 */
async function saveWithRetry(action: string, step: SaveStep): Promise<CustomSubject> {
  for (let attempt = 1; attempt <= CUSTOM_SUBJECT_SAVE_ATTEMPTS; attempt++) {
    // Taken before the read, so a change during the read counts as a change too
    const fileVersion = await readFileVersion(CUSTOM_SUBJECTS_PATH);
    const { records, saved } = step(await readCustomSubjects());
    if (
      await saveJsonAtomicIfUnchanged({ path: CUSTOM_SUBJECTS_PATH, data: records, fileVersion })
    ) {
      return saved;
    }
    console.warn(
      `[Repository] ${CUSTOM_SUBJECTS_PATH} changed during save attempt ${attempt} of ${CUSTOM_SUBJECT_SAVE_ATTEMPTS} for the ${action}`
    );
  }
  throw new Error(
    `${CUSTOM_SUBJECTS_PATH} changed during each of ${CUSTOM_SUBJECT_SAVE_ATTEMPTS} save attempts. Nothing was saved.`
  );
}

function validateInput(input: unknown): CustomSubjectInput {
  const kanjiIds = new Set(kanji.filter(isVisibleSubject).map((item) => item.id));
  try {
    validateCustomSubjectInput({ input, kanjiIds });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw new CustomSubjectWriteError(400, error.message);
  }
  return input as CustomSubjectInput;
}

function refuseClash(params: { records: CustomSubject[]; record: CustomSubject }): void {
  const { records, record } = params;
  const characters = record.data.characters;
  const customTwin = records.find(
    (other) => isVisibleSubject(other) && other.data.characters === characters
  );
  if (customTwin) {
    throw new CustomSubjectWriteError(
      409,
      `characters ${characters} are used by custom subject ${customTwin.id}`
    );
  }
  const [clash] = findWaniKaniClash({
    customSubjects: [record],
    wanikaniWords: getWaniKaniWords(),
  });
  if (clash) {
    throw new CustomSubjectWriteError(
      409,
      `characters ${characters} are used by WaniKani subject ${clash.wanikaniId}`
    );
  }
}

function findVisibleRecord(records: CustomSubject[], id: number): CustomSubject {
  const record = findCustomSubject(records, id);
  if (!record || !isVisibleSubject(record)) {
    throw new CustomSubjectWriteError(404, `custom subject ${id} not found`);
  }
  return record;
}

// Checked before the input check, so a changed type is named as such and not as a field problem
// of the other type
function refuseIdentityChange(params: { current: CustomSubject; input: unknown }): void {
  const { current, input } = params;
  if (!isRecord(input)) return;
  if ("object" in input && input.object !== current.object) {
    throw new CustomSubjectWriteError(
      400,
      `object cannot change from ${current.object}. Delete the word and create a new one.`
    );
  }
  const data = input.data;
  if (isRecord(data) && "characters" in data && data.characters !== current.data.characters) {
    throw new CustomSubjectWriteError(
      400,
      `characters cannot change from ${current.data.characters}. Delete the word and create a new one.`
    );
  }
}

function replaceRecord(records: CustomSubject[], record: CustomSubject): CustomSubject[] {
  return records.map((other) => (other.id === record.id ? record : other));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
