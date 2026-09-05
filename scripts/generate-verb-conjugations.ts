import { readFile, writeFile } from "fs/promises";
import { parseArgs } from "util";
import OpenAI from "openai";
import { formatError } from "./format-error.ts";

// === TYPES ===

type VerbConjugation = {
  dictionary: string;
  masu: string;
  te: string;
  nai: string;
};

type ConjugationsData = Record<string, VerbConjugation>;

type VocabularyItem = {
  id: number;
  object: string;
  data: {
    characters: string;
    readings: Array<{ reading: string; primary: boolean }>;
    parts_of_speech: string[];
  };
};

type CliArgs = {
  limit: number | undefined;
  dryRun: boolean;
  showPrompt: boolean;
};

// === CONFIGURATION ===

if (!process.env.LLM_BASE_URL) throw new Error("Missing LLM_BASE_URL in .env");
if (!process.env.LLM_MODEL) throw new Error("Missing LLM_MODEL in .env");
if (!process.env.LLM_API_KEY) throw new Error("Missing LLM_API_KEY in .env");

const LLM_BASE_URL = process.env.LLM_BASE_URL;
// for CLIProxyAPI
const LLM_MODEL = "gpt-5.4";
// for OpenRouter
// const LLM_MODEL = "openai/gpt-5-mini";
const LLM_API_KEY = process.env.LLM_API_KEY;
const RATE_LIMIT_MS = 500;
const VOCABULARY_FILE = "./data/userdata/vocabulary.json";
const KANA_VOCABULARY_FILE = "./data/userdata/kana_vocabulary.json";
const CONJUGATIONS_FILE = "./data/verb_conjugations.json";

// 来る (ID 2824) is in vocabulary.json
// する (ID 9180) is in kana_vocabulary.json
const IRREGULAR_VERB_IDS = [2824, 9180];

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
Usage: bun run scripts/generate-verb-conjugations.ts [options]

Options:
  -l, --limit <n>   Limit the number of verbs to process
  -d, --dry-run     Don't save to file, output to stdout only
  -p, --show-prompt Print the prompt for the first verb and exit
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

function getVerbType(item: VocabularyItem): string {
  if (IRREGULAR_VERB_IDS.includes(item.id)) return "irregular";
  if (item.data.parts_of_speech.includes("ichidan verb")) return "ichidan";
  if (item.data.parts_of_speech.includes("godan verb")) return "godan";
  return "unknown";
}

function getPrimaryReading(item: VocabularyItem): string {
  if (!item.data.readings) return item.data.characters;
  const primary = item.data.readings.find((r) => r.primary);
  return primary?.reading ?? item.data.readings[0]?.reading ?? item.data.characters;
}

function isTargetVerb(item: VocabularyItem): boolean {
  const pos = item.data.parts_of_speech;
  return (
    pos.includes("godan verb") ||
    pos.includes("ichidan verb") ||
    IRREGULAR_VERB_IDS.includes(item.id)
  );
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

async function loadExistingConjugations(): Promise<ConjugationsData> {
  try {
    const content = await readFile(CONJUGATIONS_FILE, "utf-8");
    return JSON.parse(content) as ConjugationsData;
  } catch {
    return {};
  }
}

async function saveConjugations(data: ConjugationsData): Promise<void> {
  await writeFile(CONJUGATIONS_FILE, JSON.stringify(data, null, 2) + "\n");
}

function parseConjugationResponse(response: string): VerbConjugation | null {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.dictionary && parsed.masu && parsed.te && parsed.nai) {
      return parsed as VerbConjugation;
    }
    return null;
  } catch {
    return null;
  }
}

