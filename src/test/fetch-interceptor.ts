import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";
import {
  RADICAL_DECK_NAME,
  RADICAL_MODEL_NAME,
  RADICAL_EXPECTED_FIELDS,
  KANJI_DECK_NAME,
  KANJI_MODEL_NAME,
  KANJI_EXPECTED_FIELDS,
  VOCABULARY_DECK_NAME,
  VOCABULARY_MODEL_NAME,
  VOCABULARY_EXPECTED_FIELDS,
} from "@/model/anki-models.ts";

type AnkiCall = {
  action: string;
  params: Record<string, unknown>;
};

type AnkiErrorOverride = { message: string; onCall?: number };

const SVG_CONTENT_TYPE = "image/svg+xml";

export const ankiCalls: AnkiCall[] = [];
/** Every fetched URL that is not AnkiConnect, so a test can see a cache hit made no request. */
export const externalFetches: string[] = [];

const responseOverrides = new Map<string, unknown>();
const errorOverrides = new Map<string, AnkiErrorOverride>();
const callCounts = new Map<string, number>();
const modelFieldOverrides = new Map<string, string[]>();
let mediaStatus = 200;
let mediaContentType: string | null = SVG_CONTENT_TYPE;

let nextNoteId = 1000000;

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";

const DECK_IDS: Record<string, number> = {
  [RADICAL_DECK_NAME]: 1001,
  [KANJI_DECK_NAME]: 1002,
  [VOCABULARY_DECK_NAME]: 1003,
};

const MODEL_FIELDS: Record<string, string[]> = {
  [RADICAL_MODEL_NAME]: RADICAL_EXPECTED_FIELDS,
  [KANJI_MODEL_NAME]: KANJI_EXPECTED_FIELDS,
  [VOCABULARY_MODEL_NAME]: VOCABULARY_EXPECTED_FIELDS,
};

export function installFetchInterceptor() {
  globalThis.fetch = createFetchMock(async (input, init) => {
    const url = resolveUrl(input);

    if (url === ANKI_CONNECT_URL) {
      const body = JSON.parse(init?.body as string) as {
        action: string;
        params?: Record<string, unknown>;
      };
      const params = body.params ?? {};
      ankiCalls.push({ action: body.action, params });
      const callNumber = (callCounts.get(body.action) ?? 0) + 1;
      callCounts.set(body.action, callNumber);
      const error = ankiError(body.action, callNumber);
      const result = error === null ? handleAnkiRequest(body.action, params) : null;
      return new Response(JSON.stringify({ result, error }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    externalFetches.push(url);

    if (url.includes("files.wanikani.com")) {
      const headers = new Headers();
      if (mediaContentType !== null) headers.set("Content-Type", mediaContentType);
      return new Response(mediaStatus === 200 ? "<svg></svg>" : "Not Found", {
        status: mediaStatus,
        headers,
      });
    }

    if (url.includes("wanikani.com")) {
      return new Response("<html></html>", { status: 200 });
    }

    if (url.includes(".tts.speech.microsoft.com")) {
      return new Response(new ArrayBuffer(100), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  });
}

export function setAnkiResponse(action: string, result: unknown) {
  responseOverrides.set(action, result);
}

/** Every call of the action answers the error. `onCall` limits it to one call, counted from 1. */
export function setAnkiError(params: { action: string; message: string; onCall?: number }) {
  const { action, message, onCall } = params;
  errorOverrides.set(action, { message, onCall });
}

export function setModelFields(modelName: string, fields: string[]) {
  modelFieldOverrides.set(modelName, fields);
}

export function setMediaStatus(status: number) {
  mediaStatus = status;
}

/** Only the mnemonic picture reads it, the other media kinds know their type up front. */
export function setMediaContentType(contentType: string | null) {
  mediaContentType = contentType;
}

export function resetFetchInterceptor() {
  ankiCalls.length = 0;
  externalFetches.length = 0;
  responseOverrides.clear();
  errorOverrides.clear();
  callCounts.clear();
  modelFieldOverrides.clear();
  mediaStatus = 200;
  mediaContentType = SVG_CONTENT_TYPE;
  nextNoteId = 1000000;
}

function ankiError(action: string, callNumber: number): string | null {
  const override = errorOverrides.get(action);
  if (!override) return null;
  if (override.onCall !== undefined && override.onCall !== callNumber) return null;
  return override.message;
}

function handleAnkiRequest(action: string, params: Record<string, unknown>): unknown {
  const override = responseOverrides.get(action);
  if (override !== undefined) return override;

  switch (action) {
    case "deckNamesAndIds":
      return DECK_IDS;
    case "modelFieldNames": {
      const modelName = params["modelName"] as string;
      return modelFieldOverrides.get(modelName) ?? MODEL_FIELDS[modelName] ?? [];
    }
    case "findNotes":
      return [];
    case "notesInfo":
      return [];
    case "addNote":
      return nextNoteId++;
    case "updateNoteFields":
    case "storeMediaFile":
    case "sync":
      return null;
    default:
      return null;
  }
}
