import { hc } from "hono/client";
import type { ApiType } from "@server/api.ts";
import type { SubjectType } from "@/model/wanikani.ts";
import { HttpStatusError } from "./utils/http-error.ts";

const client = hc<ApiType>("/api");

export const api = {
  search: async (type: SubjectType, query: string) => {
    const res = await client.search.$get({ query: { type, q: query } });
    if (!res.ok && res.status !== 404) throw new HttpStatusError(res.status);
    return res.json();
  },
  addToAnki: async (id: number, type: SubjectType) => {
    const res = await client["add-to-anki"].$post({ json: { id, type } });
    // an unhandled server error answers with plain text, and res.json() would throw a SyntaxError
    if (!res.headers.get("content-type")?.includes("application/json")) {
      throw new HttpStatusError(res.status);
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.data;
  },
};
