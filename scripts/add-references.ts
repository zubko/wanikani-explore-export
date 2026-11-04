import { readFile } from "fs/promises";
import { parseArgs } from "util";

import {
  KANJI_MODEL_NAME,
  RADICAL_MODEL_NAME,
  VOCABULARY_MODEL_NAME,
} from "../src/model/anki-models.ts";
import type {
  AnkiNoteItem,
  KanjiData,
  RadicalData,
  VocabularyData,
} from "../src/model/wanikani.ts";
import { ankiInvoke } from "./lib/anki-templates.ts";
import { formatError } from "./lib/format-error.ts";
import {
  buildReferenceLookup,
  findMissingReferences,
  type MissingReference,
  type ReferenceLookup,
  type ReferenceType,
  type SourceNote,
} from "./lib/references.ts";

type CliArgs = {
  baseUrl: string;
  days: number;
  dryRun: boolean;
};

type NoteInfo = {
  noteId: number;
  fields: Record<string, { value: string }>;
};

type AnkiNotesResponse = { ok: true; data: AnkiNoteItem[] } | { ok: false; error: string };

type AddToAnkiResponse = { ok: true; data: unknown } | { ok: false; error: string };

type AnkiSyncResponse = { ok: true } | { ok: false; error: string };

const DATA_DIR = "./data/userdata";
const DEFAULT_BASE_URL = "http://localhost:5173";
const SAME_AS_KANJI = /same as the kanji/i;
const NOTE_TYPES: ReferenceType[] = ["radical", "kanji", "vocabulary"];

const MODEL_NAMES: Record<ReferenceType, string> = {
  radical: RADICAL_MODEL_NAME,
  kanji: KANJI_MODEL_NAME,
  vocabulary: VOCABULARY_MODEL_NAME,
};

const CHARACTER_FIELDS: Record<ReferenceType, string> = {
  radical: "character",
  kanji: "character",
  vocabulary: "characters",
};

