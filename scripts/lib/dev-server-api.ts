import { hc } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { ApiType } from "@server/api.ts";
import type { AnkiDeckType } from "@shared/anki/anki-models.ts";
import type { AnkiNoteItem, SubjectType } from "@shared/wanikani/wanikani.ts";
import { getErrorMessage } from "@shared/error-message.ts";

type ApiClient = ReturnType<typeof apiClient>;

type SearchAnswer = InferResponseType<ApiClient["search"]["$get"], 200 | 404>;

type FoundSubject = Extract<SearchAnswer, { found: true }>["data"];

export type SearchResponse =
  | Extract<SearchAnswer, { found: false }>
  | { found: true; data: Extract<FoundSubject, { object: "vocabulary" | "kana_vocabulary" }> };

export type AnkiNotesResponse = InferResponseType<ApiClient["anki-notes"]["$get"]>;

export type AddToAnkiResponse = InferResponseType<ApiClient["add-to-anki"]["$post"]>;

export type AnkiSyncResponse = InferResponseType<ApiClient["anki-sync"]["$post"]>;

export const DEFAULT_BASE_URL = "http://localhost:5173";

export async function searchVocabulary(baseUrl: string, word: string): Promise<SearchResponse> {
  const response = await apiClient(baseUrl).search.$get({
    query: { type: "vocabulary", q: word },
  });
  const failure = `Search ${word}`;
  if (!response.ok && response.status !== 404) {
    throw new Error(`${failure} failed with status ${response.status}`);
  }
  const answer = await readJsonAnswer<SearchAnswer>(response, failure);
  if (!answer.found) return answer;
  const { data } = answer;
  if (data.object !== "vocabulary" && data.object !== "kana_vocabulary") {
    throw new Error(`${failure} found ${data.object} ${data.id}, not a word`);
  }
  return { found: true, data };
}

export async function fetchAnkiNotes(baseUrl: string, type: AnkiDeckType): Promise<AnkiNoteItem[]> {
  const response = await apiClient(baseUrl)["anki-notes"].$get({ query: { type } });
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
  const response = await apiClient(baseUrl)["add-to-anki"].$post({
    // a sync per item runs one full AnkiWeb sync each time, and a failed sync answers ok:false
    // for an item that is already written
    json: { id, type, sync: false },
  });
  return readJsonAnswer<AddToAnkiResponse>(response, `Add ${type} ${id}`);
}

export function isFieldMismatch(result: AddToAnkiResponse): boolean {
  if (result.ok || !("reason" in result)) return false;
  // "reason" in result alone types the value as unknown when the route renames it
  const reason: "fields" | undefined = result.reason;
  return reason === "fields";
}

export async function syncAnkiWeb(baseUrl: string): Promise<AnkiSyncResponse> {
  const response = await apiClient(baseUrl)["anki-sync"].$post();
  return readJsonAnswer<AnkiSyncResponse>(response, "Sync with AnkiWeb");
}

export async function syncAnkiWebAtStart(baseUrl: string): Promise<void> {
  process.stdout.write("Syncing with AnkiWeb... ");
  const result = await syncAnkiWeb(baseUrl).catch(
    (err): AnkiSyncResponse => ({ ok: false, error: getErrorMessage(err) })
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

function apiClient(baseUrl: string) {
  return hc<ApiType>(`${baseUrl}/api`);
}

// an unhandled server error answers with plain text, and json() would throw a SyntaxError
async function readJsonAnswer<T>(
  response: { status: number; headers: Headers; json: () => Promise<T> },
  failure: string
): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`${failure} failed with status ${response.status}`);
  }
  return response.json();
}
