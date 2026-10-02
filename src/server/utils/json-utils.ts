import { readFile } from "fs/promises";
import { writeFileAtomic, writeFileAtomicIfUnchanged, writeFileIfMissing } from "./file-utils.ts";

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

/** `writeFileIfMissing` with the JSON format of `saveJsonAtomic`. */
export function saveJsonIfMissing(path: string, data: unknown): Promise<boolean> {
  return writeFileIfMissing(path, formatJsonFile(data));
}

function formatJsonFile(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}
