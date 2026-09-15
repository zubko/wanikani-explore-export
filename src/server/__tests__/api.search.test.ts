import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { installFetchInterceptor, resetFetchInterceptor } from "@/test/fetch-interceptor.ts";
import { ensureRepositoryInitialized } from "@/test/preload.ts";
import { api } from "../api.ts";

installFetchInterceptor();
beforeAll(() => ensureRepositoryInitialized());
beforeEach(resetFetchInterceptor);

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
    expect(result.data).toMatchSnapshot();
  });

  test("find vocabulary with a local synonym next to a WaniKani one (アメリカ人)", async () => {
    const result = await searchJson("type=vocabulary&q=アメリカ人");
    expect(result.found).toBe(true);
    expect(result.data.characters).toBe("アメリカ人");
    expect(result.data).toMatchSnapshot();
  });

  test("find kana vocabulary (ここ)", async () => {
    const result = await searchJson("type=vocabulary&q=ここ");
    expect(result.found).toBe(true);
    expect(result.data.characters).toBe("ここ");
    expect(result.data).toMatchSnapshot();
  });
});
