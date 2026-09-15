# Local Study Materials

## Overview

Add own meaning notes, reading notes and user synonyms for radicals, kanji, vocabulary and kana vocabulary without changing the WaniKani data.

- Local values live in `data/userdata/study_materials_extra.json`, an object keyed by subject id.
- A local note replaces the WaniKani note per field. Local synonyms are appended to the WaniKani list.
- The web UI edits them in place: a pencil button next to "Note", an inline input for synonyms. Saves are optimistic.
- A new `PATCH /api/study-materials` endpoint upserts one entry. The subject id is in the body, like every other route in the project. Hono RPC cannot type a route that has both a path param and a JSON body without a validator.
- Anki gets the merged result through the same helper the cards use, so the screen and the deck always agree. The one exception is kanji synonyms, the kanji note type has no field for them.

## Context (from discovery)

- `src/model/wanikani.ts` holds `StudyMaterial` (the WaniKani record) and the enriched subject types. `KanaVocabulary.studyMaterial` is typed `null` today.
- `src/model/subject-utils.ts` has `findStudyMaterial(studyMaterials, subjectId, subjectType)`.
- `src/server/repository/data-loader.ts` loads all data files in one `Promise.all` into module-level `let` bindings. `vocabulary.ts` line ~72 hard-codes `studyMaterial: null` for kana vocabulary.
- `src/server/repository/mnemonic-image-fetcher.ts` is the only server code that writes a file. It uses `writeFile` from `fs/promises`, which the test preload mocks into `writeCalls`.
- `src/server/services/anki-connect.ts` reads `studyMaterial?.data.meaning_note ?? ""` and friends in three note builders (radical ~line 289, kanji ~381, vocabulary ~519). The kanji note type has no `user_synonyms` field (`KANJI_EXPECTED_FIELDS` in `src/model/anki-models.ts`), so kanji synonyms stay on screen only, today and in this plan.
- `scripts/lib/llm-utils.ts` has `saveJsonAtomic` (temp file, then rename). The server cannot import from `scripts/`, so the server gets its own copy in `src/server/utils/json-utils.ts`.
- `src/client/components/card-components/NoteSection.tsx` and `UserSynonymsRow.tsx` show the values and have dead "+ Add" buttons. The three cards pass computed `note` and `userSynonyms` props.
- `src/client/api.ts` uses Hono RPC. `addToAnki` shows the error handling pattern: non-JSON answer throws `HttpStatusError`, `ok: false` throws `Error(data.error)`.
- `src/test/preload.ts` redirects reads of `mnemonic-images.json` to `src/test/fixtures/`. The same trick keeps the new file out of the snapshots.
- Snapshot subjects: none of them has a WaniKani study material today. 川 (kanji 456) has a WaniKani reading note "Kawai", アメリカ人 (vocabulary 2478) has a WaniKani synonym "usa person". Both get a search test.
- The add-to-anki snapshot holds AnkiConnect calls, not subjects. The 一 and 校 tests snapshot action names only. The 毎晩, ここ and 入る tests snapshot fields. The fixture covers 毎晩 (3766) and its kanji 晩 (958) to prove the vocabulary and the kanji builders, and Task 3 adds one field assertion for the 一 radical note.
- `bun test` runs every file in one process. Module-level state changed by one test file is seen by the next. A `beforeEach` in the changing file does not clean up after its last test, so every file that changes `localStudyMaterials` or the write mock resets them in `afterEach` too.
- The repository arrays are `undefined` until `initRepository()` ran. Every test file that touches them calls `ensureRepositoryInitialized()` from the preload in `beforeAll`.
- `study_materials.json` has only kanji and vocabulary records today, so the new kana vocabulary lookup is a no-op until a download brings such a record.
- Icons in `@hugeicons/core-free-icons`: `PencilEdit01Icon`, `CheckmarkCircle01Icon`, `Cancel01Icon`.

## Development Approach

- **testing approach**: Regular (code first, then tests)
- complete each task fully before moving to the next
- make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
  - tests are not optional - they are a required part of the checklist
  - write unit tests for new functions
  - update existing tests when behavior changes
  - tests cover both success and error scenarios
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- run `bun test` after each change
- run `bun run lint:fix` on edited files and `bun run tsc` before closing a task
- snapshot updates are scoped to one file: `bun test <file> --update-snapshots`
- never commit. The user asks for each commit. `data/userdata/` is a separate git repo, commit it separately when asked

