# Making Anki Cards

Project for creating Anki flashcards from Wanikani data.

## Tech Stack

- Runtime: Bun
- Language: TypeScript
- Frontend: React 19 + Vite + Tailwind CSS 4
- Backend: Hono (serves API and static files)
- API Client: Hono RPC (typed client generated from server routes)

## Project Structure

```
src/
  client/               # React frontend
    main.tsx            # Entry point
    App.tsx             # Root component
    api.ts              # Typed API client (Hono RPC)
    styles.css          # Tailwind imports
    types.ts            # Client-side types
    components/         # React components only
      card-components/  # Shared UI components (SubjectTile, CardHeader, etc.)
    context/            # React contexts
      SearchContext.tsx # Navigation context for search
    hooks/              # React hooks
      useSearchUrl.ts   # URL-based search state management
      useLocalStudyMaterial.ts # Shared store of the saved local notes / synonyms
    utils/              # Client-side utility functions (non-React)
  server/               # Hono backend
    index.ts            # Server entry: repository init, then createApp()
    app.ts              # Hono app: logger, CORS, /api routes
    api.ts              # API routes (exports ApiType for client)
    utils/              # Server-side utility functions
    repository/         # Data access layer (singleton, use initRepository() first)
                        #   study-material.ts: local notes / synonyms, saved with saveJsonAtomic
    services/           # Server services (AnkiConnect integration, Azure TTS)
  config/               # Shared configuration (theme colors)
  utils/                # Shared utility functions (mnemonic-utils)
  model/                # Shared TypeScript types and utilities (server, client and scripts)
    wanikani.ts         # Wanikani data types
    anki-models.ts      # Anki deck / note type names
    subject-utils.ts    # Shared utilities (getPrimaryMeaning, findByIds, buildSubjectReferences, etc.)
    radical-utils.ts    # Radical-specific utilities
    kanji-utils.ts      # Kanji-specific utilities
    vocabulary-utils.ts # Vocabulary-specific utilities
    __tests__/          # Unit tests for the pure model helpers

  test/                   # Shared test infrastructure
    preload.ts            # Shared mock.module + repository init + DOM (configured in bunfig.toml)
    dom.ts                # One happy-dom window on globalThis, installed by the preload
    render.tsx            # mount / mountCard / click / typeInto / pressKey / settle for behavior tests
    api-mock.ts           # Fetch mock for the study material saves of the card editors
    study-material-fixture.ts # Fixture load and state reset for the local study material tests
    fetch-interceptor.ts  # Fetch mock for API E2E tests (AnkiConnect, WaniKani media/pages)
    fetch-utils.ts        # Shared fetch mock utilities

scripts/                # Utility scripts. Top level holds only entry points, shared code goes to lib/
  download-subjects.ts
  download-study-materials.ts
  patch-subjects.ts              # Apply data/wanikani-fixes.yaml to the downloaded subjects
  generate-verb-conjugations.ts  # LLM-powered verb conjugation generator
  generate-sentence-readings.ts  # LLM-powered kana readings for context sentences
  sync-anki-fields.ts            # Add missing note-type fields to Anki (interactive, needs a TTY)
  sync-anki-templates.ts         # Sync Anki templates to Anki via AnkiConnect
  sync-anki-notes.ts             # Re-generate all Anki notes through the dev server API
  add-iknow-vocab.ts             # Add the next iKnow Core 1000 words to the Anki vocabulary deck
  lib/                           # Modules shared by the scripts, never run directly
    anki-templates.ts            # Shared by the two sync scripts: template table, ankiInvoke, field diff
    anki-template-fields.ts      # Pure markdown parsing of the template files (unit-tested)
    format-error.ts              # formatError(err) shared by all scripts
    generator-cli.ts             # Shared by the two LLM scripts: flags, log, summary, stop rule
    llm-utils.ts                 # Shared by the two LLM scripts: chunk, JSON answers, atomic save
    vocabulary-data.ts           # Shared by the two LLM scripts: load vocabulary, primary reading
    sentence-reading-check.ts    # Order check of a kana reading against its sentence (unit-tested)
    iknow-vocab.ts               # Pure parts of the iKnow import: parsing, course rollover (unit-tested)
    __tests__/                   # Unit tests for the pure script helpers, fixtures in fixtures/
  .env                  # Script-specific env vars (WANIKANI_API_TOKEN, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)
                        # Loaded via --env-file in package.json scripts

data/                   # Data files
  userdata/             # User-specific data, gitignored
                        #   Downloaded WaniKani subjects, study materials, mnemonic image cache
                        #   Populated via download scripts
                        #   study_materials_extra.json: local notes and synonyms, written by the app (see below)
  wanikani-fixes.yaml     # Hand-written corrections for wrong WaniKani API data (see below)
  verb_conjugations.json  # Verb conjugations keyed by vocabulary ID (LLM-generated)
  sentence_readings.json  # Kana readings for context sentences keyed by vocabulary ID (LLM-generated)
docs/                   # Documentation (API references, prompts, lists)
src/anki-templates/     # Anki card template documentation (Front/Back/CSS)
```

## Development

