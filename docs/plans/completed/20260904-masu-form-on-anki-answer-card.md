# Show the masu form on the Anki vocabulary answer card

## Overview

- Verb cards in Anki show only the dictionary form (食べる) on the short answer card. The masu form (食べます) is only visible in the details view, inside one comma-joined `conjugations` string.
- This change adds a new `masu_form` note field and shows it on the short answer card right under the characters badge. It is gray text at 50% of the badge font size (`1em` against the `2em` badge). Non-verbs leave the field empty, so nothing extra renders for them.
- The masu form already exists in `data/verb_conjugations.json` as a separate `masu` key. No new data is needed.
- The field migration lives in its own script, `bun run sync-anki-fields`. `sync-anki-templates` only checks the fields and refuses to sync when they do not match. See "Scope change" below.

### Acceptance criteria

1. A verb note sent to Anki has `masu_form` filled from the conjugation data. A non-verb or kana note has it empty.
2. The short answer card of a verb shows the masu form under the characters badge, gray, 50% of the badge size (`1em` against the `2em` badge). Non-verb cards look the same as before.
3. `bun run sync-anki-fields` adds fields that are in a template Fields list but missing in the Anki note type. It prints a big warning and asks the user to type `yes` first. Without a TTY it prints instructions and exits 1 without changing the note type. `bun run sync-anki-templates` checks the fields first and refuses to sync when any note type does not match. (Rewritten by the scope change below; the original wording described the combined script.)
4. Each template Fields list matches the service field list exactly, checked by a test.

## Context (from discovery)

- `data/verb_conjugations.json` is keyed by vocabulary ID with `dictionary`, `masu`, `te`, `nai` keys. Loaded in `src/server/repository/data-loader.ts`, exposed as `VerbConjugations` in `src/model/wanikani.ts`, attached to `Vocabulary.conjugations` in `src/server/repository/vocabulary.ts`.
- `src/server/services/anki-connect.ts` builds vocabulary note fields near line 523. It joins the four forms into the `conjugations` string. `VOCABULARY_EXPECTED_FIELDS` (line 52) and `VocabularyNoteFields` (line 110) list the fields. `validateModelFields` (line 168) compares field sets, not order, and throws on missing or extra fields.
- `updateNote` (line 236) sends `{ note: { id, fields } }` without a model name. In tests, the vocabulary `updateNoteFields` call can only be told apart from the radical and kanji calls by its field names.
- `src/anki-templates/vocabulary.md` holds the Fields list, Front, Back, and CSS. The back-short header (`#header-scaled`) is a flex column with `gap: 0.75em`: `.badge` with `{{characters}}`, then `.header-text` with meaning and reading. A script scales `.header-scaled` font size to fit; `.badge` is `2em`. The single dark mode block is at line ~398.
- Template Fields lists use lines like ``- `name` - description``. Descriptions can hold more backticks: `radicals.md` line 7 is ``- `character` - Radical character or `<img>` tag for image radicals``. A parser must take only the first backticked token per line.
- `scripts/sync-anki-templates.ts` parses the md file with `extractCodeBlock`, and `main()` wraps each model in try/catch, prints OK/FAILED per model, runs the final `sync` only when `failedCount === 0`, and exits 1 on any failure. It does not touch fields. Anki rejects a template that references a field the note type does not have, so fields must be added before templates.
- `docs/anki-connect-typescript-api.md` documents `modelFieldNames` (line 309) but not `modelFieldAdd`.
- `src/test/fetch-interceptor.ts` mocks `modelFieldNames` from `MODEL_FIELDS` (line 23). `setAnkiResponse(action, value)` is a global override for one action.
- `src/test/preload.ts` replaces `Math.random` with one seeded generator for the whole run. Each vocabulary add consumes two or three values (voice gender, audio pick, and a sentence voice pick when the word has context sentences). Only `api.add-to-anki.test.ts` consumes it. New vocabulary tests must go at the end of that file, or the audio fields in older snapshots flip.
- `src/server/__tests__/api.add-to-anki.test.ts` snapshots all AnkiConnect calls. It has no verb case. 入る (id 2480) is a level 1 verb present in the conjugation data. Existing tests only read `c.action`; `AnkiCall.params` is `Record<string, unknown>` and `tsconfig` has `noUncheckedIndexedAccess`, so a test that reads `note.fields` needs a small cast like `(c.params.note as { fields: Record<string, string> }).fields`.
- `docs/anki-decks-fields.md` lists fields per note type, split into **Front:** and **Back:** lists.
- The web app (`src/client/components/VocabularyCard.tsx`) keeps showing conjugations as one string. It is out of scope.
- Scripts do not import from `src/` today. `tsconfig.json` and ESLint cover only `src/`. `bun test` picks up any `*.test.ts` in the repo.
- ⚠️ `bun test` is already red on `main`: 6 tests fail from stale snapshots after a `data/userdata/` refresh (3 in `api.search.test.ts`, one each in `repository/__tests__/{vocabulary,radical,kanji}.test.ts`). They are unrelated to this change and stay out of scope. The test gate in this plan is "no new failures".

