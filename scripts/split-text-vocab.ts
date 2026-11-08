import { unlink, writeFile } from "fs/promises";
import { join } from "path";
import { parseArgs } from "util";

import {
  DEFAULT_BASE_URL,
  fetchVocabularyInAnki,
  searchVocabulary,
  syncAnkiWebAtStart,
} from "./lib/dev-server-api.ts";
import { formatError } from "./lib/format-error.ts";
import {
  DICTIONARY_FILE,
  NOT_IN_ANKI_FILE,
  NOT_IN_WANIKANI_FILE,
  classifyWord,
  formatWordList,
  readWordList,
  runDir,
  splitClassifiedWords,
  type ClassifiedWord,
  type VocabularyHit,
  type WordGroup,
} from "./lib/text-vocab.ts";

type CliArgs = {
  baseUrl: string;
  folder: string;
};

const GROUP_LABELS: Record<WordGroup, string> = {
  "in-anki": "already in Anki",
  "in-wanikani": "in WaniKani",
  "found-by-reading": "found by its reading only",
  "not-in-wanikani": "not in WaniKani",
};

async function main(): Promise<void> {
  const { baseUrl, folder } = parseCliArgs();
  const notInAnkiPath = join(folder, NOT_IN_ANKI_FILE);
  const notInWaniKaniPath = join(folder, NOT_IN_WANIKANI_FILE);
  // a run that fails must not leave the files of an earlier run, the add would read them
  await Promise.all([deleteIfPresent(notInAnkiPath), deleteIfPresent(notInWaniKaniPath)]);
  const entries = await readWordList({ path: join(folder, DICTIONARY_FILE), missingHint: null });

  console.log("\nSplit Text Vocabulary\n");
  console.log("=".repeat(50));
  console.log(`Backend: ${baseUrl}`);
  console.log(`Run:     ${folder}`);
  console.log(`Words:   ${entries.length}`);

  await syncAnkiWebAtStart(baseUrl);
  const charactersInAnki = await fetchVocabularyInAnki(baseUrl);
  console.log(`In Anki: ${charactersInAnki.size} words`);
  console.log("=".repeat(50) + "\n");

  const classified: ClassifiedWord[] = [];
  for (const entry of entries) {
    const label = `${entry.word} (${entry.reading})`;
    let word: ClassifiedWord;
    try {
      word = await classifyWord({
        entry,
        charactersInAnki,
        search: (spelling) => searchVocabulary(baseUrl, spelling),
      });
    } catch (err) {
      console.log(`${label} — SEARCH FAILED`);
      // a failed search taken for a miss would send the word into the custom word loop
      throw new Error(`Search failed, no file written: ${formatError(err)}`);
    }
    console.log(`${label} — ${describeWord(word, charactersInAnki)}`);
    classified.push(word);
  }

  const { notInAnki, notInWaniKani } = splitClassifiedWords(classified);
  await writeFile(notInAnkiPath, formatWordList(notInAnki));
  await writeFile(notInWaniKaniPath, formatWordList(notInWaniKani));

  const countOf = (group: WordGroup) => classified.filter((word) => word.group === group).length;
  console.log();
  console.log("=".repeat(50));
  console.log("Summary");
  console.log("-".repeat(50));
  console.log(`Already in Anki:    ${countOf("in-anki")}`);
  console.log(`In WaniKani:        ${countOf("in-wanikani")}`);
  console.log(`Found by reading:   ${countOf("found-by-reading")}`);
  console.log(`Not in WaniKani:    ${countOf("not-in-wanikani")}`);
  console.log(
    `Wrote ${NOT_IN_ANKI_FILE} (${notInAnki.length}) and ${NOT_IN_WANIKANI_FILE} (${notInWaniKani.length})`
  );
  console.log("=".repeat(50));
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      run: { type: "string", short: "r" },
      "base-url": { type: "string", short: "b", default: DEFAULT_BASE_URL },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run split-text-vocab -- --run <name> [options]

Reads ${DICTIONARY_FILE} of a text run in ${runDir("<name>")}/. Writes the words
that are not in the Anki vocabulary deck to ${NOT_IN_ANKI_FILE}, and the ones of
them that the WaniKani search does not find to ${NOT_IN_WANIKANI_FILE}. A word
that the search finds by its reading only goes into both files, and the output
names the word it found. It deletes the two files first, so a failed run leaves
neither. It writes nothing to Anki. The dev server must run.

Options:
  -r, --run <name>      The run folder name, like 20261107-1432-図書館
  -b, --base-url <url>  Backend URL (default: ${DEFAULT_BASE_URL})
  -h, --help            Show this help
`);
    process.exit(0);
  }

  return {
    baseUrl: values["base-url"] ?? DEFAULT_BASE_URL,
    folder: runDir(values.run),
  };
}

async function deleteIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

function describeWord(word: ClassifiedWord, charactersInAnki: Set<string>): string {
  const label = GROUP_LABELS[word.group];
  if (word.group === "in-wanikani") {
    return `${label} (${word.hits.map((hit) => `${hit.characters} ${sourceOf(hit)}`).join(", ")})`;
  }
  if (word.group !== "found-by-reading") return label;
  const { characters, meaning } = word.hit;
  const inAnki = charactersInAnki.has(characters) ? "in Anki" : "not in Anki";
  return `${label}: ${word.word} → ${characters} (${meaning}, ${sourceOf(word.hit)}, ${inAnki})`;
}

function sourceOf(hit: VocabularyHit): string {
  return `${hit.isCustom ? "custom " : ""}${hit.object} id=${hit.id}`;
}

main().catch((err) => {
  console.error(`Error: ${formatError(err)}`);
  process.exit(1);
});
