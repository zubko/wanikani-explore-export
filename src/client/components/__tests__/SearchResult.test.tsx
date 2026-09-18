import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Radical } from "@/model/wanikani.ts";
import { installApiMock } from "@/test/api-mock.ts";
import { click, mountCard, typeInto } from "@/test/render.tsx";
import { SearchResult } from "@client/components/SearchResult.tsx";
import { SERVER_UNREACHABLE_MESSAGE } from "@client/utils/request-error.ts";

type Result = Parameters<typeof SearchResult>[0]["result"];

type RadicalParams = { id: number; characters: string; meaning: string };

installApiMock();

function render(result: Result): string {
  return renderToStaticMarkup(<SearchResult type="kanji" result={result} onRetry={() => {}} />);
}

function radicalResult({ id, characters, meaning }: RadicalParams) {
  const radical: Radical = {
    object: "radical",
    id,
    characters,
    characterImages: [],
    slug: meaning.toLowerCase(),
    level: 1,
    documentUrl: `https://www.wanikani.com/radicals/${meaning.toLowerCase()}`,
    meanings: [{ meaning, primary: true, accepted_answer: true }],
    auxiliaryMeanings: [],
    meaningMnemonic: `This radical is the ${meaning.toLowerCase()}.`,
    amalgamationSubjectIds: [],
    studyMaterial: null,
    localStudyMaterial: null,
    mnemonicImageUrl: null,
    foundInKanji: [],
  };
  return (
    <SearchResult type="radicals" result={{ status: "found", item: radical }} onRetry={() => {}} />
  );
}

describe("SearchResult error state", () => {
  it("shows the message and a Retry button, never the not-found text", () => {
    const html = render({ status: "error", message: SERVER_UNREACHABLE_MESSAGE });

    expect(html).toContain(SERVER_UNREACHABLE_MESSAGE);
    expect(html).toContain("Retry");
    expect(html).not.toContain("No kanji found");
  });

  it("shows a server status message", () => {
    expect(render({ status: "error", message: "Server error (500)" })).toContain(
      "Server error (500)"
    );
  });

  it("still shows the not-found text for a real miss", () => {
    const html = render({ status: "not_found", query: "zzz" });

    expect(html).toContain("No kanji found for");
    expect(html).toContain("zzz");
    expect(html).not.toContain("Retry");
  });

  it("wires the Retry button to onRetry", () => {
    let calls = 0;
    const tree = SearchResult({
      type: "kanji",
      result: { status: "error", message: "Server error (500)" },
      onRetry: () => calls++,
    });

    findButtonOnClick(tree)?.();

    expect(calls).toBe(1);
  });
});

describe("SearchResult card identity", () => {
  // guards the `key` on the top-level cards
  it("drops an open editor when the next search answers with another subject", () => {
    const view = mountCard(radicalResult({ id: 1, characters: "一", meaning: "Ground" }));

    click(view.findByLabel("+ Add Note"));
    typeInto(view.find("textarea"), "Draft of the first radical");

    view.rerender(radicalResult({ id: 2, characters: "丨", meaning: "Stick" }));

    expect(view.html()).not.toContain("<textarea");
    expect(view.html()).not.toContain("Draft of the first radical");
    expect(view.findAllByLabel("+ Add Note")).toHaveLength(1);
  });
});

function findButtonOnClick(node: unknown): (() => void) | undefined {
  if (Array.isArray(node)) return node.map(findButtonOnClick).find(Boolean);
  if (!node || typeof node !== "object") return undefined;
  const element = node as { type?: unknown; props?: { children?: unknown; onClick?: () => void } };
  if (element.type === "button") return element.props?.onClick;
  return findButtonOnClick(element.props?.children);
}