## Development Approach

- **testing approach**: Regular (code first, then tests)
- complete each task fully before moving to the next
- make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
  - tests are not optional - they are a required part of the checklist
  - write unit tests for new functions/methods
  - write unit tests for modified functions/methods
  - add new test cases for new code paths
  - update existing test cases if behavior changes
  - tests cover both success and error scenarios
- **CRITICAL: test gate before the next task**: the 6 pre-existing failures listed above may stay red. Every other test must pass, and no new failure may appear. Compare against the baseline `69 pass / 6 fail` from `main`.
- **CRITICAL: never run a bare `bun test --update-snapshots`**. It rewrites the 6 stale unrelated snapshots too. Always scope it to one file.
- **Task order is chosen so the Anki note type gets the new field early.** Task 1 and 2 build the field-adding script. Task 3 declares the field and ends with the user running the sync once in their own terminal (the Enter pause needs a TTY). From then on the note type is complete, the script has nothing to add, and later template syncs run without a pause, so the agent can run them right after a template edit as CLAUDE.md asks.
- **CRITICAL: update this plan file when scope changes during implementation**
- run tests after each change
- run `bun run lint:fix` and `bun run tsc` after editing files under `src/`
- maintain backward compatibility: existing notes keep working, `conjugations` string stays as is

## Testing Strategy

- **unit tests**: required for every task (see Development Approach above)
- **integration tests**: the project has API E2E tests in `src/server/__tests__/` that run the full Hono app against a fetch interceptor. This change modifies the create/update path of vocabulary notes (`addNote` / `updateNoteFields` field payload). The integration tests must cover:
  - create path: a verb note gets `masu_form` filled (new test, 入る id 2480)
  - create path: a non-verb note gets `masu_form` empty (existing 毎晩 / ここ / 高校 snapshots, updated)
  - update path: an existing verb note is updated with `masu_form` (new test, uses `setAnkiResponse("findNotes", [id])` like the existing radical update test)
- **parser tests**: `parseTemplateFields` and `findMissingFields` are pure functions in `src/server/utils/anki-template-fields.ts` with unit tests on the real template files. The AnkiConnect calls and the Enter pause in the script are not unit tested (manual run).
- **consistency test**: each template's Fields list must equal the service's expected field list in exact order. This guards against a template that references a field the service does not fill. The three lists already match today, so the test is green when it is written in Task 1. Task 3 adds `masu_form` to both the service list and the template Fields list in the same step, so it stays green.
- **e2e tests**: the project has no browser e2e tests. The Anki card is checked manually (see Post-Completion).

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope
- keep plan in sync with actual work done

## Solution Overview

