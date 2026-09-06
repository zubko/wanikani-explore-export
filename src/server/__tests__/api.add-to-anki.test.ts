import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import {
  installFetchInterceptor,
  resetFetchInterceptor,
  ankiCalls,
  setAnkiResponse,
  setMediaStatus,
  setModelFields,
} from "@/test/fetch-interceptor.ts";
import { ensureRepositoryInitialized, resetRandom } from "@/test/preload.ts";
import { VOCABULARY_MODEL_NAME, VOCABULARY_EXPECTED_FIELDS } from "@/model/anki-models.ts";
import { api } from "../api.ts";

process.env.AZURE_TTS_KEY = "test-key";
process.env.AZURE_TTS_REGION = "eastus";
process.env.AZURE_TTS_VOICES = "ja-JP-TestNeural";

installFetchInterceptor();
beforeAll(() => ensureRepositoryInitialized());
beforeEach(() => {
  resetFetchInterceptor();
  resetRandom();
});

async function addToAnki(body: { id: number; type: string }) {
  return api.request("/add-to-anki", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function addToAnkiJson(body: { id: number; type: string }) {
  return (await addToAnki(body)).json();
}

function findVocabularyFields(action: string, characters: string): Record<string, string> {
  const call = ankiCalls.find((c) => {
    if (c.action !== action) return false;
    const note = c.params.note as { fields?: Record<string, string> } | undefined;
    return note?.fields?.characters === characters;
  });
  if (!call) throw new Error(`No ${action} call for ${characters}`);
  return (call.params.note as { fields: Record<string, string> }).fields;
}

describe("add-to-anki API", () => {
  test("invalid type returns 400", async () => {
    const response = await addToAnki({ id: 1, type: "invalid" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid type: invalid" });
  });

  test("non-existent subject returns 404", async () => {
    const response = await addToAnki({ id: 999999, type: "radical" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "Subject not found" });
    expect(ankiCalls).toEqual([]);
  });

  test("add radical (一, id=1)", async () => {
    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.name).toBe("Ground");

    const actions = ankiCalls.map((c) => c.action);
    expect(actions).toMatchSnapshot();
  });

  test("add kanji (校, id=658) with radicals", async () => {
    const result = await addToAnkiJson({ id: 658, type: "kanji" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.characters).toBe("校");
    expect(result.data.radicals.length).toBeGreaterThan(0);

    const actions = ankiCalls.map((c) => c.action);
    expect(actions).toMatchSnapshot();
  });

  test("update existing radical returns created:false", async () => {
    setAnkiResponse("findNotes", [42]);

    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.created).toBe(false);

    const actions = ankiCalls.map((c) => c.action);
    expect(actions).toContain("updateNoteFields");
    expect(actions).not.toContain("addNote");
  });

  test("add vocabulary (毎晩, id=3766) full AnkiConnect sequence", async () => {
    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.characters).toBe("毎晩");

    expect(findVocabularyFields("addNote", "毎晩").masu_form).toBe("");
    expect(ankiCalls).toMatchSnapshot();
  });

  test("add kana vocabulary (ここ, id=9209)", async () => {
    const result = await addToAnkiJson({ id: 9209, type: "kana_vocabulary" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.characters).toBe("ここ");
    expect(result.data.kanji).toEqual([]);
    expect(result.data.radicals).toEqual([]);

    expect(findVocabularyFields("addNote", "ここ").masu_form).toBe("");
    expect(ankiCalls).toMatchSnapshot();
  });

  test("add vocabulary (高校, id=2950) deduplicates shared radicals", async () => {
    const result = await addToAnkiJson({ id: 2950, type: "vocabulary" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.characters).toBe("高校");
    const radicalNames = result.data.radicals.map((r: { name: string }) => r.name);
    expect(radicalNames).toMatchInlineSnapshot(`
      [
        "Lid",
        "Mouth",
        "Mustache",
        "Tree",
        "Father",
      ]
    `);
  });

  test("failed audio download returns error", async () => {
    setMediaStatus(404);
    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Failed to download audio (404)");
  });

  test("failed SVG download returns error", async () => {
    setMediaStatus(500);
    const result = await addToAnkiJson({ id: 8766, type: "radical" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Failed to download SVG (500)");
  });

  test("add verb vocabulary (入る, id=2480) fills masu_form", async () => {
    const result = await addToAnkiJson({ id: 2480, type: "vocabulary" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.characters).toBe("入る");

    const fields = findVocabularyFields("addNote", "入る");
    expect(fields.masu_form).toBe("入ります");
    expect(fields.conjugations).toBe("入る, 入ります, 入って, 入らない");
    expect(fields).toMatchSnapshot();
  });

  test("update existing verb vocabulary (入る) fills masu_form", async () => {
    setAnkiResponse("findNotes", [1]);

    const result = await addToAnkiJson({ id: 2480, type: "vocabulary" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.created).toBe(false);

    const fields = findVocabularyFields("updateNoteFields", "入る");
    expect(fields.masu_form).toBe("入ります");
    expect(fields.conjugations).toBe("入る, 入ります, 入って, 入らない");
  });

  test("note type without masu_form returns an error", async () => {
    setModelFields(
      VOCABULARY_MODEL_NAME,
      VOCABULARY_EXPECTED_FIELDS.filter((f) => f !== "masu_form")
    );

    const result = await addToAnkiJson({ id: 2480, type: "vocabulary" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("masu_form");
  });
});