## Testing Strategy

- **unit tests**: `bun:test`, next to the source in `__tests__/`. Required for every task.
- **integration tests**: the project has API E2E tests in `src/server/__tests__/` that call `api.request()` with the fetch interceptor. This change adds create, update and delete behavior, so the new `api.study-materials.test.ts` must cover all three: create an entry, update one field of an existing entry, clear a field, remove the last field (entry deleted). Each case snapshots the written JSON from `writeCalls` and the response body.
- **existing snapshots**: four files change in Task 2, because every snapshotted subject gains `localStudyMaterial`: `api.search.test.ts.snap` (13 subjects) and the three repository snapshots `radical.test.ts.snap`, `kanji.test.ts.snap`, `vocabulary.test.ts.snap`. `api.add-to-anki.test.ts.snap` changes in Task 3 only, in the 毎晩 note fields. Update each file on its own, never with a bare `bun test --update-snapshots`.
- **client tests**: components render with `renderToStaticMarkup`, so only view states are tested. The api layer test uses `createFetchMock`.
- **no UI e2e framework** in the project. Manual browser checks are listed under Post-Completion.
- **data dependency**: the 川 and アメリカ人 tests read the real `study_materials.json`. If the WaniKani note or synonym changes after a re-download, those snapshots change too. That is the same class of dependency the other search tests already have.

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope

## Solution Overview

- The server keeps two records per subject: the WaniKani `studyMaterial` and the new `localStudyMaterial`. It sends both. One pure helper `mergeStudyMaterial` in `src/model/` merges them. Cards and Anki note builders call it.
- The client needs both records because the editors must know what is yours: local synonyms get a remove button, and clearing a local note must show the WaniKani note again without a re-fetch.
- The repository holds the local file in memory like the other data. The upsert writes the whole object to a temp file, renames it over the real file, then replaces the in-memory object. A failed write leaves both the file and memory unchanged.
- All upserts go through one promise queue, so two overlapping saves cannot start from the same old state and drop each other's change.
- The endpoint is fixed to study materials. A generic "extras" router is not built. The file-level upsert can be extracted when a second kind arrives.
- `MergedStudyMaterial` uses camelCase on purpose. It is our own computed shape, like the enriched subject fields (`meaningMnemonic`). `LocalStudyMaterial` stays snake_case because it mirrors the WaniKani record field by field. Do not "fix" one to match the other.
- Editors keep their own state. A radical that appears under two kanji of one word renders two cards, and an edit in one does not reach the other. Accepted.

## Technical Details

### File

`data/userdata/study_materials_extra.json`, starts as `{}`:

```json
{
  "2484": { "meaning_note": "Chi + kara = power" },
  "456": { "reading_note": "Kawa like a river bank", "meaning_synonyms": ["stream"] }
}
```

- Key: subject id as a string. WaniKani subject ids are unique across all types.
- No `subject_type`, no ids inside. A missing key means no local value.
- The server never stores an empty string or an empty list. An entry with no fields left is deleted.

### Types (`src/model/wanikani.ts`)

```ts
export type LocalStudyMaterial = {
  meaning_note?: string;
  reading_note?: string;
  meaning_synonyms?: string[];
};

export type MergedStudyMaterial = {
  meaningNote: string;
  readingNote: string;
  meaningSynonyms: string[];
};
```

- `StudyMaterialData.subject_type` gains `"kana_vocabulary"`. `findStudyMaterial` takes `SubjectType` instead of its own three-literal union.
- `KanaVocabulary.studyMaterial` becomes `StudyMaterial | null`.
- `Radical`, `Kanji`, `Vocabulary`, `KanaVocabulary` gain `localStudyMaterial: LocalStudyMaterial | null`.

### Merge (`src/model/subject-utils.ts`)

`mergeStudyMaterial(wanikani: StudyMaterial | null, local: LocalStudyMaterial | null): MergedStudyMaterial`

- note: local when set, else WaniKani, else `""`
- synonyms: WaniKani list, then local list, duplicates dropped

### Server

