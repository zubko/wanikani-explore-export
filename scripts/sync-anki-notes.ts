import { parseArgs } from "util";

type CliArgs = {
  baseUrl: string;
  dryRun: boolean;
  limit: number | undefined;
};

type AnkiNoteItem = {
  characters: string;
  meaning: string;
  wkId: number | null;
  wkType: string | null;
};

type AnkiNotesResponse = { ok: true; data: AnkiNoteItem[] } | { ok: false; error: string };

type AddToAnkiResponse = { ok: true; data: unknown } | { ok: false; error: string };

// === CLI ===

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string", short: "b", default: "http://localhost:5173" },
      "dry-run": { type: "boolean", short: "d", default: false },
      limit: { type: "string", short: "l" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run scripts/update-anki-data.ts [options]

Options:
  -b, --base-url <url>  Backend URL (default: http://localhost:5173)
  -l, --limit <n>       Limit the number of items to update
  -d, --dry-run         List items without updating
  -h, --help            Show this help message
`);
    process.exit(0);
  }

  return {
    baseUrl: values["base-url"] ?? "http://localhost:5173",
    dryRun: values["dry-run"] ?? false,
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
  };
}

// === Spinner ===

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function createSpinner() {
  let frameIndex = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentLine = "";

  return {
    start(line: string) {
      currentLine = line;
      frameIndex = 0;
      timer = setInterval(() => {
        frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
        process.stdout.write(`\r${currentLine}${SPINNER_FRAMES[frameIndex]} `);
      }, 80);
      process.stdout.write(`\r${currentLine}${SPINNER_FRAMES[frameIndex]} `);
    },
    stop(finalLine: string) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      process.stdout.write(`\r${finalLine}\n`);
    },
  };
}

// === API ===

async function fetchAnkiNotes(baseUrl: string, type: string): Promise<AnkiNotesResponse> {
  const response = await fetch(`${baseUrl}/api/anki-notes?type=${type}`);
  return (await response.json()) as AnkiNotesResponse;
}

async function addToAnki(baseUrl: string, id: number, type: string): Promise<AddToAnkiResponse> {
  const response = await fetch(`${baseUrl}/api/add-to-anki`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type }),
  });
  return (await response.json()) as AddToAnkiResponse;
}

// === Main ===

function padIndex(index: number, total: number): string {
  const width = String(total).length;
  return String(index).padStart(width);
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  console.log("\nUpdate Anki Data\n");
  console.log("=".repeat(50));
  console.log(`Backend: ${args.baseUrl}`);
  if (args.dryRun) console.log("Mode: DRY RUN");
  if (args.limit) console.log(`Limit: ${args.limit}`);
  console.log("=".repeat(50));
  console.log();

  process.stdout.write("Fetching vocabulary notes from Anki... ");
  const notesResult = await fetchAnkiNotes(args.baseUrl, "vocabulary");

  if (!notesResult.ok) {
    console.log("FAILED");
    console.error(`Error: ${notesResult.error}`);
    process.exit(1);
  }

  const allNotes = notesResult.data;
  console.log(`OK (${allNotes.length} items)`);

  const unresolved = allNotes.filter((n) => n.wkId === null);
  if (unresolved.length > 0) {
    console.log(`\n⚠️  ${unresolved.length} items not found in WaniKani data:`);
    for (const item of unresolved) {
      console.log(`   - ${item.characters}`);
    }
  }

  let processable = allNotes.filter((n) => n.wkId !== null);

  if (args.limit && args.limit < processable.length) {
    processable = processable.slice(0, args.limit);
  }

  if (processable.length === 0) {
    console.log("\nNo items to update.");
    return;
  }

  console.log(`\n${args.dryRun ? "Would update" : "Updating"} ${processable.length} items...\n`);

  if (args.dryRun) {
    for (let i = 0; i < processable.length; i++) {
      const item = processable[i];
      console.log(
        `[${padIndex(i + 1, processable.length)}/${processable.length}] ${item.characters} (${item.meaning})`
      );
    }
    console.log(`\n[DRY RUN] No changes made.`);
    return;
  }

  const spinner = createSpinner();
  let updated = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < processable.length; i++) {
    const item = processable[i];
    const prefix = `[${padIndex(i + 1, processable.length)}/${processable.length}]`;

    spinner.start(`${prefix} `);

    try {
      const result = await addToAnki(args.baseUrl, item.wkId!, item.wkType!);
      if (result.ok) {
        spinner.stop(`${prefix} ✅ ${item.characters} (${item.meaning})`);
        updated++;
      } else {
        spinner.stop(`${prefix} ❌ ${item.characters} (${item.meaning}) - ${result.error}`);
        errors++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spinner.stop(`${prefix} ❌ ${item.characters} (${item.meaning}) - ${message}`);
      errors++;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log();
  console.log("=".repeat(50));
  console.log("Summary");
  console.log("-".repeat(50));
  console.log(`Total:   ${processable.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors:  ${errors}`);
  console.log(`Time:    ${elapsed}s`);
  console.log("=".repeat(50));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
