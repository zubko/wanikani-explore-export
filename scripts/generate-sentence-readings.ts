import { readFile, writeFile } from "fs/promises";
import { parseArgs } from "util";
import OpenAI from "openai";
import { formatError } from "./format-error.ts";

// === TYPES ===

type ContextSentence = {
  en: string;
  ja: string;
};

type SentenceReading = {
  ja: string;
  reading: string;
};

type SentenceReadingsData = Record<string, SentenceReading>;

type VocabularyItem = {
  id: number;
  object: string;
  data: {
    characters: string;
    readings?: Array<{ reading: string; primary: boolean }>;
    context_sentences: ContextSentence[];
  };
};

type CliArgs = {
  limit: number | undefined;
  dryRun: boolean;
  showPrompt: boolean;
};

// === CONFIGURATION ===

if (!process.env.LLM_BASE_URL) throw new Error("Missing LLM_BASE_URL in .env");
if (!process.env.LLM_API_KEY) throw new Error("Missing LLM_API_KEY in .env");

const LLM_BASE_URL = process.env.LLM_BASE_URL;
// for CLIProxyAPI
const LLM_MODEL = "gpt-5";
// for OpenRouter
// const LLM_MODEL = "openai/gpt-5-mini";
const LLM_API_KEY = process.env.LLM_API_KEY;
const RATE_LIMIT_MS = 500;
const VOCABULARY_FILE = "./data/userdata/vocabulary.json";
const KANA_VOCABULARY_FILE = "./data/userdata/kana_vocabulary.json";
const SENTENCE_READINGS_FILE = "./data/sentence_readings.json";

