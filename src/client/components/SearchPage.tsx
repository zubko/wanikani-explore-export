import { useState, useCallback, useMemo, useRef } from "react";
import type { Radical, Kanji, Vocabulary, KanaVocabulary } from "@/model/wanikani.ts";
import {
  type SearchableType,
  type SearchResult as SearchResultType,
  searchableTypeToSubjectType,
} from "../types.ts";
import { api } from "../api.ts";
import { searchErrorMessage } from "../utils/request-error.ts";
import { useSearchUrl, type UrlSearchParams } from "../hooks/useSearchUrl.ts";
import { SearchContext } from "../context/SearchContext.tsx";
import { TypeDropdown } from "./TypeDropdown.tsx";
import { SearchInput } from "./SearchInput.tsx";
import { SearchResult } from "./SearchResult.tsx";
import { subjectColors } from "@/config/theme.ts";

type AnySubject = Radical | Kanji | Vocabulary | KanaVocabulary;

const TYPE_OPTIONS = [
  { value: "radicals" as const, label: "部首", title: "Radicals", color: subjectColors.radical },
  { value: "kanji" as const, label: "漢字", title: "Kanji", color: subjectColors.kanji },
  {
    value: "vocabulary" as const,
    label: "単語",
    title: "Vocabulary",
    color: subjectColors.vocabulary,
  },
];

export function SearchPage() {
  const [selectedType, setSelectedType] = useState<SearchableType>("kanji");
  const [currentQuery, setCurrentQuery] = useState("");
  const [resultType, setResultType] = useState<SearchableType>("kanji");
  const [result, setResult] = useState<SearchResultType<AnySubject>>({
    status: "idle",
  });
  const searchIdRef = useRef(0);

  const performSearch = useCallback(async (type: SearchableType, query: string) => {
    const requestId = ++searchIdRef.current;
    setResult({ status: "loading" });
    setSelectedType(type);
    setResultType(type);
    setCurrentQuery(query);

    const subjectType = searchableTypeToSubjectType[type];

    let response;
    try {
      response = await api.search(subjectType, query);
    } catch (err) {
      if (requestId !== searchIdRef.current) return;
      console.error("[search] request failed", err);
      setResult({ status: "error", message: searchErrorMessage(err) });
      return;
    }

    if (requestId !== searchIdRef.current) return;

    if (response.found) {
      setResult({
        status: "found",
        item: response.data as AnySubject,
      });
    } else {
      setResult({ status: "not_found", query });
    }
  }, []);

  const retrySearch = useCallback(() => {
    performSearch(resultType, currentQuery);
  }, [resultType, currentQuery, performSearch]);

  const handleUrlChange = useCallback(
    (params: UrlSearchParams) => {
      if (params) {
        performSearch(params.type, params.query);
      } else {
        searchIdRef.current++;
        setResult({ status: "idle" });
        setCurrentQuery("");
      }
    },
    [performSearch]
  );

  const { pushSearch } = useSearchUrl({ onUrlChange: handleUrlChange });

  const handleSearch = useCallback(
    (query: string) => {
      pushSearch(selectedType, query);
      performSearch(selectedType, query);
    },
    [selectedType, pushSearch, performSearch]
  );

  const navigateTo = useCallback(
    (type: SearchableType, query: string) => {
      pushSearch(type, query);
      performSearch(type, query);
    },
    [pushSearch, performSearch]
  );

  const searchContextValue = useMemo(() => ({ navigateTo }), [navigateTo]);

  return (
    <SearchContext.Provider value={searchContextValue}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <TypeDropdown options={TYPE_OPTIONS} value={selectedType} onChange={setSelectedType} />
          <SearchInput
            onSearch={handleSearch}
            placeholder={`Search ${selectedType.replace("_", " ")}...`}
            disabled={result.status === "loading"}
            initialValue={currentQuery}
          />
        </div>

        <SearchResult type={resultType} result={result} onRetry={retrySearch} />
      </div>
    </SearchContext.Provider>
  );
}
