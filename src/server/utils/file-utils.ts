import { randomUUID } from "crypto";
import { rename, unlink, writeFile } from "fs/promises";

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

export function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
