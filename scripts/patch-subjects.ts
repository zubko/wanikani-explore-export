import { parseArgs } from "util";
import { formatError } from "./lib/format-error.ts";
import {
  formatStatusLine,
  parsePatches,
  patchSubjects,
  SUBJECT_FILE_NAMES,
  type SubjectFile,
  type SubjectRecord,
} from "./lib/subject-patches.ts";

const FIXES_FILE = "./data/wanikani-fixes.yaml";
const DATA_DIR = "./data/userdata";

const USAGE = `Apply the corrections in ${FIXES_FILE} to the downloaded subject data.

Usage: bun run patch-subjects [options]

Options:
  --dry-run   Check every patch and print the result, write nothing
  --help      Show this help

Nothing is written unless every patch applies. A failing patch means WaniKani
changed the record: look at the subject, then either delete the patch or update
its \`seen\`. Never delete a patch just because the run failed.`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  process.stdout.write(`Loading ${FIXES_FILE}... `);
  const patches = parsePatches(await Bun.file(FIXES_FILE).text());
  console.log(`${patches.length} patches`);

  if (patches.length === 0) {
    console.log("No patches, nothing to do.");
    return;
  }

  process.stdout.write("Loading subjects... ");
  const files = await loadSubjectFiles();
  const total = files.reduce((count, file) => count + file.subjects.length, 0);
  console.log(`${total} in ${files.length} files\n`);

  const result = patchSubjects({ files, patches, dryRun: values["dry-run"] });
  for (const status of result.statuses) {
    console.log(formatStatusLine(status));
  }

  if (!result.ok) {
    const failed = result.statuses.filter((status) => status.kind === "fail").length;
    console.error(`\n${failed} of ${patches.length} patches do not apply. Nothing was written.`);
    console.error("Look at the subject on wanikani.com, then either delete the patch from");
    console.error(`${FIXES_FILE} (WaniKani fixed this field), or update \`seen\` and re-check`);
    console.error("`expect` (WaniKani changed something else). Do not delete it blindly.");
    process.exit(1);
  }

  console.log(`\nAll ${patches.length} patches applied or already in place.`);

  if (values["dry-run"]) {
    console.log("Dry run, nothing was written.");
    return;
  }

  if (result.writes.length === 0) {
    console.log("Nothing to write.");
    return;
  }

  for (const file of result.writes) {
    await Bun.write(file.path, JSON.stringify(file.subjects, null, 2));
    console.log(`Wrote ${file.path}`);
  }
}

async function loadSubjectFiles(): Promise<SubjectFile[]> {
  return Promise.all(
    SUBJECT_FILE_NAMES.map(async (name) => {
      const path = `${DATA_DIR}/${name}`;
      const file = Bun.file(path);
      if (!(await file.exists())) {
        throw new Error(`${path} is missing. Run \`bun run download-subjects\` first.`);
      }
      return { path, subjects: (await file.json()) as SubjectRecord[] };
    })
  );
}

main().catch((err) => {
  console.error("\nFatal error:", formatError(err));
  process.exit(1);
});