```bash
bun run dev        # Start dev server (Vite + Hono)
bun run build      # Build client + server
bun run preview    # Run production build
bun run lint:fix   # ESLint
bun run format     # Prettier
bun run tsc        # TypeScript type checking
```

## Data Scripts

```bash
bun run download-subjects              # Download Wanikani subjects
bun run download-study-materials       # Download study materials
bun run patch-subjects                 # Apply data/wanikani-fixes.yaml to the downloaded subjects
bun run generate-verb-conjugations     # Generate verb conjugations via LLM
bun run generate-sentence-readings     # Generate kana readings for context sentences via LLM
bun run sync-anki-fields               # Add missing note-type fields to Anki (interactive, needs a TTY)
bun run sync-anki-templates            # Sync Anki templates to Anki
bun run sync-anki-notes                # Sync all Anki vocabulary notes (requires dev server running)
bun run add-iknow-vocab                # Add the next iKnow Core 1000 words (requires dev server running)
```

The verb conjugation script has CLI options: `--limit <n>`, `--batch-size <n>` (default 20), `--dry-run`, `--show-prompt`, `--help`

The sentence readings script has CLI options: `--limit <n>`, `--batch-size <n>` (default 20), `--dry-run`, `--show-prompt`, `--help`

Both LLM scripts only fill ids that are missing in their data file, so a rerun continues where the last run stopped. They send one JSON array of items per request, check every answer item, save after every batch, and stop after 3 batches in a row without a usable answer. An item that fails a check is logged and skipped, a rerun picks it up. `--batch-size 1` helps with the last stubborn items. The model is `LLM_MODEL` from `scripts/.env`

The sync Anki notes script has CLI options: `--base-url <url>`, `--limit <n>`, `--dry-run`, `--help`

### Fixing Wrong WaniKani Data

Sometimes the WaniKani API serves data the website disagrees with. `data/wanikani-fixes.yaml` holds hand-written corrections and `bun run patch-subjects` applies them to the downloaded files in `data/userdata/`. It has `--dry-run` and `--help`.

`download-subjects` writes the raw API answer, so **a download must be followed by a patch run**. The two are separate because a download takes minutes and a patch run takes a second.

Each patch names a `subject` id, a `field` inside `subject.data`, the whole broken value as `expect`, and the whole fixed value as `set`. There is only this one kind. An earlier design also had `add` / `remove` for the long id lists, but it allowed a patch to hold both with no defined precedence, and an empty `add: []` satisfied both its "all present" and "none present" checks, so the patch never settled. Long lists are generated from the real data instead of typed, which makes the verbosity cheap.

Two things guard a patch, and both must fail loudly rather than guess:

- `seen` holds the subject's `data_updated_at` when the patch was written. It is checked **first**, before any value. Any WaniKani edit to that record fails the run, even an unrelated one.
- `expect` must match the current value exactly. Matching `set` instead means the patch is already applied, which is how a rerun stays idempotent.

**A failing run is a prompt to look, never an instruction to delete.** The `seen` guard also fires when WaniKani edits something else and leaves the wrong ids in place. Deleting then would drop a fix that is still needed, and the next download would bring the bad value back. Open the subject on wanikani.com, then either delete the patch (that field was fixed) or update `seen` and re-check `expect`.

The run is all-or-nothing: one failing patch writes nothing and exits 1. That is not crash-safe atomicity across files — a failure between two writes leaves one file patched. That state is safe, because a rerun reports `already` for the written file and `apply` for the other. Recovery is running the script again.

The pure logic is `scripts/lib/subject-patches.ts`, tested in `scripts/lib/__tests__/subject-patches.test.ts`. Those tests read the real fixes file and the real `data/userdata/`, and check each patch's `expect` → `set` delta against a small hand-written table, because a long pasted id list can keep its length while holding a typo.

Patching `data/userdata/` changes two checked-in snapshots (`radical.test.ts.snap` and `api.search.test.ts.snap`) whenever a patched radical appears in them. Update them scoped, one file at a time.

Current contents: seven patches for WaniKani's 2026-08-27 content update, which changed the radicals of 万, 別 and 成 on the website but not in the API. Reported at https://community.wanikani.com/t/75554 and to hello@wanikani.com. Delete the file and the script once WaniKani fixes it and no patch is left.

### Local Study Materials

Local notes and synonyms for any subject, written in the web UI. They never touch the WaniKani data. There is no script for this, the app writes the file.

