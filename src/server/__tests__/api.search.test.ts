import { describe, test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import {
  externalFetches,
  installFetchInterceptor,
  resetFetchInterceptor,
} from "@/test/fetch-interceptor.ts";
import {
  ensureRepositoryInitialized,
  resetFsMock,
  setFileContent,
  writeCalls,
} from "@/test/preload.ts";
import {
  setStudyMaterialFile,
  studyMaterialFixture as fixture,
} from "@/test/study-material-fixture.ts";
import { getLocalStudyMaterials } from "../repository/data-loader.ts";
import { LOCAL_STUDY_MATERIALS_PATH, MNEMONIC_IMAGES_PATH } from "../repository/data-paths.ts";
import { api } from "../api.ts";

installFetchInterceptor();
beforeAll(ensureRepositoryInitialized);
beforeEach(resetFetchInterceptor);
// Earlier tests and files may already have appended a page to the registry
beforeEach(resetFsMock);
afterEach(resetFsMock);

async function searchApi(params: string) {
  return api.request(`/search?${params}`);
}

async function searchJson(params: string) {
  return (await searchApi(params)).json();
}

describe("search API", () => {
  test("missing params returns 400", async () => {
    const response = await searchApi("");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Missing required parameters: type and q",
    });
  });

  test("missing query returns 400", async () => {
    const response = await searchApi("type=kanji");
    expect(response.status).toBe(400);
  });

  test("missing type returns 400", async () => {
    const response = await searchApi("q=校");
    expect(response.status).toBe(400);
  });

  test("invalid type returns 400", async () => {
    const response = await searchApi("type=invalid&q=校");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid type: invalid" });
  });

  test("non-existent kanji returns 404", async () => {
    const response = await searchApi("type=kanji&q=zzz");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ found: false });
  });

  test("find kanji by character (校)", async () => {
    const result = await searchJson("type=kanji&q=校");
    expect(result.found).toBe(true);
    expect(result.data.characters).toBe("校");
    expect(result.data).toMatchSnapshot();
  });

  test("find kanji by meaning (school)", async () => {
    const result = await searchJson("type=kanji&q=school");
    expect(result.found).toBe(true);
    expect(result.data.characters).toBe("校");
  });

  test("find radical by character (一)", async () => {
    const result = await searchJson("type=radical&q=一");
    expect(result.found).toBe(true);
    expect(result.data.id).toBe(1);
    expect(result.data).toMatchSnapshot();
  });

  test("find radical by name (ground)", async () => {
    const result = await searchJson("type=radical&q=ground");
    expect(result.found).toBe(true);
    expect(result.data.id).toBe(1);
  });

  test("a radical page not in the registry is scraped once and appended (barb)", async () => {
    const page = "https://www.wanikani.com/radicals/barb";

    const result = await searchJson("type=radical&q=barb");
    expect(result.data.documentUrl).toBe(page);
    expect(result.data.mnemonicImageUrl).toBeNull();
    expect(externalFetches).toEqual([page]);
    expect(writeCalls).toEqual([
      { path: MNEMONIC_IMAGES_PATH, data: JSON.stringify({ page, image: null }) + "\n" },
    ]);

    resetFetchInterceptor();
    await searchJson("type=radical&q=barb");
    expect(externalFetches).toEqual([]);
    expect(writeCalls).toHaveLength(1);
  });

  test("find vocabulary by characters (毎晩)", async () => {
    const result = await searchJson("type=vocabulary&q=毎晩");
    expect(result.found).toBe(true);
    expect(result.data.characters).toBe("毎晩");
    expect(result.data).toMatchSnapshot();
  });

  test("find kanji with a local reading note over a WaniKani one (川)", async () => {
    const result = await searchJson("type=kanji&q=川");
    expect(result.found).toBe(true);
    expect(result.data.characters).toBe("川");
    expect(result.data.studyMaterial.data.reading_note).toBe("Kawai");
    expect(result.data.localStudyMaterial).toEqual({
      reading_note: "Kawa like a river bank",
    });
    expect(result.data).toMatchSnapshot();
  });

  test("find vocabulary with a local synonym next to a WaniKani one (アメリカ人)", async () => {
    const result = await searchJson("type=vocabulary&q=アメリカ人");
    expect(result.found).toBe(true);
    expect(result.data.characters).toBe("アメリカ人");
    expect(result.data.studyMaterial.data.meaning_synonyms).toEqual(["usa person"]);
    expect(result.data.localStudyMaterial).toEqual({ meaning_synonyms: ["american"] });
    expect(result.data).toMatchSnapshot();
  });

  test("find kana vocabulary (ここ)", async () => {
    const result = await searchJson("type=vocabulary&q=ここ");
    expect(result.found).toBe(true);
    expect(result.data.characters).toBe("ここ");
    expect(result.data).toMatchSnapshot();
  });
});

describe("search API with the local study materials changed outside the app", () => {
  test("a record put into the file shows in the next answer without a save (川)", async () => {
    setStudyMaterialFile({ ...fixture, "456": { meaning_note: "Typed by hand" } });

    const result = await searchJson("type=kanji&q=川");
    expect(result.data.localStudyMaterial).toEqual({ meaning_note: "Typed by hand" });
    expect(writeCalls.some((call) => call.path === LOCAL_STUDY_MATERIALS_PATH)).toBe(false);
  });

  test("a broken file fails the next search, a fixed file answers again (川)", async () => {
    setFileContent(LOCAL_STUDY_MATERIALS_PATH, "{ broken");
    expect((await searchApi("type=kanji&q=川")).status).toBe(500);
    await expect(getLocalStudyMaterials()).rejects.toThrow(
      `Cannot read ${LOCAL_STUDY_MATERIALS_PATH}`
    );

    setStudyMaterialFile(fixture);
    const response = await searchApi("type=kanji&q=川");
    expect(response.status).toBe(200);
    expect((await response.json()).data.localStudyMaterial).toEqual(fixture["456"]!);
  });
});
