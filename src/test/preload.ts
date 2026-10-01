import { mock } from "bun:test";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { basename, dirname, normalize } from "path";
import { installDom } from "./dom.ts";

// react-dom reads the DOM globals when it loads, so this must run before any test file imports it
installDom();

type FsOp = "readFile" | "writeFile" | "appendFile" | "rename" | "unlink" | "stat" | "readdir";

type FileData = string | Buffer;

type MockFile = { data: FileData; version: number };

// Checked-in fixtures under the real paths, so no test depends on user-specific state
const SEEDED_FILES = [
  {
    path: "./data/userdata/mnemonic-images.jsonl",
    fixturePath: "src/test/fixtures/mnemonic-images.jsonl",
  },
  {
    path: "./data/userdata/study_materials_extra.json",
    fixturePath: "src/test/fixtures/study_materials_extra.json",
  },
];

// A seeded or media file that is not in the mock must read as missing, never as the user's real
// file. An exact compare, because a fixture file has the same base name as its seeded path.
const SEEDED_PATHS = new Set(SEEDED_FILES.map(({ path }) => normalize(path)));
const MEDIA_FOLDER = normalize("./data/userdata/media/");

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
    const key = fileKey(path);
    const file = files.get(key);
    if (file === undefined) {
      if (SEEDED_PATHS.has(key) || key.startsWith(MEDIA_FOLDER)) {
        throw missingFileError("readFile", path);
      }
      return realReadFile(path, options);
    }
    const encoding = typeof options === "string" ? options : options?.encoding;
    const bytes = Buffer.from(file.data);
    return encoding ? bytes.toString(encoding) : bytes;
  },
  writeFile: async (path: string, data: FileData) => {
    throwWhenSet("writeFile");
    putFile(path, data);
    writeCalls.push({ path: String(path), data });
  },
  appendFile: async (path: string, data: FileData) => {
    throwWhenSet("appendFile");
    const current = files.get(fileKey(path))?.data ?? "";
    putFile(path, Buffer.concat([Buffer.from(current), Buffer.from(data)]));
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
  readdir: async (path: string) => {
    throwWhenSet("readdir");
    const folder = fileKey(path);
    const names = [...files.keys()]
      .filter((key) => dirname(key) === folder)
      .map((key) => basename(key));
    if (names.length === 0) throw missingFileError("readdir", path);
    return names;
  },
  mkdir: async () => {},
}));

// Plain assignments: bun test loads the root env file, and its real voice list would change the
// sentence clip names in the snapshots from machine to machine
process.env.AZURE_TTS_KEY = "test-key";
process.env.AZURE_TTS_REGION = "eastus";
process.env.AZURE_TTS_VOICES = "ja-JP-TestNeural";

let initialized = false;

export async function ensureRepositoryInitialized() {
  if (initialized) return;
  const { initRepository } = await import("@server/repository/data-loader.ts");
  await initRepository();
  initialized = true;
}