- `data-loader.ts`: `export let localStudyMaterials: Record<string, LocalStudyMaterial>` read strictly from the file in the same `Promise.all`, no fallback when the file is missing, same as the other data files. New `setLocalStudyMaterials(next)` in the same module, because an exported `let` cannot be assigned from another module. The upsert uses it after a write, tests use it to reset state.
- `src/server/repository/study-material.ts`:
  - `findSubjectTypeById(id): SubjectType | null` scans the four arrays. The route calls it first, because it needs the type for the `reading_note` rule, and answers 404 when it is `null`. The upsert trusts the id.
  - `upsertLocalStudyMaterial(subjectId, patch): Promise<LocalStudyMaterial | null>`. Next record = current + patch. An empty string or empty list in the patch deletes that field. A record with no fields left is deleted from the object. `saveJsonAtomic` writes the whole object with two-space indent and a trailing newline, then `setLocalStudyMaterials`. Returns the saved record, or `null` when the entry was deleted.
  - The whole read, merge, write, publish step runs inside one module-level promise queue. The caller's promise stays separate from the chain, so the caller sees a rejection and the chain stays usable: `const run = queue.then(step); queue = run.catch(() => {}); return run;`.
  - The file path is one exported constant, used by `data-loader.ts` for the read and by `study-material.ts` for the write.
- `src/server/utils/json-utils.ts` gets `saveJsonAtomic(path, data)`: write `${path}.tmp`, `rename` it over `path`, `unlink` the temp file when either step throws. Same as the scripts copy.
- `PATCH /api/study-materials`, body `{ id, meaning_note?, reading_note?, meaning_synonyms? }`. Every answer has `ok` with `as const`, like `/add-to-anki`, so the client can narrow:
  - 400 `{ ok: false, error }`: id missing or not an integer; no field besides id; unknown key; a note that is not a string; synonyms that are not an array of strings; `reading_note` for a radical or kana vocabulary
  - 404 `{ ok: false, error }`: subject not found
  - 500 `{ ok: false, error }` when the write throws
  - 200 `{ ok: true, data: LocalStudyMaterial | null }`
  - log `[API] Study material kanji id=456: reading_note` on entry, then `— saved` or `— removed`
- `saveCache()` is not involved. The upsert writes its own file.

### Test hooks (`src/test/preload.ts`)

- Read redirect: `study_materials_extra.json` -> `src/test/fixtures/study_materials_extra.json`, next to the mnemonic redirect.
- The `fs/promises` mock gains `rename(from, to)`, which changes the recorded path of the `writeCalls` entry from `from` to `to`, and `unlink(path)`, which removes that entry. Both find the entry by exact path and do nothing when there is none, because after a failed `writeFile` no `.tmp` entry exists and `unlink` still runs. So a finished atomic save shows up in `writeCalls` under the real path, and a failed one leaves no `.tmp` entry behind.
- `setFsError(op: "writeFile" | "rename", err: Error | null)`: when set, that mocked call throws instead of doing its work. `resetWriteCalls()` also clears it. This is the only way to test a failed write, because `mock.module` is process-global and set once.
- Fixture content: `"658"` (校) reading_note; `"3766"` (毎晩) meaning_note and one synonym; `"958"` (晩) meaning_note and reading_note; `"1"` (一) meaning_note; `"456"` (川) reading_note that overrides "Kawai"; `"2478"` (アメリカ人) one synonym next to "usa person".

### Client

- `api.saveStudyMaterial(id, patch)`: sends `{ id, ...patch }`. A non-JSON answer throws `HttpStatusError`; `ok: false` throws `Error(data.error)`; returns `data`. A rejected fetch (server down) throws the `TypeError` from fetch, and the editor shows its message in the toast.
- `NoteSection` props: `subjectId`, `field: "meaning_note" | "reading_note"`, `wanikaniNote: string`, `localNote: string | null`. State: `localNote`, `mode: "view" | "edit"`, `draft`, `saving`. Shown text = local when set, else WaniKani.
  - view with a note: "Note" header, pencil icon button, a small "local" tag when the shown note is local, the text below
  - view without a note: "+ Add Note" opens edit with an empty draft
  - edit: textarea with `rows` from the line count (min 3), save and cancel icon buttons below. Esc cancels, Cmd+Enter saves
  - save: trim the draft, remember the previous local note, set the local note to the trimmed draft, switch to view, send `{ [field]: trimmed }`. Empty draft clears the local note. On error: restore the previous local note for the view, back to edit with the draft kept, `toast.error(message)`. Cancel after an error then shows the last saved value, never the unsaved draft. `saving` blocks a second save while one runs
  - cancel drops the draft
