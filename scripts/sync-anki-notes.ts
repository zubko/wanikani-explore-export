import { parseArgs } from "util";

import type { AnkiAddResult } from "../src/model/wanikani.ts";
import { formatError } from "./lib/format-error.ts";

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

type AddToAnkiResponse = { ok: true; data: AnkiAddResult } | { ok: false; error: string };

type AnkiSyncResponse = { ok: true } | { ok: false; error: string };

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
    body: JSON.stringify({ id, type, sync: false }),
  });
  return (await response.json()) as AddToAnkiResponse;
}

async function syncAnkiWeb(baseUrl: string): Promise<AnkiSyncResponse> {
  const response = await fetch(`${baseUrl}/api/anki-sync`, { method: "POST" });
  return (await response.json()) as AnkiSyncResponse;
}

// === Main ===

async function fetchResolvedNotes(baseUrl: string, type: string): Promise<AnkiNoteItem[]> {
  process.stdout.write(`Fetching ${type} notes from Anki... `);
  const notesResult = await fetchAnkiNotes(baseUrl, type);

  if (!notesResult.ok) {
    console.log("FAILED");
    console.error(`Error: ${notesResult.error}`);
    process.exit(1);
  }

  const allNotes = notesResult.data;
  console.log(`OK (${allNotes.length} items)`);

  const unresolved = allNotes.filter((n) => n.wkId === null);
  if (unresolved.length > 0) {
    console.log(`\n⚠️  ${unresolved.length} ${type} items not found in WaniKani data:`);
    for (const item of unresolved) {
      console.log(`   - ${item.characters}`);
    }
    console.log();
  }

  return allNotes.filter((n) => n.wkId !== null);
}

function padIndex(index: number, total: number): string {
  const width = String(total).length;
  return String(index).padStart(width);
}

function takeLimit<T>(items: T[], limit: number | undefined): T[] {
  return limit === undefined ? items : items.slice(0, limit);
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

  process.stdout.write("Syncing with AnkiWeb... ");
  const syncResult = await syncAnkiWeb(args.baseUrl).catch(
    (err): AnkiSyncResponse => ({ ok: false, error: formatError(err) })
  );
  if (!syncResult.ok) {
    console.log(`FAILED: ${syncResult.error}`);
    process.exit(1);
  }
  console.log("OK");

  const words = await fetchResolvedNotes(args.baseUrl, "vocabulary");
  const kanji = await fetchResolvedNotes(args.baseUrl, "kanji");

  if (words.length === 0 && kanji.length === 0) {
    console.log("\nNo items to update.");
    return;
  }

  if (args.dryRun) {
    const listed = takeLimit([...words, ...kanji], args.limit);
    console.log(`\nWould update up to ${listed.length} items.`);
    console.log("A real run skips the kanji that a word update already refreshed.\n");
    for (const [i, item] of listed.entries()) {
      console.log(`[${padIndex(i + 1, listed.length)}/${listed.length}] ${formatNote(item)}`);
    }
    console.log(`\n[DRY RUN] No notes written.`);
    return;
  }

  const startTime = Date.now();

  const wordBatch = takeLimit(words, args.limit);
  console.log(`\nUpdating ${wordBatch.length} words...\n`);
  const wordResults = await updateNotes(args.baseUrl, wordBatch);

  // A word update also writes its kanji, so only the kanji that no word update wrote need their own
  const refreshedKanji = new Set(
    wordResults.flatMap((result) => result.kanji.map((k) => k.character))
  );
  const kanjiBatch = takeLimit(
    kanji.filter((note) => !refreshedKanji.has(note.characters)),
    args.limit === undefined ? undefined : args.limit - wordBatch.length
  );
  if (kanjiBatch.length > 0) {
    console.log(`\nUpdating ${kanjiBatch.length} kanji with no word...\n`);
    await updateNotes(args.baseUrl, kanjiBatch);
  }

  const updated = wordBatch.length + kanjiBatch.length;
  let synced = false;
  if (updated > 0) {
    process.stdout.write("\nSyncing to AnkiWeb... ");
    try {
      const result = await syncAnkiWeb(args.baseUrl);
      synced = result.ok;
      console.log(result.ok ? "OK" : `FAILED: ${result.error}`);
    } catch (err) {
      console.log(`FAILED: ${formatError(err)}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log();
  console.log("=".repeat(50));
  console.log("Summary");
  console.log("-".repeat(50));
  console.log(`Words:   ${wordBatch.length}`);
  console.log(`Kanji:   ${kanjiBatch.length}`);
  console.log(`Synced:  ${updated > 0 ? (synced ? "yes" : "no") : "nothing to sync"}`);
  console.log(`Time:    ${elapsed}s`);
  console.log("=".repeat(50));

  if (updated > 0 && !synced) process.exit(1);
}

async function updateNotes(baseUrl: string, items: AnkiNoteItem[]): Promise<AnkiAddResult[]> {
  const spinner = createSpinner();
  const results: AnkiAddResult[] = [];

  for (const [i, item] of items.entries()) {
    const prefix = `[${padIndex(i + 1, items.length)}/${items.length}]`;
    spinner.start(`${prefix} `);

    const result = await addToAnki(baseUrl, item.wkId!, item.wkType!).catch(
      (err): AddToAnkiResponse => ({ ok: false, error: formatError(err) })
    );
    if (!result.ok) {
      spinner.stop(`${prefix} ❌ ${formatNote(item)} - ${result.error}`);
      console.error("\nStopped at the first failed update. Nothing was synced to AnkiWeb.");
      process.exit(1);
    }

    spinner.stop(`${prefix} ✅ ${formatNote(item)}`);
    results.push(result.data);
  }

  return results;
}

function formatNote(item: AnkiNoteItem): string {
  return `${item.characters} (${item.meaning})`;
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
