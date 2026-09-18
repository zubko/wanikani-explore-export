import { readFile, rename, unlink, writeFile } from "fs/promises";

export async function readJson<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

export async function saveJsonAtomic(path: string, data: unknown): Promise<void> {
  const tempPath = `${path}.tmp`;
  try {
    await writeFile(tempPath, JSON.stringify(data, null, 2) + "\n");
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}