- **New note field `masu_form`.** The service fills it from `conjugations.masu`, or `""` when the subject is not a verb. The existing `conjugations` string is unchanged.
- **Template shows it with an Anki conditional.** `{{#masu_form}}...{{/masu_form}}` renders a `.masu-form` div under the badge only for verbs. No JavaScript is needed. The existing scaling script keeps working because the new element uses `em` units inside `.header-scaled`.
- **Sync script adds missing fields.** Before syncing templates, the script parses the Fields list of each template md file, compares it with `modelFieldNames`, and appends missing fields with `modelFieldAdd`. Because a field change is a schema change, the script first prints a big warning, triggers an AnkiWeb sync, and pauses until the user presses Enter.
- **Why append instead of insert at an index.** Each `modelFieldAdd` shifts later positions, and Anki may hold extra fields the template does not list. The service compares field sets, not order, so field order in Anki is cosmetic. Appending avoids index bugs.
- **Why pause on Enter.** The AnkiConnect `sync` action starts Anki's sync and returns right away. AnkiConnect has no action to check sync progress. The Enter pause is the only reliable way to wait.
- **Why a TTY guard.** An agent or CI runs the script without a terminal. There `rl.question` either hangs or resolves at once, and the schema change would happen with no sync. Without a TTY the script prints what to do and exits without adding fields.
- **Why sync first.** After a schema change Anki requires a one-way sync. Syncing before the change makes sure the local collection has all changes from other devices, so the later one-way upload does not lose anything.
- **Where the parser lives.** `src/server/utils/anki-template-fields.ts`, so it is linted and type-checked. The script imports it with a relative path. It is a pure utility, not a service, so this does not break the rule that scripts talk to services over HTTP.
- **Two md parsers on purpose.** `extractCodeBlock` stays in the script; only the Fields parser moves to `src/` because only it needs tests. Do not merge them later.

## Technical Details

### Data flow

```
data/verb_conjugations.json  -> repository (Vocabulary.conjugations.masu)
  -> anki-connect.ts vocabulary field builder: masu_form = conjugations?.masu ?? ""
  -> Anki note field "masu_form"
  -> vocabulary.md back-short: {{#masu_form}}<div class="masu-form">{{masu_form}}</div>{{/masu_form}}
```

### Field name and order

- Field name: `masu_form`
- Position in code and docs: right after `conjugations` in `VOCABULARY_EXPECTED_FIELDS`, `VocabularyNoteFields`, the template Fields list, `MODEL_FIELDS` in the interceptor, and the Back list in `docs/anki-decks-fields.md`.
- Position in Anki: appended at the end of the note type by `modelFieldAdd` (no `index`). Order in Anki does not matter to the service.

### Template markup (back-short)

```html
<div class="header-scaled" id="header-scaled">
  <div class="badge">{{characters}}</div>
  {{#masu_form}}
  <div class="masu-form">{{masu_form}}</div>
  {{/masu_form}}
  <div class="header-text">...</div>
</div>
```

```css
/* next to .header-scaled .badge (line ~217) */
.header-scaled .masu-form {
  font-size: 1em; /* 50% of the 2em badge */
  color: #888;
  /* The flex column gap is 0.75em of the parent above and below this element.
     -0.5em leaves 0.25em above, tight under the badge. */
  margin-top: -0.5em;
}

/* inside the existing @media (prefers-color-scheme: dark) block (line ~398), not a new block */
.header-scaled .masu-form {
  color: #aaa;
}
```

Exact spacing values are tuned during the manual check in Anki.

### Template Fields list format

The parser reads the `## Fields` section of a template md file. Each line looks like:

```
- `field_name` - description
```

