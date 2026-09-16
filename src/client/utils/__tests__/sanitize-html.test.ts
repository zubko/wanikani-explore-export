import { describe, expect, it } from "bun:test";
import { sanitizeHtml } from "@client/utils/sanitize-html.ts";

describe("sanitizeHtml", () => {
  it("preserves mnemonic tags", () => {
    const html = "The <radical>ground</radical> radical combined with <kanji>big</kanji>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("preserves all custom mnemonic tag types", () => {
    const html =
      "<radical>r</radical> <kanji>k</kanji> <vocabulary>v</vocabulary> <reading>re</reading>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("strips script tags", () => {
    const html = 'Hello <script>alert("xss")</script> world';
    expect(sanitizeHtml(html)).toBe("Hello  world");
  });

  it("strips event handlers", () => {
    const html = '<img src="x" onerror="alert(1)">';
    expect(sanitizeHtml(html)).toBe('<img src="x">');
  });

  it("strips javascript: URLs", () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    expect(sanitizeHtml(html)).toBe("<a>click</a>");
  });

  it("preserves normal HTML formatting", () => {
    const html = "This is <strong>bold</strong> and <em>italic</em>";
    expect(sanitizeHtml(html)).toBe(html);
  });
});
