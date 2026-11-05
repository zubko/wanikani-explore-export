import { Hono } from "hono";
import type { Context } from "hono";
import { isSubjectType, LOCAL_STUDY_MATERIAL_PATCH_FIELDS } from "@/model/wanikani.ts";
import type {
  AnkiAddResult,
  AnkiNoteItem,
  Kanji,
  KanaVocabulary,
  KanaVocabularyData,
  LocalStudyMaterialPatch,
  Radical,
  Subject,
  SubjectType,
  Vocabulary,
  VocabularyData,
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
  findSubjectTypeById,
  getCustomSubjects,
  getKanaVocabularyData,
  getVocabularyData,
} from "./repository/data-loader.ts";
import { upsertLocalStudyMaterial } from "./repository/study-material.ts";
import {
  getPrimaryMeaning,
  isVisibleSubject,
  validateLocalStudyMaterialValue,
  validateReadingNote,
} from "@/model/subject-utils.ts";
import { findCustomSubject, isCustomSubjectId } from "@/model/custom-subject-utils.ts";
import { ValidationError } from "@/model/validation-error.ts";
import type { AnkiDeckType } from "./services/anki-connect.ts";
import {
  addOrUpdateRadical,
  addKanjiWithRadicals,
  addVocabularyWithKanjiAndRadicals,
  getDeckNotes,
  isFieldMismatchError,
  syncAnkiWeb,
} from "./services/anki-connect.ts";
import { getErrorMessage } from "./utils/error-utils.ts";

type VocabularyPools = {
  vocabularyWords: VocabularyData[];
  kanaVocabularyWords: KanaVocabularyData[];
};

const ANKI_DECK_TYPES: AnkiDeckType[] = ["radical", "kanji", "vocabulary"];

async function findSubjectForAnki(id: number, type: SubjectType): Promise<Subject | null> {
  if (type === "radical") return getRadical(id);
  if (type === "kanji") return getKanji(id);
  // /search answers both types from one pool, so a caller can hold a kana id under type "vocabulary"
  return (await getVocabulary(id)) ?? (await getKanaVocabulary(id));
}

function addSubjectToAnki(subject: Subject): Promise<AnkiAddResult> {
  if (subject.object === "radical") return addOrUpdateRadical(subject);
  if (subject.object === "kanji") return addKanjiWithRadicals(subject);
  return addVocabularyWithKanjiAndRadicals(subject);
}

function validateStudyMaterialPatch(patch: Record<string, unknown>): void {
  const fields = Object.keys(patch);
  if (fields.length === 0) {
    throw new ValidationError("Missing required parameter: at least one field besides id");
  }

  const knownFields: readonly string[] = LOCAL_STUDY_MATERIAL_PATCH_FIELDS;
  const unknown = fields.find((key) => !knownFields.includes(key));
  if (unknown !== undefined) throw new ValidationError(`Invalid field: ${unknown}`);

  for (const field of fields) {
    try {
      validateLocalStudyMaterialValue(field, patch[field]);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(`Invalid ${field}: ${error.message}`);
      }
      throw error;
    }
  }
}

