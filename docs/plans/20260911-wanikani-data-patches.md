# WaniKani Data Patches

## Overview

WaniKani's content update of 2026-08-27 changed the radical composition of three kanji. The change is live on the WaniKani website, and the API already serves the new mnemonics, but the API still serves the **old** `component_subject_ids` and `amalgamation_subject_ids`. Verified live against `api.wanikani.com` on 2026-09-11. Reported to the forum ([t/75554](https://community.wanikani.com/t/75554)) and to `hello@wanikani.com`.

The result in our app: 別 shows Mouth + **Sword** + Knife while its own mnemonic talks about a prison, and the Prison radical page does not list 別, 万 or 成 at all.

This plan adds a small patch mechanism:

- A fixes file checked into the main repo, holding hand-written corrections with the reason for each.
- A separate script that applies them to the downloaded data in `data/userdata/`.
- Every patch states the exact value it expects to find. When that value is gone, the run **fails loudly** instead of guessing.

Downloading is expensive, so `download-subjects.ts` stays as it is. Patching is a separate, cheap, repeatable step.

## Context (from discovery)

- **Files involved:** `data/wanikani-fixes.yaml` (new), `scripts/patch-subjects.ts` (new), `scripts/lib/subject-patches.ts` (new), `scripts/lib/__tests__/subject-patches.test.ts` (new), `scripts/download-subjects.ts` (one line), `package.json`, `README.md`, `CLAUDE.md`
- **Related patterns found:**
  - `scripts/lib/sentence-reading-check.ts` — small pure module, named exports, no I/O, unit-tested in `scripts/lib/__tests__/`
  - `scripts/lib/format-error.ts` — shared `formatError(err)` used by all scripts
  - `scripts/download-subjects.ts` — writes `data/userdata/{radicals,kanji,vocabulary,kana_vocabulary}.json` as `JSON.stringify(subjects, null, 2)`
  - Script convention in `CLAUDE.md`: `main()` first, helpers below, `main().catch(...)` last; `parseArgs` from `util` for flags
- **Dependencies identified:** none. `Bun.YAML.parse` is built in (checked on Bun 1.3.14). The script needs no env vars, so no `--env-file` in `package.json`.
- **Consumers that make this matter:** `src/server/repository/radical.ts:13` builds "Found in Kanji" from `amalgamation_subject_ids`, and `src/server/repository/kanji.ts:18` builds "Found in Vocabulary" the same way. This is why the radical back-links must be patched too, not only the three kanji.

## Development Approach

- **testing approach**: Regular (code first, then tests)
- complete each task fully before moving to the next
- make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
  - tests are not optional - they are a required part of the checklist
  - write unit tests for new functions
  - write unit tests for modified functions
  - add new test cases for new code paths
  - tests cover both success and error scenarios
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- run `bun test scripts/lib/__tests__/subject-patches.test.ts` after each change
- run `bun run lint:fix` on edited files before moving on, per `CLAUDE.md`

## Testing Strategy

- **unit tests**: required for every task, in `scripts/lib/__tests__/subject-patches.test.ts`. The logic is pure — no fetch mock, no file mock, no repository init needed. Fixtures are small hand-written subject records shaped like the real API wrapper (`{ id, object, data_updated_at, data }`).
- **integration tests**: the project's integration tests are the API E2E tests in `src/server/__tests__/`, which drive `api.request()` through `src/test/fetch-interceptor.ts`. This change touches no server route and no repository function, so those tests are not extended. They must still pass unchanged.
  - The create/update behaviour this change introduces is **deciding which subject files to rewrite**. That decision does not live in the entry point. `patchSubjects` takes already-loaded files and returns the list of files to write, so all-or-nothing, dry-run and "only the changed files" are covered by plain unit tests on real-shaped records. `formatStatusLine` covers the printed line and the character fallback. The entry point is left with read, print, write and exit code only.
  - One test loads the real checked-in `data/wanikani-fixes.yaml` and runs it through `parsePatches`, so a typo in the data file fails the suite instead of failing at run time. This mirrors how `scripts/lib/__tests__/anki-template-fields.test.ts` checks the real template files — resolve the path with `join(import.meta.dir, "../../../data/wanikani-fixes.yaml")` as that test does, never relative to the working directory.
  - **The long id lists get their own tests.** Three patches hold 18 to 68 ids, pasted from generated output, and length alone cannot prove a paste is right. Task 4 adds a hand-written delta table naming the few ids each patch adds and removes, and tests that the real file matches it, that ids are unique and sorted where they should be, that every id resolves to a real subject, and that a dry run over the real data reports only `apply` or `already`. These tests read `data/userdata/`, which the repository tests already do.