- The file is `data/userdata/study_materials_extra.json`. It is an object keyed by the subject id as a string. WaniKani subject ids are unique across all types, so the file holds no type. A record has `meaning_note`, `reading_note` and `meaning_synonyms`, all optional.
- `data-loader.ts` reads it into `localStudyMaterials` in the same `Promise.all` as the other data files. A missing file fails the start, like every other data file, but with a message that names the file and asks for `{}`. No script creates it, so a fresh clone of the data repo has to write it by hand. The path is one exported constant, `LOCAL_STUDY_MATERIALS_PATH`. An exported `let` cannot be assigned from another module, so `setLocalStudyMaterials(next)` sits next to it.
- Every enriched subject carries two records: `studyMaterial` from WaniKani and `localStudyMaterial` from this file. The server sends both. `mergeStudyMaterial(wanikani, local)` in `src/model/subject-utils.ts` joins them: a local note replaces the WaniKani note, local synonyms are appended to the WaniKani ones and duplicates are dropped.
- The client gets both records on purpose. Local synonyms need a remove button, and clearing a local note must show the WaniKani note again with no re-fetch.
- The three Anki note builders in `src/server/services/anki-connect.ts` call the same helper, so a note built now holds the merged values. A note that is already in the deck keeps its old text until the next `add-to-anki` or `bun run sync-anki-notes`. Kanji synonyms are the one exception: the kanji note type has no `user_synonyms` field, so they stay on screen only. `KanjiCard` says "not in Anki" next to the synonym row, and reads that from `KANJI_EXPECTED_FIELDS`, so the hint goes away on its own once the field is added.
- `MergedStudyMaterial` uses camelCase, because it is our own computed shape, like `meaningMnemonic`. `LocalStudyMaterial` stays snake_case, because it mirrors the WaniKani record field by field. Do not "fix" one to match the other.
- `applyLocalStudyMaterialPatch(current, patch)` in `src/model/subject-utils.ts` is the one place that merges a patch into a record. The server writes its result, the client shows it while the request runs. It trims the notes, drops blank and repeated synonyms, deletes a field that ends up empty and returns `null` when no field is left. It cleans the whole merged record, not only the patched fields, so the file never holds an empty string, an empty list or an empty entry.
- `upsertLocalStudyMaterial` in `src/server/repository/study-material.ts` writes the whole object with `saveJsonAtomic` from `src/server/utils/json-utils.ts` (write `<path>.tmp`, rename it over the real file, unlink the temp file when a step throws), then publishes it with `setLocalStudyMaterials`. A failed write leaves both the file and the memory unchanged.
- `saveJsonAtomic` exists twice, here and in `scripts/lib/llm-utils.ts`. The scripts must not import from `src/server/`, so the copy stays on purpose. Change both when you change one.
- Every upsert runs in one module-level promise queue. Two saves at the same time would otherwise start from the same old object, and one change would be lost. The caller's promise stays out of the chain (`const run = queue.then(step); queue = run.catch(() => {}); return run;`). So the caller sees the error, and the next save still starts from the last good state.
- The upsert reads the file again inside that queue and merges the patch onto the fresh content, it never writes the memory copy. The user also edits this file by hand and pulls it from git while the server runs, and the memory copy is only filled at startup. A read error fails the save, because writing the stale map would drop those edits with no error.
- `findSubjectTypeById(id)` scans the four subject arrays. The route calls it before the write, because a `reading_note` for a radical or for kana vocabulary is a 400. The upsert itself trusts the id.
- The web UI edits the values in place. `NoteSection.tsx` has a pencil button and a textarea, Esc cancels and Cmd+Enter saves. `UserSynonymsRow.tsx` has an inline input and a small × on every local chip. Both are optimistic: they show the new value at once, send the patch, and on an error put the old value back and show a `toast.error`.
- One subject can render on several cards at once. A radical under two kanji of one word gets one card per kanji. So the saved records live in one module-level store, `src/client/hooks/useLocalStudyMaterial.ts`, and not in the components. Per-card state would let one card send a synonym list that the other card never saw, and the whole-list write would drop the other card's word. A card reads the store first and falls back to the record the server sent.
- The store keeps one promise chain per subject id, like the server queue. Two saves for one subject would otherwise race: the slower answer would land on top of the newer one. Saves for different subjects still run at the same time. It holds two maps: `confirmed`, the answer of the last finished save, and `shown`, which is `confirmed` with every save that is still in flight applied on top. Every published `shown` map is built from the current `shown` object, so an entry another subject saved meanwhile stays.
- `confirmed` is a real `Map` and not an object, and `shown` is only ever spread and published in the same tick. In an object literal the spread runs **first**, so an `await` after it writes back a copy of the shared state taken before the request started, and the answer of another subject in between is lost. Never put an `await` inside an object literal that also spreads shared state.
- The store also holds `origins`: the `fromServer` record each subject's session started from. A render with another value means the file changed outside this tab (a hand edit, a `git pull` of `data/userdata`). The hook then shows `fromServer` instead of the session record, and the next save drops the confirmed entry first. Without it the client would send a whole synonym list built from a record the file no longer has, and the server-side re-read could not save it, because a whole-list patch replaces.
- The new `shown` value is published **before** the save enters the queue. Publishing it inside the queue would leave a second edit of the same subject invisible until the first request answers, which is the opposite of an optimistic UI.
- A whole-list field passes a function `(confirmed) => patch` instead of a ready-made patch. It runs when the request starts, so the list that goes to the server is built from the last confirmed list. Built at click time it would carry the change of a save that failed meanwhile, and the next save would store the very change the user was told had failed.
- A note keeps its line breaks. The Anki field holds the raw text, so the `.note` rule of all three templates sets `white-space: pre-wrap`. Without it Anki shows a multi-line note as one long line.
- Anki renders a note field as HTML. `mergeStudyMaterialForAnki` in `anki-connect.ts` escapes `&`, `<` and `>` in the two notes and in every synonym before they go into a field. Without it a note like "use < for the smaller one" loses everything after the `<`. `mergeStudyMaterial` itself must keep the raw text: the client renders the same values through React, which escapes on its own.
- The editors do not call `mergeStudyMaterial`, they need the two records apart. They must still follow its rules. A local note falls back with `||` and not `??`, so an empty note in a hand-edited file shows the WaniKani note on screen and in Anki alike.
- `PATCH /api/study-materials` is the only route that writes user data, so `createApp()` in `src/server/app.ts` allows CORS for the vite dev client only (`http://localhost:5173`, `http://127.0.0.1:5173`). With the default `cors()` any open page could rewrite the notes of any subject id. A built client is served from the same origin and needs no CORS. The app is built in `app.ts` and not in `index.ts`, so a test can build one without the `initRepository()` that `index.ts` runs at import time.
- The field list lives once, as `LOCAL_STUDY_MATERIAL_FIELDS` in `src/model/wanikani.ts`. The `LocalStudyMaterial` type and the `field` prop of `NoteSection` are built from it, and the PATCH route validates against it. A copy in the route would answer a new field with a silent 400.
- `SearchResult.tsx` gives the three top-level cards a `key` with the subject id. Without it React reuses the same component instance on a new search, and the open editor would keep the draft of the last subject. The nested cards already sit in keyed wrappers. `SearchResult.test.tsx` guards it: it opens an editor, renders another subject in the same place and expects no editor.
- A failed save shows `saveErrorMessage(err)` from `src/client/utils/request-error.ts`, the same module the search page uses. So a stopped dev server reads "Could not reach the server" everywhere, instead of the raw fetch `TypeError` in the editors.
- `noteProps(subject, field)` and `synonymProps(subject)` in `src/client/components/card-components/study-material-props.ts` build the editor props. The cards never pick the fields apart by hand, so a `reading_note` editor cannot end up with a `meaning_note` value.
- Kana vocabulary has no card of its own. `SearchResult.tsx` sends it to `VocabularyCard`, which hides the reading section for it, so it gets a meaning note editor only.
- A new download of `study_materials.json` keeps these values, they live in their own file.

