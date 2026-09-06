import { parseArgs } from "util";

export type GeneratorArgs = {
  limit: number | undefined;
  batchSize: number;
  dryRun: boolean;
  showPrompt: boolean;
};

export const DEFAULT_BATCH_SIZE = 20;
export const MAX_FAILED_BATCHES_IN_A_ROW = 3;

export function parseGeneratorArgs(helpText: string): GeneratorArgs {
  const { values } = parseArgs({
    options: {
      limit: { type: "string", short: "l" },
      "batch-size": { type: "string", short: "b" },
      "dry-run": { type: "boolean", short: "d", default: false },
      "show-prompt": { type: "boolean", short: "p", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(helpText);
    process.exit(0);
  }

  return {
    limit: parseCount(values.limit, "--limit"),
    batchSize: parseCount(values["batch-size"], "--batch-size") ?? DEFAULT_BATCH_SIZE,
    dryRun: values["dry-run"] ?? false,
    showPrompt: values["show-prompt"] ?? false,
  };
}

export function logSummary(params: {
  processed: number;
  successful: number;
  errors: number;
  durationMs: number;
  totalSaved: number;
  dryRun: boolean;
  itemName: string;
  savedName: string;
}): void {
  const { processed, successful, errors, durationMs, totalSaved, dryRun, itemName, savedName } =
    params;
  log("");
  log("-".repeat(60));
  log("SUMMARY");
  log("-".repeat(60));
  log(`Processed: ${processed}, Successful: ${successful}, Errors: ${errors}`);
  log(
    `Time: ${(durationMs / 1000).toFixed(1)}s (${Math.round(durationMs / processed)}ms/${itemName})`
  );
  log(dryRun ? "[DRY RUN] No changes saved" : `Total ${savedName} saved: ${totalSaved}`);
  log("=".repeat(60));
}

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCount(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return count;
}