- **snapshots**: the repository tests read the real `data/userdata/` files, so patching the data changes two checked-in snapshots. Radical 1 (一 ground) gains 495 (万), which shows up in `src/server/repository/__tests__/__snapshots__/radical.test.ts.snap` (from `getRadical(1)`) and `src/server/__tests__/__snapshots__/api.search.test.ts.snap` (from `type=radical&q=一`). Both are updated in Task 6, one file at a time. No other snapshot references the four patched radicals, and the radical note type has no "found in kanji" field, so the Anki snapshots are untouched.
- **e2e tests**: the project has no browser e2e suite. Manual verification of the 別 page is in Task 6.

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope
- keep plan in sync with actual work done

## Solution Overview

Three pieces, each with one job.

**1. `data/wanikani-fixes.yaml`** — the data. Checked into the main repo next to `data/verb_conjugations.json`. YAML rather than JSON so every patch can carry a comment saying why it exists, with the link to the forum thread. Parsed with `Bun.YAML.parse`.

**2. `scripts/lib/subject-patches.ts`** — the pure logic. Parses and validates the patch list, decides a status for each patch against a subject record, and returns which files to write. No file I/O, no network.

**3. `scripts/patch-subjects.ts`** — the entry point. Reads the fixes file and the four subject files, calls the lib, prints a line per patch, writes the files the lib names, and sets the exit code.

**Key design decision — one patch kind.** A patch states `expect` (the whole broken value) and `set` (the whole fixed value). There is no `add` / `remove`. An earlier draft had them, to keep the long `amalgamation_subject_ids` patches short, but they brought edge cases that are not worth the saved lines: a patch could hold both `add` and `remove` with no defined precedence, and an empty `add: []` satisfies both "none present" and "all present", so it would report `apply` forever and never settle. Spelling out a 68-id list twice is ugly. It is also unambiguous, and the arrays are generated from the real data rather than typed by hand.

**Key design decision — the guard.** Every patch records the `data_updated_at` it was written against, as `seen`. That check runs first and outranks everything else. If WaniKani touches the record at all — to fix this bug or for any other reason — the run fails and asks a human to look.

**A failing patch does not mean "delete it".** The `seen` guard fires on _any_ edit to the record, including one that leaves the wrong ids in place, for example a new allow-list meaning on 別. Deleting the patch then would throw away a fix that is still needed, and the next download would bring the bad value back with nothing left to correct it. So every failure message and every doc line says the same thing: **look at the record, then either delete the patch (WaniKani fixed that field) or update `seen` and re-check `expect` (WaniKani changed something else).**

**Key design decision — all or nothing.** A full check pass runs before anything is written. One failing patch means nothing is written and the process exits 1. A half-patched data file would be worse than an unpatched one, because it would look correct at a glance.

The guarantee is exactly this: **nothing is written unless every patch passes.** It is not crash-safe atomicity across the two files. The script writes `kanji.json` and `radicals.json` with separate `Bun.write` calls, so a failure between them leaves one file patched and the other not. That state is safe, because the run is idempotent and self-heals: run the script again, the written file reports `already`, the unwritten one reports `apply`, and only it gets rewritten. Recovery is one command on a local file that a download can rebuild, so the plan does not add staged writes, backups or rollback. What it does require is that a failed write is **loud** — see the exit code rule below.

