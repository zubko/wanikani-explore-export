import { readFile } from "fs/promises";
import { existsSync } from "fs";

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";

type TemplateConfig = {
  file: string;
  modelName: string;
};

const TEMPLATES_DIR = "src/anki-templates";

const TEMPLATES: TemplateConfig[] = [
  { file: "radicals.md", modelName: "Japanese Radicals" },
  { file: "kanji.md", modelName: "Japanese Kanji" },
  { file: "vocabulary.md", modelName: "Japanese Vocabulary" },
];

type ParsedTemplate = {
  front: string;
  back: string;
  css: string;
};

async function ankiInvoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
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

function extractCodeBlock(content: string, sectionHeader: string, lang: string): string {
  const headerPattern = new RegExp(`## ${sectionHeader}\\s*\\n`);
  const headerMatch = content.match(headerPattern);
  if (!headerMatch || headerMatch.index === undefined) {
    throw new Error(`Section "${sectionHeader}" not found`);
  }

  const sectionStart = headerMatch.index + headerMatch[0].length;
  const nextSectionMatch = content.slice(sectionStart).match(/\n## /);
  const sectionEnd = nextSectionMatch?.index
    ? sectionStart + nextSectionMatch.index
    : content.length;

  const sectionContent = content.slice(sectionStart, sectionEnd);

  const codeBlockPattern = new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\`\`\``, "m");
  const codeMatch = sectionContent.match(codeBlockPattern);
  if (!codeMatch) {
    throw new Error(`No ${lang} code block found in "${sectionHeader}" section`);
  }

  return codeMatch[1].trim();
}

function parseTemplateFile(content: string): ParsedTemplate {
  return {
    front: extractCodeBlock(content, "Front Template", "html"),
    back: extractCodeBlock(content, "Back Template", "html"),
    css: extractCodeBlock(content, "Styling \\(CSS\\)", "css"),
  };
}

function getTemplatePath(file: string): string {
  return `${TEMPLATES_DIR}/${file}`;
}

async function syncTemplate(config: TemplateConfig): Promise<void> {
  const content = await readFile(getTemplatePath(config.file), "utf-8");
  const template = parseTemplateFile(content);

  await ankiInvoke("updateModelTemplates", {
    model: {
      name: config.modelName,
      templates: {
        "Card 1": { Front: template.front, Back: template.back },
      },
    },
  });

  await ankiInvoke("updateModelStyling", {
    model: {
      name: config.modelName,
      css: template.css,
    },
  });
}

function validateTemplateFilesExist(): void {
  const missingFiles = TEMPLATES.filter((t) => !existsSync(getTemplatePath(t.file)));
  if (missingFiles.length === 0) return;

  console.error("Missing template files:");
  for (const t of missingFiles) {
    console.error(`  - ${getTemplatePath(t.file)}`);
  }
  process.exit(1);
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  console.log("Syncing Anki Templates\n");
  console.log("=".repeat(40));

  validateTemplateFilesExist();

  let failedCount = 0;

  for (const config of TEMPLATES) {
    process.stdout.write(`\n${config.modelName}... `);
    try {
      await syncTemplate(config);
      console.log("OK");
    } catch (err) {
      failedCount++;
      console.log("FAILED");
      console.error(`  Error: ${getErrorMessage(err)}`);
    }
  }

  console.log("\n" + "=".repeat(40));

  const successCount = TEMPLATES.length - failedCount;

  if (failedCount === 0) {
    console.log("\nSyncing to AnkiWeb...");
    await ankiInvoke("sync");
    console.log("Done!");
  }

  console.log(`\nSummary: ${successCount} synced, ${failedCount} failed`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", getErrorMessage(err));
  process.exit(1);
});
