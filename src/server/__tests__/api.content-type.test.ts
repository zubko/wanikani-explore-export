import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  ankiCalls,
  installFetchInterceptor,
  resetFetchInterceptor,
} from "@/test/fetch-interceptor.ts";
import { ensureRepositoryInitialized, resetFsMock, writeCalls } from "@/test/preload.ts";
import { customKanaWord, customKanaWordInput } from "@/test/custom-subject-fixture.ts";
import { api } from "../api.ts";

const WRITE_ROUTES = [
  { method: "POST", path: "/add-to-anki", body: { id: 3766, type: "vocabulary" } },
  { method: "PATCH", path: "/study-materials", body: { id: 3766, meaning_note: "Note" } },
  { method: "POST", path: "/custom-subjects", body: customKanaWordInput },
  { method: "PUT", path: `/custom-subjects/${customKanaWord.id}`, body: customKanaWordInput },
];

installFetchInterceptor();
beforeAll(ensureRepositoryInitialized);
beforeEach(() => {
  resetFetchInterceptor();
  resetFsMock();
});
afterEach(resetFsMock);

describe("write routes and the Content-Type", () => {
  test("a body that is not sent as JSON is a 415 and runs nothing", async () => {
    for (const { method, path, body } of WRITE_ROUTES) {
      for (const contentType of ["text/plain", "application/x-www-form-urlencoded", undefined]) {
        const response = await api.request(path, {
          method,
          headers: contentType ? { "Content-Type": contentType } : undefined,
          body: JSON.stringify(body),
        });

        expect(response.status).toBe(415);
        expect(await response.json()).toEqual({
          ok: false,
          error: "Content-Type must be application/json",
        });
      }
    }
    expect(writeCalls).toHaveLength(0);
    expect(ankiCalls).toHaveLength(0);
  });

  test("a JSON type with a charset passes", async () => {
    const response = await api.request("/study-materials", {
      method: "PATCH",
      headers: { "Content-Type": "Application/JSON; charset=utf-8" },
      body: JSON.stringify({ id: 3766, meaning_note: "Note" }),
    });

    expect(response.status).toBe(200);
  });
});
