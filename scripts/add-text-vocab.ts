import { join } from "path";
import { parseArgs } from "util";

import {
  DEFAULT_BASE_URL,
  addToAnki,
  fetchVocabularyInAnki,
  searchVocabulary,
  syncAnkiWeb,
  syncAnkiWebAtStart,
  type AddToAnkiResponse,
} from "./lib/dev-server-api.ts";
import { formatError } from "./lib/format-error.ts";
import {
  NOT_IN_ANKI_FILE,
  addRunFailed,
  classifyWord,
  readWordList,
  runDir,
  type ClassifiedWord,
  type VocabularyHit,
  type WordEntry,
} from "./lib/text-vocab.ts";

type CliArgs = {
  baseUrl: string;
  dryRun: boolean;
  folder: string;
};

type RunCounts = {
  added: number;
  alreadyInAnki: number;
  notInWaniKani: number;
  errors: number;
};

async function main(): Promise<void> {
  const args = parseCliArgs();
  const entries = await readWordList({
    path: join(args.folder, NOT_IN_ANKI_FILE),
    missingHint: "run split-text-vocab first",
  });

  console.log("\nAdd Text Vocabulary\n");
  console.log("=".repeat(50));
  console.log(`Backend: ${args.baseUrl}`);
  if (args.dryRun) console.log("Mode: DRY RUN");
  console.log(`Run:     ${args.folder}`);
  console.log(`Words:   ${entries.length}`);

  await syncAnkiWebAtStart(args.baseUrl);
  const charactersInAnki = await fetchVocabularyInAnki(args.baseUrl);
  console.log(`In Anki: ${charactersInAnki.size} words`);
  console.log("=".repeat(50) + "\n");

  const counts: RunCounts = { added: 0, alreadyInAnki: 0, notInWaniKani: 0, errors: 0 };
  const addedIds = new Set<number>();
  let stoppedAt: string | null = null;

  for (const entry of entries) {
    const outcome = await processEntry({ args, entry, charactersInAnki, addedIds, counts });
    if (outcome === "stop") {
      stoppedAt = entry.word;
      break;
    }
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

  console.log();
  console.log("=".repeat(50));
  console.log("Summary");
  console.log("-".repeat(50));
  console.log(`${args.dryRun ? "Would add:       " : "Added:           "} ${counts.added}`);
  console.log(`Already in Anki:  ${counts.alreadyInAnki}`);
  console.log(`Not in WaniKani:  ${counts.notInWaniKani}`);
  console.log(`Errors:           ${counts.errors}`);
  if (counts.added > 0 && !args.dryRun) console.log(`Synced:           ${synced ? "yes" : "no"}`);
  if (args.dryRun) console.log("\n[DRY RUN] Nothing added.");
  console.log("=".repeat(50));

  if (stoppedAt !== null) {
    console.log(`\nStopped at ${stoppedAt}.`);
    console.log("The Anki note type fields do not match the code. Fix them, then run again:");
    console.log("  bun run sync-anki-fields     (interactive, needs a terminal)");
    console.log("  bun run sync-anki-templates");
  }

  const failed = addRunFailed({
    stopped: stoppedAt !== null,
    errors: counts.errors,
    added: counts.added,
    dryRun: args.dryRun,
    synced,
  });
  if (failed) process.exit(1);
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      run: { type: "string", short: "r" },
      "base-url": { type: "string", short: "b", default: DEFAULT_BASE_URL },
      "dry-run": { type: "boolean", short: "d", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run add-text-vocab -- --run <name> [options]

Reads ${NOT_IN_ANKI_FILE} of a text run in ${runDir("<name>")}/ and adds every word
that the WaniKani search finds to the Anki vocabulary deck. A word that is already
in Anki is skipped, so a rerun goes on where the last run stopped. A word that the
search does not find is listed as not in WaniKani. The dev server must run.

Options:
  -r, --run <name>      The run folder name, like 20261107-1432-図書館
  -b, --base-url <url>  Backend URL (default: ${DEFAULT_BASE_URL})
  -d, --dry-run         Sync and search only, add nothing
  -h, --help            Show this help
`);
    process.exit(0);
  }

  return {
    baseUrl: values["base-url"] ?? DEFAULT_BASE_URL,
    dryRun: values["dry-run"] ?? false,
    folder: runDir(values.run),
  };
}

async function processEntry(params: {
  args: CliArgs;
  entry: WordEntry;
  charactersInAnki: Set<string>;
  addedIds: Set<number>;
  counts: RunCounts;
}): Promise<"continue" | "stop"> {
  const { args, entry, charactersInAnki, addedIds, counts } = params;
  const label = `${entry.word} (${entry.reading})`;

  let word: ClassifiedWord;
  try {
    word = await classifyWord({
      entry,
      charactersInAnki,
      search: (spelling) => searchVocabulary(args.baseUrl, spelling),
    });
  } catch (err) {
    console.log(`${label} — SEARCH FAILED ${formatError(err)}`);
    counts.errors++;
    return "continue";
  }

  if (word.group === "in-anki") {
    console.log(`${label} — already in Anki`);
    counts.alreadyInAnki++;
    return "continue";
  }

  if (word.group !== "in-wanikani") {
    const readingHint =
      word.group === "found-by-reading" ? ` (its reading finds ${word.hit.characters})` : "";
    console.log(`${label} — not in WaniKani${readingHint}`);
    counts.notInWaniKani++;
    return "continue";
  }

  for (const hit of word.hits) {
    const outcome = await addHit({ args, label, hit, addedIds, counts });
    if (outcome === "stop") return "stop";
  }
  return "continue";
}

async function addHit(params: {
  args: CliArgs;
  label: string;
  hit: VocabularyHit;
  addedIds: Set<number>;
  counts: RunCounts;
}): Promise<"continue" | "stop"> {
  const { args, label, hit, addedIds, counts } = params;
  const { id, object, characters } = hit;
  const target = `${characters} (${object} id=${id})`;

  // a する verb line and a noun line of the same text can find the same word
  if (addedIds.has(id)) {
    console.log(`${label} — ${characters} added above`);
    return "continue";
  }

  if (args.dryRun) {
    console.log(`${label} — would add ${target}`);
    addedIds.add(id);
    counts.added++;
    return "continue";
  }

  const result = await addToAnki({ baseUrl: args.baseUrl, id, type: object }).catch(
    (err): AddToAnkiResponse => ({ ok: false, error: formatError(err) })
  );
  if (!result.ok) {
    // every later word would fail the same way
    if (result.reason === "fields") {
      console.log(`${label} — STOPPED ${result.error}`);
      return "stop";
    }
    console.log(`${label} — ERROR ${target} ${result.error}`);
    counts.errors++;
    return "continue";
  }

  console.log(`${label} — added ${target}`);
  addedIds.add(id);
  counts.added++;
  return "continue";
}

main().catch((err) => {
  console.error(`Error: ${formatError(err)}`);
  process.exit(1);
});
