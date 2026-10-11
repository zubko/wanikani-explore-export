import { parseArgs } from "util";
import { readFile } from "fs/promises";
import { join } from "path";

import { getPrimaryMeaning } from "../src/model/subject-utils.ts";
import type { AnkiNoteItem, KanaVocabulary, Vocabulary } from "../src/model/wanikani.ts";
import { formatError } from "./lib/format-error.ts";
import { saveJsonAtomic } from "./lib/llm-utils.ts";
import {
  createInitialStatus,
  listFilesToWalk,
  listNewRadicals,
  parseCourseFiles,
  parseGoalItems,
  rollOverToNextFile,
  type IknowItem,
  type VocabStatus,
} from "./lib/iknow-vocab.ts";

type Mode = "next-words" | "known-kanji-only" | "new-radicals";

type CliArgs = {
  baseUrl: string;
  dryRun: boolean;
  mode: Mode;
  limit: number;
};

type SearchResponse = { found: true; data: Vocabulary | KanaVocabulary } | { found: false };

type AnkiNotesResponse = { ok: true; data: AnkiNoteItem[] } | { ok: false; error: string };

type AddToAnkiResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; reason?: "fields" };

type AnkiSyncResponse = { ok: true } | { ok: false; error: string };

type AnkiContents = {
  words: Set<string>;
  kanjiIds: Set<number>;
  radicalNames: Set<string>;
};

type RunCounts = {
  added: number;
  alreadyInAnki: number;
  notFound: number;
  missingKanji: number;
  noNewRadical: number;
  errors: number;
};

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
      "known-kanji-only": { type: "boolean", short: "k", default: false },
      "new-radicals": { type: "boolean", short: "r", default: false },
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
  -l, --limit <n>       How many words to really add (default: ${DEFAULT_LIMIT}).
                        With --new-radicals it counts radicals
  -k, --known-kanji-only
                        Add only kana words and words whose kanji are all in Anki.
                        Walks on into the next course files, writes no status
  -r, --new-radicals    Add no words, only the radicals of the next words that are
                        not in Anki yet. Walks on into the next course files,
                        writes no status
  -d, --dry-run         Search only, add nothing, write no status
  -h, --help            Show this help message