// === CLI ===

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      limit: { type: "string", short: "l" },
      "dry-run": { type: "boolean", short: "d", default: false },
      "show-prompt": { type: "boolean", short: "p", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run scripts/generate-sentence-readings.ts [options]

Options:
  -l, --limit <n>   Limit the number of items to process
  -d, --dry-run     Don't save to file, output to stdout only
  -p, --show-prompt Print the prompt for the next item and exit
  -h, --help        Show this help message
`);
    process.exit(0);
  }

  return {
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
    dryRun: values["dry-run"] ?? false,
    showPrompt: values["show-prompt"] ?? false,
  };
}

// === HELPERS ===

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getShortestSentence(sentences: ContextSentence[]): ContextSentence | null {
  if (sentences.length === 0) return null;
  return sentences.reduce((shortest, current) =>
    current.ja.length < shortest.ja.length ? current : shortest
  );
}

function getPrimaryReading(item: VocabularyItem): string {
  if (!item.data.readings) return item.data.characters;
  const primary = item.data.readings.find((r) => r.primary);
  return primary?.reading ?? item.data.readings[0]?.reading ?? item.data.characters;
}

async function loadVocabulary(): Promise<VocabularyItem[]> {
  const [vocabContent, kanaContent] = await Promise.all([
    readFile(VOCABULARY_FILE, "utf-8"),
    readFile(KANA_VOCABULARY_FILE, "utf-8"),
  ]);
  const vocabulary = JSON.parse(vocabContent) as VocabularyItem[];
  const kanaVocabulary = JSON.parse(kanaContent) as VocabularyItem[];
  return [...vocabulary, ...kanaVocabulary];
}

async function loadExistingReadings(): Promise<SentenceReadingsData> {
  try {
    const content = await readFile(SENTENCE_READINGS_FILE, "utf-8");
    return JSON.parse(content) as SentenceReadingsData;
  } catch {
    return {};
  }
}

async function saveReadings(data: SentenceReadingsData): Promise<void> {
  await writeFile(SENTENCE_READINGS_FILE, JSON.stringify(data, null, 2) + "\n");
}

const KANJI_REGEX = /[\u4e00-\u9faf]/;

function validateReading(reading: string): boolean {
  return !KANJI_REGEX.test(reading);
}

function buildPrompt(word: string, reading: string, sentence: string): string {
  return `You are a Japanese language expert. Convert the following Japanese sentence into its kana reading.

Vocabulary word: ${word}
Reading: ${reading}

Sentence: ${sentence}

Rules:
- Convert all kanji to hiragana
- Keep katakana as katakana
- Keep hiragana, punctuation, and symbols unchanged
- Use the correct reading for each kanji based on the sentence context
- The vocabulary word "${word}" should be read as "${reading}" in this context

IMPORTANT:
- Double-check that the reading doesn't contain any kanji

Return ONLY the kana reading of the sentence, nothing else.`;
}

// === MAIN ===

type ProcessResult =
  | { success: true; reading: SentenceReading }
  | { success: false; error: string };

async function processItem(
  client: OpenAI,
  item: VocabularyItem,
  sentence: ContextSentence
): Promise<ProcessResult> {
  const reading = getPrimaryReading(item);
  const prompt = buildPrompt(item.data.characters, reading, sentence.ja);

  try {
    const completion = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const responseText = (completion.choices[0]?.message?.content ?? "").trim();

    if (!responseText) {
      return { success: false, error: "Empty response from LLM" };
    }

    if (!validateReading(responseText)) {
      const preview = responseText.length > 200 ? responseText.slice(0, 200) + "..." : responseText;
      return { success: false, error: `Response contains kanji: ${preview}` };
    }

    return {
      success: true,
      reading: { ja: sentence.ja, reading: responseText },
    };
  } catch (error) {
    return { success: false, error: `API error: ${formatError(error)}` };
  }
}

function logHeader(args: CliArgs): void {
  log("=".repeat(60));
  log("SENTENCE READING GENERATOR");
  log("=".repeat(60));
  log(`LLM: ${LLM_BASE_URL} (${LLM_MODEL})`);
  log(`Limit: ${args.limit ?? "none"}, Dry run: ${args.dryRun}`);
  log("=".repeat(60));
}

function logSummary(
  stats: {
    processed: number;
    successful: number;
    errors: number;
    durationMs: number;
    totalSaved: number;
  },
  dryRun: boolean
): void {
  log("");
  log("-".repeat(60));
  log("SUMMARY");
  log("-".repeat(60));
  log(`Processed: ${stats.processed}, Successful: ${stats.successful}, Errors: ${stats.errors}`);
  log(
    `Time: ${(stats.durationMs / 1000).toFixed(1)}s (${Math.round(stats.durationMs / stats.processed)}ms/item)`
  );
  log(dryRun ? "[DRY RUN] No changes saved" : `Total readings saved: ${stats.totalSaved}`);
  log("=".repeat(60));
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  logHeader(args);

  log("Loading vocabulary...");
  const vocabulary = await loadVocabulary();
  const withSentences = vocabulary.filter((v) => v.data.context_sentences.length > 0);
  log(
    `Found ${withSentences.length} items with context sentences in ${vocabulary.length} vocabulary items`
  );

  const readings = await loadExistingReadings();
  const existingCount = Object.keys(readings).length;

  let itemsToProcess = withSentences.filter((v) => !(String(v.id) in readings));
  log(`${itemsToProcess.length} items need processing (${existingCount} already done)`);

  if (args.limit && args.limit < itemsToProcess.length) {
    log(`Limiting to first ${args.limit} items`);
    itemsToProcess = itemsToProcess.slice(0, args.limit);
  }

  if (itemsToProcess.length === 0) {
    log("All items already processed!");
    return;
  }

  if (args.showPrompt) {
    const item = itemsToProcess[0]!;
    const sentence = getShortestSentence(item.data.context_sentences)!;
    const reading = getPrimaryReading(item);
    const prompt = buildPrompt(item.data.characters, reading, sentence.ja);
    log(`Prompt for: ${item.data.characters} (${reading})`);
    log("-".repeat(60));
    console.log(prompt);
    return;
  }

  const client = new OpenAI({ baseURL: LLM_BASE_URL, apiKey: LLM_API_KEY });
  let successful = 0;
  let errors = 0;
  const startTime = Date.now();

  log("");
  log("Processing...");
  log("-".repeat(60));

  for (const [i, item] of itemsToProcess.entries()) {
    const sentence = getShortestSentence(item.data.context_sentences)!;
    const reading = getPrimaryReading(item);

    log(
      `[${i + 1}/${itemsToProcess.length}] ${item.data.characters} (${reading}) — "${sentence.ja}"`
    );

    const result = await processItem(client, item, sentence);

    if (result.success) {
      log(`  OK: ${result.reading.reading}`);

      if (args.dryRun) {
        log(`  [DRY RUN] Would save`);
      } else {
        readings[String(item.id)] = result.reading;
        await saveReadings(readings);
      }
      successful++;
    } else {
      log(`  ERROR: ${result.error}`);
      errors++;
    }

    if (i < itemsToProcess.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  logSummary(
    {
      processed: itemsToProcess.length,
      successful,
      errors,
      durationMs: Date.now() - startTime,
      totalSaved: Object.keys(readings).length,
    },
    args.dryRun
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
