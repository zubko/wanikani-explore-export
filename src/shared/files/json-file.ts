import { readFile } from "fs/promises";
import { writeFileAtomic } from "./file-utils.ts";

export async function readJson<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

export async function saveJsonAtomic(path: string, data: unknown): Promise<void> {
  await writeFileAtomic(path, formatJsonFile(data));
}

export function formatJsonFile(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}
