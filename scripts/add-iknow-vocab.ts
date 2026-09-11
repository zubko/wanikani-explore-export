import { parseArgs } from "util";
import { readFile } from "fs/promises";
import { join } from "path";

import { formatError } from "./lib/format-error.ts";
import { saveJsonAtomic } from "./lib/llm-utils.ts";
import {
  createInitialStatus,
  parseCourseFiles,
  parseGoalItems,
  rollOverToNextFile,
  type IknowItem,
  type VocabStatus,
} from "./lib/iknow-vocab.ts";

type CliArgs = {
  baseUrl: string;
  dryRun: boolean;
  limit: number;
};

type SearchResponse = { found: true; data: { id: number; object: string } } | { found: false };

type AnkiNotesResponse =
  | { ok: true; data: { characters: string }[] }
  | { ok: false; error: string };

type AddToAnkiResponse = { ok: true; data: unknown } | { ok: false; error: string };

type AnkiSyncResponse = { ok: true } | { ok: false; error: string };

const IKNOW_DIR = "data/userdata/iknow";
const SERIES_FILE = join(IKNOW_DIR, "japanese-core-1000-series.json");
const STATUS_FILE = "data/userdata/iknow-vocabulary-status.json";
const DEFAULT_BASE_URL = "http://localhost:5173";
const DEFAULT_LIMIT = 15;

// === CLI ===

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string", short: "b", default: DEFAULT_BASE_URL },
      "dry-run": { type: "boolean", short: "d", default: false },
      limit: { type: "string", short: "l" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run scripts/add-iknow-vocab.ts [options]

Adds the next iKnow course words to the Anki vocabulary deck.
The dev server must be running.

Options:
  -b, --base-url <url>  Backend URL (default: ${DEFAULT_BASE_URL})
  -l, --limit <n>       How many words to really add (default: ${DEFAULT_LIMIT})
  -d, --dry-run         Search only, add nothing, write no status
  -h, --help            Show this help message
`);
    process.exit(0);
  }

  const limit = values.limit ? Number(values.limit) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid limit: ${values.limit}`);
  }

  return {
    baseUrl: values["base-url"] ?? DEFAULT_BASE_URL,
    dryRun: values["dry-run"] ?? false,
    limit,
  };
}

// === API ===

async function search(baseUrl: string, word: string): Promise<SearchResponse> {
  const url = `${baseUrl}/api/search?type=vocabulary&q=${encodeURIComponent(word)}`;
  const response = await fetch(url);
  if (!response.ok && response.status !== 404) {
    throw new Error(`Search ${word} failed with status ${response.status}`);
  }
  return (await response.json()) as SearchResponse;
}

async function fetchAnkiWords(baseUrl: string): Promise<Set<string>> {
  const response = await fetch(`${baseUrl}/api/anki-notes?type=vocabulary`);
  const result = (await response.json()) as AnkiNotesResponse;
  if (!result.ok) throw new Error(result.error);
  return new Set(result.data.map((note) => note.characters));
}