- Match with a regex anchored at line start, for example ``/^-\s+`([^`]+)`/``. Only the first backticked token counts; backticks in the description are ignored (see the `radicals.md` `<img>` case).
- Return field names in file order.
- Throw when the section is missing or has no field lines.
- Section end detection must treat a match at index `0` as a real match (do not copy the `index ? … : content.length` pattern from `extractCodeBlock`).

### Missing fields helper

`findMissingFields(modelFields, templateFields): string[]` returns the template fields not present in `modelFields`, in template order. Argument order follows the project rule: the collection being searched (`modelFields`) comes first.

### Sync script flow

```
validateTemplateFilesExist()
ensureModelFields(TEMPLATES):
  for each template: fields = parseTemplateFields(readFile(md))   # reads the md file itself; syncTemplate is untouched and reads it again later (cheap)
  for each model: actual = modelFieldNames(model); missing = findMissingFields(actual, fields)
    log extra fields (in Anki, not in template) as a warning, never remove them
  if nothing is missing: return { added: false }
  print big warning (schema change, one-way sync follows, sync now)
  if !process.stdin.isTTY: print "run this in a terminal", return { added: false, blocked: true } -> exit 1 without touching the note type
  ankiInvoke("sync")
  wait for Enter ("Wait until the sync in Anki finishes, then press Enter")
  for each missing field, in template order: ankiInvoke("modelFieldAdd", { modelName, fieldName })
  return { added: true }
for each model (existing loop): updateModelTemplates, updateModelStyling, OK/FAILED, failedCount
if failedCount === 0: final ankiInvoke("sync")
  if it throws and fields were added: print "Anki needs a one-way sync, finish it in Anki", keep exit 0
  if it throws and no fields were added: rethrow as today
summary line, exit 1 when failedCount > 0 (unchanged)
```

The per-model try/catch, the OK/FAILED lines, the summary, and exit 1 on template failures stay exactly as they are today. Only the final sync failure on a schema-change run is downgraded.

One behavior change: `ensureModelFields` calls AnkiConnect before the per-model loop. When Anki is closed, the run now ends in `main().catch` with one line ("Failed to connect to Anki. Is Anki running with AnkiConnect?") instead of three `FAILED` lines plus the summary. That message is already clear, so no extra handling is added.

### Files touched

- Modify: `src/server/services/anki-connect.ts`
- Modify: `src/test/fetch-interceptor.ts`
- Modify: `src/server/__tests__/api.add-to-anki.test.ts` and its snapshots
- Create: `src/server/utils/anki-template-fields.ts`
- Create: `src/server/utils/__tests__/anki-template-fields.test.ts`
- Modify: `scripts/sync-anki-templates.ts`
- Modify: `docs/anki-connect-typescript-api.md`
- Modify: `src/anki-templates/vocabulary.md`
- Modify: `docs/anki-decks-fields.md`
- Modify: `CLAUDE.md`

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): code, tests, docs in this repo
- **Post-Completion** (no checkboxes): running the sync against a live Anki, manual card check, re-syncing existing notes

## Implementation Steps

### Task 1: Template Fields parser and consistency test

**Files:**

- Create: `src/server/utils/anki-template-fields.ts`
- Create: `src/server/utils/__tests__/anki-template-fields.test.ts`
- Modify: `src/server/services/anki-connect.ts` (exports only)

- [x] create `src/server/utils/anki-template-fields.ts` with `parseTemplateFields(content: string): string[]` (reads the `## Fields` section, first backticked token per line with a line-start anchored regex, returns names in order, throws when the section is missing or has no field lines; handle a section-end match at index `0`)
- [x] add `findMissingFields(modelFields: string[], templateFields: string[]): string[]` to the same file (template fields not present in the model, in template order)
- [x] export `RADICAL_EXPECTED_FIELDS`, `KANJI_EXPECTED_FIELDS`, `VOCABULARY_EXPECTED_FIELDS` from `src/server/services/anki-connect.ts` (three constants is the smallest change, no new module)
- [x] write tests for `parseTemplateFields` on the real files: `vocabulary.md` returns the full list in order; `radicals.md` returns `character` (not `<img>`) as the first field
- [x] write tests for `parseTemplateFields` edge cases: ignores field names mentioned outside the `## Fields` section, throws on missing section, throws on an empty `## Fields` section that is followed right away by the next `## ` header (the index-`0` case)
- [x] write tests for `findMissingFields`: none missing, one missing in the middle, several missing keep template order, model has extra fields (ignored)
- [x] write the consistency test in the same test file: for each of the three template files, `parseTemplateFields(content)` must equal the matching exported `*_EXPECTED_FIELDS` array (exact order). It is green today
- [x] run `bun run lint:fix` and `bun run tsc`
- [x] run `bun test` - no new failures beyond the 6 known ones before task 2 (81 pass / 6 fail, same 6 as the baseline)

