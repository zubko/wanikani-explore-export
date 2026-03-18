import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";

type AnkiCall = {
  action: string;
  params: Record<string, unknown>;
};

export const ankiCalls: AnkiCall[] = [];

const responseOverrides = new Map<string, unknown>();
let mediaStatus = 200;

let nextNoteId = 1000000;

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";

const DECK_IDS: Record<string, number> = {
  "Japanese Radicals": 1001,
  "Japanese Kanji": 1002,
  "Japanese Vocabulary": 1003,
};

const MODEL_FIELDS: Record<string, string[]> = {
  "Japanese Radicals": [
    "character",
    "primary_name",
    "extra_names",
    "user_synonyms",
    "mnemonic_text",
    "mnemonic_image",
    "note",
  ],
  "Japanese Kanji": [
    "character",
    "radicals",
    "primary_meaning",
    "primary_reading",
    "extra_meanings",
    "meaning_mnemonic",
    "meaning_hint",
    "meaning_note",
    "readings_onyomi",
    "readings_kunyomi",
    "readings_nanori",
    "reading_mnemonic",
    "reading_hint",
    "reading_note",
  ],
  "Japanese Vocabulary": [
    "characters",
    "kanji_composition",
    "primary_meaning",
    "extra_meanings",
    "user_synonyms",
    "word_type",
    "conjugations",
    "meaning_explanation",
    "meaning_note",
    "reading",
    "reading_audio_female",
    "reading_audio_male",
    "reading_explanation",
    "reading_note",
    "sentence_jap",
    "sentence_jap_furigana",
    "sentence_jap_audio",
    "sentence_eng",
    "sentence_eng_audio",
  ],
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
      const result = handleAnkiRequest(body.action, params);
      return new Response(JSON.stringify({ result, error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("files.wanikani.com")) {
      return new Response(mediaStatus === 200 ? "<svg></svg>" : "Not Found", {
        status: mediaStatus,
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

export function setMediaStatus(status: number) {
  mediaStatus = status;
}

export function resetFetchInterceptor() {
  ankiCalls.length = 0;
  responseOverrides.clear();
  mediaStatus = 200;
  nextNoteId = 1000000;
}

function handleAnkiRequest(action: string, params: Record<string, unknown>): unknown {
  const override = responseOverrides.get(action);
  if (override !== undefined) return override;

  switch (action) {
    case "deckNamesAndIds":
      return DECK_IDS;
    case "modelFieldNames":
      return MODEL_FIELDS[params["modelName"] as string] ?? [];
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
