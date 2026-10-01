import { randomUUID } from "crypto";
import { readFile, rename, unlink, writeFile } from "fs/promises";

export async function readJson<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

export async function saveJsonAtomic(path: string, data: unknown): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(data, null, 2) + "\n");
}

export async function writeFileAtomic(path: string, data: string | Buffer): Promise<void> {
  // A unique temp name keeps two writes of one path from sharing a temp file
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, data);
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}