async function readJsonObjectBody(c: Context): Promise<Record<string, unknown> | null> {
  const body = await c.req.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

async function findStudyMaterialSubjectType(id: number): Promise<SubjectType | null> {
  if (!isCustomSubjectId(id)) return findSubjectTypeById(id);
  const record = findCustomSubject(await getCustomSubjects(), id);
  return record && isVisibleSubject(record) ? record.object : null;
}

function resolveWkSubject(params: {
  deckType: AnkiDeckType;
  characters: string;
  vocabularyPools: VocabularyPools;
}): { id: number; type: SubjectType } | null {
  const { deckType, characters, vocabularyPools } = params;
  if (deckType === "radical") {
    const matches = radicalData.filter(
      (r) =>
        isVisibleSubject(r) &&
        (r.data.characters === characters || getPrimaryMeaning(r.data.meanings) === characters)
    );
    // The note holds no WaniKani id, so a guess could write the other radical into it
    if (matches.length > 1) {
      const ids = matches.map((r) => r.id).join(", ");
      console.warn(`[API] Radical note "${characters}" matches radicals ${ids} — not resolved`);
      return null;
    }
    const found = matches[0];
    return found ? { id: found.id, type: "radical" } : null;
  }

  if (deckType === "kanji") {
    const found = kanjiData.find((k) => isVisibleSubject(k) && k.data.characters === characters);
    return found ? { id: found.id, type: "kanji" } : null;
  }

  // vocabulary deck can contain both vocabulary and kana_vocabulary
  const vocab = vocabularyPools.vocabularyWords.find(
    (v) => isVisibleSubject(v) && v.data.characters === characters
  );
  if (vocab) return { id: vocab.id, type: "vocabulary" };

  const kanaVocab = vocabularyPools.kanaVocabularyWords.find(
    (v) => isVisibleSubject(v) && v.data.characters === characters
  );
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
      // One read of the custom file per request, not one per note
      const vocabularyPools: VocabularyPools = {
        vocabularyWords: await getVocabularyData(),
        kanaVocabularyWords: await getKanaVocabularyData(),
      };

      const data: AnkiNoteItem[] = deckNotes.map((note) => {
        const resolved = resolveWkSubject({
          deckType,
          characters: note.characters,
          vocabularyPools,
        });
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
      const subject = await findSubjectForAnki(id, type);
      if (!subject) {
        console.log(`[API] Add to Anki: ${type} id=${id} — subject not found`);
        return c.json({ ok: false as const, error: "Subject not found" }, 404);
      }
      if (sync) {
        console.log(`[API] Add to Anki: ${type} id=${id} — syncing with AnkiWeb first`);
        await syncAnkiWeb();
      }
      const result = await addSubjectToAnki(subject);
      if (sync) await syncAnkiWeb();
      console.log(`[API] Add to Anki: ${type} id=${id} — done`);
      return c.json({ ok: true as const, data: result });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] Add to Anki: ${type} id=${id} — error: ${message}`);
      if (isFieldMismatchError(err)) {
        return c.json({ ok: false as const, error: message, reason: "fields" as const });
      }
      return c.json({ ok: false as const, error: message });
    }
  })
  .patch("/study-materials", async (c) => {
    const body = await readJsonObjectBody(c);
    if (!body) {
      return c.json({ ok: false as const, error: "Invalid body: must be a JSON object" }, 400);
    }

    const id = body.id;
    if (typeof id !== "number" || !Number.isInteger(id)) {
      return c.json({ ok: false as const, error: "Invalid id: must be an integer" }, 400);
    }

    const patch = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "id"));
    try {
      validateStudyMaterialPatch(patch);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      return c.json({ ok: false as const, error: error.message }, 400);
    }

    try {
      const type = await findStudyMaterialSubjectType(id);
      if (!type) {
        console.log(`[API] Study material id=${id} — subject not found`);
        return c.json({ ok: false as const, error: "Subject not found" }, 404);
      }

      if ("reading_note" in patch) {
        try {
          validateReadingNote(type);
        } catch (error) {
          if (!(error instanceof ValidationError)) throw error;
          return c.json(
            { ok: false as const, error: `Invalid reading_note: ${error.message}` },
            400
          );
        }
      }

      console.log(`[API] Study material ${type} id=${id}: ${Object.keys(patch).join(", ")}`);

      const data = await upsertLocalStudyMaterial(id, patch as LocalStudyMaterialPatch);
      console.log(`[API] Study material ${type} id=${id} — ${data ? "saved" : "removed"}`);
      return c.json({ ok: true as const, data });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] Study material id=${id} — error: ${message}`);
      return c.json({ ok: false as const, error: message }, 500);
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
