import type { SubjectType } from "@/model/wanikani.ts";

export type SearchableType = "radicals" | "kanji" | "vocabulary";

export const searchableTypeToSubjectType: Record<SearchableType, SubjectType> = {
  radicals: "radical",
  kanji: "kanji",
  vocabulary: "vocabulary",
};

export type SearchResult<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; item: T }
  | { status: "not_found"; query: string }
  | { status: "error"; query: string; message: string };
