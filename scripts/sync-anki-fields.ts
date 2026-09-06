import { createInterface } from "readline/promises";

import { formatFieldProblems, isInTemplateOrder } from "./lib/anki-template-fields.ts";
import {
  ankiInvoke,
  collectFieldProblems,
  getTemplatePath,
  loadTemplates,
  type TemplateFieldProblem,
} from "./lib/anki-templates.ts";
import { formatError } from "./lib/format-error.ts";

async function main(): Promise<void> {
  console.log("Checking Anki note type fields\n");
  console.log("=".repeat(40));

  const templates = await loadTemplates();
  const problems = await collectFieldProblems(templates);

  if (problems.length === 0) {
    console.log("\nEvery note type matches its template. Nothing to add.");
    return;
  }

  stopOnExtraFields(problems);
  stopOnWrongOrder(problems);

  printMissingFieldsWarning(problems);
  requireTerminal();
  await confirmMigration();

  // Step 2 of the warning syncs this machine, so the note types can change while the prompt waits
  const current = await collectFieldProblems(templates);

  if (current.length === 0) {
    console.log("\nEvery note type matches its template now. Nothing to add.");
    return;
  }

  stopOnChangedProblems(problems, current);

  const added: string[] = [];
  try {
    for (const { modelName, missing, templateFields } of current) {
      for (const fieldName of missing) {
        process.stdout.write(`\nAdding field ${modelName}.${fieldName}... `);
        // Extra fields and a wrong order stop the run, so the note type is a template-order subset
        await ankiInvoke("modelFieldAdd", {
          modelName,
          fieldName,
          index: templateFields.indexOf(fieldName),
        });
        console.log("OK");
        added.push(`${modelName}.${fieldName}`);
      }
    }
  } catch (err) {
    console.error(`\nFailed: ${formatError(err)}`);
    printMigrationResult(added);
    process.exit(1);
  }

  printMigrationResult(added);
  console.log("\nThen run `bun run sync-anki-templates` to push the templates.");
}

function stopOnExtraFields(problems: TemplateFieldProblem[]): void {
  const withExtra = problems.filter((p) => p.extra.length > 0);
  if (withExtra.length === 0) return;

  for (const problem of withExtra) {
    printExtraFields(problem);
  }
  console.error("\nStopped. Nothing was changed.");
  console.error("Remove the extra fields in Anki, then run this script again.");
  process.exit(1);
}

function stopOnWrongOrder(problems: TemplateFieldProblem[]): void {
  const wrongOrder = problems.filter((p) => !isInTemplateOrder(p.templateFields, p.modelFields));
  if (wrongOrder.length === 0) return;

  for (const problem of wrongOrder) {
    console.error("");
    console.error(`${problem.modelName}: the fields are not in template order`);
    console.error(`  in Anki:     ${problem.modelFields.join(", ")}`);
    console.error(`  in template: ${problem.templateFields.join(", ")}`);
  }
  console.error("\nStopped. Nothing was changed.");
  console.error("This script adds a field at the position the template lists it.");
  console.error("With this order the new field would land in the wrong place.");
  console.error("Open the note type in Anki, press Fields..., and reposition the fields");
  console.error("into template order. Then run this script again.");
  process.exit(1);
}

function stopOnChangedProblems(
  approved: TemplateFieldProblem[],
  current: TemplateFieldProblem[]
): void {
  if (fieldStateKey(approved) === fieldStateKey(current)) return;

  console.error("\nThe note types changed while the script waited for the answer.");
  console.error("\nWhat you approved:");
  for (const line of describeProblems(approved)) {
    console.error(`  ${line}`);
  }
  console.error("\nWhat the note types hold now:");
  for (const line of describeProblems(current)) {
    console.error(`  ${line}`);
  }
  console.error("\nStopped. Nothing was changed.");
  console.error("Run this script again to see the current state.");
  process.exit(1);
}

function describeProblems(problems: TemplateFieldProblem[]): string[] {
  return problems.flatMap((problem) => [
    ...formatFieldProblems([problem]),
    `  fields in Anki: ${problem.modelFields.join(", ")}`,
  ]);
}

function fieldStateKey(problems: TemplateFieldProblem[]): string {
  return problems.map((p) => `${p.modelName}=${p.modelFields.join(",")}`).join(";");
}

function printExtraFields(problem: TemplateFieldProblem): void {
  console.error("");
  for (const line of formatFieldProblems([{ ...problem, missing: [] }])) {
    console.error(line);
  }
  console.error("  This script never removes them, and it adds no field while they are there.");
  console.error("  A new field would land next to them, so the field order would come out wrong.");
  console.error("  validateModelFields in src/server/services/anki-connect.ts checks one note");
  console.error("  type at a time. It throws on an extra field, so every add-to-anki call that");
  console.error("  writes this note type fails.");
  console.error(
    `  Remove the field in Anki by hand, or add it to ${getTemplatePath(problem.file)}`
  );
  console.error("  and to every other place CLAUDE.md lists for a note field.");
}

function printMissingFieldsWarning(withMissing: TemplateFieldProblem[]): void {
  console.error("\n" + "!".repeat(60));
  console.error("WARNING: the Anki note types miss fields listed in the templates");
  console.error("");
  for (const line of formatFieldProblems(withMissing.map((p) => ({ ...p, extra: [] })))) {
    console.error(`  ${line}`);
  }
  console.error("");
  console.error("Adding a field changes the collection schema.");
  console.error("After that Anki asks for a one-way sync, and you must choose upload.");
  console.error("Upload replaces the AnkiWeb collection with the one on this machine.");
  console.error("So do these steps in this order:");
  console.error("  1. Sync every OTHER device to AnkiWeb.");
  console.error("  2. Sync Anki on THIS machine, so it downloads those changes.");
  console.error("  3. Only then let this script add the fields.");
  console.error("  4. Sync in Anki again and choose upload.");
  console.error("Skip step 2 and the upload wipes the changes from the other devices.");
  console.error("!".repeat(60));
}

function requireTerminal(): void {
  if (process.stdin.isTTY) return;

  console.error("\nNo terminal here. Run `bun run sync-anki-fields` in a terminal");
  console.error("to add the fields. Nothing was changed.");
  process.exit(1);
}

async function confirmMigration(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // On Ctrl+D readline closes and question() never settles, so the script hangs
  const abort = new AbortController();
  rl.once("close", () => abort.abort());

  let answer: string;
  try {
    answer = await rl.question(
      "\nType yes if steps 1 and 2 are done and this machine is synced: ",
      {
        signal: abort.signal,
      }
    );
  } catch {
    stopWithoutChanges();
  } finally {
    rl.close();
  }

  if (answer.trim().toLowerCase() !== "yes") {
    stopWithoutChanges();
  }
}

function printMigrationResult(added: string[]): void {
  if (added.length === 0) {
    console.error("\nNo field was added. If Anki still asks for a one-way sync, choose upload.");
    return;
  }

  console.log(`\nAdded: ${added.join(", ")}`);
  console.log("The collection schema changed. Now step 4: sync in Anki and choose upload.");
}

function stopWithoutChanges(): never {
  console.error("\nStopped. Nothing was changed.");
  process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal error:", formatError(err));
  process.exit(1);
});
