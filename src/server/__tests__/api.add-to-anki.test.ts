import { describe, test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { localStudyMaterials, setLocalStudyMaterials } from "@server/repository/data-loader.ts";
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

type AddBody = { id: number; type: string; sync?: boolean };

async function addToAnki(body: AddBody) {
  return api.request("/add-to-anki", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function addToAnkiJson(body: AddBody) {
  return (await addToAnki(body)).json();
}

/** The vocabulary note type holds the word in `characters`, the radical one in `character`. */
function findNoteFields(params: {
  action: string;
  field: "characters" | "character";
  value: string;
}): Record<string, string> {
  const { action, field, value } = params;
  const call = ankiCalls.find((c) => {
    if (c.action !== action) return false;
    const note = c.params.note as { fields?: Record<string, string> } | undefined;
    return note?.fields?.[field] === value;
  });
  if (!call) throw new Error(`No ${action} call for ${value}`);
  return (call.params.note as { fields: Record<string, string> }).fields;
}

function findVocabularyFields(action: string, characters: string): Record<string, string> {
  return findNoteFields({ action, field: "characters", value: characters });
}

function storedAudioFilenames(): string[] {
  return ankiCalls
    .filter((c) => c.action === "storeMediaFile")
    .map((c) => String(c.params.filename))
    .filter((name) => name.endsWith(".mp3"));
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
    const fields = findNoteFields({ action: "addNote", field: "character", value: "一" });
    expect(fields.note).toBe("One flat line on the ground");
    expect(fields.user_synonyms).toBe("flat ground");

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

  test("add kana vocabulary (ここ, id=9209) under type vocabulary", async () => {
    const result = await addToAnkiJson({ id: 9209, type: "vocabulary" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.characters).toBe("ここ");
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

  test("add vocabulary with two readings (平壌, id=7973) stores one audio per reading", async () => {
    const result = await addToAnkiJson({ id: 7973, type: "vocabulary" });
    expect(result.ok).toBe(true);

    const fields = findVocabularyFields("addNote", "平壌");
    expect([fields.reading_audio_female, fields.reading_audio_male]).toMatchInlineSnapshot(`
      [
        "",
        "[sound:1003_平壌_male_3af1ead2.mp3] [sound:1003_平壌_male_d10a9de1.mp3]",
      ]
    `);
    expect(storedAudioFilenames()).toMatchInlineSnapshot(`
      [
        "1003_平壌_male_3af1ead2.mp3",
        "1003_平壌_male_d10a9de1.mp3",
        "1003_平壌_sentence.mp3",
      ]
    `);
  });

  test("add vocabulary with audio for one gender only (実る, id=9348) uses that gender", async () => {
    const result = await addToAnkiJson({ id: 9348, type: "vocabulary" });
    expect(result.ok).toBe(true);

    const fields = findVocabularyFields("addNote", "実る");
    expect(fields.reading_audio_male).toBe("");
    expect(fields.reading_audio_female).toMatchInlineSnapshot(
      `"[sound:1003_実る_female_ccee5ce3.mp3]"`
    );
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

  test("add with a non-boolean sync returns 400", async () => {
    const response = await addToAnki({ id: 1, type: "radical", sync: "false" as never });
    expect(response.status).toBe(400);
    expect(ankiCalls).toEqual([]);
  });

  test("add with sync:false skips the AnkiWeb sync", async () => {
    const result = await addToAnkiJson({ id: 1, type: "radical", sync: false });
    expect(result.ok).toBe(true);
    expect(ankiCalls.map((c) => c.action)).not.toContain("sync");
  });

  test("anki-sync syncs to AnkiWeb once", async () => {
    const response = await api.request("/anki-sync", { method: "POST" });
    expect(await response.json()).toEqual({ ok: true });
    expect(ankiCalls.map((c) => c.action)).toEqual(["sync"]);
  });
});

describe("HTML in a local note", () => {
  let original: Record<string, LocalStudyMaterial>;

  beforeEach(() => {
    original = structuredClone(localStudyMaterials);
    setLocalStudyMaterials({
      ...original,
      "1": {
        meaning_note: "use < for the smaller one & > for the bigger",
        meaning_synonyms: ["a & b", "c < d"],
      },
      "958": { meaning_note: "night & day", reading_note: "ban < bang" },
    });
  });

  afterEach(() => setLocalStudyMaterials(original));

  test("a radical note and its synonyms reach Anki escaped", async () => {
    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(true);

    const fields = findNoteFields({ action: "addNote", field: "character", value: "一" });
    expect(fields.note).toBe("use &lt; for the smaller one &amp; &gt; for the bigger");
    expect(fields.user_synonyms).toBe("a &amp; b, c &lt; d");
  });

  test("a kanji note reaches Anki escaped", async () => {
    const result = await addToAnkiJson({ id: 958, type: "kanji" });
    expect(result.ok).toBe(true);

    const fields = findNoteFields({ action: "addNote", field: "character", value: "晩" });
    expect(fields.meaning_note).toBe("night &amp; day");
    expect(fields.reading_note).toBe("ban &lt; bang");
  });

  test("a vocabulary note and its synonyms reach Anki escaped", async () => {
    setLocalStudyMaterials({
      ...original,
      "3766": { meaning_note: "every evening & night", meaning_synonyms: ["a < b"] },
    });

    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(true);

    const fields = findVocabularyFields("addNote", "毎晩");
    expect(fields.meaning_note).toBe("every evening &amp; night");
    expect(fields.user_synonyms).toBe("a &lt; b");
  });
});
