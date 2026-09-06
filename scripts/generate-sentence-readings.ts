import OpenAI from "openai";
import { getShortestSentence } from "../src/model/vocabulary-utils.ts";
import type { ContextSentence } from "../src/model/wanikani.ts";
import {
  DEFAULT_BATCH_SIZE,
  MAX_FAILED_BATCHES_IN_A_ROW,
  log,
  logSummary,
  parseGeneratorArgs,
  sleep,
  type GeneratorArgs,
} from "./lib/generator-cli.ts";
import { askForJsonObject, chunk, loadJsonFile, saveJsonAtomic } from "./lib/llm-utils.ts";
import { getReadingProblem } from "./lib/sentence-reading-check.ts";
import {
  getVocabularyReading,
  loadVocabulary,
  type VocabularyItem,
} from "./lib/vocabulary-data.ts";

// === TYPES ===

type SentenceReading = {
  ja: string;
  reading: string;
};

type ReadingTask = {
  id: string;
  word: string;
  reading: string;
  sentence: ContextSentence;
};

type TaskResult = { success: true; reading: string } | { success: false; error: string };

// === CONFIGURATION ===

if (!process.env.LLM_BASE_URL) throw new Error("Missing LLM_BASE_URL in .env");
if (!process.env.LLM_MODEL) throw new Error("Missing LLM_MODEL in .env");
if (!process.env.LLM_API_KEY) throw new Error("Missing LLM_API_KEY in .env");

const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const RATE_LIMIT_MS = 500;
const SENTENCE_READINGS_FILE = "./data/sentence_readings.json";

const HELP = `
Usage: bun run scripts/generate-sentence-readings.ts [options]

Options:
  -l, --limit <n>       Limit the number of items to process
  -b, --batch-size <n>  Items per LLM request (default: ${DEFAULT_BATCH_SIZE})
  -d, --dry-run         Don't save to file, output to stdout only
  -p, --show-prompt     Print the prompt for the first batch and exit
  -h, --help            Show this help message
`;

// === MAIN ===

async function main(): Promise<void> {
  const args = parseGeneratorArgs(HELP);
  logHeader(args);

  log("Loading vocabulary...");
  const vocabulary = await loadVocabulary();
  const withSentences = vocabulary.filter((v) => v.data.context_sentences.length > 0);
  log(
    `Found ${withSentences.length} items with context sentences in ${vocabulary.length} vocabulary items`
  );

  const readings = await loadJsonFile<SentenceReading>(SENTENCE_READINGS_FILE);
  const existingCount = Object.keys(readings).length;

  let tasks = withSentences.filter((v) => !(String(v.id) in readings)).map(toTask);
  log(`${tasks.length} items need processing (${existingCount} already done)`);

  if (args.limit && args.limit < tasks.length) {
    log(`Limiting to first ${args.limit} items`);
    tasks = tasks.slice(0, args.limit);
  }

  if (tasks.length === 0) {
    log("All items already processed!");
    return;
  }

  const batches = chunk(tasks, args.batchSize);

  if (args.showPrompt) {
    const batch = batches[0]!;
    log(`Prompt for the first batch (${batch.length} items)`);
    log("-".repeat(60));
    console.log(buildPrompt(batch));
    return;
  }

  const client = new OpenAI({ baseURL: LLM_BASE_URL, apiKey: LLM_API_KEY });
  let processed = 0;
  let successful = 0;
  let errors = 0;
  let failedBatchesInARow = 0;
  const startTime = Date.now();

  log("");
  log("Processing...");
  log("-".repeat(60));

  for (const [i, batch] of batches.entries()) {
    log(`[${i + 1}/${batches.length}] ${batch.map((t) => t.word).join(", ")}`);
    processed += batch.length;

    const answer = await askForJsonObject({ client, model: LLM_MODEL, prompt: buildPrompt(batch) });

    if (!answer.success) {
      log(`  ERROR: ${answer.error}`);
      errors += batch.length;
      failedBatchesInARow++;
      if (failedBatchesInARow >= MAX_FAILED_BATCHES_IN_A_ROW) {
        log(`${MAX_FAILED_BATCHES_IN_A_ROW} batches in a row got no answer, stopping`);
        process.exitCode = 1;
        break;
      }
    } else {
      failedBatchesInARow = 0;
      for (const task of batch) {
        const result = checkAnswer(task, answer.data[task.id]);
        if (result.success) {
          log(`  OK ${task.word}: ${result.reading}`);
          readings[task.id] = { ja: task.sentence.ja, reading: result.reading };
          successful++;
        } else {
          log(`  ERROR ${task.word}: ${result.error}`);
          errors++;
        }
      }

      if (args.dryRun) {
        log("  [DRY RUN] Not saved");
      } else {
        await saveJsonAtomic(SENTENCE_READINGS_FILE, readings);
      }
    }

    if (i < batches.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  logSummary({
    processed,
    successful,
    errors,
    durationMs: Date.now() - startTime,
    totalSaved: Object.keys(readings).length,
    dryRun: args.dryRun,
    itemName: "item",
    savedName: "readings",
  });
}

// === HELPERS ===

function logHeader(args: GeneratorArgs): void {
  log("=".repeat(60));
  log("SENTENCE READING GENERATOR");
  log("=".repeat(60));
  log(`LLM: ${LLM_BASE_URL} (${LLM_MODEL})`);
  log(`Limit: ${args.limit ?? "none"}, Batch size: ${args.batchSize}, Dry run: ${args.dryRun}`);
  log("=".repeat(60));
}

function toTask(item: VocabularyItem): ReadingTask {
  return {
    id: String(item.id),
    word: item.data.characters,
    reading: getVocabularyReading(item),
    sentence: getShortestSentence(item.data.context_sentences)!,
  };
}

function buildPrompt(tasks: ReadingTask[]): string {
  const items = tasks.map((t) => ({
    id: t.id,
    word: t.word,
    reading: t.reading,
    sentence: t.sentence.ja,
    en: t.sentence.en,
  }));

  return `You are a Japanese language expert. Convert each Japanese sentence below into its kana reading.

Rules:
- Convert all kanji to hiragana
- Keep katakana as katakana
- Write a kanji loanword in katakana, for example 珈琲 is コーヒー
- Read ヶ and ヵ as か or が, for example 二ヶ所 is にかしょ
- Keep hiragana, punctuation, and symbols unchanged
- Use the correct reading for each kanji based on the sentence context
- In each item, the vocabulary word on its own must be read with the given reading
- A compound that contains the word keeps its natural reading, including rendaku, for example アマゾン川 is アマゾンがわ even when 川 is read かわ
- The English translation shows the intended meaning

Items:
${JSON.stringify(items)}

Return ONLY a JSON object that maps each id to the kana reading of its sentence,
for example {"2467": "レベルいちです。"}. No markdown, no explanation.`;
}

function checkAnswer(task: ReadingTask, value: unknown): TaskResult {
  if (typeof value !== "string" || !value.trim()) {
    return { success: false, error: "Missing or empty answer" };
  }
  const reading = value.trim();
  const problem = getReadingProblem(task.sentence.ja, reading);
  if (problem) return { success: false, error: `Answer ${problem}: ${reading}` };
  return { success: true, reading };
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