## Technical Details

### Patch file format

```yaml
# WaniKani's content update of 2026-08-27 changed the radicals of 万, 別 and 成.
# The website shows the new values, the API still serves the old ones.
# Reported: https://community.wanikani.com/t/75554  and hello@wanikani.com (2026-09-11)
#
# A patch that stops applying means WaniKani changed the record. Look at it, then either:
#   - delete the patch, if WaniKani fixed this field
#   - update `seen` and re-check `expect`, if they changed something else
# Never delete a patch just because the run failed.

patches:
  - subject: 785 # kanji 別
    seen: "2026-08-27T17:34:38.403049Z"
    field: component_subject_ids
    expect: [16, 24, 128] # Mouth + Sword + Knife
    set: [16, 14, 128] # Mouth + Prison + Knife
```

### Types

```ts
type SubjectPatch = {
  subject: number;
  seen: string;
  field: string;
  expect: number[];
  set: number[];
};

type SubjectRecord = { id: number; data_updated_at: string; data: Record<string, unknown> };

type SubjectFile = { path: string; subjects: SubjectRecord[] };

type PatchStatus = { patch: SubjectPatch; characters: string | null } & (
  | { kind: "apply" }
  | { kind: "already" }
  | { kind: "fail"; reason: string }
);

type PatchResult = { ok: boolean; statuses: PatchStatus[]; writes: SubjectFile[] };
```

`expect` and `set` are both required and both `number[]`, so they are compared by length plus elements. No generic deep-equal helper.

`characters` is resolved by the lib, not the script: `data.characters` when it is a string, else `data.slug`, else `null` when the record was not found at all. Image-only radicals have no character, so the fallback is real — but none of the seven patches targets one, which is exactly why it needs a unit test rather than a manual check.

### Exported functions

| function                                                                            | job                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parsePatches(text: string): SubjectPatch[]`                                        | `Bun.YAML.parse` then validate the whole list. Throws on a bad file.                                                                                                                                                                                                  |
| `checkPatch(patch: SubjectPatch, subject: SubjectRecord \| undefined): PatchStatus` | One patch against one record. `undefined` means the id was not in the download, which is rule 1 below. Never mutates.                                                                                                                                                 |
| `patchSubjects({ files, patches, dryRun }): PatchResult`                            | The whole decision. Indexes the records by id, keeping the owning `SubjectFile` with each, checks every patch, and returns the files to write. Mutates records only when nothing failed and `dryRun` is off. Params object, per the 3+ arguments rule in `CLAUDE.md`. |
| `formatStatusLine(status: PatchStatus): string`                                     | The one output line for a patch: id, character, field, status, and the reason on a failure.                                                                                                                                                                           |

`patchSubjects` is where all-or-nothing, dry-run and "only the changed files" live, and `formatStatusLine` holds the character fallback. That leaves the entry point with read, print, write and exit only — no branch that a unit test would want to reach.

### Status rules, in order

1. `subject` is `undefined`, meaning the id was not in the download → `fail` — `subject not found`
2. `subject.data_updated_at !== patch.seen` → `fail` — `record changed: seen <seen>, now <actual>`
3. `field` missing from `subject.data` → `fail` — `field missing`
4. value is not an array of numbers → `fail` — `field is not a list of ids`
5. value matches `expect` → `apply`
6. value matches `set` → `already`
7. anything else → `fail` — `expected [16,24,128], found [16,14,999]`

Rules 5 and 6 cannot both hold, because validation rejects a patch whose `expect` equals its `set`.

### File-level validation, before any data file is read

- `Bun.YAML.parse` returns `unknown`, so start at the top: the document must be an object, it must have a `patches` key, and `patches` must be a list
- an **empty** list is valid, not an error. It is the end state once WaniKani fixes everything. The entry point is authoritative here: it prints `No patches, nothing to do.` and exits 0 before reading any subject file. `patchSubjects([])` also returns `ok: true` with empty `writes`, which is a guard rather than the live path, and is tested as such
- each entry must have `subject` (number), `seen` (non-empty string) and `field` (non-empty string)
- `expect` and `set` are both required, both non-empty arrays of numbers
- `expect` must not equal `set` — such a patch would report `apply` on every run and never reach `already`
- no two patches share the same `subject` + `field`

### Apply rules

- `set` is written as given, order untouched. Order matters: 別 must read Mouth + Prison + Knife.
- Only `subject.data[field]` is touched. The wrapper (`id`, `object`, `url`, `data_updated_at`) is never written, so a patched record still looks like a normal API record to the repository layer.
- A file lands in `writes` only when at least one of its records was applied. A run of all `already` writes nothing.

### Output

Success:

```
Loading data/wanikani-fixes.yaml... 7 patches
Loading subjects... 9435 in 4 files

  785  別  component_subject_ids     apply
  495  万  component_subject_ids     apply
  14   勹  amalgamation_subject_ids  apply
  24   刀  amalgamation_subject_ids  already