`);
    process.exit(0);
  }

  const limit = values.limit ? Number(values.limit) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid limit: ${values.limit}`);
  }

  if (values["known-kanji-only"] && values["new-radicals"]) {
    throw new Error("Use only one of --known-kanji-only and --new-radicals");
  }
  let mode: Mode = "next-words";
  if (values["known-kanji-only"]) mode = "known-kanji-only";
  if (values["new-radicals"]) mode = "new-radicals";

  return {
    baseUrl: values["base-url"] ?? DEFAULT_BASE_URL,
    dryRun: values["dry-run"] ?? false,
    mode,
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

async function fetchAnkiContents(baseUrl: string): Promise<AnkiContents> {
  const [words, kanji, radicals] = await Promise.all([
    fetchAnkiNotes(baseUrl, "vocabulary"),
    fetchAnkiNotes(baseUrl, "kanji"),
    fetchAnkiNotes(baseUrl, "radical"),
  ]);
  return {
    words: new Set(words.map((note) => note.characters)),
    kanjiIds: new Set(kanji.flatMap((note) => (note.wkId === null ? [] : [note.wkId]))),
    // a radical note holds its primary name in this field
    radicalNames: new Set(radicals.map((note) => note.characters)),
  };
}

async function fetchAnkiNotes(
  baseUrl: string,
  type: "vocabulary" | "kanji" | "radical"
): Promise<AnkiNoteItem[]> {
  const response = await fetch(`${baseUrl}/api/anki-notes?type=${type}`);
  const result = (await response.json()) as AnkiNotesResponse;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function addToAnki(params: {
  baseUrl: string;
  id: number;
  type: string;
}): Promise<AddToAnkiResponse> {
  const { baseUrl, id, type } = params;
  const response = await fetch(`${baseUrl}/api/add-to-anki`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // syncing per word would answer ok:false for a word that is already written, and run one
    // full AnkiWeb sync per word — the run syncs once at the start, so every lookup sees the
    // current AnkiWeb state, and once at the end
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
  if (args.mode !== "next-words")
    console.log(`Mode: ${args.mode.replaceAll("-", " ").toUpperCase()}`);
  console.log(`Limit: ${args.limit}`);

  const courseFiles = parseCourseFiles(JSON.parse(await readFile(SERIES_FILE, "utf-8")));
  const status = await loadStatus(courseFiles[0]!);

  if (status.files[status.current]?.done) {
    console.log(`\n${status.current} is already done. Nothing to do.`);
    return;
  }

  const filesToWalk = listFilesToWalk({
    status,
    courseFiles,
    acrossFiles: args.mode !== "next-words",
  });
  // these modes leave words behind, so the index stays for a normal run to reach them
  const writesStatus = !args.dryRun && args.mode === "next-words";

  process.stdout.write("Syncing with AnkiWeb... ");
  const syncResult = await syncAnkiWeb(args.baseUrl).catch(
    (err): AnkiSyncResponse => ({ ok: false, error: formatError(err) })
  );
  if (!syncResult.ok) {
    console.log(`FAILED: ${syncResult.error}`);
    process.exit(1);
  }
  console.log("OK");

  const anki = await fetchAnkiContents(args.baseUrl);
  const problemWords = new Set(status.problems.map((p) => p.word));
  const seenWords = new Set<string>();

  console.log(
    `In Anki: ${anki.words.size} words, ${anki.kanjiIds.size} kanji, ${anki.radicalNames.size} radicals`
  );
  console.log("=".repeat(50));

  const problemsBefore = status.problems.length;
  const counts: RunCounts = {
    added: 0,
    alreadyInAnki: 0,
    notFound: 0,
    missingKanji: 0,
    noNewRadical: 0,
    errors: 0,
  };

  let current = status.current;
  let items: IknowItem[] = [];
  let index = 0;
  let stopped = false;

  const save = async () => {
    if (!writesStatus) return;
    status.files[current] = { ...status.files[current], index };
    await saveStatus(status);
  };

  for (const fileToWalk of filesToWalk) {
    current = fileToWalk.file;
    items = parseGoalItems(JSON.parse(await readFile(join(IKNOW_DIR, current), "utf-8")));
    index = fileToWalk.startIndex;
    console.log(`\nFile: ${current} (${items.length} words), start index ${index}\n`);

    while (index < items.length && counts.added < args.limit) {
      const item = items[index]!;
      const label = `${String(index).padStart(3)} ${item.word}`;

      if (anki.words.has(item.word)) {
        console.log(`${label} — already in Anki`);
        counts.alreadyInAnki++;
      } else if (problemWords.has(item.word)) {
        console.log(`${label} — already a known problem`);
      } else if (seenWords.has(item.word)) {
        console.log(`${label} — repeated, handled earlier in this run`);
      } else {
        seenWords.add(item.word);
        const outcome = await processItem({
          args,
          item,
          index,
          current,
          status,
          anki,
          counts,
          label,
        });
        if (outcome === "stop") {
          stopped = true;
          break;
        }
      }

      index++;
      await save();
    }

    if (stopped || counts.added >= args.limit) break;
  }

  let nextStart: string;
  if (!writesStatus) {
    nextStart = `${status.current} index ${filesToWalk[0]!.startIndex} (unchanged)`;
  } else if (index >= items.length) {
    const rolled = rollOverToNextFile({ status, courseFiles, itemCount: items.length });
    Object.assign(status, rolled.status);
    await saveStatus(status);
    nextStart = rolled.nextFile ? `${rolled.nextFile} index 0` : "nothing, the series is finished";
  } else {
    nextStart = `${current} index ${index}`;
  }

  let synced = false;
  if (counts.added > 0 && !args.dryRun) {
    process.stdout.write("\nSyncing to AnkiWeb... ");
    try {
      const result = await syncAnkiWeb(args.baseUrl);
      synced = result.ok;
      console.log(result.ok ? "OK" : `FAILED: ${result.error}`);
    } catch (err) {
      console.log(`FAILED: ${formatError(err)}`);
    }
  }

  const addedNoun = args.mode === "new-radicals" ? "radical" : "word";
  console.log();
  console.log("=".repeat(50));
  console.log("Summary");
  console.log("-".repeat(50));
  console.log(
    `${args.dryRun ? "Would add:     " : "Added:         "} ${countOf(counts.added, addedNoun)}`
  );
  console.log(`Already added:  ${countOf(counts.alreadyInAnki, "word")}`);
  console.log(`Not found:      ${countOf(counts.notFound, "word")}`);
  if (args.mode === "known-kanji-only") {
    console.log(`Missing kanji:  ${countOf(counts.missingKanji, "word")}`);
  }
  if (args.mode === "new-radicals") {
    console.log(`No new radical: ${countOf(counts.noNewRadical, "word")}`);
  }
  console.log(`Errors:         ${counts.errors}`);
  console.log(`Open problems:  ${writesStatus ? status.problems.length : problemsBefore}`);
  console.log(`Next run:       ${nextStart}`);
  if (counts.added > 0 && !args.dryRun) console.log(`Synced:         ${synced ? "yes" : "no"}`);
  if (args.dryRun) console.log("\n[DRY RUN] Nothing added, status file untouched.");
  console.log("=".repeat(50));

  if (stopped) {
    console.log(`\nStopped at ${items[index]!.word}, it is not recorded as a problem.`);
    console.log("The Anki note type fields do not match the code. Fix them, then run again:");
    console.log("  bun run sync-anki-fields     (interactive, needs a terminal)");
    console.log("  bun run sync-anki-templates");
  }

  if (stopped || (counts.added > 0 && !synced && !args.dryRun)) process.exit(1);
}

async function processItem(params: {
  args: CliArgs;
  item: IknowItem;
  index: number;
  current: string;
  status: VocabStatus;
  anki: AnkiContents;
  counts: RunCounts;
  label: string;
}): Promise<"continue" | "stop"> {
  const { args, item, index, current, status, anki, counts, label } = params;

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
    counts.errors++;
    return "continue";
  }

  if (!found.found) {
    console.log(`${label} — not found in WaniKani`);
    addProblem("not_found");
    counts.notFound++;
    return "continue";
  }

  if (args.mode === "new-radicals") {
    return addNewRadicals({ args, subject: found.data, anki, counts, label });
  }

  if (args.mode === "known-kanji-only") {
    const missing = findKanjiNotInAnki(found.data, anki.kanjiIds);
    if (missing.length > 0) {
      console.log(`${label} — missing kanji ${missing.join("")}`);
      counts.missingKanji++;
      return "continue";
    }
  }

  if (args.dryRun) {
    console.log(`${label} — would add (${found.data.object} id=${found.data.id})`);
    counts.added++;
    return "continue";
  }

  // the search answers vocabulary and kana_vocabulary from one pool, so take the type it reports
  const result = await addToAnki({
    baseUrl: args.baseUrl,
    id: found.data.id,
    type: found.data.object,
  }).catch((err): AddToAnkiResponse => ({ ok: false, error: formatError(err) }));

  if (!result.ok) {
    // every later word would fail the same way, and a problem entry is never revisited
    if (result.reason === "fields") {
      console.log(`${label} — STOPPED ${result.error}`);
      return "stop";
    }
    console.log(`${label} — ERROR ${result.error}`);
    addProblem("error", result.error);
    counts.errors++;
    return "continue";
  }

  console.log(`${label} — added`);
  anki.words.add(item.word);
  counts.added++;
  return "continue";
}

async function addNewRadicals(params: {
  args: CliArgs;
  subject: Vocabulary | KanaVocabulary;
  anki: AnkiContents;
  counts: RunCounts;
  label: string;
}): Promise<"continue" | "stop"> {
  const { args, subject, anki, counts, label } = params;

  const newRadicals = listNewRadicals({
    componentKanji: subject.object === "vocabulary" ? subject.componentKanji : [],
    knownRadicalNames: anki.radicalNames,
  });
  if (newRadicals.length === 0) {
    console.log(`${label} — no new radical`);
    counts.noNewRadical++;
    return "continue";
  }

  for (const radical of newRadicals) {
    if (counts.added >= args.limit) break;

    const name = getPrimaryMeaning(radical.meanings);
    const radicalLabel = `${label} → ${[radical.characters, name].filter(Boolean).join(" ")}`;
    // a dry run must count a radical once, and a failed add would fail again for every later word
    anki.radicalNames.add(name);

    if (args.dryRun) {
      console.log(`${radicalLabel} — would add (radical id=${radical.id})`);
      counts.added++;
      continue;
    }

    const result = await addToAnki({
      baseUrl: args.baseUrl,
      id: radical.id,
      type: "radical",
    }).catch((err): AddToAnkiResponse => ({ ok: false, error: formatError(err) }));

    if (!result.ok) {
      if (result.reason === "fields") {
        console.log(`${radicalLabel} — STOPPED ${result.error}`);
        return "stop";
      }
      console.log(`${radicalLabel} — ERROR ${result.error}`);
      counts.errors++;
      continue;
    }

    console.log(`${radicalLabel} — added`);
    counts.added++;
  }
  return "continue";
}

function findKanjiNotInAnki(
  subject: Vocabulary | KanaVocabulary,
  ankiKanjiIds: Set<number>
): string[] {
  if (subject.object === "kana_vocabulary") return [];
  return subject.componentKanji
    .filter((kanji) => !ankiKanjiIds.has(kanji.id))
    .map((kanji) => kanji.characters);
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
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
