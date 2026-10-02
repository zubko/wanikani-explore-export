import { readFile } from "fs/promises";
import { MISSING_FILE_VERSION, readFileVersion } from "./file-utils.ts";

type ReloadingFile<T> = { get: () => Promise<T> };

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
