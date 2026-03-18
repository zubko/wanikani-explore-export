import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import {
  installFetchInterceptor,
  resetFetchInterceptor,
  setAnkiResponse,
} from "@/test/fetch-interceptor.ts";
import { ensureRepositoryInitialized } from "@/test/preload.ts";
import { api } from "../api.ts";

installFetchInterceptor();
beforeAll(() => ensureRepositoryInitialized());
beforeEach(resetFetchInterceptor);

async function getAnkiNotes(type: string) {
  return api.request(`/anki-notes?type=${type}`);
}

async function getAnkiNotesJson(type: string) {
  return (await getAnkiNotes(type)).json();
}

describe("anki-notes API", () => {
  test("missing type returns 400", async () => {
    const response = await api.request("/anki-notes");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Missing required parameter: type",
    });
  });

  test("invalid type returns 400", async () => {
    const response = await getAnkiNotes("invalid");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid type: invalid",
    });
  });

  test("kana_vocabulary type returns 400", async () => {
    const response = await getAnkiNotes("kana_vocabulary");
    expect(response.status).toBe(400);
  });

  test("empty deck returns empty array", async () => {
    const result = await getAnkiNotesJson("vocabulary");
    expect(result).toEqual({ ok: true, data: [] });
  });

  test("resolves vocabulary items by characters", async () => {
    setAnkiResponse("findNotes", [100, 101]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 100,
        fields: {
          characters: { value: "毎晩" },
          primary_meaning: { value: "Every Night" },
        },
      },
      {
        noteId: 101,
        fields: {
          characters: { value: "高校" },
          primary_meaning: { value: "High School" },
        },
      },
    ]);

    const result = await getAnkiNotesJson("vocabulary");
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      { characters: "毎晩", meaning: "Every Night", wkId: 3766, wkType: "vocabulary" },
      { characters: "高校", meaning: "High School", wkId: 2950, wkType: "vocabulary" },
    ]);
  });

  test("resolves kana vocabulary items", async () => {
    setAnkiResponse("findNotes", [200]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 200,
        fields: {
          characters: { value: "ここ" },
          primary_meaning: { value: "Here" },
        },
      },
    ]);

    const result = await getAnkiNotesJson("vocabulary");
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      { characters: "ここ", meaning: "Here", wkId: 9209, wkType: "kana_vocabulary" },
    ]);
  });

  test("unresolvable items get null wkId and wkType", async () => {
    setAnkiResponse("findNotes", [300]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 300,
        fields: {
          characters: { value: "何か特別な" },
          primary_meaning: { value: "Something Special" },
        },
      },
    ]);

    const result = await getAnkiNotesJson("vocabulary");
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      { characters: "何か特別な", meaning: "Something Special", wkId: null, wkType: null },
    ]);
  });

  test("resolves kanji items", async () => {
    setAnkiResponse("findNotes", [400]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 400,
        fields: {
          character: { value: "校" },
          primary_meaning: { value: "School" },
        },
      },
    ]);

    const result = await getAnkiNotesJson("kanji");
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      { characters: "校", meaning: "School", wkId: 658, wkType: "kanji" },
    ]);
  });

  test("resolves radical items by primary name", async () => {
    setAnkiResponse("findNotes", [500]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 500,
        fields: {
          primary_name: { value: "Ground" },
        },
      },
    ]);

    const result = await getAnkiNotesJson("radical");
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      { characters: "Ground", meaning: "Ground", wkId: 1, wkType: "radical" },
    ]);
  });
});
