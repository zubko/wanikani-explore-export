import { mock } from "bun:test";
import { readFile } from "fs/promises";

export const writeCalls: { path: string; data: string }[] = [];

export function resetWriteCalls() {
  writeCalls.length = 0;
}

const realReadFile = readFile;
mock.module("fs/promises", () => ({
  readFile: async (path: string, encoding?: BufferEncoding) => {
    // Redirect mnemonic cache reads to a checked-in test fixture
    // so tests don't depend on user-specific cache state
    if (String(path).includes("mnemonic-images.json")) {
      return realReadFile("src/test/fixtures/mnemonic-images.json", encoding);
    }
    return realReadFile(path, encoding);
  },
  writeFile: async (path: string, data: string) => {
    writeCalls.push({ path: String(path), data: String(data) });
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
