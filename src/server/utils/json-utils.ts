import { readFile } from "fs/promises";
import {
  readFileVersion,
  writeFileAtomic,
  writeFileAtomicIfUnchanged,
  writeFileIfMissing,
} from "./file-utils.ts";

type SaveQueue = <T>(step: () => Promise<T>) => Promise<T>;

export async function readJson<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

export async function saveJsonAtomic(path: string, data: unknown): Promise<void> {
  await writeFileAtomic(path, formatJsonFile(data));
}

/** `saveJsonAtomic` through `writeFileAtomicIfUnchanged`. Answers false when nothing was written. */
export function saveJsonAtomicIfUnchanged(params: {
  path: string;
  data: unknown;
  fileVersion: string;
}): Promise<boolean> {
  const { path, data, fileVersion } = params;
  return writeFileAtomicIfUnchanged({ path, data: formatJsonFile(data), fileVersion });
}

/**
 * One queue per file. The caller's promise stays out of the chain, so a rejection reaches the
 * caller and the next save still starts from the last good state.
 */
export function createSaveQueue(): SaveQueue {
  let queue: Promise<unknown> = Promise.resolve();
  return (step) => {
    const run = queue.then(step);
    queue = run.catch(() => {});
    return run;
  };
}

/**
 * A read, merge and write. `step` reads the file and answers the new content. The queue only
 * orders the saves of this server. A git pull of the other server's saves can still land between
 * the read and the rename, so a save that finds the file changed starts again from the read.
 */
export async function saveJsonWithRetry<T>(params: {
  path: string;
  attempts: number;
  label: string;
  step: () => Promise<{ data: unknown; result: T }>;
}): Promise<T> {
  const { path, attempts, label, step } = params;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Taken before the read, so a change during the read counts as a change too
    const fileVersion = await readFileVersion(path);
    const { data, result } = await step();
    if (await saveJsonAtomicIfUnchanged({ path, data, fileVersion })) return result;
    console.warn(
      `[Repository] ${path} changed during save attempt ${attempt} of ${attempts} for ${label}`
    );
  }
  throw new Error(`${path} changed during each of ${attempts} save attempts. Nothing was saved.`);
}

/** `writeFileIfMissing` with the JSON format of `saveJsonAtomic`. */
export function saveJsonIfMissing(path: string, data: unknown): Promise<boolean> {
  return writeFileIfMissing(path, formatJsonFile(data));
}

function formatJsonFile(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}
