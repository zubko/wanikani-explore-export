import { Fragment } from "react";
import type { Radical, Kanji, Vocabulary, KanaVocabulary } from "@/model/wanikani.ts";
import type { SearchableType, SearchResult as SearchResultType } from "../types.ts";
import { RadicalCard } from "./RadicalCard.tsx";
import { KanjiCard } from "./KanjiCard.tsx";
import { VocabularyCard } from "./VocabularyCard.tsx";

type AnySubject = Radical | Kanji | Vocabulary | KanaVocabulary;

type SearchResultProps = {
  type: SearchableType;
  result: SearchResultType<AnySubject>;
};

export function SearchResult({ type, result }: SearchResultProps) {
  if (result.status === "idle") {
    return <div className="py-6 text-center text-gray-500">Enter a search term to find items</div>;
  }

  if (result.status === "loading") {
    return <div className="py-6 text-center text-gray-500">Searching...</div>;
  }

  if (result.status === "not_found") {
    return (
      <div className="py-6 text-center text-gray-500">
        No {type.replace("_", " ")} found for "{result.query}"
      </div>
    );
  }

  switch (type) {
    case "radicals":
      return <RadicalCard radical={result.item as Radical} />;
    case "kanji": {
      const kanji = result.item as Kanji;
      return (
        <div className="space-y-3">
          <KanjiCard kanji={kanji} />
          {kanji.componentRadicals.map((radical) => (
            <div key={radical.id} id={`radical-${radical.id}`} className="ml-3">
              <RadicalCard radical={radical} />
            </div>
          ))}
        </div>
      );
    }
    case "vocabulary": {
      const vocabulary = result.item as Vocabulary | KanaVocabulary;
      const componentKanji =
        vocabulary.object === "vocabulary" ? (vocabulary as Vocabulary).componentKanji : [];
      return (
        <div className="space-y-3">
          <VocabularyCard vocabulary={vocabulary} />
          {componentKanji.map((kanjiItem) => (
            <Fragment key={kanjiItem.id}>
              <div id={`kanji-${kanjiItem.id}`} className="ml-3">
                <KanjiCard kanji={kanjiItem} />
              </div>
              {kanjiItem.componentRadicals.map((radical) => (
                <div key={radical.id} id={`radical-${radical.id}`} className="ml-6">
                  <RadicalCard radical={radical} />
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      );
    }
  }
}
