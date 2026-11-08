import type { CustomSubject, CustomSubjectInput } from "@/model/wanikani.ts";
import { isVisibleSubject } from "@/model/subject-utils.ts";
import {
  buildCustomRecord,
  findCustomSubject,
  nextCustomSubjectId,
  validateCustomSubjectInput,
} from "@/model/custom-subject-utils.ts";
import { ValidationError } from "@/model/validation-error.ts";
import { createSaveQueue, saveJsonWithRetry } from "@server/utils/json-utils.ts";
import { CUSTOM_SUBJECTS_PATH } from "./data-paths.ts";
import { getKanjiCharactersById, getWaniKaniWords, readCustomSubjects } from "./data-loader.ts";

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

const runInQueue = createSaveQueue();

export function createCustomSubject(input: unknown): Promise<CustomSubject> {
  return runInQueue(async () => {
    const checkedInput = validateInput({ input, keptKanjiIds: [] });
    return saveWithRetry(`the create of ${checkedInput.data.characters}`, (records) => {
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
    saveWithRetry(`the update of ${id}`, (records) => {
      const current = findVisibleRecord(records, id);
      refuseIdentityChange({ current, input });
      const record = buildCustomRecord({
        id,
        // A kanji that WaniKani hid after the save must not block every later edit of the word
        input: validateInput({ input, keptKanjiIds: keptKanjiIdsOf(current) }),
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
    saveWithRetry(`the delete of ${id}`, (records) => {
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

function saveWithRetry(label: string, step: SaveStep): Promise<CustomSubject> {
  return saveJsonWithRetry({
    path: CUSTOM_SUBJECTS_PATH,
    attempts: CUSTOM_SUBJECT_SAVE_ATTEMPTS,
    label,
    step: async () => {
      const { records, saved } = step(await readCustomSubjects());
      return { data: records, result: saved };
    },
  });
}

function validateInput(params: { input: unknown; keptKanjiIds: number[] }): CustomSubjectInput {
  const { input, keptKanjiIds } = params;
  try {
    validateCustomSubjectInput({
      input,
      kanjiCharactersById: getKanjiCharactersById(keptKanjiIds),
    });
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
  const wanikaniTwin = getWaniKaniWords().find(
    (word) => isVisibleSubject(word) && word.data.characters === characters
  );
  if (wanikaniTwin) {
    throw new CustomSubjectWriteError(
      409,
      `characters ${characters} are used by WaniKani subject ${wanikaniTwin.id}`
    );
  }
}

function findVisibleRecord(records: CustomSubject[], id: number): CustomSubject {
  const record = findCustomSubject(records, id);
  if (!record || !isVisibleSubject(record)) {
    throw new CustomSubjectWriteError(404, `Custom subject ${id} not found`);
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

function keptKanjiIdsOf(record: CustomSubject): number[] {
  return record.object === "vocabulary" ? record.data.component_subject_ids : [];
}

function replaceRecord(records: CustomSubject[], record: CustomSubject): CustomSubject[] {
  return records.map((other) => (other.id === record.id ? record : other));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