### Task 2: Add missing note-type fields in `sync-anki-templates`

**Files:**

- Modify: `scripts/sync-anki-templates.ts`
- Modify: `docs/anki-connect-typescript-api.md`

- [x] import `parseTemplateFields` and `findMissingFields` with a relative path (`../src/server/utils/anki-template-fields.ts`)
- [x] add `ensureModelFields(TEMPLATES)` and call it in `main()` after `validateTemplateFilesExist()` and before the existing per-model sync loop. It reads each md file and calls `parseTemplateFields` itself. `syncTemplate` and `parseTemplateFile` stay untouched. Keep the per-model try/catch, OK/FAILED lines, summary, and exit 1 on template failures unchanged
- [x] in `ensureModelFields`: call `modelFieldNames` per model, compute missing fields, log extra fields (in Anki, not in template) as a warning without removing them; return early when nothing is missing. A connection failure here is fatal via `main().catch` (see Technical Details)
- [x] when a field is missing and `process.stdin.isTTY` is false: print the big warning plus "run this script in a terminal to add the fields", and exit 1 without touching the note type
- [x] when a field is missing and there is a TTY: print the big multi-line warning (schema change, Anki will need a one-way sync after, sync before continuing), call `ankiInvoke("sync")`, wait for Enter with `readline/promises` (`rl.question`), then call `modelFieldAdd` with `{ modelName, fieldName }` for each missing field in template order and log each one
- [x] on a run that added fields, catch a failure of the final `ankiInvoke("sync")`, print that Anki needs a one-way sync to be finished by hand, and keep exit code 0. On a run that added nothing, the final sync failure stays fatal as today
- [x] document `modelFieldAdd` (params `modelName`, `fieldName`, optional `index`) next to `modelFieldNames` in `docs/anki-connect-typescript-api.md`
- [x] smoke run: `scripts/` is outside `tsconfig` and ESLint, so always run `bun run sync-anki-templates </dev/null` once. Nothing is missing yet, so with Anki open it must sync the templates as before with no warning and no pause. With Anki closed the expected output is `Fatal error: Failed to connect to Anki. Is Anki running with AnkiConnect?` and exit 1. Either way this proves the file loads and the relative import resolves
  - ran with Anki open: 3 models `OK`, no warning, no pause, `Syncing to AnkiWeb... Done!`, `Summary: 3 synced, 0 failed`, exit 0
- [x] tests: the script has no unit tests today and runs against a live Anki. Its logic is in the tested helpers from Task 1. The missing-field paths are exercised in Task 3
- [x] run `bun test` - no new failures beyond the 6 known ones before task 3 (81 pass / 6 fail, same 6)

### Task 3: Declare `masu_form`, fill it in notes, and migrate the Anki note type

**Files:**

- Modify: `src/server/services/anki-connect.ts`
- Modify: `src/anki-templates/vocabulary.md` (Fields list only)
- Modify: `docs/anki-decks-fields.md`
- Modify: `src/test/fetch-interceptor.ts`
- Modify: `src/server/__tests__/api.add-to-anki.test.ts`
- Modify: `src/server/__tests__/__snapshots__/api.add-to-anki.test.ts.snap`

