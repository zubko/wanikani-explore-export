import { createContext, useContext } from "react";
import type { SearchableType } from "../types.ts";

type SearchContextType = {
  navigateTo: (type: SearchableType, query: string) => void;
};

export const SearchContext = createContext<SearchContextType | null>(null);

export function useSearch(): SearchContextType {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within SearchContext.Provider");
  }
  return context;
}
