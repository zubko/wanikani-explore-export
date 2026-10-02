import { describe, test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import {
  setStudyMaterialFile,
  studyMaterialFixture as fixture,
} from "@/test/study-material-fixture.ts";
import {
  installFetchInterceptor,
  resetFetchInterceptor,
  ankiCalls,
  externalFetches,
  setAnkiError,
  setAnkiResponse,
  setMediaContentType,
  setMediaStatus,
  setModelFields,
} from "@/test/fetch-interceptor.ts";
import { ensureRepositoryInitialized, resetFsMock, writeCalls } from "@/test/preload.ts";
import { VOCABULARY_MODEL_NAME, VOCABULARY_EXPECTED_FIELDS } from "@/model/anki-models.ts";
import { getRadicalSvgUrl } from "@/model/radical-utils.ts";
import { vocabulary as vocabularyData } from "@server/repository/data-loader.ts";
import { MEDIA_ROOT_PATH, MNEMONIC_IMAGES_PATH } from "@server/repository/data-paths.ts";
import { getRadical } from "@server/repository/radical.ts";
import { getVocabulary } from "@server/repository/vocabulary.ts";
import { api } from "../api.ts";

installFetchInterceptor();
beforeAll(ensureRepositoryInitialized);
// An add writes media files and registry lines, which must not reach the next test or file
beforeEach(() => {
  resetFetchInterceptor();
  resetFsMock();
});
afterEach(resetFsMock);

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

function storedMediaFilenames(): string[] {
  return ankiCalls
    .filter((c) => c.action === "storeMediaFile")
    .map((c) => String(c.params.filename));
}

/** The name and the base64 bytes of every file sent to Anki. */
function storedMedia(): { filename: unknown; data: unknown }[] {
  return ankiCalls
    .filter((c) => c.action === "storeMediaFile")
    .map((c) => ({ filename: c.params.filename, data: c.params.data }));
}

function storedAudioFilenames(): string[] {
  return storedMediaFilenames().filter((name) => name.endsWith(".mp3"));
}

function cachedMediaPaths(): string[] {
  return writeCalls.map((call) => call.path).filter((path) => path.startsWith(MEDIA_ROOT_PATH));
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

  test("a hidden subject returns 404 (昌, id=2285)", async () => {
    const response = await addToAnki({ id: 2285, type: "kanji" });
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
        "1003_平壌_b85cd9d7.mp3",
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

  test("failed audio download returns error and caches nothing", async () => {
    const vocabulary = await getVocabulary(3766);
    const audioUrls = vocabulary?.pronunciationAudios.map((audio) => audio.url);
    setMediaStatus(404);
    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(false);
    const failedUrl = externalFetches.at(-1);
    expect(audioUrls).toContain(failedUrl);
    expect(result.error).toBe(`Failed to download media (404): ${failedUrl}`);
    expect(cachedMediaPaths()).toEqual([]);
  });

  test("failed SVG download returns error and caches nothing", async () => {
    const radical = await getRadical(8766);
    const svgUrl = radical && getRadicalSvgUrl(radical);
    setMediaStatus(500);
    const result = await addToAnkiJson({ id: 8766, type: "radical" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(`Failed to download media (500): ${svgUrl}`);
    expect(cachedMediaPaths()).toEqual([]);
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
    expect(fields.alternative_meanings).toMatchInlineSnapshot(`"To Go In"`);
  });

  test("note type without masu_form returns a field mismatch", async () => {
    setModelFields(
      VOCABULARY_MODEL_NAME,
      VOCABULARY_EXPECTED_FIELDS.filter((f) => f !== "masu_form")
    );

    const result = await addToAnkiJson({ id: 2480, type: "vocabulary" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("masu_form");
    expect(result.reason).toBe("fields");
  });

  test("an error that is no field mismatch has no reason", async () => {
    setMediaStatus(404);
    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeUndefined();
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

  test("a failed sync before the add writes nothing", async () => {
    setAnkiError({ action: "sync", message: "Sync status 2 not one of [0, 1]" });
    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Sync status 2");
    expect(ankiCalls.map((c) => c.action)).toEqual(["sync"]);
  });

  test("a failed sync after the write answers ok:false, the note is written", async () => {
    setAnkiError({ action: "sync", message: "auth not configured", onCall: 2 });
    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("auth not configured");
    const actions = ankiCalls.map((c) => c.action);
    expect(actions).toContain("addNote");
    expect(actions.filter((action) => action === "sync")).toHaveLength(2);
  });

  test("anki-sync syncs to AnkiWeb once", async () => {
    const response = await api.request("/anki-sync", { method: "POST" });
    expect(await response.json()).toEqual({ ok: true });
    expect(ankiCalls.map((c) => c.action)).toEqual(["sync"]);
  });

  test("anki-sync answers the AnkiConnect error", async () => {
    setAnkiError({ action: "sync", message: "auth not configured" });
    const response = await api.request("/anki-sync", { method: "POST" });
    expect(await response.json()).toEqual({ ok: false, error: "auth not configured" });
  });
});

describe("media cache", () => {
  test("a radical add stores the mnemonic picture as an <img> tag (一)", async () => {
    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(true);

    const [ankiFilename] = storedMediaFilenames();
    expect(storedMediaFilenames()).toMatchInlineSnapshot(`
      [
        "1001_ground_mnemonic_f09eea31.svg",
      ]
    `);
    expect(cachedMediaPaths()).toMatchInlineSnapshot(`
      [
        "./data/userdata/media/mnemonics/ground_mnemonic_f09eea31.svg",
      ]
    `);
    const fields = findNoteFields({ action: "addNote", field: "character", value: "一" });
    expect(fields.mnemonic_image).toBe(`<img src="${ankiFilename}" class="mnemonic-img">`);
  });

  test("a second radical add reads the mnemonic picture from disk (一)", async () => {
    await addToAnkiJson({ id: 1, type: "radical" });
    const firstStored = storedMedia();
    resetFetchInterceptor();

    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(true);
    expect(externalFetches).toEqual([]);
    expect(storedMedia()).toEqual(firstStored);
  });

  test("a picture answered as PNG is cached and stored as .png (一)", async () => {
    setMediaContentType("image/png");

    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(true);

    expect(cachedMediaPaths()).toEqual([
      `${MEDIA_ROOT_PATH}/mnemonics/ground_mnemonic_f09eea31.png`,
    ]);
    const fields = findNoteFields({ action: "addNote", field: "character", value: "一" });
    expect(fields.mnemonic_image).toBe(
      `<img src="1001_ground_mnemonic_f09eea31.png" class="mnemonic-img">`
    );
  });

  test("a failed picture download fails the add, names the registry and caches nothing (一)", async () => {
    const radical = await getRadical(1);
    setMediaStatus(404);

    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      `Failed to download media (404): ${radical?.mnemonicImageUrl}. It is the mnemonic picture of ${radical?.documentUrl}. To scrape that page again, delete its line in ${MNEMONIC_IMAGES_PATH}`
    );
    expect(cachedMediaPaths()).toEqual([]);
    expect(ankiCalls.map((c) => c.action)).not.toContain("addNote");
  });

  test("a picture with an unknown content type fails the add with its URL (一)", async () => {
    const radical = await getRadical(1);
    setMediaContentType("text/html");

    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(false);
    expect(result.error).toStartWith(
      `Unknown media content type (text/html): ${radical?.mnemonicImageUrl}. It is the mnemonic picture of`
    );
    expect(cachedMediaPaths()).toEqual([]);
  });

  test("a picture with no content type fails the add (一)", async () => {
    setMediaContentType(null);

    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(false);
    expect(result.error).toStartWith("Unknown media content type (null)");
    expect(cachedMediaPaths()).toEqual([]);
  });

  test("a second radical add reads the SVG from disk (8766)", async () => {
    await addToAnkiJson({ id: 8766, type: "radical" });
    expect(cachedMediaPaths()).toMatchInlineSnapshot(`
      [
        "./data/userdata/media/radicals/beggar_ee00622d.svg",
      ]
    `);
    const firstStored = storedMedia();
    resetFetchInterceptor();

    const result = await addToAnkiJson({ id: 8766, type: "radical" });
    expect(result.ok).toBe(true);
    expect(externalFetches).toEqual([]);
    expect(storedMedia()).toEqual(firstStored);
    const [ankiFilename] = storedMediaFilenames();
    expect(storedMediaFilenames()).toMatchInlineSnapshot(`
      [
        "1001_beggar_ee00622d.svg",
      ]
    `);
    const fields = findNoteFields({
      action: "addNote",
      field: "character",
      value: `<img src="${ankiFilename}">`,
    });
    expect(fields.primary_name).toBe("Beggar");
  });

  test("a second kanji add reads every file from disk (写)", async () => {
    const first = await addToAnkiJson({ id: 531, type: "kanji" });
    expect(first.ok).toBe(true);
    expect(cachedMediaPaths()).toMatchInlineSnapshot(`
      [
        "./data/userdata/media/radicals/beggar_ee00622d.svg",
        "./data/userdata/media/mnemonics/ground_mnemonic_f09eea31.svg",
      ]
    `);
    expect(storedMediaFilenames()).toMatchInlineSnapshot(`
      [
        "1001_beggar_ee00622d.svg",
        "1001_ground_mnemonic_f09eea31.svg",
        "1002_beggar_ee00622d.svg",
      ]
    `);
    const firstStored = storedMedia();
    resetFetchInterceptor();

    const result = await addToAnkiJson({ id: 531, type: "kanji" });
    expect(result.ok).toBe(true);
    expect(externalFetches).toEqual([]);
    expect(storedMedia()).toEqual(firstStored);
  });
});

describe("media cache for a word", () => {
  test("an add caches the reading clips and the sentence clip with no deck id (毎晩)", async () => {
    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(true);

    expect(cachedMediaPaths()).toMatchInlineSnapshot(`
      [
        "./data/userdata/media/readings/毎晩_female_a03eecb8.mp3",
        "./data/userdata/media/sentences/毎晩_982a186a.mp3",
      ]
    `);
    expect(storedAudioFilenames()).toMatchInlineSnapshot(`
      [
        "1003_毎晩_female_a03eecb8.mp3",
        "1003_毎晩_982a186a.mp3",
      ]
    `);
    const fields = findVocabularyFields("addNote", "毎晩");
    expect(fields.sentence_jap_audio).toMatch(/^\[sound:1003_毎晩_[0-9a-f]{8}\.mp3\]$/);
  });

  test("a second add reads every clip from disk (毎晩)", async () => {
    await addToAnkiJson({ id: 3766, type: "vocabulary" });
    const firstStored = storedMedia();
    const firstFields = findVocabularyFields("addNote", "毎晩");
    resetFetchInterceptor();

    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(true);
    expect(externalFetches).toEqual([]);
    expect(storedMedia()).toEqual(firstStored);
    const fields = findVocabularyFields("addNote", "毎晩");
    expect(fields.reading_audio_female).toBe(firstFields.reading_audio_female);
    expect(fields.reading_audio_male).toBe(firstFields.reading_audio_male);
    expect(fields.sentence_jap_audio).toBe(firstFields.sentence_jap_audio);
  });

  test("a missing Azure value fails the add before any note or file is written", async () => {
    const key = process.env.AZURE_TTS_KEY;
    delete process.env.AZURE_TTS_KEY;
    try {
      const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Missing AZURE_TTS_KEY in the root env file");
      expect(ankiCalls.map((c) => c.action)).toEqual(["sync"]);
      expect(cachedMediaPaths()).toEqual([]);
    } finally {
      process.env.AZURE_TTS_KEY = key;
    }
  });

  test("a word with no context sentence gets no sentence clip (毎晩)", async () => {
    const data = vocabularyData.find((item) => item.id === 3766)!.data;
    const sentences = data.context_sentences;
    data.context_sentences = [];
    try {
      const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
      expect(result.ok).toBe(true);

      const fields = findVocabularyFields("addNote", "毎晩");
      expect(fields.sentence_jap).toBe("");
      expect(fields.sentence_jap_audio).toBe("");
      expect(externalFetches.some((url) => url.includes(".tts.speech.microsoft.com"))).toBe(false);
      expect(cachedMediaPaths().some((path) => path.includes("/sentences/"))).toBe(false);
    } finally {
      data.context_sentences = sentences;
    }
  });
});

describe("alternative_meanings", () => {
  test("a local synonym equal to a WaniKani meaning is listed once (毎晩)", async () => {
    setStudyMaterialFile({ ...fixture, "3766": { meaning_synonyms: ["nightly", "Nights"] } });

    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(true);

    const fields = findVocabularyFields("addNote", "毎晩");
    expect([fields.user_synonyms, fields.alternative_meanings]).toMatchInlineSnapshot(`
      [
        "nightly, Nights",
        "Nightly, Nights",
      ]
    `);
  });

  test("WaniKani and local synonyms are joined, a case variant is listed once (アメリカ人)", async () => {
    setStudyMaterialFile({ ...fixture, "2478": { meaning_synonyms: ["USA Person", "yankee"] } });

    const result = await addToAnkiJson({ id: 2478, type: "vocabulary" });
    expect(result.ok).toBe(true);

    const fields = findVocabularyFields("addNote", "アメリカ人");
    expect([fields.user_synonyms, fields.alternative_meanings]).toMatchInlineSnapshot(`
      [
        "usa person, USA Person, yankee",
        "Person From The USA, usa person, yankee",
      ]
    `);
  });

  test("an updated kanji note gets its synonyms (晩)", async () => {
    setAnkiResponse("findNotes", [1]);
    setStudyMaterialFile({ ...fixture, "958": { meaning_synonyms: ["dusk"] } });

    const result = await addToAnkiJson({ id: 958, type: "kanji" });
    expect(result.ok).toBe(true);
    expect(result.data.subject.created).toBe(false);

    const fields = findNoteFields({ action: "updateNoteFields", field: "character", value: "晩" });
    expect([fields.user_synonyms, fields.alternative_meanings]).toMatchInlineSnapshot(`
      [
        "dusk",
        "Evening, dusk",
      ]
    `);
  });
});

describe("HTML in a local note", () => {
  beforeEach(() => {
    setStudyMaterialFile({
      ...fixture,
      "1": {
        meaning_note: "use < for the smaller one & > for the bigger",
        meaning_synonyms: ["a & b", "c < d"],
      },
      "958": {
        meaning_note: "night & day",
        reading_note: "ban < bang",
        meaning_synonyms: ["dusk & dark", "x < y"],
      },
    });
  });

  test("a radical note and its synonyms reach Anki escaped", async () => {
    const result = await addToAnkiJson({ id: 1, type: "radical" });
    expect(result.ok).toBe(true);

    const fields = findNoteFields({ action: "addNote", field: "character", value: "一" });
    expect(fields.note).toBe("use &lt; for the smaller one &amp; &gt; for the bigger");
    expect(fields.user_synonyms).toBe("a &amp; b, c &lt; d");
  });

  test("a kanji note and its synonyms reach Anki escaped", async () => {
    const result = await addToAnkiJson({ id: 958, type: "kanji" });
    expect(result.ok).toBe(true);

    const fields = findNoteFields({ action: "addNote", field: "character", value: "晩" });
    expect(fields.meaning_note).toBe("night &amp; day");
    expect(fields.reading_note).toBe("ban &lt; bang");
    expect(fields.user_synonyms).toBe("dusk &amp; dark, x &lt; y");
    expect(fields.alternative_meanings).toMatchInlineSnapshot(
      `"Evening, dusk &amp; dark, x &lt; y"`
    );
  });

  test("a vocabulary note and its synonyms reach Anki escaped", async () => {
    setStudyMaterialFile({
      ...fixture,
      "3766": { meaning_note: "every evening & night", meaning_synonyms: ["a < b"] },
    });

    const result = await addToAnkiJson({ id: 3766, type: "vocabulary" });
    expect(result.ok).toBe(true);

    const fields = findVocabularyFields("addNote", "毎晩");
    expect(fields.meaning_note).toBe("every evening &amp; night");
    expect(fields.user_synonyms).toBe("a &lt; b");
    expect(fields.alternative_meanings).toMatchInlineSnapshot(`"Nightly, a &lt; b"`);
  });
});