- `UserSynonymsRow` props: `subjectId`, `wanikaniSynonyms: string[]`, `localSynonyms: string[]`. WaniKani chips are plain. Local chips get a small × button. "+ Add Synonym" opens an inline input, Enter adds, Esc closes. Every change sends the whole local list as `meaning_synonyms`. On error the list goes back and a toast shows the message. A synonym already in either list is not added twice.
- Cards pass these props. `mergeStudyMaterial` is not needed on the client, the two components compute the shown value from their props.

## Implementation Steps

### Task 1: Types and merge helper

**Files:**

- Modify: `src/model/wanikani.ts`
- Modify: `src/model/subject-utils.ts`
- Create: `src/model/__tests__/subject-utils.test.ts`

- [x] add `LocalStudyMaterial` and `MergedStudyMaterial` to `src/model/wanikani.ts`
- [x] add `"kana_vocabulary"` to `StudyMaterialData.subject_type`
- [x] change the `findStudyMaterial` type parameter to `SubjectType`
- [x] add `mergeStudyMaterial` to `src/model/subject-utils.ts`
- [x] write tests: no records, WaniKani only, local only, local note wins, empty local field falls back to WaniKani, synonyms appended with a duplicate dropped
- [x] run `bun run tsc` and `bun test` - must pass before Task 2

### Task 2: Load the local file and expose it on every subject

**Files:**

- Create: `data/userdata/study_materials_extra.json` (content `{}`)
- Create: `src/test/fixtures/study_materials_extra.json`
- Modify: `src/test/preload.ts`
- Modify: `src/model/wanikani.ts`
- Modify: `src/server/repository/data-loader.ts`
- Modify: `src/server/repository/radical.ts`
- Modify: `src/server/repository/kanji.ts`
- Modify: `src/server/repository/vocabulary.ts`
- Modify: `src/server/__tests__/api.search.test.ts`
- Modify: `src/server/__tests__/__snapshots__/api.search.test.ts.snap`
- Modify: `src/server/repository/__tests__/__snapshots__/radical.test.ts.snap`
- Modify: `src/server/repository/__tests__/__snapshots__/kanji.test.ts.snap`
- Modify: `src/server/repository/__tests__/__snapshots__/vocabulary.test.ts.snap`

- [x] create `data/userdata/study_materials_extra.json` with `{}`
- [x] create the fixture with the six entries listed under Test hooks
- [x] add the read redirect, the `rename` and `unlink` mocks, and `setFsError` to `src/test/preload.ts`
- [x] change `KanaVocabulary.studyMaterial` to `StudyMaterial | null` and add `localStudyMaterial: LocalStudyMaterial | null` to the four enriched types in `src/model/wanikani.ts`
- [x] load `localStudyMaterials` in `data-loader.ts` and add `setLocalStudyMaterials`
- [x] add `localStudyMaterial: localStudyMaterials[String(data.id)] ?? null` in the radical, kanji and vocabulary builders, and the kana vocabulary builder
- [x] replace the hard-coded `studyMaterial: null` for kana vocabulary with `findStudyMaterial(..., "kana_vocabulary")`. It finds nothing with today's data, the change is for future downloads
- [x] add search tests for `type=kanji&q=川` and `type=vocabulary&q=アメリカ人` with file snapshots
- [x] update the search snapshot: `bun test src/server/__tests__/api.search.test.ts --update-snapshots`, then read the diff and check that every subject gained a `localStudyMaterial` entry (13 today, `null` except 658, 1, 3766 and 958 which show the fixture object) and the two new snapshots appeared
- [x] update the three repository snapshots one file at a time: `bun test src/server/repository/__tests__/radical.test.ts --update-snapshots`, then kanji, then vocabulary. Their top-level subjects 一, 校, 毎晩 and the nested 晩 show the fixture object
- [x] run `bun run tsc` and `bun test` - must pass before Task 3

### Task 3: Anki note builders use the merged values

**Files:**

- Modify: `src/server/services/anki-connect.ts`
- Modify: `src/server/__tests__/api.add-to-anki.test.ts`
- Modify: `src/server/__tests__/__snapshots__/api.add-to-anki.test.ts.snap`