- [x] add `"masu_form"` after `"conjugations"` in `VOCABULARY_EXPECTED_FIELDS` in `src/server/services/anki-connect.ts`
- [x] add `- \`masu_form\` - Polite (masu) form for verbs, empty otherwise`after`conjugations`in the Fields list of`src/anki-templates/vocabulary.md` (only the list; the markup comes in Task 4). This keeps the service list and the template list in step for the consistency test
- [x] add `masu_form` after `conjugations` in the Japanese Vocabulary **Back** list in `docs/anki-decks-fields.md`
- [x] add `masu_form: string` after `conjugations` in `VocabularyNoteFields`
- [x] in the vocabulary field builder (near line 523) set `masu_form: conjugations?.masu ?? ""`
- [x] add `"masu_form"` after `"conjugations"` in `MODEL_FIELDS["Japanese Vocabulary"]` in `src/test/fetch-interceptor.ts`
- [x] write test `add verb vocabulary (入る, id=2480) fills masu_form` **appended at the end** of the `describe("add-to-anki API")` block (see the seeded `Math.random` note in Context): find the `addNote` call whose `note.fields` has a `masu_form` key, assert `masu_form === "入ります"` and `conjugations === "入る, 入ります, 入って, 入らない"`, then snapshot only that `fields` object with file-based `toMatchSnapshot()` (it has 20 fields with long HTML, so it is over 50 lines; do not snapshot all of `ankiCalls`, which would add hundreds of repeated lines for the kanji and radicals of 入る)
- [x] write test `update existing verb vocabulary (入る) fills masu_form` **appended after the previous one**: `setAnkiResponse("findNotes", [1])` so every note is "found", then find the `updateNoteFields` call whose `note.fields` has a `masu_form` key (radical and kanji updates have no such key) and assert `masu_form === "入ります"`
- [x] run `bun test src/server/__tests__/api.add-to-anki.test.ts --update-snapshots` (scoped, see Development Approach) so the existing non-verb snapshots gain `"masu_form": ""`, then review the snapshot diff: the only change in old snapshots must be the new empty field
  - diff checked: 毎晩 and ここ each gained one `"masu_form": ""` line, plus the new 入る fields snapshot. Nothing else changed
- [x] run `bun run lint:fix` and `bun run tsc`
- [x] run `bun test` - no new failures beyond the 6 known ones (83 pass / 6 fail, same 6)
- [x] agent check of the no-TTY path: run `bun run sync-anki-templates </dev/null` with Anki open. It must print the warning and exit 1 without adding the field. Record the output here. This must run **before** the migration box below: once the field is added nothing is missing and this path cannot be reproduced. If Anki is closed, the user runs this check first, then the migration
  - real output (Anki was open, exit code 1, note type untouched):

    ```
    Syncing Anki Templates

    ========================================

    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    WARNING: the Anki note types miss fields listed in the templates

      Japanese Vocabulary: masu_form

    Adding a field changes the collection schema.
    After that Anki asks for a one-way sync, choose upload.
    Sync every other device to AnkiWeb before you continue.
    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    No terminal here. Run `bun run sync-anki-templates` in a terminal
    to add the fields. Nothing was changed.
    error: script "sync-anki-templates" exited with code 1
    ```

- [x] **the user migrated Anki** (DONE): the user ran `bun run sync-anki-templates` in a real terminal with Anki open, followed the warning, and pressed Enter. The `masu_form` field was added to "Japanese Vocabulary" and all three templates synced. A second run with `</dev/null` printed no warning, did not pause, reported "3 synced, 0 failed", and exited 0
- ⚠️ between the service edit and the user's sync run, `add-to-anki` against a real Anki fails in `validateModelFields` because the note type lacks `masu_form`. This is expected and short-lived

### Task 4: Show the masu form on the back-short card

**Files:**

- Modify: `src/anki-templates/vocabulary.md`