All 7 patches applied or already in place.
Wrote data/userdata/kanji.json
Wrote data/userdata/radicals.json
```

Failure:

```
  785  別  component_subject_ids     FAIL  record changed: seen 2026-08-27T17:34:38.403049Z, now 2026-10-02T09:11:24.000000Z

1 of 7 patches does not apply. Nothing was written.
Look at the subject on wanikani.com, then either delete the patch from
data/wanikani-fixes.yaml (WaniKani fixed this field), or update `seen` and
re-check `expect` (WaniKani changed something else). Do not delete it blindly.
```

Every patch gets a line in both cases, so one run shows the full picture.

### Exit codes

| case                                                          | exit |
| ------------------------------------------------------------- | ---- |
| every patch `apply` or `already`, all writes succeeded        | 0    |
| no patches in the file                                        | 0    |
| `--help`                                                      | 0    |
| any patch `fail`                                              | 1    |
| a thrown error — bad YAML, missing subject file, failed write | 1    |

The last row needs care. Match `scripts/sync-anki-templates.ts:114` and `scripts/sync-anki-fields.ts:213`, which already end with a catch that prints `formatError(err)` and then calls `process.exit(1)`. Do **not** copy `scripts/download-subjects.ts:128`, which ends with `main().catch(console.error)` — that prints the error and still exits 0, so a failed write would look like a success. Five of the seven scripts already exit 1; only the two download scripts do not.

### The seven patches

Three are short enough to write by hand:

| subject              | field                      | seen                          | expect → set                                 | reading of `set`       |
| -------------------- | -------------------------- | ----------------------------- | -------------------------------------------- | ---------------------- |
| kanji 785 別         | `component_subject_ids`    | `2026-08-27T17:34:38.403049Z` | `[16, 24, 128]` → `[16, 14, 128]`            | Mouth + Prison + Knife |
| kanji 495 万         | `component_subject_ids`    | `2026-08-27T17:36:38.022392Z` | `[8763, 24]` → `[1, 14]`                     | Ground + Prison        |
| kanji 780 成         | `component_subject_ids`    | `2026-08-27T17:38:34.186451Z` | `[194, 24]` → `[14, 194]`                    | Prison + Drunkard      |
| radical 8763 丆 leaf | `amalgamation_subject_ids` | `2026-08-27T17:36:38.084930Z` | `[495, 549, 659, 1423]` → `[549, 659, 1423]` | drops 万               |

`set` is written as given, so the order in the first three rows is the order the page shows. Each matches wanikani.com today. Put the reading into the YAML inline comment too, so a future editor can check it without re-reading this plan.

The other three hold long id lists. **Generate them, do not type them.** Run this from the repo root and paste the output into the fixes file:

```bash
bun -e '
const rs = (await Bun.file("data/userdata/radicals.json").json());
const edits = [[14,[495,780,785],[]],[24,[],[780]],[1,[495],[]]];
for (const [id, add, rm] of edits) {
  const s = rs.find(x => x.id === id).data;
  const cur = s.amalgamation_subject_ids;
  const next = [...cur.filter(x => !rm.includes(x)), ...add].sort((a, b) => a - b);
  console.log(`  - subject: ${id} # radical ${s.characters} ${s.slug}`);
  console.log(`    seen: "${rs.find(x => x.id === id).data_updated_at}"`);
  console.log(`    field: amalgamation_subject_ids`);
  console.log(`    expect: [${cur.join(", ")}]`);
  console.log(`    set: [${next.join(", ")}]`);
}'
```

A pasted 68-number list cannot be checked by eye, and length alone does not prove it: a duplicated, dropped or mistyped id can keep the length and pass. Since `set` is written verbatim, such a typo would silently break an unrelated radical's back-links. So the paste is guarded twice — by length here, and by the delta tests in Task 4, which check the long lists against a small hand-written table of intended changes.

Check the generated lists by length first:

| subject              | expect length | set length               |
| -------------------- | ------------- | ------------------------ |
| radical 14 勹 prison | 26            | 29 (gains 495, 780, 785) |
| radical 24 刀 sword  | 19            | 18 (loses 780)           |
| radical 1 一 ground  | 67            | 68 (gains 495)           |

Sword loses only 780, even though 別 and 万 also stop pointing at it. That is correct, not a missing patch: sword's `amalgamation_subject_ids` never held 785 or 495 in the first place. The API's bad write was one-way.

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): the fixes file, the lib, the script, the tests, `package.json`, `README.md`, `CLAUDE.md`
- **Post-Completion** (no checkboxes): committing `data/userdata/` in its own repo, re-adding the affected notes to Anki, and watching for WaniKani's reply

## Implementation Steps

### Task 1: Patch types and file validation

**Files:**

- Create: `scripts/lib/subject-patches.ts`
- Create: `scripts/lib/__tests__/subject-patches.test.ts`

- [ ] create `scripts/lib/subject-patches.ts` with the `SubjectPatch`, `SubjectRecord`, `SubjectFile`, `PatchStatus` and `PatchResult` types (use `type`, not `interface`; named exports only; `.ts` extensions on every import, per `CLAUDE.md`)
- [ ] implement `parsePatches(text: string): SubjectPatch[]` using `Bun.YAML.parse`
- [ ] validate the document shape first, since `Bun.YAML.parse` returns `unknown`: object, `patches` key present, `patches` a list. An empty list is valid and returns `[]`
- [ ] validate each entry: `subject` number, `seen` non-empty string, `field` non-empty string, `expect` and `set` both present and both non-empty number arrays
- [ ] reject a patch whose `expect` equals its `set`, and say why in the message
- [ ] reject two patches sharing the same `subject` + `field`, naming both in the error
- [ ] write tests for `parsePatches` on a valid file (returns the parsed list in order)
- [ ] write tests for the document-shape rejections: `patches` key absent, `patches` not a list, YAML that parses to a plain string
- [ ] write a test that an empty `patches` list is accepted and returns `[]`
- [ ] write tests for each entry rejection: missing `expect`, missing `set`, empty array, non-number element, `expect` equal to `set`, duplicate `subject` + `field`, wrong types
- [ ] run `bun test scripts/lib/__tests__/subject-patches.test.ts` - must pass before task 2

### Task 2: Check pass — one patch against one record

**Files:**

- Modify: `scripts/lib/subject-patches.ts`
- Modify: `scripts/lib/__tests__/subject-patches.test.ts`

- [ ] implement `checkPatch(patch: SubjectPatch, subject: SubjectRecord | undefined)` returning `apply` / `already` / `fail`, following the status rules in Technical Details in that exact order — `undefined` is rule 1, so the unknown-subject case lives here and not in `patchSubjects`
- [ ] make the `seen` check run before any value check, so a changed record always fails
- [ ] write the concrete difference into the rule 7 reason: the expected list and the found list
- [ ] resolve `characters` on every returned status — `data.characters` when it is a string, else `data.slug`, else `null` when the record was not found
- [ ] confirm `checkPatch` never mutates the record it is given
- [ ] implement `formatStatusLine(status)` returning the one printed line: id, character, field, status, and the reason on a failure
- [ ] write tests: applies on matching `expect`, `already` on the target value, fails on a third value
- [ ] write tests for the failures: `subject` passed as `undefined`, changed `data_updated_at` while the value still matches `expect`, missing field, value not an array, array holding a non-number
- [ ] write tests for `characters`: a normal record, a record with `characters: null` falling back to `slug`, and a not-found record giving `null`
- [ ] write tests for `formatStatusLine` on each of the three kinds, including the `characters: null` case
- [ ] run tests - must pass before task 3

### Task 3: Patch pass — all or nothing, and which files to write

**Files:**

- Modify: `scripts/lib/subject-patches.ts`
- Modify: `scripts/lib/__tests__/subject-patches.test.ts`

- [ ] implement `patchSubjects({ files, patches, dryRun })` — index every record by id, keeping the owning `SubjectFile` with it so `writes` can name the right files, then check every patch and mutate only when no status is `fail`
- [ ] look each id up in the index and hand the result straight to `checkPatch`, so a missing id becomes rule 1 rather than a special case here
- [ ] return `writes` holding only the files with at least one applied record; return `[]` when `dryRun` is on, when a patch failed, or when every patch was `already`
- [ ] write a test for the happy path: patches across two files all apply, records hold the new values, `writes` names both files
- [ ] write a test for two patches landing in the **same** file — that file appears in `writes` once, not twice
- [ ] write a test proving all-or-nothing: one failing patch among good ones leaves **every** record untouched, `ok` false, `writes` empty
- [ ] write a test that a file with no applied record stays out of `writes`
- [ ] write a test for idempotency: running the same patches twice gives `already` for all of them the second time, and `writes` is empty
- [ ] write a test that `dryRun` returns the statuses but never mutates and never writes
- [ ] write a test that an empty patch list gives `ok` true and empty `writes`
- [ ] write a test that the wrapper fields (`id`, `data_updated_at`) are unchanged after a successful run
- [ ] run tests - must pass before task 4

### Task 4: The fixes file

**Files:**

- Create: `data/wanikani-fixes.yaml`
- Modify: `scripts/lib/__tests__/subject-patches.test.ts`

- [ ] create `data/wanikani-fixes.yaml` with the header comment from Technical Details: what WaniKani broke, when, the forum link, and the rule that a failing patch is a prompt to look, never an instruction to delete
- [ ] add the four short patches by hand from the table in Technical Details, each with an inline comment naming the subject and spelling out the reading of `set` in plain words, e.g. `# Mouth + Prison + Knife`
- [ ] generate the three long radical patches with the command in Technical Details and paste them in — do not type the id lists
- [ ] check the three generated patches against the length table: 26 → 29, 19 → 18, 67 → 68
- [ ] write a test that reads the real `data/wanikani-fixes.yaml` and runs it through `parsePatches` without throwing, so a typo in the data file fails the suite instead of failing at run time. Resolve the path with `join(import.meta.dir, "../../../data/wanikani-fixes.yaml")`, the way `anki-template-fields.test.ts` does, never relative to the working directory
- [ ] write the **delta table** in the test file — the intended change per patch, written by hand and short enough to check by eye:

  ```ts
  const INTENDED = {
    "785:component_subject_ids": { added: [14], removed: [24] },
    "495:component_subject_ids": { added: [1, 14], removed: [8763, 24] },
    "780:component_subject_ids": { added: [14], removed: [24] },
    "14:amalgamation_subject_ids": { added: [495, 780, 785], removed: [] },
    "24:amalgamation_subject_ids": { added: [], removed: [780] },
    "8763:amalgamation_subject_ids": { added: [], removed: [495] },
    "1:amalgamation_subject_ids": { added: [495], removed: [] },
  };
  ```