- [x] call `mergeStudyMaterial(subject.studyMaterial, subject.localStudyMaterial)` once per builder. Radical reads `meaningNote` and `meaningSynonyms.join(", ")`, vocabulary reads all three, kanji reads only the two notes because its note type has no synonyms field
- [x] remove the `?.data.meaning_note ?? ""` chains
- [x] in the `add radical (一, id=1)` test, assert that the `note` field of the addNote call holds the fixture note. The existing `findVocabularyFields` helper matches on `characters`, the radical note type has `character`, so the test needs its own lookup over `ankiCalls`
- [x] update the add-to-anki snapshot scoped to that file and check that only the 毎晩 test changed: `meaning_note` and `user_synonyms` of the vocabulary note, `meaning_note` and `reading_note` of the 晩 kanji note
- [x] run `bun run tsc` and `bun test` - must pass before Task 4

### Task 4: Repository upsert

**Files:**

- Create: `src/server/repository/study-material.ts`
- Create: `src/server/repository/__tests__/study-material.test.ts`
- Modify: `src/server/utils/json-utils.ts`

- [x] add `saveJsonAtomic` to `src/server/utils/json-utils.ts`
- [x] add `findSubjectTypeById` scanning radicals, kanji, vocabulary, kana vocabulary
- [x] add `upsertLocalStudyMaterial(subjectId, patch)` with the field-drop and entry-drop rules, `saveJsonAtomic` first, then `setLocalStudyMaterials`, the whole step inside the promise queue
- [x] test setup: `beforeAll` calls `ensureRepositoryInitialized()`; import the fixture from `src/test/fixtures/study_materials_extra.json`; `beforeEach` and `afterEach` both call `resetWriteCalls()` and `setLocalStudyMaterials(structuredClone(fixture))`, so the last test leaves nothing behind for the next file
- [x] write tests: create entry, update one field keeps the others, clear a field, remove the last field deletes the entry, the saved entry in `writeCalls` has the real path and no `.tmp` entry is left
- [x] write failure tests: a `writeFile` error and a `rename` error (`setFsError`) both leave the in-memory object unchanged and leave no `.tmp` entry, and after `setFsError(op, null)` the next save works
- [x] write a queue test: two saves started without awaiting, for two subjects and for two fields of one subject, both end up in the final file
- [x] run `bun test src/server/repository` - must pass before Task 5

### Task 5: PATCH endpoint

**Files:**

- Modify: `src/server/api.ts`
- Create: `src/server/__tests__/api.study-materials.test.ts`
- Generated: `src/server/__tests__/__snapshots__/api.study-materials.test.ts.snap` by `bun test src/server/__tests__/api.study-materials.test.ts --update-snapshots`, never written by hand

- [x] add `.patch("/study-materials", ...)` with the validation list from Technical Details, `as const` on every `ok`
- [x] add the `[API]` log lines
- [x] test setup: same as Task 4, `beforeAll` init plus `beforeEach` and `afterEach` resets, so a later test file sees the fixture state whatever the file order
- [x] write tests for every 400 case, the 404 case, and the 500 case with `setFsError`
- [x] write tests for create, update one field, add a synonym, clear a note, remove the last field; snapshot the response body and the written JSON
- [x] run `bun test` - must pass before Task 6

### Task 6: Client api method

**Files:**

- Modify: `src/client/api.ts`
- Modify: `src/client/__tests__/api.test.ts`

- [x] add `saveStudyMaterial(id, patch)` next to `addToAnki`, same error handling
- [x] record `init.method` and `init.body` next to the url in the fetch mock of `src/client/__tests__/api.test.ts`
- [x] write tests: 200 returns `data`, `ok: false` throws with the server message, non-JSON 500 throws `HttpStatusError`, a rejected fetch propagates, the request is a PATCH to `/api/study-materials` with `id` in the body
- [x] run `bun test src/client` - must pass before Task 7

### Task 7: Note editor

**Files:**

- Modify: `src/client/components/card-components/NoteSection.tsx`
- Modify: `src/client/components/RadicalCard.tsx`
- Modify: `src/client/components/KanjiCard.tsx`
- Modify: `src/client/components/VocabularyCard.tsx`
- Create: `src/client/components/__tests__/NoteSection.test.tsx`

- [x] rewrite `NoteSection` with the props, state and behavior from Technical Details, icons `PencilEdit01Icon`, `CheckmarkCircle01Icon`, `Cancel01Icon`
- [x] thread `subjectId`, `field`, `wanikaniNote`, `localNote` through the three cards, including `MnemonicBlock` in the kanji card and the meaning and reading sections in the vocabulary card
- [x] write tests with `renderToStaticMarkup`: WaniKani note without the tag, local note with the tag, no note shows "+ Add Note"
- [x] run `bun run lint:fix` on the edited files, `bun run tsc`, `bun test` - must pass before Task 8
- [x] manual browser check (skipped - not automatable): add, edit, clear, cancel. For the error path stop the dev server, the toast then shows the fetch error and the editor opens again with the draft. Cancel after that shows the last saved value

