import type {
  Radical,
  Kanji,
  KanjiReading,
  Vocabulary,
  KanaVocabulary,
  ContextSentence,
  PronunciationAudio,
  AnkiAddResult,
  StudyMaterial,
  LocalStudyMaterial,
  MergedStudyMaterial,
} from "@/model/wanikani.ts";
import {
  getPrimaryMeaning,
  getPrimaryReading,
  getExtraMeanings,
  mergeStudyMaterial,
} from "@/model/subject-utils.ts";
import { getRadicalSvgUrl } from "@/model/radical-utils.ts";
import { getReadingsByType } from "@/model/kanji-utils.ts";
import { selectReadingAudios, getShortestSentence } from "@/model/vocabulary-utils.ts";
import { styleMnemonicHtml } from "@/utils/mnemonic-utils.ts";
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
import { generateSentenceAudio } from "@/server/services/azure-tts.ts";
import { createHash } from "crypto";

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";

type AnkiConnectError = {
  message: string;
  action: string;
  params?: unknown;
};

function createAnkiError(message: string, action: string, params?: unknown): AnkiConnectError {
  return { message, action, params };
}

type RadicalNoteFields = {
  character: string;
  primary_name: string;
  extra_names: string;
  user_synonyms: string;
  mnemonic_text: string;
  mnemonic_image: string;
  note: string;
};

type KanjiNoteFields = {
  character: string;
  radicals: string;
  primary_meaning: string;
  primary_reading: string;
  extra_meanings: string;
  meaning_mnemonic: string;
  meaning_hint: string;
  meaning_note: string;
  readings_onyomi: string;
  readings_kunyomi: string;
  readings_nanori: string;
  reading_mnemonic: string;
  reading_hint: string;
  reading_note: string;
};

type VocabularyNoteFields = {
  characters: string;
  kanji_composition: string;
  primary_meaning: string;
  extra_meanings: string;
  user_synonyms: string;
  word_type: string;
  conjugations: string;
  masu_form: string;
  meaning_explanation: string;
  meaning_note: string;
  reading: string;
  reading_audio_female: string;
  reading_audio_male: string;
  reading_explanation: string;
  reading_note: string;
  sentence_jap: string;
  sentence_jap_furigana: string;
  sentence_jap_audio: string;
  sentence_eng: string;
  sentence_eng_audio: string;
};

async function ankiInvoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch {
    throw createAnkiError("Failed to connect to Anki. Is Anki running?", action, params);
  }

  const data = await response.json();

  if (data.error) {
    console.error(`[Anki] Error from ${action}:`, data.error);
    throw createAnkiError(String(data.error), action, params);
  }

  return data.result as T;
}

async function getDeckId(deckName: string): Promise<number> {
  const decks = await ankiInvoke<Record<string, number>>("deckNamesAndIds");
  const deckId = decks[deckName];
  if (!deckId) {
    throw createAnkiError(`Deck "${deckName}" not found in Anki`, "getDeckId");
  }
  return deckId;
}

async function getModelFieldNames(modelName: string): Promise<string[]> {
  return ankiInvoke<string[]>("modelFieldNames", { modelName });
}

async function validateModelFields(modelName: string, expectedFields: string[]): Promise<void> {
  const actualFields = await getModelFieldNames(modelName);

  const missingFields = expectedFields.filter((f) => !actualFields.includes(f));
  const extraFields = actualFields.filter((f) => !expectedFields.includes(f));

  if (missingFields.length > 0 || extraFields.length > 0) {
    const parts: string[] = [`Note type "${modelName}" has unexpected fields.`];
    if (missingFields.length > 0) {
      parts.push(`Missing: ${missingFields.join(", ")}`);
    }
    if (extraFields.length > 0) {
      parts.push(`Extra: ${extraFields.join(", ")}`);
    }
    throw createAnkiError(parts.join(" "), "validateModelFields");
  }
}

async function storeMediaFile(filename: string, data: string): Promise<void> {
  const sizeKb = ((data.length * 0.75) / 1024).toFixed(1);
  console.log(`[Anki] Storing media: ${filename} (${sizeKb} KB)`);
  await ankiInvoke("storeMediaFile", { filename, data });
}

