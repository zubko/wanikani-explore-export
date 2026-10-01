import { mock } from "bun:test";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { normalize } from "path";
import { installDom } from "./dom.ts";

// react-dom reads the DOM globals when it loads, so this must run before any test file imports it
installDom();

type FsOp = "readFile" | "writeFile" | "rename" | "unlink" | "stat";

type FileData = string | Buffer;

type MockFile = { data: FileData; version: number };

// Checked-in fixtures under the real paths, so no test depends on user-specific state
const SEEDED_FILES = [
  {
    path: "./data/userdata/mnemonic-images.json",
    fixturePath: "src/test/fixtures/mnemonic-images.json",
  },
  {
    path: "./data/userdata/study_materials_extra.json",
    fixturePath: "src/test/fixtures/study_materials_extra.json",
  },
];

export const writeCalls: { path: string; data: FileData }[] = [];

const fsErrors = new Map<FsOp, Error>();
// Holds the written files, so a read after a write sees the new content like a real disk does
const files = new Map<string, MockFile>();
// Never reset, so a file seeded again after a reset still looks changed to a reader that holds the old one
let lastVersion = 0;

seedFixtures();

/** Drops the recorded writes, the written files and the injected errors, then seeds the fixtures again. */
export function resetFsMock() {
  writeCalls.length = 0;
  files.clear();
  fsErrors.clear();
  seedFixtures();
}

/** Puts content under a path without recording a write, for a change made outside the app. */
export function setFileContent(path: string, data: FileData) {
  putFile(path, data);
}

export function setFsError(op: FsOp, err: Error | null) {
  if (err) fsErrors.set(op, err);
  else fsErrors.delete(op);
}

function seedFixtures() {
  for (const { path, fixturePath } of SEEDED_FILES) {
    setFileContent(path, readFileSync(fixturePath, "utf-8"));
  }
}

function putFile(path: string, data: FileData) {
  lastVersion += 1;
  files.set(fileKey(path), { data, version: lastVersion });
}

// `./data/x` and `data/x` name one file
function fileKey(path: string): string {
  return normalize(String(path));
}

function throwWhenSet(op: FsOp) {
  const err = fsErrors.get(op);
  if (err) throw err;
}

function missingFileError(op: FsOp, path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, ${op} '${path}'`), {
    code: "ENOENT",
  });
}

const realReadFile = readFile;
mock.module("fs/promises", () => ({
  readFile: async (
    path: string,
    options?: BufferEncoding | { encoding?: BufferEncoding | null }
  ) => {
    throwWhenSet("readFile");
    const file = files.get(fileKey(path));
    if (file === undefined) return realReadFile(path, options);
    const encoding = typeof options === "string" ? options : options?.encoding;
    const bytes = Buffer.from(file.data);
    return encoding ? bytes.toString(encoding) : bytes;
  },
  writeFile: async (path: string, data: FileData) => {
    throwWhenSet("writeFile");
    putFile(path, data);
    writeCalls.push({ path: String(path), data });
  },
  rename: async (from: string, to: string) => {
    throwWhenSet("rename");
    const file = files.get(fileKey(from));
    if (file !== undefined) {
      files.delete(fileKey(from));
      putFile(to, file.data);
    }
    const entry = writeCalls.find((call) => fileKey(call.path) === fileKey(from));
    if (entry) entry.path = String(to);
  },
  unlink: async (path: string) => {
    throwWhenSet("unlink");
    files.delete(fileKey(path));
    const index = writeCalls.findIndex((call) => fileKey(call.path) === fileKey(path));
    if (index >= 0) writeCalls.splice(index, 1);
  },
  // The version stands in for the mtime, so every change of a file gives it a new one
  stat: async (path: string) => {
    throwWhenSet("stat");
    const file = files.get(fileKey(path));
    if (file === undefined) throw missingFileError("stat", path);
    return { mtimeMs: file.version, size: Buffer.byteLength(file.data) };
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
