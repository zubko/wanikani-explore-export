import OpenAI from "openai";
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
import {
  getVocabularyReading,
  loadVocabulary,
  type VocabularyItem,
} from "./lib/vocabulary-data.ts";

// === TYPES ===

type VerbConjugation = {
  dictionary: string;
  masu: string;
  te: string;
  nai: string;
};

type ConjugationTask = {
  id: string;
  verb: string;
  reading: string;
  type: string;
};

type TaskResult =
  | { success: true; conjugation: VerbConjugation }
  | { success: false; error: string };

// === CONFIGURATION ===

if (!process.env.LLM_BASE_URL) throw new Error("Missing LLM_BASE_URL in .env");
if (!process.env.LLM_MODEL) throw new Error("Missing LLM_MODEL in .env");
if (!process.env.LLM_API_KEY) throw new Error("Missing LLM_API_KEY in .env");

const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const RATE_LIMIT_MS = 500;
const CONJUGATIONS_FILE = "./data/verb_conjugations.json";

// 来る (ID 2824) is in vocabulary.json
// する (ID 9180) is in kana_vocabulary.json
const IRREGULAR_VERB_IDS = [2824, 9180];

const HELP = `
Usage: bun run scripts/generate-verb-conjugations.ts [options]

Options:
  -l, --limit <n>       Limit the number of verbs to process
  -b, --batch-size <n>  Verbs per LLM request (default: ${DEFAULT_BATCH_SIZE})
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
  const verbs = vocabulary.filter(isTargetVerb);
  log(`Found ${verbs.length} verbs in ${vocabulary.length} vocabulary items`);

  const conjugations = await loadJsonFile<VerbConjugation>(CONJUGATIONS_FILE);
  const existingCount = Object.keys(conjugations).length;

  let tasks = verbs.filter((v) => !(String(v.id) in conjugations)).map(toTask);
  log(`${tasks.length} verbs need processing (${existingCount} already done)`);

  if (args.limit && args.limit < tasks.length) {
    log(`Limiting to first ${args.limit} verbs`);
    tasks = tasks.slice(0, args.limit);
  }

  if (tasks.length === 0) {
    log("All verbs already processed!");
    return;
  }

  const batches = chunk(tasks, args.batchSize);

  if (args.showPrompt) {
    const batch = batches[0]!;
    log(`Prompt for the first batch (${batch.length} verbs)`);
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
    log(`[${i + 1}/${batches.length}] ${batch.map((t) => t.verb).join(", ")}`);
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
          const c = result.conjugation;
          log(`  OK ${task.verb}: ます=${c.masu}, て=${c.te}, ない=${c.nai}`);
          conjugations[task.id] = c;
          successful++;
        } else {
          log(`  ERROR ${task.verb}: ${result.error}`);
          errors++;
        }
      }

      if (args.dryRun) {
        log("  [DRY RUN] Not saved");
      } else {
        await saveJsonAtomic(CONJUGATIONS_FILE, conjugations);
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
    totalSaved: Object.keys(conjugations).length,
    dryRun: args.dryRun,
    itemName: "verb",
    savedName: "conjugations",
  });
}

// === HELPERS ===

function logHeader(args: GeneratorArgs): void {
  log("=".repeat(60));
  log("VERB CONJUGATION GENERATOR");
  log("=".repeat(60));
  log(`LLM: ${LLM_BASE_URL} (${LLM_MODEL})`);
  log(`Limit: ${args.limit ?? "none"}, Batch size: ${args.batchSize}, Dry run: ${args.dryRun}`);
  log("=".repeat(60));
}

function isTargetVerb(item: VocabularyItem): boolean {
  return getVerbType(item) !== "unknown";
}

function getVerbType(item: VocabularyItem): string {
  if (IRREGULAR_VERB_IDS.includes(item.id)) return "irregular";
  if (item.data.parts_of_speech.includes("ichidan verb")) return "ichidan";
  if (item.data.parts_of_speech.includes("godan verb")) return "godan";
  return "unknown";
}

function toTask(item: VocabularyItem): ConjugationTask {
  return {
    id: String(item.id),
    verb: item.data.characters,
    reading: getVocabularyReading(item),
    type: getVerbType(item),
  };
}

function buildPrompt(tasks: ConjugationTask[]): string {
  return `You are a Japanese language expert. Conjugate each Japanese verb below into four forms: dictionary, masu, te and nai.

Items:
${JSON.stringify(tasks)}

Examples:
- 食べる (ichidan): {"dictionary": "食べる", "masu": "食べます", "te": "食べて", "nai": "食べない"}
- 書く (godan): {"dictionary": "書く", "masu": "書きます", "te": "書いて", "nai": "書かない"}
- 来る (irregular): {"dictionary": "来る", "masu": "来ます", "te": "来て", "nai": "来ない"}
- する (irregular): {"dictionary": "する", "masu": "します", "te": "して", "nai": "しない"}

Return ONLY a JSON object that maps each id to the conjugations of its verb,
for example {"2480": {"dictionary": "入る", "masu": "入ります", "te": "入って", "nai": "入らない"}}.
No markdown, no explanation.`;
}

function checkAnswer(task: ConjugationTask, value: unknown): TaskResult {
  const conjugation = parseConjugation(value);
  if (!conjugation) {
    return { success: false, error: `Missing or incomplete answer: ${JSON.stringify(value)}` };
  }
  if (conjugation.dictionary !== task.verb) {
    return {
      success: false,
      error: `Dictionary form "${conjugation.dictionary}" is not "${task.verb}"`,
    };
  }
  return { success: true, conjugation };
}

function parseConjugation(value: unknown): VerbConjugation | null {
  if (typeof value !== "object" || value === null) return null;
  const { dictionary, masu, te, nai } = value as Record<string, unknown>;
  if (
    !isNonEmptyString(dictionary) ||
    !isNonEmptyString(masu) ||
    !isNonEmptyString(te) ||
    !isNonEmptyString(nai)
  ) {
    return null;
  }
  return { dictionary: dictionary.trim(), masu: masu.trim(), te: te.trim(), nai: nai.trim() };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
