import { extractSection, formatFieldProblems } from "./anki-template-fields.ts";
import {
  ankiInvoke,
  collectFieldProblems,
  loadTemplates,
  type LoadedTemplate,
} from "./anki-templates.ts";
import { formatError } from "./format-error.ts";

type ParsedTemplate = {
  front: string;
  back: string;
  css: string;
};

async function main(): Promise<void> {
  console.log("Syncing Anki Templates\n");
  console.log("=".repeat(40));

  const templates = await loadTemplates();

  await checkModelFields(templates);

  let failedCount = 0;

  for (const config of templates) {
    process.stdout.write(`\n${config.modelName}... `);
    try {
      await syncTemplate(config);
      console.log("OK");
    } catch (err) {
      failedCount++;
      console.log("FAILED");
      console.error(`  Error: ${formatError(err)}`);
    }
  }

  console.log("\n" + "=".repeat(40));
  console.log(`\nSummary: ${templates.length - failedCount} synced, ${failedCount} failed`);

  if (failedCount > 0) {
    process.exit(1);
  }

  await syncToAnkiWeb();
}

async function checkModelFields(templates: LoadedTemplate[]): Promise<void> {
  const problems = await collectFieldProblems(templates);
  if (problems.length === 0) return;

  console.error("");
  for (const line of formatFieldProblems(problems)) {
    console.error(line);
  }
  console.error("\nRun `bun run sync-anki-fields` to add missing fields.");
  console.error("Remove extra fields in Anki by hand.");
  console.error("\nNothing was synced.");
  process.exit(1);
}

async function syncTemplate(config: LoadedTemplate): Promise<void> {
  const template = parseTemplateFile(config.content);

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

// A collection with no AnkiWeb account cannot sync, and that must not fail the push
async function syncToAnkiWeb(): Promise<void> {
  console.log("\nSyncing to AnkiWeb...");
  try {
    await ankiInvoke("sync");
    console.log("Done!");
  } catch (err) {
    console.error(`Warning: AnkiWeb sync failed: ${formatError(err)}`);
    console.error("The templates are in Anki. Sync from Anki when you can.");
  }
}

function parseTemplateFile(content: string): ParsedTemplate {
  return {
    front: extractCodeBlock(content, "Front Template", "html"),
    back: extractCodeBlock(content, "Back Template", "html"),
    css: extractCodeBlock(content, "Styling (CSS)", "css"),
  };
}

function extractCodeBlock(content: string, sectionHeader: string, lang: string): string {
  const section = extractSection(content, sectionHeader);

  const codeBlockPattern = new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\`\`\``, "m");
  const code = section.match(codeBlockPattern)?.[1];
  if (code === undefined) {
    throw new Error(`No ${lang} code block found in "${sectionHeader}" section`);
  }

  return code.trim();
}

main().catch((err) => {
  console.error("\nFatal error:", formatError(err));
  process.exit(1);
});
