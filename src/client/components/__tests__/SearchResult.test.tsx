import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchResult } from "@client/components/SearchResult.tsx";
import { SERVER_UNREACHABLE_MESSAGE } from "@client/utils/search-error.ts";

type Result = Parameters<typeof SearchResult>[0]["result"];

function render(result: Result): string {
  return renderToStaticMarkup(<SearchResult type="kanji" result={result} onRetry={() => {}} />);
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

function findButtonOnClick(node: unknown): (() => void) | undefined {
  if (Array.isArray(node)) return node.map(findButtonOnClick).find(Boolean);
  if (!node || typeof node !== "object") return undefined;
  const element = node as { type?: unknown; props?: { children?: unknown; onClick?: () => void } };
  if (element.type === "button") return element.props?.onClick;
  return findButtonOnClick(element.props?.children);
}