### Task 8: Synonym editor

**Files:**

- Modify: `src/client/components/card-components/UserSynonymsRow.tsx`
- Modify: `src/client/components/RadicalCard.tsx`
- Modify: `src/client/components/KanjiCard.tsx`
- Modify: `src/client/components/VocabularyCard.tsx`
- Create: `src/client/components/__tests__/UserSynonymsRow.test.tsx`

- [x] rewrite `UserSynonymsRow` with the props, state and behavior from Technical Details
- [x] thread `subjectId`, `wanikaniSynonyms`, `localSynonyms` through the three cards
- [x] write tests with `renderToStaticMarkup`: WaniKani chips have no remove button, local chips have one, empty lists show only the add button
- [x] run `bun run lint:fix` on the edited files, `bun run tsc`, `bun test` - must pass before Task 9
- [x] check in the browser (skipped - not automatable): add, remove, duplicate is refused, error toast

### Task 9: Verify acceptance criteria

- [x] every subject type shows and edits its notes: radical (meaning only), kanji, vocabulary, kana vocabulary (meaning only) (verified by reading the code, browser check skipped - no browser in this run). Kana vocabulary has no own card, `SearchResult` sends it to `VocabularyCard`, and `ReadingSection` only renders for `object === "vocabulary"`. New `src/client/components/__tests__/VocabularyCard.test.tsx` proves kana vocabulary shows one note editor and no Reading section, regular vocabulary shows two
- [x] a local note replaces the WaniKani note, clearing it brings the WaniKani note back (verified by reading the code, browser check skipped - no browser in this run). `mergeStudyMaterial` prefers the local note, `NoteSection` shows `savedNote ?? wanikaniNote` and sets `savedNote` to `null` on an empty draft, the upsert deletes a field set to an empty string
- [x] local synonyms are appended, WaniKani ones cannot be removed. `mergeStudyMaterial` puts the WaniKani list first and drops duplicates, `UserSynonymsRow` renders the remove button only on local chips and `remove` filters the local list only
- [x] "Add to Anki" after an edit puts the merged values into the Anki fields, except kanji synonyms, which have no field on the kanji note type. All three note builders call `mergeStudyMaterial`, `KANJI_EXPECTED_FIELDS` has no `user_synonyms`, and a new repository test shows a saved note on the subject at the next read
- [x] `data/userdata/study_materials_extra.json` stays valid JSON and never holds empty strings, empty lists or empty entries. ➕ fixed: `applyPatch` now trims the notes and drops blank synonyms, so a list like `["", " yank "]` no longer stores an empty string. New test `blank values never reach the file` checks the whole written file
- [x] run `bun run lint:fix`, `bun run tsc`, `bun test`

### Task 10: Update documentation

**Files:**

- Modify: `CLAUDE.md`
- Modify: `data/userdata/README.md`
- Modify: `docs/prompts/test-scenarios.md`
- Modify: `docs/backlog.md`

- [x] CLAUDE.md: add the API table row for `PATCH /study-materials`, a short "Local Study Materials" section after "Fixing Wrong WaniKani Data", `study_materials_extra.json` in the structure tree, `study-material.ts` in the repository list, the fixture redirect, the `rename` / `unlink` mocks and `setFsError` in the test architecture notes
- [x] `data/userdata/README.md`: one row for the new file
- [x] `docs/prompts/test-scenarios.md`: manual scenarios for note and synonym editing
- [x] `docs/backlog.md`: one line for a `user_synonyms` field on the kanji note type, which needs the interactive field migration, a template change and the field docs
- [x] move this plan to `docs/plans/completed/` (done by the harness after the review phases)

## Post-Completion

**Manual verification**:

- edit a note on a kanji shown under a vocabulary word, then search that kanji on its own and check the note is there
- stop the dev server, save a note, check the editor opens again with the text and the toast shows the error
- run "Add to Anki" for a word with a local note and check the note field in Anki

**External system updates**:

- commit `study_materials_extra.json` and the README row in the `data/userdata` repo when the user asks
- WaniKani never sees the local values. A re-download of `study_materials.json` keeps them, since they are in a separate file
