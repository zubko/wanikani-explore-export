import { describe, test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import {
  ensureRepositoryInitialized,
  resetFsMock,
  writeCalls,
  setFileContent,
  setFsError,
} from "@/test/preload.ts";
import {
  customKanaWord,
  customSubjectFixture,
  customVerb,
  hiddenCustomWord,
  setCustomSubjectsFile,
} from "@/test/custom-subject-fixture.ts";
import { lastWrite, studyMaterialFixture as fixture } from "@/test/study-material-fixture.ts";
import { getLocalStudyMaterials } from "../repository/data-loader.ts";
import { CUSTOM_SUBJECTS_PATH, LOCAL_STUDY_MATERIALS_PATH } from "../repository/data-paths.ts";
import { api } from "../api.ts";

async function patchJson(body: unknown, rawBody?: string) {
  const response = await api.request("/study-materials", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

beforeAll(ensureRepositoryInitialized);

// The fs mock is process-global, so a saved record must not reach the next test or file
beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("study-materials API validation", () => {
  test("missing id returns 400", async () => {
    const { status, json } = await patchJson({ meaning_note: "Note" });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid id: must be an integer" });
  });

  test("a string id returns 400", async () => {
    const { status, json } = await patchJson({ id: "1", meaning_note: "Note" });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid id: must be an integer" });
  });

  test("a fractional id returns 400", async () => {
    const { status, json } = await patchJson({ id: 1.5, meaning_note: "Note" });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid id: must be an integer" });
  });

  test("a body that is not a JSON object returns 400", async () => {
    for (const rawBody of ["", "null", "[1]", '"text"']) {
      const { status, json } = await patchJson(null, rawBody);
      expect(status).toBe(400);
      expect(json).toEqual({ ok: false, error: "Invalid body: must be a JSON object" });
    }
    expect(writeCalls).toHaveLength(0);
  });

  test("an empty field name returns 400", async () => {
    const { status, json } = await patchJson({ id: 1, "": "Note" });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid field: " });
    expect(writeCalls).toHaveLength(0);
  });

  test("no field besides id returns 400", async () => {
    const { status, json } = await patchJson({ id: 1 });
    expect(status).toBe(400);
    expect(json).toEqual({
      ok: false,
      error: "Missing required parameter: at least one field besides id",
    });
  });

  test("an unknown field returns 400", async () => {
    const { status, json } = await patchJson({ id: 1, meaning_mnemonic: "Note" });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid field: meaning_mnemonic" });
  });

  test("a meaning note that is not a string returns 400", async () => {
    const { status, json } = await patchJson({ id: 1, meaning_note: 5 });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid meaning_note: must be a string" });
  });

  test("a reading note that is not a string returns 400", async () => {
    const { status, json } = await patchJson({ id: 456, reading_note: null });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid reading_note: must be a string" });
  });

  test("a whole synonym list returns 400", async () => {
    const { status, json } = await patchJson({ id: 1, meaning_synonyms: ["one"] });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid field: meaning_synonyms" });
  });

  test("a synonym operation that is not a string returns 400", async () => {
    const { status, json } = await patchJson({ id: 1, add_synonym: ["one"] });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid add_synonym: must be a string" });
  });

  test("a reading note on a radical returns 400", async () => {
    const { status, json } = await patchJson({ id: 1, reading_note: "Note" });
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "Invalid reading_note: a radical has no reading" });
  });

  test("a reading note on kana vocabulary returns 400", async () => {
    const { status, json } = await patchJson({ id: 9176, reading_note: "Note" });
    expect(status).toBe(400);
    expect(json).toEqual({
      ok: false,
      error: "Invalid reading_note: a kana_vocabulary has no reading",
    });
  });

  test("an unknown subject returns 404", async () => {
    const { status, json } = await patchJson({ id: 999999, meaning_note: "Note" });
    expect(status).toBe(404);
    expect(json).toEqual({ ok: false, error: "Subject not found" });
  });

  test("no failed request writes anything", async () => {
    await patchJson({ id: 1, reading_note: "Note" });
    await patchJson({ id: 999999, meaning_note: "Note" });
    expect(writeCalls).toHaveLength(0);
  });

  test("a write error returns 500 and keeps the old records", async () => {
    setFsError("writeFile", new Error("disk full"));

    const { status, json } = await patchJson({ id: 1, meaning_note: "New note" });

    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, error: "disk full" });
    expect((await getLocalStudyMaterials())["1"]).toEqual(fixture["1"]!);
    expect(writeCalls).toHaveLength(0);
  });

  test("a rename error returns 500 and keeps the old records", async () => {
    setFsError("rename", new Error("rename failed"));

    const { status, json } = await patchJson({ id: 1, meaning_note: "New note" });

    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, error: "rename failed" });
    expect((await getLocalStudyMaterials())["1"]).toEqual(fixture["1"]!);
    expect(writeCalls).toHaveLength(0);
  });
});

