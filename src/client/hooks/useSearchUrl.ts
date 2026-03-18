import { useEffect, useCallback, useRef } from "react";
import type { SearchableType } from "../types.ts";
import { searchableTypeToSubjectType } from "../types.ts";

export type UrlSearchParams = {
  type: SearchableType;
  query: string;
} | null;

function isValidSearchableType(value: string): value is SearchableType {
  return value in searchableTypeToSubjectType;
}

function parseSearchUrl(): UrlSearchParams {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const query = params.get("q");

  if (type && isValidSearchableType(type) && query) {
    return { type, query };
  }
  return null;
}

function buildSearchUrl(type: SearchableType, query: string): string {
  const params = new URLSearchParams();
  params.set("type", type);
  params.set("q", query);
  return `?${params.toString()}`;
}

function updateTitle(params: UrlSearchParams) {
  if (params) {
    document.title = `${params.query} | ${params.type} | WK Cards`;
  } else {
    document.title = "WK Cards";
  }
}

type UseSearchUrlOptions = {
  onUrlChange: (params: UrlSearchParams) => void;
};

export function useSearchUrl({ onUrlChange }: UseSearchUrlOptions) {
  const isInitialMount = useRef(true);

  const pushSearch = useCallback((type: SearchableType, query: string) => {
    const url = buildSearchUrl(type, query);
    window.history.pushState({ type, query }, "", url);
    updateTitle({ type, query });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const params = parseSearchUrl();
      updateTitle(params);
      onUrlChange(params);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onUrlChange]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const params = parseSearchUrl();
      updateTitle(params);
      if (params) {
        onUrlChange(params);
      }
    }
  }, [onUrlChange]);

  return { pushSearch };
}