- [x] in the Back Template `#header-scaled`, add `{{#masu_form}}<div class="masu-form">{{masu_form}}</div>{{/masu_form}}` right after the `.badge` div
- [x] add `.header-scaled .masu-form` CSS next to `.header-scaled .badge` (font-size `1em`, gray color, `margin-top: -0.5em` with the flex-gap comment). The user later tuned these values in Anki; `1em` / `-0.5em` is what shipped
- [x] add the `.header-scaled .masu-form { color: #aaa; }` override inside the existing `@media (prefers-color-scheme: dark)` block, not in a new block
- [x] run `bun test` - no new failures beyond the 6 known ones (the consistency test covers the Fields list, which did not change in this task): 83 pass / 6 fail, same 6
- [x] (DONE) `bun run sync-anki-templates` ran after the Task 3 migration and pushed the new template. The note type already had the field, so the script did not warn or pause

### Task 5: Verify acceptance criteria

- [x] criterion 1: verb note has `masu_form` filled, non-verb and kana notes have it empty (tests from Task 3)
  - `anki-connect.ts` sets `masu_form: conjugations?.masu ?? ""`; 入る tests assert `入ります` on both the `addNote` and the `updateNoteFields` payload; 毎晩 and ここ snapshots hold `"masu_form": ""`
- [x] criterion 4: template Fields lists match `*_EXPECTED_FIELDS` (consistency test), and `MODEL_FIELDS` plus `docs/anki-decks-fields.md` list `masu_form` after `conjugations`
  - the three consistency tests pass; `MODEL_FIELDS["Japanese Vocabulary"]` and the docs Back list both have `masu_form` right after `conjugations`
- [x] criterion 3, no-TTY path: `sync-anki-templates </dev/null` with a missing field exits 1 without changes (checked in Task 3)
  - re-run in Task 5 with Anki open: same warning, exit 1, and `modelFieldNames("Japanese Vocabulary")` still has no `masu_form`
- [x] (CONFIRMED) criterion 3, TTY path: the user confirmed during the Task 3 migration that the script warns, syncs, pauses, adds the field, and that a second run does not warn or pause. (The "extra fields are reported, not removed" branch is not observable today because all note types match; it is covered by code review only)
  - code review of `ensureModelFields`: warning -> `ankiInvoke("sync")` -> `rl.question` -> `modelFieldAdd` per missing field in template order; returns `false` early when nothing is missing, so a second run neither warns nor pauses. Extra fields are only logged, never removed
- [x] (pending - the visual check in Anki is still on the user, see Post-Completion) criterion 2
  - markup and CSS reviewed: `{{#masu_form}}` block sits right after `.badge`, `.header-scaled .masu-form` is `font-size: 1em` (50% of the 2em badge) with `color: #888` and `#aaa` in the existing dark-mode block
- [x] run full test suite: `bun test` - no new failures beyond the 6 known ones (83 pass / 6 fail, same 6)
- [x] run `bun run lint` and `bun run tsc` - both clean

### Task 6: [Final] Update documentation

- [x] update `CLAUDE.md` "Anki Template Development": the sync script adds missing fields from the template Fields list, warns, syncs to AnkiWeb, waits for Enter before the schema change, and needs a real terminal for that step. When no field is missing it runs as before
  - also noted that extra Anki-only fields are logged, never removed, and that a field must exist before a template references it
- [x] update the `src/server/utils/` line in the `CLAUDE.md` project structure: it now also holds pure helpers that `scripts/` may import (`anki-template-fields.ts`). Scripts still must not import services or repositories
  - added the matching exception under the Architecture rule "Scripts communicate with services through the backend HTTP API"
- [x] update `CLAUDE.md` if new patterns came up (for example the template/service field consistency test, and the scoped `--update-snapshots` rule)
  - added: the field consistency test (Anki Integration), the scoped `--update-snapshots` rule (Unit/Integration Tests), and the seeded `Math.random` in the preload that forces new vocabulary tests to the end of the file (Test Architecture)
- [x] check GitHub issues (`gh issue list`) and close any that this change resolves
  - `gh issue list` returned nothing (the repo has no open issues), so nothing to close
- [x] move this plan to `docs/plans/completed/` (skipped - the harness moves the plan after all phases finish)