### iKnow Vocabulary Import

`bun run add-iknow-vocab -- --limit <n>` walks the iKnow Core 1000 course files in `data/userdata/iknow/` and adds the next words to the Anki vocabulary deck through the dev server API. CLI options: `--base-url <url>`, `--limit <n>` (default 15), `--dry-run`, `--help`.

`data/userdata/iknow-vocabulary-status.json` holds the place: `current` file, `files[name].index` (the **next** item to process), and `problems`. The script saves it with `saveJsonAtomic` after every word, so a stop in the middle loses nothing. It rolls over to the next course file on its own, and one run never spans two files.

Like `sync-anki-notes`, it adds every word with `sync: false` and calls `/api/anki-sync` once at the end. Syncing per word would run a full AnkiWeb sync 15 times, and a failed sync would answer `ok: false` for a word that is already written — so the word would land in `problems` and not use up the budget, and a `--limit 15` run could add more than 15 words.

The limit counts words really added. A word already in Anki, or already in `problems`, is skipped for free.

A word in `problems` is never revisited — the saved index has already moved past it. Resolve one by adding it directly, then drop its entry by hand.

The search endpoint answers `vocabulary` and `kana_vocabulary` from one pool, so the script sends the type the search reports in `data.object`, never a literal.

The `.claude/skills/add-iknow-vocab/` skill runs the script and triages the new `problems` entries — grammar words WaniKani does not teach vs a different WaniKani spelling (直ぐ for すぐ). It asks before adding an alternative spelling.

### Anki Template Development

After editing Anki card templates in `src/anki-templates/`, **always** run:

```bash
bun run sync-anki-templates
```

to sync changes to Anki via AnkiConnect. Requires Anki to be running with AnkiConnect plugin.

**Important:** Always sync templates immediately after modifying them - do not wait for the user to ask.

Before it syncs anything, the script compares the `## Fields` list of each template file with the fields of the Anki note type. It writes nothing in this step, and a missing or extra field on any note type blocks the whole sync.

- Fields must exist before the templates are pushed. Anki rejects a template that references a field the note type does not have.
- A missing field is added only by `bun run sync-anki-fields`. That script is interactive and needs a real terminal, so an agent must ask the user to run it, then run `sync-anki-templates` again.
- An extra field is removed by nobody. `validateModelFields` in `src/server/services/anki-connect.ts` checks one note type at a time. It throws on an extra field, so every `add-to-anki` call that writes that note type fails. A vocabulary add also writes its kanji and radicals, so an extra radical field breaks all three types, while an extra vocabulary field breaks only vocabulary. The user must remove the field in Anki by hand.

### Anki Field Migration

```bash
bun run sync-anki-fields
```

The only script that changes note type fields, which are part of the collection schema. It adds missing fields at the position the template lists them. `sync-anki-templates` also writes these note types, but only their templates and styling, never their fields. `sync-anki-fields` never calls the AnkiConnect `sync` action - the user handles AnkiWeb syncing.

