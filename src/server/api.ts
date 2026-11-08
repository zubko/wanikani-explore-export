import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
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
  findSubjectTypeWithCustom,
  getCustomSubjects,
  getWords,
} from "./repository/data-loader.ts";
import { upsertLocalStudyMaterial } from "./repository/study-material.ts";
import {
  CustomSubjectWriteError,
  createCustomSubject,
  deleteCustomSubject,
  updateCustomSubject,
} from "./repository/custom-subject.ts";
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

const ANKI_DECK_TYPES: AnkiDeckType[] = ["radical", "kanji", "vocabulary"];

// A page of another origin can POST text/plain or a form with no CORS preflight, and CORS only
// hides the answer, so the route would still run. A JSON content type needs a preflight, and the
// CORS rule in app.ts refuses it for another origin.
const requireJsonContentType = createMiddleware(async (c, next) => {
  const mediaType = c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return c.json({ ok: false as const, error: "Content-Type must be application/json" }, 415);
  }
  await next();
});

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

function readJsonBody(c: Context): Promise<unknown> {
  return c.req.json().catch(() => null);
}

async function readJsonObjectBody(c: Context): Promise<Record<string, unknown> | null> {
  const body = await readJsonBody(c);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

/** Answers `null` for an id that is not a custom subject id, so a WaniKani id is a 400. */
function parseCustomSubjectId(param: string): number | null {
  if (!/^\d+$/.test(param)) return null;
  const id = Number(param);
  return isCustomSubjectId(id) ? id : null;
}

function customSubjectErrorStatus(error: unknown): 400 | 404 | 409 | 500 {
  return error instanceof CustomSubjectWriteError ? error.status : 500;
}

function resolveWkSubject(params: {
  deckType: AnkiDeckType;
  characters: string;
  words: (VocabularyData | KanaVocabularyData)[];
}): { id: number; type: SubjectType } | null {
  const { deckType, characters, words } = params;
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
  const word = words.find((w) => isVisibleSubject(w) && w.data.characters === characters);
  return word ? { id: word.id, type: word.object } : null;
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
      const words = deckType === "vocabulary" ? await getWords() : [];

      const data: AnkiNoteItem[] = deckNotes.map((note) => {
        const resolved = resolveWkSubject({
          deckType,
          characters: note.characters,
          words,
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
  .post("/add-to-anki", requireJsonContentType, async (c) => {
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
  .patch("/study-materials", requireJsonContentType, async (c) => {
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
      const type = findSubjectTypeWithCustom({
        id,
        // A WaniKani id must still save when the custom subjects file is broken
        customSubjects: isCustomSubjectId(id) ? await getCustomSubjects() : [],
        includeHiddenCustom: false,
      });
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
  .get("/custom-subjects", async (c) => {
    console.log("[API] List custom subjects");
    try {
      const data = await getCustomSubjects();
      console.log(`[API] List custom subjects — ${data.length} records`);
      return c.json({ ok: true as const, data });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] List custom subjects — error: ${message}`);
      return c.json({ ok: false as const, error: message }, 500);
    }
  })
  .get("/custom-subjects/:id", async (c) => {
    const param = c.req.param("id");
    const id = parseCustomSubjectId(param);
    if (id === null) {
      return c.json(
        { ok: false as const, error: `Invalid id: ${param} is not a custom subject id` },
        400
      );
    }

    console.log(`[API] Get custom subject id=${id}`);
    try {
      const data = findCustomSubject(await getCustomSubjects(), id);
      if (!data) {
        console.log(`[API] Get custom subject id=${id} — not found`);
        return c.json({ ok: false as const, error: `Custom subject ${id} not found` }, 404);
      }
      return c.json({ ok: true as const, data });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] Get custom subject id=${id} — error: ${message}`);
      return c.json({ ok: false as const, error: message }, 500);
    }
  })
  .post("/custom-subjects", requireJsonContentType, async (c) => {
    const body = await readJsonBody(c);
    console.log("[API] Create custom subject");
    try {
      const data = await createCustomSubject(body);
      console.log(
        `[API] Create custom subject — saved ${data.object} id=${data.id} "${data.data.characters}"`
      );
      return c.json({ ok: true as const, data }, 201);
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] Create custom subject — error: ${message}`);
      return c.json({ ok: false as const, error: message }, customSubjectErrorStatus(err));
    }
  })
  .put("/custom-subjects/:id", requireJsonContentType, async (c) => {
    const param = c.req.param("id");
    const id = parseCustomSubjectId(param);
    if (id === null) {
      return c.json(
        { ok: false as const, error: `Invalid id: ${param} is not a custom subject id` },
        400
      );
    }

    const body = await readJsonBody(c);
    console.log(`[API] Update custom subject id=${id}`);
    try {
      const data = await updateCustomSubject(id, body);
      console.log(`[API] Update custom subject id=${id} — saved`);
      return c.json({ ok: true as const, data });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] Update custom subject id=${id} — error: ${message}`);
      return c.json({ ok: false as const, error: message }, customSubjectErrorStatus(err));
    }
  })
  .delete("/custom-subjects/:id", async (c) => {
    const param = c.req.param("id");
    const id = parseCustomSubjectId(param);
    if (id === null) {
      return c.json(
        { ok: false as const, error: `Invalid id: ${param} is not a custom subject id` },
        400
      );
    }

    console.log(`[API] Delete custom subject id=${id}`);
    try {
      await deleteCustomSubject(id);
      console.log(`[API] Delete custom subject id=${id} — hidden`);
      return c.json({ ok: true as const });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[API] Delete custom subject id=${id} — error: ${message}`);
      return c.json({ ok: false as const, error: message }, customSubjectErrorStatus(err));
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