async function main(): Promise<void> {
  const args = parseCliArgs();
  const lookup = await loadReferenceLookup();

  console.log("\nAdd Referenced Items\n");
  console.log("=".repeat(50));
  console.log(`Backend: ${args.baseUrl}`);
  console.log(`Notes added in the last ${args.days} day(s)`);
  if (args.dryRun) console.log("DRY RUN - nothing is added");

  process.stdout.write("Syncing with AnkiWeb... ");
  const startSync = await syncAnkiWeb(args.baseUrl);
  if (!startSync.ok) {
    console.log("FAILED");
    throw new Error(`AnkiWeb sync failed, every lookup would be stale: ${startSync.error}`);
  }
  console.log("OK");
  console.log("=".repeat(50));

  const added: MissingReference[] = [];
  const unmatched = new Set<string>();
  let failure: string | null = null;
  let notes: SourceNote[] = [];
  let idsInAnki = new Set<number>();

  // an added item brings notes with their own mnemonics, so the check runs until nothing is missing
  for (let round = 1; failure === null; round++) {
    idsInAnki = await fetchIdsInAnki(args.baseUrl);
    notes = await fetchRecentNotes(args.days);
    const result = findMissingReferences({ notes, lookup, idsInAnki });
    result.unmatched.forEach((mention) => unmatched.add(mention));
    console.log(
      `\nRound ${round}: ${notes.length} notes, ${result.missing.length} referenced items not in Anki`
    );
    if (result.missing.length === 0) break;

    if (args.dryRun) {
      for (const reference of result.missing) {
        console.log(`  would add ${describeReference(reference)}`);
      }
      break;
    }

    failure = await addReferences({ baseUrl: args.baseUrl, references: result.missing, added });
  }

  printSameAsKanji({ notes, lookup, idsInAnki });

  if (unmatched.size > 0) {
    console.log(`\nNo WaniKani item for: ${[...unmatched].join(", ")}`);
  }

  let synced = false;
  if (added.length > 0) {
    process.stdout.write("\nSyncing to AnkiWeb... ");
    const endSync = await syncAnkiWeb(args.baseUrl);
    console.log(endSync.ok ? "OK" : `FAILED: ${endSync.error}`);
    synced = endSync.ok;
  }

  console.log("\n" + "=".repeat(50));
  console.log("Summary");
  console.log("-".repeat(50));
  console.log(`Added: ${added.length}`);
  for (const reference of added) console.log(`  ${describeReference(reference)}`);
  if (added.length > 0) console.log(`Synced: ${synced ? "yes" : "no"}`);
  console.log("=".repeat(50));

  if (failure !== null) {
    throw new Error(failure);
  }
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string", short: "b", default: DEFAULT_BASE_URL },
      days: { type: "string", default: "1" },
      "dry-run": { type: "boolean", short: "d", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run add-references [options]

Reads the notes added to Anki in the last days. When their mnemonics, hints or
notes mention a WaniKani item that is not in Anki, it adds that item: a word with
exactly these characters first, then a kanji, then a radical. The added notes
are checked the same way, until nothing is missing. The dev server must run.

It also lists the new radicals whose mnemonic says they are the same as a kanji.
A radical with no picture whose kanji is not in Anki is marked ADD KANJI. It
adds no such kanji by itself.

Options:
  -b, --base-url <url>  Backend URL (default: ${DEFAULT_BASE_URL})
  --days <n>            How many days back to look, 1 is today (default 1)
  -d, --dry-run         List the first round of missing items, add nothing
  -h, --help            Show this help
`);
    process.exit(0);
  }

  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`--days must be a whole number of 1 or more, got ${values.days}`);
  }

  return {
    baseUrl: values["base-url"] ?? DEFAULT_BASE_URL,
    days,
    dryRun: values["dry-run"] ?? false,
  };
}

async function loadReferenceLookup(): Promise<ReferenceLookup> {
  const [vocabulary, kanji, radicals] = await Promise.all([
    readJsonFile<VocabularyData[]>(`${DATA_DIR}/vocabulary.json`),
    readJsonFile<KanjiData[]>(`${DATA_DIR}/kanji.json`),
    readJsonFile<RadicalData[]>(`${DATA_DIR}/radicals.json`),
  ]);
  return buildReferenceLookup({ vocabulary, kanji, radicals });
}

async function fetchIdsInAnki(baseUrl: string): Promise<Set<number>> {
  const lists = await Promise.all(NOTE_TYPES.map((type) => fetchAnkiNotes(baseUrl, type)));
  return new Set(lists.flat().flatMap((note) => (note.wkId === null ? [] : [note.wkId])));
}

async function fetchRecentNotes(days: number): Promise<SourceNote[]> {
  const lists = await Promise.all(
    NOTE_TYPES.map(async (type) => {
      const noteIds = await ankiInvoke<number[]>("findNotes", {
        query: `"note:${MODEL_NAMES[type]}" added:${days}`,
      });
      const notes = await ankiInvoke<NoteInfo[]>("notesInfo", { notes: noteIds });
      return notes.map((note) => toSourceNote(type, note));
    })
  );
  return lists.flat();
}

async function addReferences(params: {
  baseUrl: string;
  references: MissingReference[];
  added: MissingReference[];
}): Promise<string | null> {
  const { baseUrl, references, added } = params;
  for (const reference of references) {
    if (added.some((item) => item.id === reference.id)) {
      return `${reference.characters} was added, but Anki still does not list it`;
    }
    process.stdout.write(`  Adding ${describeReference(reference)}... `);
    const answer = await addToAnki({ baseUrl, reference });
    if (!answer.ok) {
      console.log("FAILED");
      return answer.error;
    }
    console.log("OK");
    added.push(reference);
  }
  return null;
}

function printSameAsKanji(params: {
  notes: SourceNote[];
  lookup: ReferenceLookup;
  idsInAnki: Set<number>;
}): void {
  const { notes, lookup, idsInAnki } = params;
  const matches = notes
    .filter((note) => note.type === "radical")
    .map((note) => ({ note, mnemonic: stripHtml(note.fields.mnemonic_text ?? "") }))
    .filter(({ mnemonic }) => SAME_AS_KANJI.test(mnemonic));
  console.log(`\nNew radicals that are the same as a kanji: ${matches.length}`);

  for (const { note, mnemonic } of matches) {
    const hasPicture = note.fields.mnemonic_image !== "";
    const kanjiId = lookup.kanji.get(note.characters);
    const kanjiInAnki = kanjiId !== undefined && idsInAnki.has(kanjiId);
    const kanjiLabel =
      kanjiId === undefined
        ? "kanji: none"
        : `kanji: id=${kanjiId}, ${kanjiInAnki ? "in Anki" : "not in Anki"}`;
    const verdict = !hasPicture && kanjiId !== undefined && !kanjiInAnki ? " | ADD KANJI" : "";
    console.log(
      `\n${note.characters} ${note.label} | picture: ${hasPicture ? "yes" : "none"} | ${kanjiLabel}${verdict}`
    );
    console.log(`  ${mnemonic}`);
  }
}

async function fetchAnkiNotes(baseUrl: string, type: ReferenceType): Promise<AnkiNoteItem[]> {
  const response = await fetch(`${baseUrl}/api/anki-notes?type=${type}`);
  const result = (await response.json()) as AnkiNotesResponse;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function addToAnki(params: {
  baseUrl: string;
  reference: MissingReference;
}): Promise<AddToAnkiResponse> {
  const { baseUrl, reference } = params;
  const response = await fetch(`${baseUrl}/api/add-to-anki`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: reference.id, type: reference.type, sync: false }),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Add ${reference.characters} failed with status ${response.status}`);
  }
  return (await response.json()) as AddToAnkiResponse;
}

async function syncAnkiWeb(baseUrl: string): Promise<AnkiSyncResponse> {
  const response = await fetch(`${baseUrl}/api/anki-sync`, { method: "POST" });
  return (await response.json()) as AnkiSyncResponse;
}

function toSourceNote(type: ReferenceType, note: NoteInfo): SourceNote {
  const fields = Object.fromEntries(
    Object.entries(note.fields).map(([name, field]) => [name, field.value])
  );
  const characters = stripHtml(fields[CHARACTER_FIELDS[type]] ?? "");
  return {
    type,
    // a radical note holds a picture in its character field, so its name is the label
    label: type === "radical" ? (fields.primary_name ?? "") : characters,
    characters,
    fields,
  };
}

function describeReference(reference: MissingReference): string {
  return `${reference.characters} (${reference.type}, mentioned in ${reference.mentionedIn})`;
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

main().catch((err) => {
  console.error(`Error: ${formatError(err)}`);
  process.exit(1);
});
