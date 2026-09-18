import { mock } from "bun:test";
import { readFile } from "fs/promises";
import { installDom } from "./dom.ts";

// react-dom reads the DOM globals when it loads, so this must run before any test file imports it
installDom();

type FsOp = "readFile" | "writeFile" | "rename" | "unlink";

export const writeCalls: { path: string; data: string }[] = [];

const fsErrors: Partial<Record<FsOp, Error>> = {};
// Holds the written files, so a read after a write sees the new content like a real disk does
const files = new Map<string, string>();

/** Drops the recorded writes, the written files and the injected errors. */
export function resetFsMock() {
  writeCalls.length = 0;
  files.clear();
  delete fsErrors.readFile;
  delete fsErrors.writeFile;
  delete fsErrors.rename;
  delete fsErrors.unlink;
}

/** Puts content under a path without recording a write, for a change made outside the app. */
export function setFileContent(path: string, data: string) {
  files.set(path, data);
}

export function setFsError(op: FsOp, err: Error | null) {
  if (err) fsErrors[op] = err;
  else delete fsErrors[op];
}

function throwWhenSet(op: FsOp) {
  const err = fsErrors[op];
  if (err) throw err;
}

const realReadFile = readFile;
mock.module("fs/promises", () => ({
  readFile: async (path: string, encoding?: BufferEncoding) => {
    throwWhenSet("readFile");
    const written = files.get(String(path));
    if (written !== undefined) return written;
    // Redirect mnemonic cache and local study material reads to checked-in test fixtures
    // so tests don't depend on user-specific state
    if (String(path).includes("mnemonic-images.json")) {
      return realReadFile("src/test/fixtures/mnemonic-images.json", encoding);
    }
    if (String(path).includes("study_materials_extra.json")) {
      return realReadFile("src/test/fixtures/study_materials_extra.json", encoding);
    }
    return realReadFile(path, encoding);
  },
  writeFile: async (path: string, data: string) => {
    throwWhenSet("writeFile");
    files.set(String(path), String(data));
    writeCalls.push({ path: String(path), data: String(data) });
  },
  rename: async (from: string, to: string) => {
    throwWhenSet("rename");
    const data = files.get(String(from));
    if (data !== undefined) {
      files.delete(String(from));
      files.set(String(to), data);
    }
    const entry = writeCalls.find((call) => call.path === String(from));
    if (entry) entry.path = String(to);
  },
  unlink: async (path: string) => {
    throwWhenSet("unlink");
    files.delete(String(path));
    const index = writeCalls.findIndex((call) => call.path === String(path));
    if (index >= 0) writeCalls.splice(index, 1);
  },
}));

const RANDOM_SEED = 0.42;
let randomSeed = RANDOM_SEED;

Math.random = () => {
  randomSeed = (randomSeed * 16807) % 2147483647;
  return (randomSeed - 1) / 2147483646;
};

export function resetRandom() {
  randomSeed = RANDOM_SEED;
}

let initialized = false;

export async function ensureRepositoryInitialized() {
  if (initialized) return;
  const { initRepository } = await import("@server/repository/data-loader.ts");
  await initRepository();
  initialized = true;
}