- Adding a field changes the collection schema, so the script warns first and asks the user to type `yes`. Any other answer, or Ctrl+D, stops the run with no change.
- The warning spells out the sync order: sync every other device to AnkiWeb, then sync this machine so it pulls those changes down, then add the fields, then choose upload on the one-way sync. The prompt asks the user to confirm the first two steps. Without them the upload wipes the other devices' changes.
- Step 2 of that order changes the note types while the prompt waits. So the script reads the fields again after the `yes` and acts on the fresh read. It exits with no change when the fresh state differs from the one the user approved, and exits 0 when nothing is missing any more.
- An extra field on any note type stops the whole run. The insert position comes from the template list, so a stray field would push the new field to the wrong place. The user removes the extra field in Anki, then runs the script again.
- Existing fields in another order than the template stop the run too, for the same reason: the insert index would land the new field in the wrong place. The script never moves a field, it only adds. The user repositions the fields in Anki, then runs the script again.
- It needs a real terminal. Without a TTY it exits without any change, so an agent can never run it. Ask the user to.

Both scripts share `scripts/lib/anki-templates.ts` (template table, `ankiInvoke`, template loading, reading the fields from Anki) and `scripts/lib/anki-template-fields.ts` (pure markdown parsing, field diff, template-order check, problem formatting, covered by `scripts/lib/__tests__/`).

### Anki Note Generation

After modifying note generation logic in `src/server/services/anki-connect.ts` (e.g., changing field content, adding new fields), suggest running the sync script to update all existing notes in Anki:

```bash
bun run dev                # Start dev server (if not already running)
bun run sync-anki-notes    # Re-generate all Anki notes
```

Requires Anki to be running with AnkiConnect plugin.

Adding or re-syncing a word always creates or refreshes its component kanji and radicals too. This is intended: every word in Anki must have its kanji and radicals there. The script adds every note with `sync: false` and syncs to AnkiWeb once at the end, so a full run is one AnkiWeb sync, not one per word.

## Environment

Two `.env` files, each with a `.env.example` to copy from:

- **`.env`** (project root) — Azure TTS credentials for context sentence audio. Optional — if missing, sentence audio is silently skipped. `AZURE_TTS_VOICES` holds the Dragon HD voices `ja-JP-Nanami:DragonHDLatestNeural,ja-JP-Masaru:DragonHDLatestNeural`, the region must support them (`westeurope` does). Output is MP3 at 24 kHz, 160 kbit/s.
- **`scripts/.env`** — WaniKani API token (required for download scripts) and the LLM settings `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (for verb conjugation / sentence reading generation). `LLM_MODEL` must be a model the endpoint offers, the scripts fail at the first request otherwise.

Get your WaniKani token from: https://www.wanikani.com/settings/personal_access_tokens

## API Documentation

- `docs/wanikani-api.md` - Wanikani API reference (endpoints, auth, pagination, data structures)
- `docs/anki-connect-typescript-api.md` - AnkiConnect API for Anki deck operations
- `docs/anki-decks-fields.md` - Anki deck field definitions for each subject type
- `docs/backlog.md` - To-dos stashed for the future. Pick from it when choosing what to work on next

## Anki Integration

AnkiConnect client is in `src/server/services/anki-connect.ts`. Card templates are in `src/anki-templates/`.

- AnkiConnect endpoint: `http://127.0.0.1:8765`
- Use `toast.promise()` from `react-hot-toast` for async operations with loading/success/error feedback. The optimistic editors are the exception: they show the new value at once, so they need no loading toast and only call `toast.error` when the save fails
- Store media files with deck ID prefix to avoid filename collisions: `{deckId}_{slug}.svg`
- An audio field holds the complete `[sound:name.mp3]` tag, never a bare file name, and the template renders the field as is. Anki's Check Media keeps only files that a field references by a `[sound:]` tag or an `<img>`, and deletes the rest. On 2026-09-07 it deleted every sentence clip because that field held bare names
- Reading audio: one gender per card, picked at random, the other gender when the first has no MP3. All readings of it go into the one `reading_audio_*` field as `[sound:]` tags separated by a space, primary reading first, so Anki plays them in a row. The file name is `{deckId}_{slug}_{gender}_{hash}.mp3`, the hash is the first 8 hex chars of the SHA-1 of the reading
- Sentence audio: Azure TTS gets the plain kanji sentence, not the kana reading. The generated kana readings in `data/sentence_readings.json` only fill the furigana field. The HD voices read most sentences right but not rare readings, 外面 came out as がいめん. The planned fix is `docs/plans/tts-with-ssml.md`: one `<sub alias>` per kanji block from the reviewed readings
- Mnemonic HTML tags (`<radical>`, `<kanji>`, etc.) must be pre-styled using `styleMnemonicHtml()` before storing
- Anki templates support JavaScript for dynamic behavior (e.g., font scaling, keyboard shortcuts)
- Variable-length data (like radical lists) should be pre-rendered as styled HTML for consistency
- Anki CSS supports `@media (prefers-color-scheme: dark)` for dark mode styling
- A note field is listed in three places: `*_EXPECTED_FIELDS` in `src/model/anki-models.ts`, the matching note fields type in `anki-connect.ts`, and the `## Fields` list of the template file. `docs/anki-decks-fields.md` lists them too. A test in `scripts/lib/__tests__/anki-template-fields.test.ts` checks that `*_EXPECTED_FIELDS` and the template list match in exact order, so change them in the same commit. The docs file is not tested, keep it in sync by hand. Test code must not repeat the list: `src/test/fetch-interceptor.ts` imports `*_EXPECTED_FIELDS`
- The same test also checks that every `{{...}}` reference in the Front and Back templates is a declared field, so a typo in a template fails the suite instead of failing later in Anki
- The deck / note type names and the `*_EXPECTED_FIELDS` lists live in `src/model/anki-models.ts`. Never repeat them; `anki-connect.ts`, `src/test/fetch-interceptor.ts` and the two test files all import them. They sit in `src/model/` and not in the service so `scripts/` can import them without reaching into a service

