import { readFile } from "fs/promises";

import {
  KANJI_MODEL_NAME,
  RADICAL_MODEL_NAME,
  VOCABULARY_MODEL_NAME,
} from "../../src/model/anki-models.ts";
import {
  diffTemplateFields,
  parseTemplateFields,
  type ModelFieldProblem,
} from "./anki-template-fields.ts";
import { formatError } from "./format-error.ts";

type TemplateConfig = {
  file: string;
  modelName: string;
};

export type LoadedTemplate = TemplateConfig & {
  content: string;
};

export type TemplateFieldProblem = ModelFieldProblem & {
  file: string;
  templateFields: string[];
  modelFields: string[];
};

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";

const TEMPLATES_DIR = "src/anki-templates";

const TEMPLATES: TemplateConfig[] = [
  { file: "radicals.md", modelName: RADICAL_MODEL_NAME },
  { file: "kanji.md", modelName: KANJI_MODEL_NAME },
  { file: "vocabulary.md", modelName: VOCABULARY_MODEL_NAME },
];

export async function ankiInvoke<T>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch {
    throw new Error("Failed to connect to Anki. Is Anki running with AnkiConnect?");
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`AnkiConnect error (${action}): ${data.error}`);
  }

  return data.result as T;
}

export async function loadTemplates(): Promise<LoadedTemplate[]> {
  return Promise.all(
    TEMPLATES.map(async (config) => ({
      ...config,
      content: await readTemplateFile(config.file),
    }))
  );
}

export async function collectFieldProblems(
  templates: LoadedTemplate[]
): Promise<TemplateFieldProblem[]> {
  const problems: TemplateFieldProblem[] = [];

  for (const config of templates) {
    let templateFields: string[];
    try {
      templateFields = parseTemplateFields(config.content);
    } catch (err) {
      throw new Error(`${getTemplatePath(config.file)}: ${formatError(err)}`);
    }

    const modelFields = await ankiInvoke<string[]>("modelFieldNames", {
      modelName: config.modelName,
    });

    const { missing, extra } = diffTemplateFields(templateFields, modelFields);
    if (missing.length > 0 || extra.length > 0) {
      problems.push({
        modelName: config.modelName,
        file: config.file,
        templateFields,
        modelFields,
        missing,
        extra,
      });
    }
  }

  return problems;
}

export function getTemplatePath(file: string): string {
  return `${TEMPLATES_DIR}/${file}`;
}

async function readTemplateFile(file: string): Promise<string> {
  try {
    return await readFile(getTemplatePath(file), "utf-8");
  } catch (err) {
    throw new Error(`${getTemplatePath(file)}: ${formatError(err)}`);
  }
}
