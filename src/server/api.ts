import { Hono } from "hono";
import { isSubjectType } from "@/model/wanikani.ts";
import type {
  AnkiAddResult,
  AnkiNoteItem,
  Kanji,
  KanaVocabulary,
  Radical,
  SubjectType,
  Vocabulary,
} from "@/model/wanikani.ts";

import { getRadical, findRadicalByCharacters, findRadicalByName } from "./repository/radical.ts";
import { getKanji, findKanjiByCharacters, findKanjiByMeaning } from "./repository/kanji.ts";
import {
  getVocabulary,
  getKanaVocabulary,
  findVocabularyByCharacters,
  findVocabularyByMeaning,
} from "./repository/vocabulary.ts";
import {
  radicals as radicalData,
  kanji as kanjiData,
  vocabulary as vocabularyData,
  kanaVocabulary as kanaVocabularyData,
} from "./repository/data-loader.ts";
import { saveCache } from "./repository/data-loader.ts";
import { getPrimaryMeaning } from "@/model/subject-utils.ts";
import type { AnkiDeckType } from "./services/anki-connect.ts";
import {
  addOrUpdateRadical,
  addKanjiWithRadicals,
  addVocabularyWithKanjiAndRadicals,
  getDeckNotes,
  syncAnkiWeb,
} from "./services/anki-connect.ts";

const ANKI_DECK_TYPES: AnkiDeckType[] = ["radical", "kanji", "vocabulary"];

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String(err.message);
  return String(err);
}

async function addSubjectToAnki(id: number, type: SubjectType): Promise<AnkiAddResult | null> {
  if (type === "radical") {
    const radical = await getRadical(id);
    if (!radical) return null;
    return addOrUpdateRadical(radical);
  }

  if (type === "kanji") {
    const kanji = await getKanji(id);
    if (!kanji) return null;
    return addKanjiWithRadicals(kanji);
  }

  if (type === "vocabulary" || type === "kana_vocabulary") {
    // /search answers both types from one pool, so a caller can hold a kana id under type "vocabulary"
    const vocab = (await getVocabulary(id)) ?? getKanaVocabulary(id);
    if (!vocab) return null;
    return addVocabularyWithKanjiAndRadicals(vocab);
  }

  throw new Error(`Unknown subject type: ${type}`);
}

function resolveWkSubject(
  deckType: AnkiDeckType,
  characters: string
): { id: number; type: SubjectType } | null {
  if (deckType === "radical") {
    const found = radicalData.find(
      (r) => r.data.characters === characters || getPrimaryMeaning(r.data.meanings) === characters
    );
    return found ? { id: found.id, type: "radical" } : null;
  }

  if (deckType === "kanji") {
    const found = kanjiData.find((k) => k.data.characters === characters);
    return found ? { id: found.id, type: "kanji" } : null;
  }

  // vocabulary deck can contain both vocabulary and kana_vocabulary
  const vocab = vocabularyData.find((v) => v.data.characters === characters);
  if (vocab) return { id: vocab.id, type: "vocabulary" };

  const kanaVocab = kanaVocabularyData.find((v) => v.data.characters === characters);
  if (kanaVocab) return { id: kanaVocab.id, type: "kana_vocabulary" };

  return null;
}

const app = new Hono()
  .get("/search", async (c) => {
    const type = c.req.query("type");
    const q = c.req.query("q");

    if (!type || !q) {
      return c.json({ error: "Missing required parameters: type and q" }, 400);
    }

    if (!isSubjectType(type)) {
      return c.json({ error: `Invalid type: ${type}` }, 400);
    }

    console.log(`[API] Search ${type} "${q}"`);

    let result: Radical | Kanji | Vocabulary | KanaVocabulary | null = null;

    if (type === "radical") {
      result = await findRadicalByCharacters(q);
      if (!result) {
        result = await findRadicalByName(q);
      }
    } else if (type === "kanji") {
      result = await findKanjiByCharacters(q);
      if (!result) {
        result = await findKanjiByMeaning(q);
      }
    } else if (type === "vocabulary" || type === "kana_vocabulary") {
      result = await findVocabularyByCharacters(q);
      if (!result) {
        result = await findVocabularyByMeaning(q);
      }
    }

    await saveCache();

    if (!result) {
      console.log(`[API] Search ${type} "${q}" — not found`);
      return c.json({ found: false as const }, 404);
    }

    console.log(`[API] Search ${type} "${q}" — found id=${result.id}`);
    return c.json({
      found: true as const,
      data: result,
    });
  })
  .get("/anki-notes", async (c) => {
    const type = c.req.query("type");

    if (!type) {
      return c.json({ ok: false as const, error: "Missing required parameter: type" }, 400);
    }

    if (!ANKI_DECK_TYPES.includes(type as AnkiDeckType)) {
      return c.json({ ok: false as const, error: `Invalid type: ${type}` }, 400);
    }

    const deckType = type as AnkiDeckType;
    console.log(`[API] List Anki notes: ${deckType}`);

    try {
      const deckNotes = await getDeckNotes(deckType);

      const data: AnkiNoteItem[] = deckNotes.map((note) => {
        const resolved = resolveWkSubject(deckType, note.characters);
        return {
          characters: note.characters,
          meaning: note.meaning,
          wkId: resolved?.id ?? null,
          wkType: resolved?.type ?? null,
        };
      });

      const unresolvedCount = data.filter((d) => d.wkId === null).length;
      console.log(
        `[API] List Anki notes: ${deckType} — ${data.length} items, ${unresolvedCount} unresolved`
      );
      return c.json({ ok: true as const, data });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] List Anki notes: ${deckType} — error: ${message}`);
      return c.json({ ok: false as const, error: message });
    }
  })
  .post("/add-to-anki", async (c) => {
    const body = await c.req.json<{ id: number; type: string; sync?: boolean }>();
    const { id, type, sync = true } = body;

    if (id == null || !type) {
      return c.json({ ok: false as const, error: "Missing required parameters: id and type" }, 400);
    }

    if (typeof sync !== "boolean") {
      return c.json({ ok: false as const, error: "Invalid sync: must be a boolean" }, 400);
    }

    if (!isSubjectType(type)) {
      return c.json({ ok: false as const, error: `Invalid type: ${type}` }, 400);
    }

    console.log(`[API] Add to Anki: ${type} id=${id}`);

    try {
      const result = await addSubjectToAnki(id, type);
      if (!result) {
        console.log(`[API] Add to Anki: ${type} id=${id} — subject not found`);
        return c.json({ ok: false as const, error: "Subject not found" }, 404);
      }
      await saveCache();
      if (sync) await syncAnkiWeb();
      console.log(`[API] Add to Anki: ${type} id=${id} — done`);
      return c.json({ ok: true as const, data: result });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] Add to Anki: ${type} id=${id} — error: ${message}`);
      return c.json({ ok: false as const, error: message });
    }
  })
  .post("/anki-sync", async (c) => {
    console.log("[API] Sync to AnkiWeb");
    try {
      await syncAnkiWeb();
      return c.json({ ok: true as const });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] Sync to AnkiWeb — error: ${message}`);
      return c.json({ ok: false as const, error: message });
    }
  });

export const api = app;
export type ApiType = typeof app;