## Path Aliases

- `@/*` → `src/*`
- `@client/*` → `src/client/*`
- `@server/*` → `src/server/*`

## Coding Guidelines

### TypeScript

- Prefer `type` over `interface`
- No barrel/index files for exports - always import directly from the source file (e.g., `import { getKanji } from "./repository/kanji.ts"` not `from "./repository"`)
- No type re-exports - import types directly from their source file, don't re-export them from other modules
- Order in the module should be: types, constants, variables, exported functions / React components, utility functions / React components
- Order in the module from higher level to lower level
- Include `.ts`/`.tsx` extensions in imports
- Types shared between server and client go in `src/model/wanikani.ts`
- Type-specific utility functions go in `src/model/*-utils.ts` (e.g., `subject-utils.ts`, `kanji-utils.ts`)
- Functions with 3+ arguments should use a params object
- When writing helper functions that operate on multiple similar types (e.g., VocabularyData and KanaVocabularyData), use a union type for shared operations rather than separate parameters for each type
- Function argument ordering: container → element
  - For search/lookup functions, the collection being searched comes before the search criteria
  - Example: `findByIds(items, ids)` not `findByIds(ids, items)`
- Repository module uses module-level singleton data (initialized via `initRepository()`)
  - Callers must call `initRepository()` before using repository functions
  - Call `saveCache()` at the end to persist any cache changes
  - Repository functions don't take a context parameter - they access module-level data directly

### Architecture

- Service modules (e.g., `anki-connect.ts`) expose business-domain functions, not raw protocol wrappers — keep low-level APIs like `ankiInvoke` private, export functions like `getDeckNotes(type)` or `addOrUpdateRadical(radical)`
- Scripts communicate with services through the backend HTTP API (`/api/*`), not by directly importing service or repository modules
  - Exception: a script may import shared types and constants from `src/model/` with a relative path. A script must still not import services or repositories
- The top level of `scripts/` holds only entry points, one per `package.json` script. Code shared by several scripts lives in `scripts/lib/`, with its unit tests in `scripts/lib/__tests__/`. `tsconfig.json`, `eslint` and `prettier` all cover `scripts/`, so a scripts-only helper is still type-checked, linted and tested
- A script module starts with `main()`, puts its helpers below it, and ends with `main().catch(...)`
- New API endpoints follow the same parameter conventions as existing ones (e.g., `?type=` for subject type filtering)
- API responses return flat, complete data — let consumers filter or transform as needed
- A failed request must never fall into an "empty result" state. A missing item and a broken server must look different on screen. The client api layer throws `HttpStatusError` for a bad status, and the page maps the thrown value to a message in its own `error` state

### Configuration & Environment

- NEVER EDIT .env FILES - THEY CONTAIN USER SECRETS AND CONFIGURATION
- Never use fail-safe defaults for .env files or environment variables
- If .env file is missing, throw an error immediately
- If required env variables are missing, throw an error with a clear message
- Scripts should validate all required configuration at startup before doing any work
- Scripts can have their own `.env` file in the `scripts/` folder for script-specific configuration
- Use `parseArgs` from `util` for CLI argument parsing (supports `--flag`, `-f`, `--option value`)
- For same-line progress output in CLI scripts, use `process.stdout.write("Processing... ")` then `console.log("OK")` for the result

### API Endpoints

All routes are prefixed with `/api`.