## Scope change (after Task 6)

The user split the field migration out of `sync-anki-templates` into its own script. The combined script did two jobs and three review rounds kept finding bugs in the AnkiWeb sync it triggered.

What changed:

- New `scripts/sync-anki-fields.ts`, run as `bun run sync-anki-fields`. It is the only script that changes the Anki note type. It never calls the AnkiConnect `sync` action - the user handles AnkiWeb syncing. That removes the whole class of bugs the reviews found in `trySync` and `confirmAfterSyncFailure`.
  - It reads the three template files, diffs each `## Fields` list against `modelFieldNames`, reports extra fields (never removes them), warns about the schema change, requires a TTY, asks the user to type `yes`, then adds each missing field with `modelFieldAdd` in template order. A failed add reports which fields did get added and still prints the one-way-sync reminder. It exits 1 on extra fields even when the adds worked.
- `scripts/sync-anki-templates.ts` is back to one job. `ensureModelFields`, the readline prompts, the TTY guard, `modelFieldAdd`, `trySync` and the `fieldsAdded` plumbing are gone, and the final `ankiInvoke("sync")` is exactly what it was before this feature. It gains a check-only step that runs before any template is synced: when any note type has a missing or extra field it prints every problem for every model and exits 1 without a single AnkiConnect write.
- New `scripts/anki-templates.ts` holds what both scripts share: the `TEMPLATES` table, `ankiInvoke`, `loadTemplates`, `getTemplatePath`, `getErrorMessage`, and `collectFieldProblems` (the AnkiConnect side of the diff). Template read and parse errors are wrapped there with the file path, so both scripts name the bad file.
- `formatFieldProblems` was added to `src/server/utils/anki-template-fields.ts` and unit-tested. It is the pure part of the templates script's new check: a diff list in, the printed problem lines out. `parseTemplateFields` and `diffTemplateFields` stay where they were.
- `package.json` gained the `sync-anki-fields` entry.

Acceptance criterion 3 above was rewritten to match. Criterion 2 was corrected: the masu form is `1em` against the `2em` badge, so 50% of the badge size, not the 70% the plan first specified. The user tuned that CSS by hand.

Interactive script orchestration stays out of the unit tests, as planned. The new behaviour was proven against a fake AnkiConnect server driven over a pty: all-match for both scripts, a missing field, an extra field, both at once, declining the prompt, Ctrl+D, no TTY, a `modelFieldAdd` failure mid-loop and on the first field, a missing note type, and a broken `## Fields` section.

## Post-Completion

**Manual verification:**

- Open a verb card in Anki (for example 食べる or 入る). On the answer side, the masu form must sit under the purple badge, gray, 50% of the badge size. Check it in light and dark mode.
- Open a non-verb card (毎晩) and a kana card (ここ). No extra line must appear.
- Check a long verb (生まれる) still fits on one line after scaling.
- Tune `.masu-form` spacing or size in `vocabulary.md` if needed, then run `bun run sync-anki-templates` again.

**Data gap found in code review:**

- 157 verbs in `data/userdata/vocabulary.json` have no row in `data/verb_conjugations.json`, so their `masu_form` stays empty and no masu form shows: 110 する verbs plus 22 plain godan/ichidan verbs (支払う, 結ぶ, 捕まえる, 付き合う, 惹く and others, all recent WaniKani additions). The `conjugations` row is missing for them too, so this is not new. Re-run `bun run generate-verb-conjugations` after the last `data/userdata` refresh to fill them.

**External system updates:**

- After the field is added, the next AnkiWeb sync is a one-way sync. When Anki asks, choose upload so the new field reaches AnkiWeb.
- Existing vocabulary notes have an empty `masu_form` until they are re-generated. Run `bun run dev` and then `bun run sync-anki-notes` to refill all notes.

**Out of scope, worth a separate commit:**

- The 6 stale snapshots on `main` (search API and repository tests) need a refresh after the `data/userdata/` update.
