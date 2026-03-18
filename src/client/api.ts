import { hc } from "hono/client";
import type { ApiType } from "@server/api.ts";
import type { SubjectType } from "@/model/wanikani.ts";

const client = hc<ApiType>("/api");

export const api = {
  search: async (type: SubjectType, query: string) => {
    const res = await client.search.$get({ query: { type, q: query } });
    if (!res.ok && res.status !== 404) throw new Error("Failed to search");
    return res.json();
  },
  addToAnki: async (id: number, type: SubjectType) => {
    const res = await client["add-to-anki"].$post({ json: { id, type } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.data;
  },
};