async function fetchAndStoreSvg(url: string, filename: string): Promise<void> {
  console.log(`[Anki] Downloading SVG: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw createAnkiError(
      `Failed to download SVG (${response.status}): ${url}`,
      "fetchAndStoreSvg"
    );
  }
  const svgText = await response.text();
  const base64 = Buffer.from(svgText, "utf-8").toString("base64");
  await storeMediaFile(filename, base64);
}

async function findNote(
  deckName: string,
  fieldName: string,
  fieldValue: string
): Promise<number | null> {
  const query = `deck:"${deckName}" "${fieldName}:${fieldValue}"`;
  const noteIds = await ankiInvoke<number[]>("findNotes", { query });
  const noteId = noteIds[0] ?? null;
  console.log(
    `[Anki] Find note ${fieldName}="${fieldValue}" — ${noteId ? `found #${noteId}` : "not found"}`
  );
  return noteId;
}

async function addNote<T extends Record<string, string>>(
  deckName: string,
  modelName: string,
  fields: T
): Promise<number> {
  const noteId = await ankiInvoke<number>("addNote", {
    note: {
      deckName,
      modelName,
      fields,
      tags: ["wanikani"],
    },
  });
  console.log(`[Anki] Created note #${noteId} in "${deckName}"`);
  return noteId;
}

async function updateNote<T extends Record<string, string>>(
  noteId: number,
  fields: T
): Promise<void> {
  await ankiInvoke("updateNoteFields", {
    note: { id: noteId, fields },
  });
  console.log(`[Anki] Updated note #${noteId}`);
}

async function addOrUpdateNote<T extends Record<string, string>>(
  deckName: string,
  modelName: string,
  fields: T,
  lookupField: { name: string; value: string }
): Promise<{ created: boolean; noteId: number }> {
  const existingNoteId = await findNote(deckName, lookupField.name, lookupField.value);

  if (existingNoteId) {
    await updateNote(existingNoteId, fields);
    return { created: false, noteId: existingNoteId };
  }

  const noteId = await addNote(deckName, modelName, fields);
  return { created: true, noteId };
}

// === Deck Notes ===

export type AnkiDeckType = "radical" | "kanji" | "vocabulary";

type DeckNoteInfo = { characters: string; meaning: string };

const DECK_NOTE_CONFIG: Record<
  AnkiDeckType,
  { deckName: string; charactersField: string; meaningField: string }
> = {
  radical: {
    deckName: RADICAL_DECK_NAME,
    charactersField: "primary_name",
    meaningField: "primary_name",
  },
  kanji: {
    deckName: KANJI_DECK_NAME,
    charactersField: "character",
    meaningField: "primary_meaning",
  },
  vocabulary: {
    deckName: VOCABULARY_DECK_NAME,
    charactersField: "characters",
    meaningField: "primary_meaning",
  },
};

export async function getDeckNotes(type: AnkiDeckType): Promise<DeckNoteInfo[]> {
  const config = DECK_NOTE_CONFIG[type];

  const noteIds = await ankiInvoke<number[]>("findNotes", {
    query: `deck:"${config.deckName}"`,
  });
  console.log(`[Anki] Found ${noteIds.length} notes in "${config.deckName}"`);

  if (noteIds.length === 0) return [];

  const notesInfo = await ankiInvoke<
    Array<{ noteId: number; fields: Record<string, { value: string }> }>
  >("notesInfo", { notes: noteIds });

  return notesInfo.map((note) => ({
    characters: note.fields[config.charactersField]?.value ?? "",
    meaning: note.fields[config.meaningField]?.value ?? "",
  }));
}

// === Sync ===

export async function syncAnkiWeb(): Promise<void> {
  console.log("[Anki] Syncing with AnkiWeb...");
  await ankiInvoke("sync");
}

// === Study material ===

/**
 * Anki renders a note field as HTML, and the notes and synonyms are plain text the user wrote.
 * Without this a note like "use < for the smaller one" loses everything after the `<`.
 */
function mergeStudyMaterialForAnki(
  wanikani: StudyMaterial | null,
  local: LocalStudyMaterial | null
): MergedStudyMaterial {
  const merged = mergeStudyMaterial(wanikani, local);
  return {
    meaningNote: escapeHtml(merged.meaningNote),
    readingNote: escapeHtml(merged.readingNote),
    meaningSynonyms: merged.meaningSynonyms.map(escapeHtml),
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// === Radical ===

function buildRadicalNoteFields(radical: Radical, storedSvgFilename?: string): RadicalNoteFields {
  const primaryMeaning = getPrimaryMeaning(radical.meanings);
  const studyMaterial = mergeStudyMaterialForAnki(
    radical.studyMaterial,
    radical.localStudyMaterial
  );

  const character =
    radical.characters ?? (storedSvgFilename ? `<img src="${storedSvgFilename}">` : primaryMeaning);

  return {
    character,
    primary_name: primaryMeaning,
    extra_names: getExtraMeanings(radical.meanings),
    user_synonyms: studyMaterial.meaningSynonyms.join(", "),
    mnemonic_text: styleMnemonicHtml(radical.meaningMnemonic),
    mnemonic_image: radical.mnemonicImageUrl ?? "",
    note: studyMaterial.meaningNote,
  };
}

async function addOrUpdateRadicalCore(
  radical: Radical
): Promise<{ created: boolean; noteId: number; name: string }> {
  const primaryMeaning = getPrimaryMeaning(radical.meanings);
  console.log(`[Anki] Processing radical: ${radical.characters ?? primaryMeaning}`);

  await validateModelFields(RADICAL_MODEL_NAME, RADICAL_EXPECTED_FIELDS);

  let storedSvgFilename: string | undefined;

  if (!radical.characters) {
    const svgUrl = getRadicalSvgUrl(radical);
    if (svgUrl) {
      const deckId = await getDeckId(RADICAL_DECK_NAME);
      storedSvgFilename = `${deckId}_${radical.slug}.svg`;
      await fetchAndStoreSvg(svgUrl, storedSvgFilename);
    }
  }

  const fields = buildRadicalNoteFields(radical, storedSvgFilename);

  const result = await addOrUpdateNote(RADICAL_DECK_NAME, RADICAL_MODEL_NAME, fields, {
    name: "primary_name",
    value: primaryMeaning,
  });
  console.log(`[Anki] Radical "${primaryMeaning}" — ${result.created ? "created" : "updated"}`);
  return { ...result, name: primaryMeaning };
}

export async function addOrUpdateRadical(radical: Radical): Promise<AnkiAddResult> {
  const result = await addOrUpdateRadicalCore(radical);
  return {
    subject: { name: result.name, characters: radical.characters, created: result.created },
    kanji: [],
    radicals: [],
  };
}

// === Kanji ===

function formatReadingsHtml(readings: KanjiReading[], type: KanjiReading["type"]): string {
  const filtered = getReadingsByType(readings, type);
  if (filtered.length === 0) return "";
  return filtered.map((r) => (r.primary ? `<b>${r.reading}</b>` : r.reading)).join(", ");
}

async function buildRadicalsHtml(componentRadicals: Radical[]): Promise<string> {
  const deckId = await getDeckId(KANJI_DECK_NAME);

  const items = await Promise.all(
    componentRadicals.map(async (radical) => {
      const name = getPrimaryMeaning(radical.meanings);

      let characterHtml: string;
      if (radical.characters) {
        characterHtml = radical.characters;
      } else {
        const svgUrl = getRadicalSvgUrl(radical);
        if (svgUrl) {
          const filename = `${deckId}_${radical.slug}.svg`;
          await fetchAndStoreSvg(svgUrl, filename);
          characterHtml = `<img src="${filename}" class="radical-img">`;
        } else {
          characterHtml = name;
        }
      }

      return `<span class="radical-item"><span class="radical-badge">${characterHtml}</span> ${name}</span>`;
    })
  );

  return items.join(" + ");
}

async function buildKanjiNoteFields(kanji: Kanji): Promise<KanjiNoteFields> {
  const radicalsHtml = await buildRadicalsHtml(kanji.componentRadicals);
  const studyMaterial = mergeStudyMaterialForAnki(kanji.studyMaterial, kanji.localStudyMaterial);

  return {
    character: kanji.characters,
    radicals: radicalsHtml,
    primary_meaning: getPrimaryMeaning(kanji.meanings),
    primary_reading: getPrimaryReading(kanji.readings),
    extra_meanings: getExtraMeanings(kanji.meanings),
    meaning_mnemonic: styleMnemonicHtml(kanji.meaningMnemonic),
    meaning_hint: styleMnemonicHtml(kanji.meaningHint),
    meaning_note: studyMaterial.meaningNote,
    readings_onyomi: formatReadingsHtml(kanji.readings, "onyomi"),
    readings_kunyomi: formatReadingsHtml(kanji.readings, "kunyomi"),
    readings_nanori: formatReadingsHtml(kanji.readings, "nanori"),
    reading_mnemonic: styleMnemonicHtml(kanji.readingMnemonic),
    reading_hint: styleMnemonicHtml(kanji.readingHint),
    reading_note: studyMaterial.readingNote,
  };
}

async function addOrUpdateKanjiCore(
  kanji: Kanji
): Promise<{ created: boolean; noteId: number; character: string }> {
  const character = kanji.characters;
  console.log(`[Anki] Processing kanji: ${character}`);

  await validateModelFields(KANJI_MODEL_NAME, KANJI_EXPECTED_FIELDS);

  const fields = await buildKanjiNoteFields(kanji);

  const result = await addOrUpdateNote(KANJI_DECK_NAME, KANJI_MODEL_NAME, fields, {
    name: "character",
    value: character,
  });
  console.log(`[Anki] Kanji "${character}" — ${result.created ? "created" : "updated"}`);
  return { ...result, character };
}

export async function addKanjiWithRadicals(kanji: Kanji): Promise<AnkiAddResult> {
  const radicalCount = kanji.componentRadicals.length;
  console.log(`[Anki] Adding kanji ${kanji.characters} with ${radicalCount} radical(s)`);

  const radicalResults: AnkiAddResult["radicals"] = [];

  for (const radical of kanji.componentRadicals) {
    const result = await addOrUpdateRadicalCore(radical);
    radicalResults.push({ name: result.name, created: result.created });
  }

  const kanjiResult = await addOrUpdateKanjiCore(kanji);

  return {
    subject: {
      name: getPrimaryMeaning(kanji.meanings),
      characters: kanji.characters,
      created: kanjiResult.created,
    },
    kanji: [{ character: kanjiResult.character, created: kanjiResult.created }],
    radicals: radicalResults,
  };
}

// === Vocabulary ===

async function storeAudioData(filename: string, audio: ArrayBuffer): Promise<void> {
  const base64 = Buffer.from(audio).toString("base64");
  await storeMediaFile(filename, base64);
}

async function fetchAndStoreAudio(url: string, filename: string): Promise<void> {
  console.log(`[Anki] Downloading audio: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw createAnkiError(
      `Failed to download audio (${response.status}): ${url}`,
      "fetchAndStoreAudio"
    );
  }
  const audio = await response.arrayBuffer();
  await storeAudioData(filename, audio);
}

function shortHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 8);
}

function buildKanjiCompositionHtml(componentKanji: Kanji[]): string {
  if (componentKanji.length === 0) return "";

  const items = componentKanji.map((kanjiItem) => {
    const character = kanjiItem.characters;
    const meaning = getPrimaryMeaning(kanjiItem.meanings);
    return `<span class="kanji-item"><span class="kanji-badge">${character}</span> ${meaning}</span>`;
  });

  return items.join(" + ");
}

function getComponentKanji(vocabulary: Vocabulary | KanaVocabulary): Kanji[] {
  return vocabulary.object === "vocabulary" ? (vocabulary as Vocabulary).componentKanji : [];
}

function pickReadingAudios(
  vocabulary: Vocabulary | KanaVocabulary,
  preferredGender: "male" | "female"
): { gender: "male" | "female"; readingAudios: PronunciationAudio[] } {
  const readings =
    vocabulary.object === "vocabulary" ? vocabulary.readings.map((r) => r.reading) : [];
  const genders: Array<"male" | "female"> = [
    preferredGender,
    preferredGender === "male" ? "female" : "male",
  ];
  for (const gender of genders) {
    const readingAudios = selectReadingAudios({
      audios: vocabulary.pronunciationAudios,
      readings,
      gender,
    });
    if (readingAudios.length > 0) return { gender, readingAudios };
  }
  return { gender: preferredGender, readingAudios: [] };
}

function buildVocabularyNoteFields(params: {
  vocabulary: Vocabulary | KanaVocabulary;
  componentKanji: Kanji[];
  readingAudioTags: { female: string; male: string };
  shortestSentence: ContextSentence | null;
  sentenceAudioFilename: string;
}): VocabularyNoteFields {
  const { vocabulary, componentKanji, readingAudioTags, shortestSentence, sentenceAudioFilename } =
    params;

  const isRegularVocab = vocabulary.object === "vocabulary";
  const vocabData = isRegularVocab ? (vocabulary as Vocabulary) : null;

  const kanjiCompositionHtml = buildKanjiCompositionHtml(componentKanji);
  const studyMaterial = mergeStudyMaterialForAnki(
    vocabulary.studyMaterial,
    vocabulary.localStudyMaterial
  );

  const conjugations = vocabData?.conjugations;
  const conjugationsStr = conjugations
    ? `${conjugations.dictionary}, ${conjugations.masu}, ${conjugations.te}, ${conjugations.nai}`
    : "";

  return {
    characters: vocabulary.characters,
    kanji_composition: kanjiCompositionHtml,
    primary_meaning: getPrimaryMeaning(vocabulary.meanings),
    extra_meanings: getExtraMeanings(vocabulary.meanings),
    user_synonyms: studyMaterial.meaningSynonyms.join(", "),
    word_type: vocabulary.partsOfSpeech.join(", "),
    conjugations: conjugationsStr,
    masu_form: conjugations?.masu ?? "",
    meaning_explanation: styleMnemonicHtml(vocabulary.meaningMnemonic),
    meaning_note: studyMaterial.meaningNote,
    reading: vocabData ? getPrimaryReading(vocabData.readings) : "",
    reading_audio_female: readingAudioTags.female,
    reading_audio_male: readingAudioTags.male,
    reading_explanation: vocabData ? styleMnemonicHtml(vocabData.readingMnemonic) : "",
    reading_note: studyMaterial.readingNote,
    sentence_jap: shortestSentence?.ja ?? "",
    sentence_jap_furigana: shortestSentence?.reading ?? "",
    sentence_jap_audio: sentenceAudioFilename ? `[sound:${sentenceAudioFilename}]` : "",
    sentence_eng: shortestSentence?.en ?? "",
    sentence_eng_audio: "",
  };
}

async function addOrUpdateVocabularyCore(
  vocabulary: Vocabulary | KanaVocabulary
): Promise<{ created: boolean; noteId: number; characters: string }> {
  const characters = vocabulary.characters;
  console.log(`[Anki] Processing vocabulary: ${characters}`);

  await validateModelFields(VOCABULARY_MODEL_NAME, VOCABULARY_EXPECTED_FIELDS);

  const deckId = await getDeckId(VOCABULARY_DECK_NAME);
  const slug = vocabulary.slug;
  // Anki auto-plays every [sound:] tag on the card back, so only one gender is
  // filled. All readings of it are kept: 平壌 needs both ぴょんやん and へいじょう.
  const preferredGender = Math.random() < 0.5 ? "male" : "female";
  const { gender, readingAudios } = pickReadingAudios(vocabulary, preferredGender);

  const readingAudioTags = { female: "", male: "" };

  if (readingAudios.length === 0) {
    console.log(`[Anki] No audio available for ${characters}`);
  }
  const soundTags: string[] = [];
  for (const audio of readingAudios) {
    const filename = `${deckId}_${slug}_${gender}_${shortHash(audio.metadata.pronunciation)}.mp3`;
    await fetchAndStoreAudio(audio.url, filename);
    soundTags.push(`[sound:${filename}]`);
  }
  readingAudioTags[gender] = soundTags.join(" ");

  let sentenceAudioFilename = "";
  const shortestSentence = getShortestSentence(vocabulary.contextSentences);
  if (shortestSentence) {
    // The Dragon HD voice is on trial to read the kanji itself. The generated
    // kana reading only fills the furigana field.
    const sentenceAudio = await generateSentenceAudio(shortestSentence.ja);
    if (sentenceAudio) {
      sentenceAudioFilename = `${deckId}_${slug}_sentence.mp3`;
      await storeAudioData(sentenceAudioFilename, sentenceAudio);
    }
  }

  const fields = buildVocabularyNoteFields({
    vocabulary,
    componentKanji: getComponentKanji(vocabulary),
    readingAudioTags,
    shortestSentence,
    sentenceAudioFilename,
  });

  const result = await addOrUpdateNote(VOCABULARY_DECK_NAME, VOCABULARY_MODEL_NAME, fields, {
    name: "characters",
    value: characters,
  });
  console.log(`[Anki] Vocabulary "${characters}" — ${result.created ? "created" : "updated"}`);
  return { ...result, characters };
}

export async function addVocabularyWithKanjiAndRadicals(
  vocabulary: Vocabulary | KanaVocabulary
): Promise<AnkiAddResult> {
  const componentKanji = getComponentKanji(vocabulary);
  console.log(
    `[Anki] Adding vocabulary ${vocabulary.characters} with ${componentKanji.length} kanji`
  );

  const uniqueRadicals = new Map(
    componentKanji.flatMap((k) => k.componentRadicals).map((r) => [r.id, r])
  );

  const radicalResults: AnkiAddResult["radicals"] = [];
  for (const radical of uniqueRadicals.values()) {
    const result = await addOrUpdateRadicalCore(radical);
    radicalResults.push({ name: result.name, created: result.created });
  }

  const kanjiResults: AnkiAddResult["kanji"] = [];
  for (const kanjiItem of componentKanji) {
    const kanjiResult = await addOrUpdateKanjiCore(kanjiItem);
    kanjiResults.push({ character: kanjiResult.character, created: kanjiResult.created });
  }

  const vocabResult = await addOrUpdateVocabularyCore(vocabulary);

  return {
    subject: {
      name: getPrimaryMeaning(vocabulary.meanings),
      characters: vocabulary.characters,
      created: vocabResult.created,
    },
    kanji: kanjiResults,
    radicals: radicalResults,
  };
}
