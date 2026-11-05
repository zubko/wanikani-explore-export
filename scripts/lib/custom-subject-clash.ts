import { readFile } from "fs/promises";
import { findWaniKaniClash, validateCustomSubjects } from "../../src/model/custom-subject-utils.ts";
import type { WordForClash } from "../../src/model/custom-subject-utils.ts";
import type { CustomSubject } from "../../src/model/wanikani.ts";
import { formatError } from "./format-error.ts";

export const CUSTOM_SUBJECTS_FILE = "./data/userdata/custom_subjects.json";

/**
 * The lines to print after a download. A missing or broken file gives one line and never throws,
 * because the download before it is the long step.
 */
export async function customSubjectClashWarnings(params: {
  path: string;
  wanikaniWords: WordForClash[];
}): Promise<string[]> {
  let customSubjects: CustomSubject[];
  try {
    const parsed: unknown = JSON.parse(await readFile(params.path, "utf-8"));
    validateCustomSubjects(parsed);
    customSubjects = parsed as CustomSubject[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return ["No custom_subjects.json, skipped the custom subject check"];
    }
    return [`Could not read custom_subjects.json: ${formatError(error)}`];
  }

  const clashes = findWaniKaniClash({ customSubjects, wanikaniWords: params.wanikaniWords });
  return clashes.map(
    ({ customId, wanikaniId, characters }) =>
      `Warning: custom subject ${customId} "${characters}" has the same characters as WaniKani ${wanikaniId}`
  );
}
