import type {
  AnkiAddResult,
  AnkiNoteItem,
  KanaVocabulary,
  SubjectType,
  Vocabulary,
} from "../../src/model/wanikani.ts";
import { formatError } from "./format-error.ts";

type AnkiDeckType = "radical" | "kanji" | "vocabulary";

export type SearchResponse = { found: true; data: Vocabulary | KanaVocabulary } | { found: false };

export type AnkiNotesResponse = { ok: true; data: AnkiNoteItem[] } | { ok: false; error: string };

export type AddToAnkiResponse =
  | { ok: true; data: AnkiAddResult }
  | { ok: false; error: string; reason?: "fields" };

export type AnkiSyncResponse = { ok: true } | { ok: false; error: string };

export const DEFAULT_BASE_URL = "http://localhost:5173";

export async function searchVocabulary(baseUrl: string, word: string): Promise<SearchResponse> {
  const url = `${baseUrl}/api/search?type=vocabulary&q=${encodeURIComponent(word)}`;
  const response = await fetch(url);
  const failure = `Search ${word}`;
  if (!response.ok && response.status !== 404) {
    throw new Error(`${failure} failed with status ${response.status}`);
  }
  return readJsonAnswer<SearchResponse>(response, failure);
}

export async function fetchAnkiNotes(baseUrl: string, type: AnkiDeckType): Promise<AnkiNoteItem[]> {
  const response = await fetch(`${baseUrl}/api/anki-notes?type=${type}`);
  const result = await readJsonAnswer<AnkiNotesResponse>(response, `Reading the ${type} deck`);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function addToAnki(params: {
  baseUrl: string;
  id: number;
  type: SubjectType;
}): Promise<AddToAnkiResponse> {
  const { baseUrl, id, type } = params;
  const response = await fetch(`${baseUrl}/api/add-to-anki`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // a sync per item runs one full AnkiWeb sync each time, and a failed sync answers ok:false
    // for an item that is already written
    body: JSON.stringify({ id, type, sync: false }),
  });
  return readJsonAnswer<AddToAnkiResponse>(response, `Add ${type} ${id}`);
}

export async function syncAnkiWeb(baseUrl: string): Promise<AnkiSyncResponse> {
  const response = await fetch(`${baseUrl}/api/anki-sync`, { method: "POST" });
  return readJsonAnswer<AnkiSyncResponse>(response, "Sync with AnkiWeb");
}

export async function syncAnkiWebAtStart(baseUrl: string): Promise<void> {
  process.stdout.write("Syncing with AnkiWeb... ");
  const result = await syncAnkiWeb(baseUrl).catch(
    (err): AnkiSyncResponse => ({ ok: false, error: formatError(err) })
  );
  if (!result.ok) {
    console.log(`FAILED: ${result.error}`);
    process.exit(1);
  }
  console.log("OK");
}

export async function fetchVocabularyInAnki(baseUrl: string): Promise<Set<string>> {
  const notes = await fetchAnkiNotes(baseUrl, "vocabulary");
  return new Set(notes.map((note) => note.characters));
}

async function readJsonAnswer<T>(response: Response, failure: string): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`${failure} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}