describe("study-materials API upsert", () => {
  test("creates an entry for a subject with no local record", async () => {
    const { status, json } = await patchJson({ id: 2484, meaning_note: "Chi + kara = power" });

    expect(status).toBe(200);
    expect(json).toMatchSnapshot("response");
    expect(lastWrite()).toMatchSnapshot("file");
  });

  test("updates one field and keeps the others", async () => {
    const { status, json } = await patchJson({ id: 958, reading_note: "Ban, the night curfew" });

    expect(status).toBe(200);
    expect(json).toMatchSnapshot("response");
    expect(lastWrite()).toMatchSnapshot("file");
  });

  test("adds a synonym next to the WaniKani one", async () => {
    const { status, json } = await patchJson({ id: 2478, add_synonym: "yank" });

    expect(status).toBe(200);
    expect(json).toMatchSnapshot("response");
    expect(lastWrite()).toMatchSnapshot("file");
  });

  test("removes one synonym and keeps the others", async () => {
    await patchJson({ id: 2478, add_synonym: "yank" });
    const { status, json } = await patchJson({ id: 2478, remove_synonym: "american" });

    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, data: { meaning_synonyms: ["yank"] } });
  });

  test("an empty string clears one note", async () => {
    const { status, json } = await patchJson({ id: 958, meaning_note: "" });

    expect(status).toBe(200);
    expect(json).toMatchSnapshot("response");
    expect(lastWrite()).toMatchSnapshot("file");
  });

  test("clearing the last field removes the entry", async () => {
    const { status, json } = await patchJson({ id: 456, reading_note: "" });

    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, data: null });
    expect((await getLocalStudyMaterials())["456"]).toBeUndefined();
    expect(lastWrite()).toMatchSnapshot("file");
  });

  test("two requests at the same time both land in the file", async () => {
    const [first, second] = await Promise.all([
      patchJson({ id: 1, meaning_note: "First" }),
      patchJson({ id: 2484, meaning_note: "Second" }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(lastWrite()["1"]!.meaning_note).toBe("First");
    expect(lastWrite()["2484"]).toEqual({ meaning_note: "Second" });
  });

  test("the saved file lands under the real path", async () => {
    await patchJson({ id: 1, meaning_note: "One line" });

    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]!.path).toBe(LOCAL_STUDY_MATERIALS_PATH);
  });
});

describe("study-materials API on custom words", () => {
  beforeEach(() => setCustomSubjectsFile(customSubjectFixture));

  test("saves a note on a custom word", async () => {
    const { status, json } = await patchJson({ id: customVerb.id, reading_note: "Kudasu" });

    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, data: { reading_note: "Kudasu" } });
    expect(lastWrite()[String(customVerb.id)]).toEqual({ reading_note: "Kudasu" });
    expect((await getLocalStudyMaterials())[String(customVerb.id)]).toEqual({
      reading_note: "Kudasu",
    });
  });

  test("a hidden custom word returns 404", async () => {
    const { status, json } = await patchJson({ id: hiddenCustomWord.id, meaning_note: "Note" });

    expect(status).toBe(404);
    expect(json).toEqual({ ok: false, error: "Subject not found" });
    expect(writeCalls).toHaveLength(0);
  });

  test("a reading note on a custom kana word returns 400", async () => {
    const { status, json } = await patchJson({ id: customKanaWord.id, reading_note: "Note" });

    expect(status).toBe(400);
    expect(json).toEqual({
      ok: false,
      error: "Invalid reading_note: a kana_vocabulary has no reading",
    });
    expect(writeCalls).toHaveLength(0);
  });

  test("a broken custom subjects file returns a JSON 500 and writes nothing", async () => {
    setFileContent(CUSTOM_SUBJECTS_PATH, "{ broken");

    const { status, json } = await patchJson({ id: customVerb.id, meaning_note: "Note" });

    expect(status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error).toContain(`Cannot read ${CUSTOM_SUBJECTS_PATH}`);
    expect(writeCalls).toHaveLength(0);
  });

  test("an unknown custom id returns 404", async () => {
    const { status, json } = await patchJson({ id: 1_000_999, meaning_note: "Note" });

    expect(status).toBe(404);
    expect(json).toEqual({ ok: false, error: "Subject not found" });
    expect(writeCalls).toHaveLength(0);
  });

  test("a WaniKani id still saves when the custom subjects file is broken (毎晩)", async () => {
    setFileContent(CUSTOM_SUBJECTS_PATH, "{ broken");

    const { status, json } = await patchJson({ id: 3766, meaning_note: "Note" });

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(lastWrite()["3766"]?.meaning_note).toBe("Note");
  });
});