| Method | Path                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/search?type=&q=`  | Search by type (`radical`, `kanji`, `vocabulary`) and query string. Falls back to name/meaning search if character search fails. 400 if params missing, 404 if not found, 200 with `{ found: true, data }` on success                                                                                                                                                                                                                                                                                                                                                                                        |
| GET    | `/anki-notes?type=` | List all Anki notes for a subject type (`radical`, `kanji`, `vocabulary`). Returns `{ ok: true, data: AnkiNoteItem[] }`. 400 if type missing/invalid.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| POST   | `/add-to-anki`      | Add subject to Anki. Body: `{ id: number, type: SubjectType, sync?: boolean }`. Looks up enriched subject, creates/updates Anki notes for the subject and its components (radicals, kanji), downloads media, then syncs to AnkiWeb unless `sync` is `false`. 400 if params missing, 404 if subject not found, 200 with `{ ok: true, data: AnkiAddResult }` on success, 200 with `{ ok: false, error }` on AnkiConnect failure                                                                                                                                                                                |
| POST   | `/anki-sync`        | Sync the Anki collection to AnkiWeb once. No body. 200 with `{ ok: true }`, 200 with `{ ok: false, error }` on AnkiConnect failure. `sync-anki-notes` adds every note with `sync: false` and calls this once at the end                                                                                                                                                                                                                                                                                                                                                                                      |
| PATCH  | `/study-materials`  | Save a local note or synonyms for one subject. Body: `{ id: number, meaning_note?: string, reading_note?: string, meaning_synonyms?: string[] }`. A field sent as `""` or `[]` is deleted, an entry with no field left is removed. 400 if `id` is not an integer, no field besides `id` is sent, a key is unknown, a note is not a string, synonyms are not an array of strings, or `reading_note` is sent for a radical or kana vocabulary. 404 if the subject is not found. 500 if the write fails. 200 with `{ ok: true, data: LocalStudyMaterial \| null }`, `data` is `null` when the entry was removed |

Use proper HTTP status codes: 400 for missing/invalid parameters, 404 for "not found" results. Don't return 200 with error-shaped JSON for input errors or missing resources.

### API Pattern

Server routes are defined in `src/server/api.ts` with chained methods for type inference:

```ts
const app = new Hono()
  .get("/endpoint", async (c) => { ... })
```

Export `ApiType` for the client. Client uses Hono RPC in `src/client/api.ts`:

```ts
const client = hc<ApiType>("/api");
```

For discriminated union responses, use `as const` on boolean literals so TypeScript can narrow types on the client:

```ts
return c.json({ found: false as const }, 404);
return c.json({ found: true as const, data: {...} });
```

### Server Logging

Server code should be meaningfully verbose about the steps it performs. Log high-level operations (search requests, Anki add/update flow, media downloads) with `[API]` or `[Anki]` prefixes so the process is easy to follow in the console. Avoid logging large data blobs (base64, full field objects) — log sizes instead. Each key step (looking up a note, creating/updating, downloading media, syncing) should produce a short log line.

### Server Code Compatibility

The vite dev server (`@hono/vite-dev-server`) runs in Node.js, not Bun. Use `fs/promises` instead of `Bun.file()` for file operations in server code:

```ts
import { readFile } from "fs/promises";
const data = JSON.parse(await readFile("./data/userdata/file.json", "utf-8"));
```

### Caching with Parallel Operations

When using `Promise.all` with functions that read/modify/write a cache file, there's a race condition - concurrent writes overwrite each other. Solution: load cache once, accumulate changes in memory, save once at the end. See `MnemonicImageFetcher` class in `src/server/api.ts` for the pattern.

### Preserving Order in ID Lookups

When looking up items by a list of IDs (like `component_subject_ids`), don't use `.filter()` - it returns items in array order, losing the original ID order. Use `findByIds` helper from `src/model/subject-utils.ts`:

```ts
// Wrong - loses order from component_subject_ids
const items = allItems.filter((item) => ids.includes(item.id));

// Right - preserves order
const items = findByIds(allItems, ids);
```

## Design

- Desktop screen size only (no responsive/mobile layouts)
- Page titles should put most important info first (e.g., "後 | kanji | WK Cards") since browsers truncate the end
- Use hugeicons (`@hugeicons/react`, `@hugeicons/core-free-icons`) instead of lucide icons
- Search for icons at: `https://hugeicons.com/icons?search=X&style=Stroke&type=Rounded` (replace X with search term)
- Wanikani subject colors are in `src/config/theme.ts` (radical=blue, kanji=pink, vocabulary=purple)
- Use `SubjectTile` component from `components/card-components/` for clickable kanji/vocabulary tiles with character, reading, meaning
- Use `RelatedSubjectsSection` from `components/card-components/` for collapsible "Found In X" / "Visually Similar" tile sections
- Pass `onClick` handler to control tile behavior (scroll vs navigate) from outside

### Typography

Project uses Noto Sans + Noto Sans JP to match WaniKani's typography:

- Fonts loaded via Google Fonts CDN in `index.html` (Noto Sans weights 300,350,400,500,600; Noto Sans JP weight 350)
- Base font-family and font-weight: 350 set in `src/client/styles.css`
- Font-weight convention: avoid `font-light` (too thin), use `font-medium` instead of `font-semibold` (350 base means semibold is too heavy)
- Japanese characters automatically use Noto Sans JP via font-family fallback chain

## Post-Implementation

After making code changes:

1. Run the refactor-simplifier agent to clean up the implementation:
   - Remove duplication
   - Simplify complex logic
   - Improve naming and readability
   - Extract shared utilities when appropriate

2. Run `/learn` to extract learnings and update CLAUDE.md

## Git Workflow

When asked to commit and push, also check `data/userdata/` for changes — it is a separate git repository. If there are changes there, commit and push them separately. Afterwards, return the working directory back to the main project root.

## GitHub Issues

