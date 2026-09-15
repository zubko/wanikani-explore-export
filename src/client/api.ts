import { hc } from "hono/client";
import type { ApiType } from "@server/api.ts";
import type { LocalStudyMaterial, SubjectType } from "@/model/wanikani.ts";
import { HttpStatusError } from "./utils/http-error.ts";

type OkOrErrorResponse<T> = {
  status: number;
  headers: Headers;
  json: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>;
};

const client = hc<ApiType>("/api");

export const api = {
  search: async (type: SubjectType, query: string) => {
    const res = await client.search.$get({ query: { type, q: query } });
    if (!res.ok && res.status !== 404) throw new HttpStatusError(res.status);
    return res.json();
  },
  addToAnki: async (id: number, type: SubjectType) => {
    return unwrapJson(await client["add-to-anki"].$post({ json: { id, type } }));
  },
  saveStudyMaterial: async (id: number, patch: LocalStudyMaterial) => {
    return unwrapJson(await client["study-materials"].$patch({ json: { id, ...patch } }));
  },
};

async function unwrapJson<T>(res: OkOrErrorResponse<T>): Promise<T> {
  // an unhandled server error answers with plain text, and res.json() would throw a SyntaxError
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new HttpStatusError(res.status);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data.data;
}
