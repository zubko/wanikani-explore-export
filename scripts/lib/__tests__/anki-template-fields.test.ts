import { describe, expect, it } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  diffTemplateFields,
  extractSection,
  formatFieldProblems,
  isInTemplateOrder,
  parseTemplateFields,
} from "../anki-template-fields.ts";
import {
  RADICAL_EXPECTED_FIELDS,
  KANJI_EXPECTED_FIELDS,
  VOCABULARY_EXPECTED_FIELDS,
} from "@/model/anki-models.ts";

const TEMPLATES_DIR = join(import.meta.dir, "../../../src/anki-templates");

const TEMPLATES = [
  { file: "radicals.md", expectedFields: RADICAL_EXPECTED_FIELDS },
  { file: "kanji.md", expectedFields: KANJI_EXPECTED_FIELDS },
  { file: "vocabulary.md", expectedFields: VOCABULARY_EXPECTED_FIELDS },
];

// Anki special references that are not note fields
const NON_FIELD_TOKENS = ["FrontSide", "Tags", "Type", "Deck", "Subdeck", "Card", "CardFlag"];

const HTML_CODE_BLOCK = /```html\n([\s\S]*?)```/g;
// Anki allows filters before the field name: {{text:field}}, {{furigana:text:field}}
const TEMPLATE_TOKEN = /\{\{[#^/]?(?:[a-zA-Z][a-zA-Z0-9_-]*:)*([a-zA-Z_][a-zA-Z0-9_-]*)\}\}/g;

describe("parseTemplateFields", () => {
  it("returns the vocabulary fields in file order", async () => {
    const content = await readTemplate("vocabulary.md");

    expect(parseTemplateFields(content)).toEqual(VOCABULARY_EXPECTED_FIELDS);
  });

  it("takes only the first backticked token of a line", async () => {
    const content = await readTemplate("radicals.md");

    // radicals.md describes `character` as "Radical character or `<img>` tag"
    expect(parseTemplateFields(content)[0]).toBe("character");
  });

  it("ignores field lines outside the Fields section", () => {
    const content = [
      "# Title",
      "",
      "- `before_section` - not a field",
      "",
      "## Fields",
      "",
      "- `real_field` - a field",
      "",
      "## Front Template",
      "",
      "- `after_section` - not a field",
      "",
    ].join("\n");

    expect(parseTemplateFields(content)).toEqual(["real_field"]);
  });

  it("reads to the end of the file when Fields is the last section", () => {
    const content = "# Title\n\n## Fields\n\n- `only_field` - a field\n";

    expect(parseTemplateFields(content)).toEqual(["only_field"]);
  });

  it("skips a line that does not start with a dash", () => {
    const content = "## Fields\n\n- `real_field` - a field\n  - `nested` - a sub-bullet\n";

    expect(parseTemplateFields(content)).toEqual(["real_field"]);
  });

  it("throws when the Fields section is missing", () => {
    const content = "# Title\n\n## Front Template\n\n- `field` - description\n";

    expect(() => parseTemplateFields(content)).toThrow('Section "Fields" not found');
  });

  it("throws when the Fields section is empty and the next header follows right away", () => {
    const content = "## Fields\n## Front Template\n\n- `field` - description\n";

    expect(() => parseTemplateFields(content)).toThrow('Section "Fields" has no field lines');
  });
});

describe("extractSection", () => {
  it("returns the text between the header and the next header", () => {
    const content = "## Front Template\n\nbody\n\n## Back Template\n\nother\n";

    expect(extractSection(content, "Front Template")).toBe("\n\nbody\n\n");
  });

  it("takes the header as plain text, not as a pattern", () => {
    const content = "## Styling (CSS)\n\nbody\n";

    expect(extractSection(content, "Styling (CSS)")).toBe("\n\nbody\n");
  });

  it("throws when the header is missing", () => {
    expect(() => extractSection("## Other\n", "Fields")).toThrow('Section "Fields" not found');
  });
});

describe("diffTemplateFields", () => {
  it("returns nothing when both lists match", () => {
    expect(diffTemplateFields(["a", "b", "c"], ["a", "b", "c"])).toEqual({
      missing: [],
      extra: [],
    });
  });

  it("keeps template order for fields the model lacks", () => {
    expect(diffTemplateFields(["a", "b", "c", "d"], ["c"])).toEqual({
      missing: ["a", "b", "d"],
      extra: [],
    });
  });

  it("reports fields the model has and the template does not list", () => {
    expect(diffTemplateFields(["a", "b"], ["a", "b", "old_one"])).toEqual({
      missing: [],
      extra: ["old_one"],
    });
  });

  it("reports both directions at once", () => {
    expect(diffTemplateFields(["a", "new_one"], ["a", "old_one"])).toEqual({
      missing: ["new_one"],
      extra: ["old_one"],
    });
  });

  it("handles empty lists", () => {
    expect(diffTemplateFields([], [])).toEqual({ missing: [], extra: [] });
    expect(diffTemplateFields([], ["a"])).toEqual({ missing: [], extra: ["a"] });
    expect(diffTemplateFields(["a"], [])).toEqual({ missing: ["a"], extra: [] });
  });
});

describe("isInTemplateOrder", () => {
  it("accepts the same list", () => {
    expect(isInTemplateOrder(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
  });

  it("accepts a subset that keeps template order", () => {
    expect(isInTemplateOrder(["a", "b", "c"], ["a", "c"])).toBe(true);
  });

  it("rejects a subset in another order", () => {
    expect(isInTemplateOrder(["a", "b", "c"], ["c", "a"])).toBe(false);
  });

  it("rejects a swapped pair", () => {
    expect(isInTemplateOrder(["a", "b", "c"], ["b", "a", "c"])).toBe(false);
  });

  it("looks only at fields both lists hold", () => {
    expect(isInTemplateOrder(["a", "b"], ["a", "old_one", "b"])).toBe(true);
    expect(isInTemplateOrder(["a", "b"], ["b", "old_one", "a"])).toBe(false);
  });

  it("accepts empty lists", () => {
    expect(isInTemplateOrder([], [])).toBe(true);
    expect(isInTemplateOrder(["a", "b"], [])).toBe(true);
    expect(isInTemplateOrder([], ["a"])).toBe(true);
  });
});

describe("formatFieldProblems", () => {
  it("returns no line for an empty list", () => {
    expect(formatFieldProblems([])).toEqual([]);
  });

  it("writes one line per direction", () => {
    expect(
      formatFieldProblems([
        { modelName: "Japanese Vocabulary", missing: ["masu_form"], extra: [] },
        { modelName: "Japanese Kanji", missing: [], extra: ["old_field"] },
      ])
    ).toEqual(["Japanese Vocabulary: missing masu_form", "Japanese Kanji: extra old_field"]);
  });

  it("writes both lines for one model, missing first", () => {
    expect(
      formatFieldProblems([{ modelName: "Japanese Kanji", missing: ["a", "b"], extra: ["c"] }])
    ).toEqual(["Japanese Kanji: missing a, b", "Japanese Kanji: extra c"]);
  });
});

describe("template fields match the service field list", () => {
  for (const { file, expectedFields } of TEMPLATES) {
    it(`${file} lists the same fields in the same order`, async () => {
      const content = await readTemplate(file);

      expect(parseTemplateFields(content)).toEqual(expectedFields);
    });
  }
});

describe("template markup only references declared fields", () => {
  for (const { file } of TEMPLATES) {
    it(`${file} has no unknown {{...}} reference`, async () => {
      const content = await readTemplate(file);
      const fields = parseTemplateFields(content);

      expect(collectTemplateTokens(content).filter((t) => !fields.includes(t))).toEqual([]);
    });
  }
});

async function readTemplate(file: string): Promise<string> {
  return readFile(join(TEMPLATES_DIR, file), "utf-8");
}

function collectTemplateTokens(content: string): string[] {
  const tokens = new Set<string>();
  for (const block of content.matchAll(HTML_CODE_BLOCK)) {
    for (const match of (block[1] ?? "").matchAll(TEMPLATE_TOKEN)) {
      const name = match[1];
      if (name && !NON_FIELD_TOKENS.includes(name)) tokens.add(name);
    }
  }
  return [...tokens];
}