- [ ] write a test that, for every patch **present** in the real file, its `expect` → `set` delta matches `INTENDED` exactly — ids in `set` but not `expect` equal `added`, ids in `expect` but not `set` equal `removed`. Sort both sides before comparing, so a future reorder of a display-order list does not fail the test for no reason. Look each patch up by `subject:field`, and skip any key missing from the file, so deleting a patch later does not break the test
- [ ] write a test that every `set` in the real file holds unique ids, and that the `amalgamation_subject_ids` patches are sorted ascending. Exclude `component_subject_ids` from the sort check — it is display order, and asserting anything about it would be wrong either way: 別 is `[16, 14, 128]` and not ascending, while 万 `[1, 14]` and 成 `[14, 194]` happen to be
- [ ] write a test that every id in every `expect` and `set` resolves to a real subject in `data/userdata/`, so a mistyped id is caught
- [ ] write a test that runs `patchSubjects` with `dryRun` over the real fixes file and the real subject files, and asserts every status is `apply` or `already` — this checks `expect` against the data that actually ships
- [ ] do **not** assert the exact set of patches in the file. Deleting a patch is the normal end state once WaniKani fixes a record, and such a test would fail that workflow by design. Git history already covers an accidental deletion
- [ ] run tests - must pass before task 5

### Task 5: The patch-subjects script

