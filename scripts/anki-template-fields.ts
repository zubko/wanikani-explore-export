export type TemplateFieldDiff = {
  missing: string[];
  extra: string[];
};

export type ModelFieldProblem = TemplateFieldDiff & {
  modelName: string;
};

const FIELD_LINE = /^-[ \t]+`([^`]+)`/gm;

const NEXT_SECTION_HEADER = /^## /m;

export function parseTemplateFields(content: string): string[] {
  const section = extractSection(content, "Fields");

  const fields: string[] = [];
  for (const match of section.matchAll(FIELD_LINE)) {
    const name = match[1];
    if (name) fields.push(name);
  }

  if (fields.length === 0) {
    throw new Error('Section "Fields" has no field lines');
  }

  return fields;
}

export function extractSection(content: string, header: string): string {
  const headerPattern = new RegExp(`^## ${escapeRegExp(header)}[ \\t]*$`, "m");
  const headerMatch = content.match(headerPattern);
  if (!headerMatch || headerMatch.index === undefined) {
    throw new Error(`Section "${header}" not found`);
  }

  const rest = content.slice(headerMatch.index + headerMatch[0].length);
  const nextSectionMatch = rest.match(NEXT_SECTION_HEADER);

  return nextSectionMatch?.index === undefined ? rest : rest.slice(0, nextSectionMatch.index);
}

export function diffTemplateFields(
  templateFields: string[],
  modelFields: string[]
): TemplateFieldDiff {
  return {
    missing: templateFields.filter((field) => !modelFields.includes(field)),
    extra: modelFields.filter((field) => !templateFields.includes(field)),
  };
}

export function isInTemplateOrder(templateFields: string[], modelFields: string[]): boolean {
  const shared = modelFields.filter((field) => templateFields.includes(field));
  const expected = templateFields.filter((field) => modelFields.includes(field));

  return shared.every((field, index) => field === expected[index]);
}

export function formatFieldProblems(problems: ModelFieldProblem[]): string[] {
  const lines: string[] = [];

  for (const { modelName, missing, extra } of problems) {
    if (missing.length > 0) {
      lines.push(`${modelName}: missing ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      lines.push(`${modelName}: extra ${extra.join(", ")}`);
    }
  }

  return lines;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