Project uses GitHub Issues for task tracking at https://github.com/zubko/wk-make-anki-cards/issues

- After completing a coding task, check if any GitHub issues can be closed
- When user asks to add a TODO item, create a new GitHub issue instead

```bash
gh issue list                    # List open issues
gh issue create --title "..." --body "..."  # Create new issue
gh issue close <number>          # Close an issue
```

## Testing

### Unit/Integration Tests

- Framework: `bun:test` (built-in, zero config)
- Tests live next to source in `__tests__/` directories (e.g., `src/server/repository/__tests__/`)
- Run: `bun test` or `bun test --watch`
- For inline snapshots: use empty `toMatchInlineSnapshot()` then run `bun test --update-snapshots` — never write snapshot content manually
- Always scope a snapshot update to one file: `bun test src/server/__tests__/api.add-to-anki.test.ts --update-snapshots`. A bare `bun test --update-snapshots` also rewrites stale snapshots of unrelated tests
- When a test has many `expect()` calls verifying an object's shape, snapshot the whole object instead
- When a snapshot exceeds 50 lines, use file-based `toMatchSnapshot()` instead of inline
- Repository tests use real data files but mock `globalThis.fetch` and `writeFile` to avoid side effects

### Test Architecture

- `bunfig.toml` configures `src/test/preload.ts` as a shared preload for all tests
- Preload handles `mock.module("fs/promises")` (real readFile, mock writeFile) and lazy repository init — Bun's `mock.module()` is process-global, so it must live in one place
- The preload redirects reads of `mnemonic-images.json` and `study_materials_extra.json` to `src/test/fixtures/`, so no test depends on user-specific data
- The `fs/promises` mock keeps the written files in a map, so a read after a write sees the new content like a real disk does. The study material upsert reads the file on every save, so without it a second save would start from the fixture again. `setFileContent(path, data)` puts content there without recording a write, for a change made outside the app; `setStudyMaterialFile(file)` in `src/test/study-material-fixture.ts` wraps it for that one file
- The `fs/promises` mock also has `rename` and `unlink`, so an atomic save shows up in `writeCalls` under the real path: `writeFile` records the `.tmp` path, `rename` moves that entry to the real path, `unlink` drops it. A failed save leaves no `.tmp` entry behind
- `setFsError(op, err)` makes the mocked `writeFile`, `rename` or `unlink` throw. It is the only way to test a failed write, because `mock.module` is process-global and set once. `resetFsMock()` clears it again
- `bun test` runs every file in one process, so module-level state survives a file. A file that changes `localStudyMaterials` or `writeCalls` resets them in `afterEach` too, not only in `beforeEach`
- **Repository tests** (`src/server/repository/__tests__/`): test repository functions directly, use a simple fetch mock from `setup.ts`
- **Script unit tests** (`scripts/lib/__tests__/`): test the pure script helpers directly, no mock needed
- **API E2E tests** (`src/server/__tests__/`): test full API through `api.request()` (Hono handles directly, no HTTP server), use `src/test/fetch-interceptor.ts` which routes by URL pattern (AnkiConnect, WaniKani SVGs/audio/pages)
- The preload also calls `installDom()` from `src/test/dom.ts`, which puts one happy-dom window on `globalThis`. It must run before any test file imports `react-dom`: react-dom reads the DOM globals when it loads, and without them its change events never reach `onChange`
- **Client tests** (`src/client/**/__tests__/`): the api layer installs its own `createFetchMock` from `src/test/fetch-utils.ts`. A view state is checked with `renderToStaticMarkup` from `react-dom/server`. For behavior, `src/test/render.tsx` has `mount`, `click`, `typeInto`, `pressKey` and `settle`: it renders with `createRoot`, dispatches real DOM events inside `flushSync`, and `settle()` awaits the save. `mountCard(element)` wraps the card in a `SearchContext.Provider`, on the first render and on every `rerender`, because `RelatedSubjectsSection` throws without one
- `installApiMock()` from `src/test/api-mock.ts` answers the study material saves. It is called once at the top of a test file and registers the whole lifecycle of that file: it clears itself and the client store before each test, unmounts every mounted view and clears the store after each test, and puts the old `fetch` back at the end. So a failed assertion still leaves no live React root and no saved record behind. Its `answerLater(id, data)` and `failLater(id, message)` hold an answer back until the test calls `resolve()`, which is how the store tests put two saves in flight and choose the order of the answers
- `src/test/study-material-fixture.ts` holds `loadStudyMaterialFixture()`, `lastWrite()` and `resetStudyMaterialState()` for every file that writes local study materials
- Each test type installs its own fetch mock at file top level — no conflict between them
- The preload also replaces `Math.random` with one seeded generator shared by the whole run, and exports `resetRandom()`. Each vocabulary add consumes two values (voice gender, sentence voice), so a test file that snapshots audio fields must call `resetRandom()` in `beforeEach`. Then test order does not matter and a single test can run alone

### Manual Testing

After making changes, verify functionality in browser at http://localhost:5173 (dev server must be running).

### Test Scenarios

See `docs/prompts/test-scenarios.md` for manual test scenarios.