**Files:**

- Create: `scripts/patch-subjects.ts`
- Modify: `package.json`
- Modify: `scripts/download-subjects.ts`

- [ ] create `scripts/patch-subjects.ts` following the project script shape — `main()` first, helpers below, `main().catch(...)` last
- [ ] parse `--dry-run` and `--help` with `parseArgs` from `util`; print usage and exit 0 on `--help`
- [ ] read `data/wanikani-fixes.yaml` and call `parsePatches` **before** any subject file is read, so a bad file fails fast. On an empty patch list print `No patches, nothing to do.` and exit 0
- [ ] read the four `data/userdata/*.json` files into `SubjectFile` values and pass them to `patchSubjects`
- [ ] fail with a clear message pointing at `bun run download-subjects` when a subject file is missing, rather than letting a raw ENOENT through — a fresh clone has no `data/userdata/`
- [ ] print `formatStatusLine(status)` for each status; the script does no formatting of its own
- [ ] on failure print the "look, then delete or update `seen`" hint from Technical Details, write nothing, and exit 1
- [ ] on success write each file in `writes` using `Bun.write` with `JSON.stringify(subjects, null, 2)` to match `download-subjects.ts`
- [ ] end the file with a catch that prints `formatError(err)` from `scripts/lib/format-error.ts` and then calls `process.exit(1)`, the same as `sync-anki-templates.ts` and `sync-anki-fields.ts`. This is the house pattern, so it needs no explaining comment. Do not copy the older `main().catch(console.error)` from `download-subjects.ts`, which exits 0
- [ ] check the exit codes against the table in Technical Details by hand: success 0, no patches 0, `--help` 0, failing patch 1, thrown error 1
- [ ] add `"patch-subjects": "bun run scripts/patch-subjects.ts"` to `package.json` — no `--env-file`, the script needs no secrets
- [ ] add a closing line to `scripts/download-subjects.ts` telling the user to run `bun run patch-subjects` next
- [ ] run `bun run lint:fix` and `bun run tsc`
- [ ] run tests - must pass before task 6