async function addToAnki(baseUrl: string, id: number, type: string): Promise<AddToAnkiResponse> {
  const response = await fetch(`${baseUrl}/api/add-to-anki`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // syncing per word would answer ok:false for a word that is already written, and run one
    // full AnkiWeb sync per word — the run syncs once at the end instead
    body: JSON.stringify({ id, type, sync: false }),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Add ${id} failed with status ${response.status}`);
  }
  return (await response.json()) as AddToAnkiResponse;
}

async function syncAnkiWeb(baseUrl: string): Promise<AnkiSyncResponse> {
  const response = await fetch(`${baseUrl}/api/anki-sync`, { method: "POST" });
  return (await response.json()) as AnkiSyncResponse;
}

// === Main ===

async function main(): Promise<void> {
  const args = parseCliArgs();

  console.log("\nAdd iKnow Vocabulary\n");
  console.log("=".repeat(50));
  console.log(`Backend: ${args.baseUrl}`);
  if (args.dryRun) console.log("Mode: DRY RUN");
  console.log(`Limit: ${args.limit}`);

  const courseFiles = parseCourseFiles(JSON.parse(await readFile(SERIES_FILE, "utf-8")));
  const status = await loadStatus(courseFiles[0]!);
  const current = status.current;

  if (status.files[current]?.done) {
    console.log(`\n${current} is already done. Nothing to do.`);
    return;
  }

  const items = parseGoalItems(JSON.parse(await readFile(join(IKNOW_DIR, current), "utf-8")));
  const inAnki = await fetchAnkiWords(args.baseUrl);
  const problemWords = new Set(status.problems.map((p) => p.word));

  console.log(`File: ${current} (${items.length} words)`);
  console.log(`Start index: ${status.files[current]?.index ?? 0}`);
  console.log(`In Anki: ${inAnki.size} words`);
  console.log("=".repeat(50));
  console.log();

  const startIndex = status.files[current]?.index ?? 0;
  const problemsBefore = status.problems.length;

  let index = startIndex;
  let added = 0;
  let alreadyInAnki = 0;
  let notFound = 0;
  let errors = 0;

  const save = async () => {
    if (args.dryRun) return;
    status.files[current] = { ...status.files[current], index };
    await saveStatus(status);
  };

  while (index < items.length && added < args.limit) {
    const item = items[index]!;
    const label = `${String(index).padStart(3)} ${item.word}`;

    if (inAnki.has(item.word)) {
      console.log(`${label} — already in Anki`);
      alreadyInAnki++;
    } else if (problemWords.has(item.word)) {
      console.log(`${label} — already a known problem`);
    } else {
      const outcome = await processItem({ args, item, index, current, status, inAnki, label });
      problemWords.add(item.word);
      if (outcome === "added") added++;
      if (outcome === "not_found") notFound++;
      if (outcome === "error") errors++;
    }

    index++;
    await save();
  }

  let nextStart: string;
  if (args.dryRun) {
    nextStart = `${current} index ${startIndex} (unchanged)`;
  } else if (index >= items.length) {
    const rolled = rollOverToNextFile({ status, courseFiles, itemCount: items.length });
    Object.assign(status, rolled.status);
    await saveStatus(status);
    nextStart = rolled.nextFile ? `${rolled.nextFile} index 0` : "nothing, the series is finished";
  } else {
    nextStart = `${current} index ${index}`;
  }

  let synced = false;
  if (added > 0 && !args.dryRun) {
    process.stdout.write("\nSyncing to AnkiWeb... ");
    try {
      const result = await syncAnkiWeb(args.baseUrl);
      synced = result.ok;
      console.log(result.ok ? "OK" : `FAILED: ${result.error}`);
    } catch (err) {
      console.log(`FAILED: ${formatError(err)}`);
    }
  }

  console.log();
  console.log("=".repeat(50));
  console.log("Summary");
  console.log("-".repeat(50));
  console.log(`${args.dryRun ? "Would add:     " : "Added:         "} ${added}`);
  console.log(`Already added:  ${alreadyInAnki}`);
  console.log(`Not found:      ${notFound}`);
  console.log(`Errors:         ${errors}`);
  console.log(`Open problems:  ${args.dryRun ? problemsBefore : status.problems.length}`);
  console.log(`Next run:       ${nextStart}`);
  if (added > 0 && !args.dryRun) console.log(`Synced:         ${synced ? "yes" : "no"}`);
  if (args.dryRun) console.log("\n[DRY RUN] No words added, status file untouched.");
  console.log("=".repeat(50));

  if (added > 0 && !synced && !args.dryRun) process.exit(1);
}

async function processItem(params: {
  args: CliArgs;
  item: IknowItem;
  index: number;
  current: string;
  status: VocabStatus;
  inAnki: Set<string>;
  label: string;
}): Promise<"added" | "not_found" | "error"> {
  const { args, item, index, current, status, inAnki, label } = params;

  const addProblem = (reason: "not_found" | "error", error?: string) => {
    status.problems.push({
      word: item.word,
      reading: item.reading,
      file: current,
      index,
      reason,
      ...(error ? { error } : {}),
    });
  };

  let found: SearchResponse;
  try {
    found = await search(args.baseUrl, item.word);
  } catch (err) {
    console.log(`${label} — SEARCH FAILED ${formatError(err)}`);
    addProblem("error", formatError(err));
    return "error";
  }

  if (!found.found) {
    console.log(`${label} — not found in WaniKani`);
    addProblem("not_found");
    return "not_found";
  }

  if (args.dryRun) {
    console.log(`${label} — would add (${found.data.object} id=${found.data.id})`);
    return "added";
  }

  try {
    // the search answers vocabulary and kana_vocabulary from one pool, so take the type it reports
    const result = await addToAnki(args.baseUrl, found.data.id, found.data.object);
    if (!result.ok) {
      console.log(`${label} — ERROR ${result.error}`);
      addProblem("error", result.error);
      return "error";
    }
  } catch (err) {
    console.log(`${label} — ERROR ${formatError(err)}`);
    addProblem("error", formatError(err));
    return "error";
  }

  console.log(`${label} — added`);
  inAnki.add(item.word);
  return "added";
}

async function loadStatus(firstFile: string): Promise<VocabStatus> {
  try {
    return JSON.parse(await readFile(STATUS_FILE, "utf-8")) as VocabStatus;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.log("No status file yet, starting from the first course.");
    return createInitialStatus(firstFile);
  }
}

async function saveStatus(status: VocabStatus): Promise<void> {
  await saveJsonAtomic(STATUS_FILE, status);
}

main().catch((error) => {
  console.error("Fatal error:", formatError(error));
  process.exit(1);
});
