import { readFile, stat } from "fs/promises";
import { isMissingFile } from "./file-utils.ts";

type ReloadingFile<T> = { get: () => Promise<T> };

const MISSING_FILE_VERSION = "missing";

/**
 * Reads the file again when its inode, mtime or size changed, because the other machine may change
 * it at any time. `parse` gets `null` for a missing file and decides what empty means.
 */
export function createReloadingFile<T>(params: {
  path: string;
  parse: (content: string | null) => T;
}): ReloadingFile<T> {
  const { path, parse } = params;
  let held: { fileVersion: string; value: T } | null = null;

  async function get(): Promise<T> {
    const fileVersion = await readFileVersion(path);
    if (held?.fileVersion === fileVersion) return held.value;

    const content = fileVersion === MISSING_FILE_VERSION ? null : await readFile(path, "utf-8");
    // Held only after a successful parse, so a bad file throws on every call until it is fixed
    const value = parse(content);
    held = { fileVersion, value };
    return value;
  }

  return { get };
}

async function readFileVersion(path: string): Promise<string> {
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