### Task 6: Verify acceptance criteria

- [ ] run `bun run patch-subjects --dry-run` against the real data and confirm all seven patches report `apply` and nothing is written
- [ ] run `bun run patch-subjects` and confirm it writes `data/userdata/kanji.json` and `data/userdata/radicals.json`, and nothing else
- [ ] run `bun run patch-subjects` a second time and confirm every patch reports `already`, nothing is written, and the exit code is 0
- [ ] hand-edit one `seen` value in the real `data/wanikani-fixes.yaml`, run the script, confirm it fails, writes nothing and exits 1, then revert the edit
- [ ] update the first snapshot the patched data changes, scoped to one file per the `CLAUDE.md` rule: `bun test src/server/repository/__tests__/radical.test.ts --update-snapshots`
- [ ] update the second: `bun test src/server/__tests__/api.search.test.ts --update-snapshots`
- [ ] check the snapshot diff adds only 万 / 495 to the 一 ground radical and changes nothing else
- [ ] restart `bun run dev` — `initRepository()` reads the JSON files once at import time in `src/server/index.ts:7`, and Vite does not reload on data file changes
- [ ] confirm the 別 kanji page shows Mouth + Prison + Knife
- [ ] confirm the Prison radical page now lists 万, 成 and 別 under "Found in Kanji"
- [ ] run the full suite: `bun test`
- [ ] run `bun run tsc` and `bun run lint`

