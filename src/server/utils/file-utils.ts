import { randomUUID } from "crypto";
import { rename, stat, unlink, writeFile } from "fs/promises";

export const MISSING_FILE_VERSION = "missing";

export async function writeFileAtomic(path: string, data: string | Buffer): Promise<void> {
  await writeAndRename({ path, data, canRename: async () => true });
}

/**
 * Like `writeFileAtomic`, but renames only when the file still has `fileVersion`. Answers false
 * and leaves the file as it is when the version changed. A change that lands between the check and
 * the rename is still lost, because POSIX has no rename that compares first.
 */
export async function writeFileAtomicIfUnchanged(params: {
  path: string;
  data: string | Buffer;
  fileVersion: string;
}): Promise<boolean> {
  const { path, data, fileVersion } = params;
  return writeAndRename({
    path,
    data,
    canRename: async () => (await readFileVersion(path)) === fileVersion,
  });
}

/** Creates the file only when there is none. Answers false and writes nothing when there is one. */
export async function writeFileIfMissing(path: string, data: string | Buffer): Promise<boolean> {
  try {
    await writeFile(path, data, { flag: "wx" });
    return true;
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) return false;
    throw error;
  }
}

/** Changes whenever the file changes. A missing file has `MISSING_FILE_VERSION`. */
export async function readFileVersion(path: string): Promise<string> {
  try {
    const { ino, mtimeMs, size } = await stat(path);
    // The mtime can stay the same within one clock tick, but every atomic save and every git
    // checkout gives the file a new inode
    return `${ino}:${mtimeMs}:${size}`;
  } catch (error) {
    if (isMissingFile(error)) return MISSING_FILE_VERSION;
    throw error;
  }
}

export function isMissingFile(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT");
}

async function writeAndRename(params: {
  path: string;
  data: string | Buffer;
  canRename: () => Promise<boolean>;
}): Promise<boolean> {
  const { path, data, canRename } = params;
  // A unique temp name keeps two writes of one path from sharing a temp file
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, data);
    // Asked after the slow write, so only the rename itself is left between the check and the change
    if (!(await canRename())) {
      await unlink(tempPath);
      return false;
    }
    await rename(tempPath, path);
    return true;
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
