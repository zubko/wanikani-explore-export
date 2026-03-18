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

installDeterministicRandom();

function installDeterministicRandom() {
  let seed = 0.42;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

let initialized = false;

export async function ensureRepositoryInitialized() {
  if (initialized) return;
  const { initRepository } = await import("@server/repository/data-loader.ts");
  await initRepository();
  initialized = true;
}
