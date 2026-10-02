import { mock } from "bun:test";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { basename, dirname, normalize } from "path";
import {
  LOCAL_STUDY_MATERIALS_PATH,
  MEDIA_ROOT_PATH,
  MNEMONIC_IMAGES_PATH,
} from "@server/repository/data-paths.ts";
import { installDom } from "./dom.ts";

// react-dom reads the DOM globals when it loads, so this must run before any test file imports it
installDom();

type FsOp =
  | "readFile"
  | "writeFile"
  | "appendFile"
  | "rename"
  | "unlink"
  | "stat"
  | "readdir"
  | "mkdir";

type FileData = string | Buffer;

type MockFile = { data: FileData; version: number };

type FsHold = { markReached: () => void; released: Promise<void>; release: () => void };

export const STUDY_MATERIALS_FIXTURE_PATH = "src/test/fixtures/study_materials_extra.json";

// Checked-in fixtures under the real paths, so no test depends on user-specific state
const SEEDED_FILES = [
  { path: MNEMONIC_IMAGES_PATH, fixturePath: "src/test/fixtures/mnemonic-images.jsonl" },
  { path: LOCAL_STUDY_MATERIALS_PATH, fixturePath: STUDY_MATERIALS_FIXTURE_PATH },
];

// A seeded or media file that is not in the mock must read as missing, never as the user's real
// file. An exact compare, because a fixture file has the same base name as its seeded path.
const SEEDED_PATHS = new Set(SEEDED_FILES.map(({ path }) => normalize(path)));
const MEDIA_FOLDER = normalize(`${MEDIA_ROOT_PATH}/`);

export const writeCalls: { path: string; data: FileData }[] = [];
export const mkdirCalls: { path: string; recursive: boolean }[] = [];

const fsErrors = new Map<FsOp, Error>();
const fsHolds = new Map<FsOp, FsHold>();
// Holds the written files, so a read after a write sees the new content like a real disk does
const files = new Map<string, MockFile>();
// Never reset, so a file seeded again after a reset still looks changed to a reader that holds
// the old one
let lastVersion = 0;

seedFixtures();

/**
 * Drops the recorded calls, the written files, the injected errors and the held ops, then seeds
 * the fixtures again.
 */
export function resetFsMock() {
  writeCalls.length = 0;
  mkdirCalls.length = 0;
  files.clear();
  fsErrors.clear();
  for (const hold of fsHolds.values()) hold.release();
  fsHolds.clear();
  seedFixtures();
}

/** Puts content under a path without recording a write, for a change made outside the app. */
export function setFileContent(path: string, data: FileData) {
  lastVersion += 1;
  files.set(fileKey(path), { data, version: lastVersion });
}

export function setFsError(op: FsOp, err: Error | null) {
  if (err) fsErrors.set(op, err);
  else fsErrors.delete(op);
}

/**
 * Makes every call of the op wait until `release()`. `reached` resolves when the first call
 * waits, so a test can act while the op is in the middle of its work.
 */
export function holdFsOp(op: FsOp): { reached: Promise<void>; release: () => void } {
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const release = () => {
    fsHolds.delete(op);
    released.resolve();
  };
  fsHolds.set(op, { markReached: reached.resolve, released: released.promise, release });
  return { reached: reached.promise, release };
}

function seedFixtures() {
  for (const { path, fixturePath } of SEEDED_FILES) {
    setFileContent(path, readFileSync(fixturePath, "utf-8"));
  }
}

// `./data/x` and `data/x` name one file
function fileKey(path: string): string {
  return normalize(String(path));
}

async function startOp(op: FsOp) {
  const hold = fsHolds.get(op);
  if (hold) {
    hold.markReached();
    await hold.released;
  }
  const err = fsErrors.get(op);
  if (err) throw err;
}

function missingFileError(op: FsOp, path: string): Error {
  return fsCodeError({ op, path, code: "ENOENT", message: "no such file or directory" });
}

function fsCodeError(params: { op: string; path: string; code: string; message: string }): Error {
  const { op, path, code, message } = params;
  return Object.assign(new Error(`${code}: ${message}, ${op} '${path}'`), { code });
}

const realReadFile = readFile;
mock.module("fs/promises", () => ({
  readFile: async (
    path: string,
    options?: BufferEncoding | { encoding?: BufferEncoding | null }
  ) => {
    await startOp("readFile");
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
  writeFile: async (path: string, data: FileData, options?: { flag?: string }) => {
    await startOp("writeFile");
    if (options?.flag === "wx" && files.has(fileKey(path))) {
      throw fsCodeError({ op: "open", path, code: "EEXIST", message: "file already exists" });
    }
    setFileContent(path, data);
    writeCalls.push({ path: String(path), data });
  },
  appendFile: async (path: string, data: FileData) => {
    await startOp("appendFile");
    const current = files.get(fileKey(path))?.data ?? "";
    setFileContent(path, Buffer.concat([Buffer.from(current), Buffer.from(data)]));
    writeCalls.push({ path: String(path), data });
  },
  rename: async (from: string, to: string) => {
    await startOp("rename");
    const file = files.get(fileKey(from));
    if (file !== undefined) {
      files.delete(fileKey(from));
      setFileContent(to, file.data);
    }
    const entry = writeCalls.find((call) => fileKey(call.path) === fileKey(from));
    if (entry) entry.path = String(to);
  },
  unlink: async (path: string) => {
    await startOp("unlink");
    files.delete(fileKey(path));
    const index = writeCalls.findIndex((call) => fileKey(call.path) === fileKey(path));
    if (index >= 0) writeCalls.splice(index, 1);
  },
  // The version stands in for the mtime, so every change of a file gives it a new one. The inode
  // never changes, so a test sees a change through the mtime and the size alone.
  stat: async (path: string) => {
    await startOp("stat");
    const file = files.get(fileKey(path));
    if (file === undefined) throw missingFileError("stat", path);
    return { ino: 0, mtimeMs: file.version, size: Buffer.byteLength(file.data) };
  },
  readdir: async (path: string) => {
    await startOp("readdir");
    const folder = fileKey(path);
    const names = [...files.keys()]
      .filter((key) => dirname(key) === folder)
      .map((key) => basename(key));
    if (names.length === 0) throw missingFileError("readdir", path);
    return names;
  },
  mkdir: async (path: string, options?: { recursive?: boolean }) => {
    await startOp("mkdir");
    mkdirCalls.push({ path: String(path), recursive: options?.recursive ?? false });
  },
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