function buildPrompt(verb: string, reading: string, verbType: string): string {
  return `You are a Japanese language expert. Conjugate the following Japanese verb into four forms.

Verb: ${verb}
Reading: ${reading}
Type: ${verbType}

Provide the conjugations in this exact JSON format (no markdown, no explanation, just the JSON):
{
  "dictionary": "${verb}",
  "masu": "<masu form>",
  "te": "<te form>",
  "nai": "<nai form>"
}

Examples:
- 食べる (ichidan): {"dictionary": "食べる", "masu": "食べます", "te": "食べて", "nai": "食べない"}
- 書く (godan): {"dictionary": "書く", "masu": "書きます", "te": "書いて", "nai": "書かない"}
- 来る (irregular): {"dictionary": "来る", "masu": "来ます", "te": "来て", "nai": "来ない"}
- する (irregular): {"dictionary": "する", "masu": "します", "te": "して", "nai": "しない"}

Return ONLY the JSON object for ${verb}, nothing else.`;
}

// === MAIN ===

type ProcessResult =
  | { success: true; conjugation: VerbConjugation }
  | { success: false; error: string };

async function processVerb(client: OpenAI, verb: VocabularyItem): Promise<ProcessResult> {
  const verbType = getVerbType(verb);
  const reading = getPrimaryReading(verb);
  const prompt = buildPrompt(verb.data.characters, reading, verbType);

  try {
    const completion = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const responseText = completion.choices[0]?.message?.content ?? "";
    const conjugation = parseConjugationResponse(responseText);

    if (conjugation) {
      return { success: true, conjugation };
    }
    const preview = responseText.length > 200 ? responseText.slice(0, 200) + "..." : responseText;
    return { success: false, error: `Failed to parse response: ${preview}` };
  } catch (error) {
    return { success: false, error: `API error: ${formatError(error)}` };
  }
}

function logHeader(args: CliArgs): void {
  log("=".repeat(60));
  log("VERB CONJUGATION GENERATOR");
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
    `Time: ${(stats.durationMs / 1000).toFixed(1)}s (${Math.round(stats.durationMs / stats.processed)}ms/verb)`
  );
  log(dryRun ? "[DRY RUN] No changes saved" : `Total conjugations saved: ${stats.totalSaved}`);
  log("=".repeat(60));
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  logHeader(args);

  log("Loading vocabulary...");
  const vocabulary = await loadVocabulary();
  const verbs = vocabulary.filter(isTargetVerb);
  log(`Found ${verbs.length} verbs in ${vocabulary.length} vocabulary items`);

  const conjugations = await loadExistingConjugations();
  const existingCount = Object.keys(conjugations).length;

  let verbsToProcess = verbs.filter((v) => !(String(v.id) in conjugations));
  log(`${verbsToProcess.length} verbs need processing (${existingCount} already done)`);

  if (args.limit && args.limit < verbsToProcess.length) {
    log(`Limiting to first ${args.limit} verbs`);
    verbsToProcess = verbsToProcess.slice(0, args.limit);
  }

  if (verbsToProcess.length === 0) {
    log("All verbs already processed!");
    return;
  }

  if (args.showPrompt) {
    const verb = verbsToProcess[0]!;
    const verbType = getVerbType(verb);
    const reading = getPrimaryReading(verb);
    const prompt = buildPrompt(verb.data.characters, reading, verbType);
    log(`Prompt for: ${verb.data.characters} (${reading}, ${verbType})`);
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

  for (const [i, verb] of verbsToProcess.entries()) {
    const verbType = getVerbType(verb);
    const reading = getPrimaryReading(verb);

    log(`[${i + 1}/${verbsToProcess.length}] ${verb.data.characters} (${reading}, ${verbType})`);

    const result = await processVerb(client, verb);

    if (result.success) {
      const c = result.conjugation;
      log(`  OK: ます=${c.masu}, て=${c.te}, ない=${c.nai}`);

      if (args.dryRun) {
        log(`  [DRY RUN] Would save`);
      } else {
        conjugations[String(verb.id)] = c;
        await saveConjugations(conjugations);
      }
      successful++;
    } else {
      log(`  ERROR: ${result.error}`);
      errors++;
    }

    if (i < verbsToProcess.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  logSummary(
    {
      processed: verbsToProcess.length,
      successful,
      errors,
      durationMs: Date.now() - startTime,
      totalSaved: Object.keys(conjugations).length,
    },
    args.dryRun
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