### Task 7: [Final] Refactor, document and close out

- [ ] run the refactor-simplifier agent over the new files, per the Post-Implementation section of `CLAUDE.md`
- [ ] re-run `bun test`, `bun run tsc` and `bun run lint` after the refactor — a refactor must not leave the final code unverified
- [ ] add `bun run patch-subjects` to the Data Scripts list in `CLAUDE.md`, next to `download-subjects`
- [ ] add a short `CLAUDE.md` section on `data/wanikani-fixes.yaml`: what it is for, the single `expect` / `set` patch kind, the `seen` guard, the all-or-nothing rule, and that a failing run means look first, then delete **or** update `seen`
- [ ] note in `CLAUDE.md` that a download must be followed by a patch run, since `download-subjects` writes raw API data
- [ ] add a `bun run patch-subjects` row to the Data Scripts table in `README.md` — the `## Data Scripts` heading is at line 126, the rows run from 128 to 135
- [ ] add a line to the `README.md` setup block next to `bun run download-subjects` at line 90, saying a download must be followed by a patch run
- [ ] run `/learn` to capture anything worth keeping in `CLAUDE.md`
- [ ] check `gh issue list` for an issue this closes
- [ ] move this plan to `docs/plans/completed/`

## Post-Completion

_Items requiring manual intervention or external systems - no checkboxes, informational only_

**Manual verification:**

- `data/userdata/` is a separate git repository and is gitignored by the main project. After the patch run, its changes need their own commit and push, per the Git Workflow section of `CLAUDE.md`.
- 別 is already in the Anki vocabulary deck from the iKnow run on 2026-09-11 with the wrong radicals baked into the note. After patching, re-add 別 (and 万, 成 if present) so the note picks up the correct radicals. `bun run sync-anki-notes` re-generates every note if a full refresh is preferred.

**External system updates:**

- Watch [community.wanikani.com/t/75554](https://community.wanikani.com/t/75554) and the reply to `hello@wanikani.com`. When WaniKani publishes the missing half of the Aug 27 update, the next patch run fails. That is a prompt to look at the record, not an instruction to delete the patch — see the rule in Solution Overview. Deleting a patch needs no test change, by the Task 4 decision.
- If every patch is gone, delete the whole mechanism: `data/wanikani-fixes.yaml`, `scripts/patch-subjects.ts`, `scripts/lib/subject-patches.ts`, `scripts/lib/__tests__/subject-patches.test.ts`, the `package.json` entry, the reminder line in `scripts/download-subjects.ts`, and the `README.md` and `CLAUDE.md` entries added in Task 7. The mechanism only earns its place while there is something to fix.
- Re-running `download-subjects` then `patch-subjects` will change the two snapshots again in the same way. That is expected, not a regression.
