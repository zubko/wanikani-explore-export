import { mock } from "bun:test";
import { readFile } from "fs/promises";

type FsOp = "writeFile" | "rename";

export const writeCalls: { path: string; data: string }[] = [];

const fsErrors: Partial<Record<FsOp, Error>> = {};

export function resetWriteCalls() {
  writeCalls.length = 0;
  delete fsErrors.writeFile;
  delete fsErrors.rename;
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
    writeCalls.push({ path: String(path), data: String(data) });
  },
  rename: async (from: string, to: string) => {
    throwWhenSet("rename");
    const entry = writeCalls.find((call) => call.path === String(from));
    if (entry) entry.path = String(to);
  },
  unlink: async (path: string) => {
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
