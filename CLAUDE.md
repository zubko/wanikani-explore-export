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
    index.ts            # Server entry: Azure config check, repository init, then createApp()
    app.ts              # Hono app: logger, CORS, /api routes
    api.ts              # API routes (exports ApiType for client)
    utils/              # Server-side utility functions
      hash.ts           # shortHash (first 8 hex chars of SHA-1) and hashNumber
      json-utils.ts     # readJson, writeFileAtomic, saveJsonAtomic
      reloading-file.ts # createReloadingFile: reads a file again when its mtime or size changed
    repository/         # Data access layer (singleton, use initRepository() first)
                        #   study-material.ts: local notes / synonyms, saved with saveJsonAtomic
                        #   mnemonic-image-fetcher.ts: mnemonic image registry, an append-only JSONL file
                        #   media-cache.ts: getOrFetchMedia, the media files in data/userdata/media/
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
    note-refresh.ts              # pickNotesToRefresh for the kanji and radical passes of sync-anki-notes (unit-tested)
    __tests__/                   # Unit tests for the pure script helpers, fixtures in fixtures/
  .env                  # Script-specific env vars (WANIKANI_API_TOKEN, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)
                        # Loaded via --env-file in package.json scripts

data/                   # Data files
  userdata/             # User-specific data, gitignored, its own git repo (see "Two Machines")
                        #   Downloaded WaniKani subjects, study materials
                        #   Populated via download scripts
                        #   study_materials_extra.json: local notes and synonyms, written by the app (see below)
                        #   mnemonic-images.jsonl: mnemonic image registry, one line per page, written by the app
    media/              # Media cache, written by the app, one file per item
      radicals/         # Radical SVGs
      mnemonics/        # Radical mnemonic pictures
      readings/         # WaniKani reading clips
      sentences/        # Azure TTS sentence clips
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
bun run sync-anki-notes                # Sync all Anki vocabulary notes, kanji notes with no word and radical notes with no kanji (requires dev server running)
bun run add-iknow-vocab                # Add the next iKnow Core 1000 words (requires dev server running)
```

The verb conjugation script has CLI options: `--limit <n>`, `--batch-size <n>` (default 20), `--dry-run`, `--show-prompt`, `--help`

The sentence readings script has CLI options: `--limit <n>`, `--batch-size <n>` (default 20), `--dry-run`, `--show-prompt`, `--help`

Both LLM scripts only fill ids that are missing in their data file, so a rerun continues where the last run stopped. They send one JSON array of items per request, check every answer item, save after every batch, and stop after 3 batches in a row without a usable answer. An item that fails a check is logged and skipped, a rerun picks it up. `--batch-size 1` helps with the last stubborn items. The model is `LLM_MODEL` from `scripts/.env`

The sync Anki notes script has CLI options: `--base-url <url>`, `--limit <n>`, `--dry-run`, `--help`. `--limit` counts words, kanji and radicals together. A dry run lists all word, kanji and radical notes, because only a real add tells which kanji and radicals an add refreshed

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

### Two Machines

Two servers read and write `data/userdata/`: the Mac by hand, and the Linux box through an auto-pull job that commits every few minutes. Correctness beats speed here. One person uses the app at a time, so a `stat` per request is fine.

Design rules:

- A file the server reads and the other machine may change is never kept in memory for the whole process. `createReloadingFile({ path, parse })` in `src/server/utils/reloading-file.ts` runs a `stat` on every `get()` and reads the file again when its mtime or size changed. `parse` gets `null` for a missing file and decides what empty means. The value is kept only after `parse` succeeded.
- A bad data file that shows up while the server runs (a hand edit, a pull) fails every request that needs it, loudly, until the file is fixed. No restart is needed after the fix. A bad file at startup still fails the start.
- A write is an append of one line, or an atomic write and rename. It is never a rewrite of a whole file from a memory copy. `writeFileAtomic(path, data)` in `src/server/utils/json-utils.ts` writes `<path>.<uuid>.tmp` and renames it over the file, so two writes of one path never share a temp file. `saveJsonAtomic` calls it.
- The reading gender and the sentence voice come from hashes, not from `Math.random`. So a word always gets the same file names, on both machines, as long as both hold the same `AZURE_TTS_VOICES` list.

The mnemonic image registry, `data/userdata/mnemonic-images.jsonl`:

- One line per WaniKani page: `{"page": string, "image": string | null}`. `getMnemonicImageUrl(documentUrl)` in `src/server/repository/mnemonic-image-fetcher.ts` reads it through `createReloadingFile` before every lookup. So a line pulled from the other machine is found with no scrape.
- On a miss it scrapes the page once and appends one line. A second lookup of the same page waits for the first one and does not scrape again. A failed append fails the request.
- A failed scrape or a bad HTTP status appends nothing, and the subject builds with no picture. The next search tries again. A `null` line in an append-only file of two machines stays forever, so only a page that was really read is recorded.
- Git's union merge puts the lines of both sides in no fixed order, so the parser never looks at the order. Two equal lines are fine, and a URL beats `null`. Two different URLs for one page fail the read with the page in the message. The user then deletes one line.
- `initRepository` reads the registry once, so a broken line fails the start. The error names the line number.

The media cache, `data/userdata/media/`:

- `getOrFetchMedia({ folder, nameWithoutExtension, fetch })` in `src/server/repository/media-cache.ts`. A hit reads the file from disk and never touches the network. A miss calls `fetch`, writes the file with `writeFileAtomic` and returns it. So an add or a re-sync goes to the network only once per file, and a card still builds when WaniKani drops a file.
- Four folders: `radicals/` (radical SVGs), `mnemonics/` (radical mnemonic pictures), `readings/` (WaniKani reading clips), `sentences/` (Azure sentence clips).
- A hit is a file named `<nameWithoutExtension>.<ext>` with no dot in `ext`, so a `.tmp` file is never a hit. Two such files throw `Two cached files for ...`, the cache never picks one. A read error on a hit throws, it never falls back to the network.
- The file names on disk carry no deck id: radical SVG `{slug}_{urlHash}.svg`, mnemonic picture `{slug}_mnemonic_{urlHash}.{ext}`, reading clip `{slug}_{gender}_{readingHash}.mp3`, sentence clip `{slug}_{ssmlHash}.mp3`. A changed URL, reading or SSML gives a new name, so the new file is fetched by itself. The Anki name adds the deck id, see "Anki Integration".
- The mnemonic picture takes its extension from the `Content-Type` of the answer, through `extensionOfContentType`. It knows `svg`, `png`, `jpg` and `gif` and throws on anything else, it never guesses. The other three types are known from the API metadata or the TTS output format.

Git attributes in `data/userdata/.gitattributes`. `data/userdata/README.md` explains them for that repo too.

- `*.jsonl merge=union`: git keeps the new lines of both sides. It needs no setup.
- `media/** merge=ours`: when both machines add the same media file, git keeps the local copy. Both copies come from the same source, so either one is fine.
- `ours` is not a built-in merge driver. Every clone needs `git -C data/userdata config merge.ours.driver true` once. Without it git ignores the attribute, and a media file that both machines added stops the pull with a conflict.

### Local Study Materials

Local notes and synonyms for any subject, written in the web UI. They never touch the WaniKani data. There is no script for this, the app writes the file.

- The file is `data/userdata/study_materials_extra.json`. It is an object keyed by the subject id as a string. WaniKani subject ids are unique across all types, so the file holds no type. A record has `meaning_note`, `reading_note` and `meaning_synonyms`, all optional.
- `getLocalStudyMaterials()` in `data-loader.ts` answers the records. It reads the file through `createReloadingFile`, so a hand edit or a `git pull` shows on the next request with no restart. A bad file fails every request that needs it until it is fixed. `initRepository` reads it once after the subject arrays, so a bad file still fails the start. The path is one exported constant, `LOCAL_STUDY_MATERIALS_PATH`.
- A file that is missing at start is created with `{}` by `ensureLocalStudyMaterialsFile()`, which only `initRepository` calls. This is the one data file the app itself writes, so it can make its own empty one; every other data file still fails the start, because only a download script can fill those. After the start a missing file is an error, `<path> is missing`: a git pull never deletes it, so it was deleted by hand. The getter fails, and a save fails and writes nothing instead of a new file with one record.
- The file is hand-written, so the load refuses everything the PATCH route refuses. Both sides use the same rules from `src/model/subject-utils.ts`: `localStudyMaterialValueProblem(field, value)` for the value, `readingNoteProblem(type)` for a `reading_note` on a type that has no reading. The field lists live in `src/model/wanikani.ts`: `LOCAL_STUDY_MATERIAL_FIELDS` for a stored record, `LOCAL_STUDY_MATERIAL_PATCH_FIELDS` for a patch. An entry with no field is refused too, because the app deletes such an entry and would never look at it.
- The subject rules need the loaded subject arrays, so they are not part of `readLocalStudyMaterials`. `checkLocalStudyMaterialSubjects(records)` runs on every reread of the file, inside the `parse` of the reloading file, and refuses an id that is no WaniKani subject, and a `reading_note` on a radical or on kana vocabulary. It is a separate step because `readLocalStudyMaterials` also runs inside every save, where a bad record of another subject must not fail the write. `findSubjectTypeById(id)` lives in `data-loader.ts` next to the arrays it scans, so this check needs no import cycle.
- Every enriched subject carries two records: `studyMaterial` from WaniKani and `localStudyMaterial` from this file. The server sends both. `mergeStudyMaterial(wanikani, local)` in `src/model/subject-utils.ts` joins them: a local note replaces the WaniKani note, local synonyms are appended to the WaniKani ones and duplicates are dropped.
- The client gets both records on purpose. Local synonyms need a remove button, and clearing a local note must show the WaniKani note again with no re-fetch.
- The three Anki note builders in `src/server/services/anki-connect.ts` call the same helper, so a note built now holds the merged values. A note that is already in the deck keeps its old text until the next `add-to-anki` or `bun run sync-anki-notes`.
- The kanji and vocabulary notes also have `alternative_meanings`, the one line under the main meaning on the short back. `getAlternativeMeanings(meanings, synonyms)` in `src/model/subject-utils.ts` builds it: the WaniKani alternatives first, then the synonyms. It drops a blank synonym and a synonym equal to a shown meaning (the primary one or an accepted alternative) or to an earlier synonym. The compare key is `meaningKey` (trim, lower case, NFC), the same one `UserSynonymsRow` uses. The short back does not tell WaniKani and user meanings apart. The Details view keeps the split in `extra_meanings` and `user_synonyms`.
- `MergedStudyMaterial` uses camelCase, because it is our own computed shape, like `meaningMnemonic`. `LocalStudyMaterial` stays snake_case, because it mirrors the WaniKani record field by field. Do not "fix" one to match the other.
- A patch never carries the synonym list. It names one word in `add_synonym` or in `remove_synonym`, and the server applies it to the record it just read from the file. So a client that holds an old record cannot delete a synonym it never saw, and no client-side reconciling of lists is needed. A patch that holds both fields removes first and adds after, and the editor only ever sends one of them. The notes stay whole values: a note is one text the user typed, and writing it over the old one is the point.
- `applyLocalStudyMaterialPatch(current, patch)` in `src/model/subject-utils.ts` is the one place that merges a patch into a record. The server writes its result, the client shows it while the request runs. It trims the notes and the added word, drops blank and repeated synonyms, deletes a field that ends up empty and returns `null` when no field is left. It cleans the whole merged record, not only the patched fields, so the file never holds an empty string, an empty list or an empty entry.
- `upsertLocalStudyMaterial` in `src/server/repository/study-material.ts` writes the whole object with `saveJsonAtomic` from `src/server/utils/json-utils.ts` (write `<path>.<uuid>.tmp`, rename it over the real file, unlink the temp file when a step throws). It keeps no memory copy: the next `getLocalStudyMaterials()` sees the new mtime and reads the file again. A failed write leaves the file unchanged.
- `saveJsonAtomic` exists twice, here and in `scripts/lib/llm-utils.ts`. The scripts must not import from `src/server/`, so the copy stays on purpose. Change both when you change one.
- Every upsert runs in one module-level promise queue. Two saves at the same time would otherwise start from the same old object, and one change would be lost. The caller's promise stays out of the chain (`const run = queue.then(step); queue = run.catch(() => {}); return run;`). So the caller sees the error, and the next save still starts from the last good state.
- The upsert reads the file again inside that queue with `readLocalStudyMaterials()` and merges the patch onto the fresh content. The user also edits this file by hand and pulls it from git while the server runs. A read error fails the save, because writing an old copy would drop those edits with no error.
- `findSubjectTypeById(id)` in `data-loader.ts` scans the four subject arrays. The route calls it before the write, because a `reading_note` for a radical or for kana vocabulary is a 400. The upsert itself trusts the id.
- The web UI edits the values in place. `NoteSection.tsx` has a pencil button and a textarea, Esc cancels and Cmd+Enter saves. `UserSynonymsRow.tsx` has an inline input and a small × on every local chip. Both are optimistic: they show the new value at once, send the patch, and on an error put the old value back and show a `toast.error`.
- One subject can render on several cards at once. A radical under two kanji of one word gets one card per kanji. So the saved records live in one module-level store, `src/client/hooks/useLocalStudyMaterial.ts`, and not in the components. Per-card state would show one card a value the other card saved a moment ago. A card reads the store first and falls back to the record the server sent.
- The store keeps one promise chain per subject id, like the server queue. Two saves for one subject would otherwise race: the slower answer would land on top of the newer one. Saves for different subjects still run at the same time. It holds two maps: `confirmed`, the answer of the last finished save, and `shown`, which is `confirmed` with every save that is still in flight applied on top. Every published `shown` map is built from the current `shown` object, so an entry another subject saved meanwhile stays.
- `confirmed` is a real `Map` and not an object, and `shown` is only ever spread and published in the same tick. In an object literal the spread runs **first**, so an `await` after it writes back a copy of the shared state taken before the request started, and the answer of another subject in between is lost. Never put an `await` inside an object literal that also spreads shared state.
- The store also holds `origins`: the `fromServer` record each subject's session started from. A render with another value means the file changed outside this tab (a hand edit, a `git pull` of `data/userdata`). That record always wins: the hook shows it instead of the session record, and the next save drops the confirmed entry first. There is no exception for a save that is still running, and that is on purpose. The rule stays one sentence, and the cost is only on screen: an answer that lands after such a render can stay hidden until the next fetch. Nothing is lost, because the patch is an operation the server merges onto the file.
- The new `shown` value is published **before** the save enters the queue. Publishing it inside the queue would leave a second edit of the same subject invisible until the first request answers, which is the opposite of an optimistic UI.
- `saveLocalStudyMaterial` answers `{ done, isLatest }`. `done` is the request promise. `isLatest()` is false once a later save of the same subject and the same fields started, and `NoteSection` asks it before it reopens the editor with the draft of a failed save. The count sits in the store and not in the component, because two cards can show the same note, and a per-instance count would call an old draft the newest one.
- `waitForLocalStudyMaterialSaves()` takes no subject: it waits for every open save and rejects when one of them failed. `addToAnkiAfterSaves` calls it, because adding a word rewrites its kanji and radical notes too, so an open save of any subject can reach the Anki fields. On a failed save the add does not run at all, and the toast says why.
- A note keeps its line breaks. The Anki field holds the raw text, so the `.note` rule of all three templates sets `white-space: pre-wrap`. Without it Anki shows a multi-line note as one long line.
- Anki renders a note field as HTML. `mergeStudyMaterialForAnki` in `anki-connect.ts` escapes `&`, `<` and `>` in the two notes and in every synonym before they go into a field. Without it a note like "use < for the smaller one" loses everything after the `<`. `alternative_meanings` is the one field built from the raw synonyms: the dedup runs first and the escape after, because an escaped `a &amp; b` never matches a raw `a & b`. `mergeStudyMaterial` itself must keep the raw text: the client renders the same values through React, which escapes on its own.
- The editors do not call `mergeStudyMaterial`, they need the two records apart. They must still follow its rules. A local note falls back with `||` and not `??`, so an empty note in a hand-edited file shows the WaniKani note on screen and in Anki alike.
- `PATCH /api/study-materials` is the only route that writes user data, so `createApp()` in `src/server/app.ts` allows CORS for the vite dev client only (`http://localhost:5173`, `http://127.0.0.1:5173`). With the default `cors()` any open page could rewrite the notes of any subject id. A built client is served from the same origin and needs no CORS. The app is built in `app.ts` and not in `index.ts`, so a test can build one without the `initRepository()` that `index.ts` runs at import time.
- The field lists live once, in `src/model/wanikani.ts`. `LOCAL_STUDY_MATERIAL_FIELDS` names what a record holds and builds the `LocalStudyMaterial` type, `LOCAL_STUDY_MATERIAL_PATCH_FIELDS` names what a patch holds and builds `LocalStudyMaterialPatch`. The `field` prop of `NoteSection`, the PATCH route and the file load all read them. A copy in the route would answer a new field with a silent 400.
- `SearchResult.tsx` gives the three top-level cards a `key` with the subject id. Without it React reuses the same component instance on a new search, and the open editor would keep the draft of the last subject. The nested cards already sit in keyed wrappers. `SearchResult.test.tsx` guards it: it opens an editor, renders another subject in the same place and expects no editor.
- A failed save shows `saveErrorMessage(err)` from `src/client/utils/request-error.ts`, the same module the search page uses. So a stopped dev server reads "Could not reach the server" everywhere, instead of the raw fetch `TypeError` in the editors.
- `noteProps(subject, field)` and `synonymProps(subject)` in `src/client/components/card-components/study-material-props.ts` build the editor props. The cards never pick the fields apart by hand, so a `reading_note` editor cannot end up with a `meaning_note` value.
- Kana vocabulary has no card of its own. `SearchResult.tsx` sends it to `VocabularyCard`, which hides the reading section for it, so it gets a meaning note editor only.
- A new download of `study_materials.json` keeps these values, they live in their own file.

### iKnow Vocabulary Import

`bun run add-iknow-vocab -- --limit <n>` walks the iKnow Core 1000 course files in `data/userdata/iknow/` and adds the next words to the Anki vocabulary deck through the dev server API. CLI options: `--base-url <url>`, `--limit <n>` (default 15), `--dry-run`, `--help`.

`data/userdata/iknow-vocabulary-status.json` holds the place: `current` file, `files[name].index` (the **next** item to process), and `problems`. The script saves it with `saveJsonAtomic` after every word, so a stop in the middle loses nothing. It rolls over to the next course file on its own, and one run never spans two files.

Like `sync-anki-notes`, it calls `/api/anki-sync` once at the start, in a dry run too, before it reads the Anki word list, adds every word with `sync: false`, and calls `/api/anki-sync` once more at the end. A failed start sync stops the run, because every lookup after it would be stale. Syncing per word would run a full AnkiWeb sync 15 times, and a failed sync would answer `ok: false` for a word that is already written — so the word would land in `problems` and not use up the budget, and a `--limit 15` run could add more than 15 words.

The limit counts words really added. A word already in Anki, or already in `problems`, is skipped for free.

A word in `problems` is never revisited — the saved index has already moved past it. Resolve one by adding it directly, then drop its entry by hand.

An add that fails with a note type field mismatch (`/add-to-anki` answers `reason: "fields"`) stops the run. The word is not recorded and the saved index stays on it. Every later word would fail the same way, so recording them would burn a whole course file into `problems`. The words added before the stop are still synced and counted in the summary, and the script prints the fix steps and exits 1. This happens after a change to `*_EXPECTED_FIELDS` until the user fixes the note type fields.

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

Adding or re-syncing a word always creates or refreshes its component kanji and radicals too. This is intended: every word in Anki must have its kanji and radicals there. So the script adds every word first. Then it adds only the kanji notes that no word add wrote: `/add-to-anki` answers with the kanji it wrote in `data.kanji`, and the script collects those characters. Last it adds only the radical notes that no word or kanji add wrote, by the names in `data.radicals`. Such a name is the primary meaning, the same value the radical note holds in `primary_name`. This pass reaches a radical that was added on its own from the web UI and has no kanji in the deck. `pickNotesToRefresh` in `scripts/lib/note-refresh.ts` drops the refreshed notes and applies the rest of `--limit` for both passes. The first failed add stops the run with exit 1 and no AnkiWeb sync, because a failed word leaves its kanji unrefreshed. The script syncs with AnkiWeb once at the start, before it reads the note list, adds every note with `sync: false`, and syncs once more at the end, so a full run is two AnkiWeb syncs, not one per note. A failed start sync stops the run, because every lookup after it would be stale. A dry run syncs too: its list is only true after a sync, and a sync never writes a note of ours, so the dry-run line says `No notes written`.

## Environment

Two `.env` files, each with a `.env.example` to copy from:

- **`.env`** (project root) — Azure TTS credentials for context sentence audio. Required: `AZURE_TTS_KEY`, `AZURE_TTS_REGION` and `AZURE_TTS_VOICES` must all be set. `readAzureTtsConfig()` throws `Missing <name> in the root env file` for the first one that is missing. `bun run preview` then fails at start. `bun run dev` starts, because vite loads the server entry only on the first `/api` request, so that first request fails and the dev server log names the missing variable. `AZURE_TTS_VOICES` holds the Dragon HD voices `ja-JP-Nanami:DragonHDLatestNeural,ja-JP-Masaru:DragonHDLatestNeural`, the region must support them (`westeurope` does). Both machines need the same `AZURE_TTS_VOICES` list, because the voice is part of the sentence clip name. Output is MP3 at 24 kHz, 160 kbit/s.
- **`scripts/.env`** — WaniKani API token (required for download scripts) and the LLM settings `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (for verb conjugation / sentence reading generation). `LLM_MODEL` must be a model the endpoint offers, the scripts fail at the first request otherwise.

Get your WaniKani token from: https://www.wanikani.com/settings/personal_access_tokens

## API Documentation

- `docs/wanikani-api.md` - Wanikani API reference (endpoints, auth, pagination, data structures)
- `docs/anki-connect-typescript-api.md` - AnkiConnect API for Anki deck operations
- `docs/anki-decks-fields.md` - Anki deck field definitions for each subject type
- `docs/backlog.md` - To-dos stashed for the future. Pick from it when choosing what to work on next. When the user asks to add a TODO item, add it here. The list has no numbers, so name an item by quoting its first words, never by its position
- `docs/hosting-on-linux.md` - Running the app with a headless Anki on a Linux box, so cards can be added from a phone

## Anki Integration

AnkiConnect client is in `src/server/services/anki-connect.ts`. Card templates are in `src/anki-templates/`.

- AnkiConnect endpoint: `http://127.0.0.1:8765`
- The source of truth for what an AnkiConnect action does is the installed add-on, `~/Library/Application Support/Anki2/addons21/2055492159/__init__.py`. The FooSoft copy on GitHub is old, the add-on moved to git.sr.ht. Read the installed file before trusting a claim about an action; a reviewer cited the old copy and got `sync` wrong
- Two Anki clients write the same collection, the Mac and the Linux box. `findNotes` only sees the local collection and AnkiWeb never merges two notes into one, so the server syncs with AnkiWeb before every note lookup. The sync makes the lookup current, it is not a lock: a `sync: false` add trusts the caller, and two adds of the same subject on both machines at the same second can still create two notes. One person uses both machines, so both are accepted. A batch caller sends `sync: false` and syncs once before its first lookup and once after its last write. The installed AnkiConnect `sync` calls `col.sync_collection` and returns after the collection sync is done (verified in the add-on source, Nov 2025 build), so the lookup right after it sees AnkiWeb's state
- Use `toast.promise()` from `react-hot-toast` for async operations with loading/success/error feedback. The optimistic editors are the exception: they show the new value at once, so they need no loading toast and only call `toast.error` when the save fails
- Store media files in Anki with a deck ID prefix to avoid file name collisions: `{deckId}_{slug}_{urlHash}.svg`. The file in `data/userdata/media/` has no prefix, so one cached file serves every deck (see "Two Machines"). `shortHash` (the first 8 hex chars of the SHA-1) and `hashNumber` live in `src/server/utils/hash.ts`
- An audio field holds the complete `[sound:name.mp3]` tag, never a bare file name, and the template renders the field as is. Anki's Check Media keeps only files that a field references by a `[sound:]` tag or an `<img>`, and deletes the rest. On 2026-09-07 it deleted every sentence clip because that field held bare names
- The radical `mnemonic_image` field holds the full `<img src="{deckId}_{slug}_mnemonic_{urlHash}.{ext}" class="mnemonic-img">` tag of a media file, like `character` holds the SVG tag, for the same Check Media reason. It is `""` when the radical has no picture
- Reading audio: one gender per card, picked from the hash of the primary reading (`hashNumber(primaryReading) % 2`), the other gender when the first has no MP3. The reading and not the slug is hashed, so the gender stays independent of the sentence voice. All readings of it go into the one `reading_audio_*` field as `[sound:]` tags separated by a space, primary reading first, so Anki plays them in a row. The file name is `{deckId}_{slug}_{gender}_{hash}.mp3`, the hash is `shortHash` of the reading
- Sentence audio: the voice is `pickSentenceVoice(voices, slug)`, picked from the hash of the slug, so a word always gets the same voice. The clip name is `{deckId}_{slug}_{ssmlHash}.mp3`, the hash covers the exact SSML from `buildSentenceSsml`. A changed sentence, voice list or SSML format gives a new clip by itself. Azure TTS gets the plain kanji sentence, not the kana reading. The generated kana readings in `data/sentence_readings.json` only fill the furigana field. The HD voices read most sentences right but not rare readings, 外面 came out as がいめん. The planned fix is `docs/plans/tts-with-ssml.md`: one `<sub alias>` per kanji block from the reviewed readings
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
- Prefer a long clear name over a short jargon word. A longer name is fine when it says exactly what the value is: `nameWithoutExtension`, not `stem`, `baseName` or `key`
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

| Method | Path                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/search?type=&q=`  | Search by type (`radical`, `kanji`, `vocabulary`) and query string. Falls back to name/meaning search if character search fails. 400 if params missing, 404 if not found, 200 with `{ found: true, data }` on success                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| GET    | `/anki-notes?type=` | List all Anki notes for a subject type (`radical`, `kanji`, `vocabulary`). Returns `{ ok: true, data: AnkiNoteItem[] }`. 400 if type missing/invalid.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| POST   | `/add-to-anki`      | Add subject to Anki. Body: `{ id: number, type: SubjectType, sync?: boolean }`. Looks up enriched subject, creates/updates Anki notes for the subject and its components (radicals, kanji), reads each media file from `data/userdata/media/` or downloads it once. Syncs with AnkiWeb before the note lookup and again after the write unless `sync` is `false`. A failed sync before the write answers `{ ok: false, error }` and writes nothing. 400 if params missing, 404 if subject not found, 200 with `{ ok: true, data: AnkiAddResult }` on success, 200 with `{ ok: false, error }` on AnkiConnect failure, with `reason: "fields"` added when a note type field list does not match `*_EXPECTED_FIELDS` |
| POST   | `/anki-sync`        | Sync the Anki collection to AnkiWeb once. No body. 200 with `{ ok: true }`, 200 with `{ ok: false, error }` on AnkiConnect failure. The batch scripts add every note with `sync: false` and call this once before their first lookup and once at the end                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PATCH  | `/study-materials`  | Save a local note or one synonym for one subject. Body: `{ id: number, meaning_note?: string, reading_note?: string, add_synonym?: string, remove_synonym?: string }`. The synonym list is never sent, the server applies the operation to the record it reads from the file. A note sent as `""` is deleted, an entry with no field left is removed. 400 if `id` is not an integer, no field besides `id` is sent, a key is unknown (`meaning_synonyms` is), a value is not a string, or `reading_note` is sent for a radical or kana vocabulary. 404 if the subject is not found. 500 if the write fails. 200 with `{ ok: true, data: LocalStudyMaterial \| null }`, `data` is `null` when the entry was removed |

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

Server code should be meaningfully verbose about the steps it performs. Log high-level operations (search requests, Anki add/update flow, media downloads) with `[API]` or `[Anki]` prefixes, and every media cache hit or miss with `[Media]`, so the process is easy to follow in the console. Avoid logging large data blobs (base64, full field objects) — log sizes instead. Each key step (looking up a note, creating/updating, downloading media, syncing) should produce a short log line.

### Server Code Compatibility

The vite dev server (`@hono/vite-dev-server`) runs in Node.js, not Bun. Use `fs/promises` instead of `Bun.file()` for file operations in server code:

```ts
import { readFile } from "fs/promises";
const data = JSON.parse(await readFile("./data/userdata/file.json", "utf-8"));
```

### Caching with Parallel Operations

A file the server writes must stay right when two requests run at once, and when the other machine changes it. Never load such a file once and write the whole memory copy back later: one writer drops the change of the other, and a pulled change is overwritten. Use one of these instead:

- An append-only file, read through `createReloadingFile` from `src/server/utils/reloading-file.ts`. The mnemonic image registry in `src/server/repository/mnemonic-image-fetcher.ts` appends one JSONL line per scraped page. Its `pendingFetches` map lets two lookups of one page at the same time share one scrape.
- One file per item, written with `writeFileAtomic`, like the media cache in `src/server/repository/media-cache.ts`.
- A read, merge and write inside a module-level promise queue, with `saveJsonAtomic`, like `upsertLocalStudyMaterial`.

See "Two Machines" for the full rules.

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

The project has two git repositories: the main one and `data/userdata/`. A request to commit, push or pull covers both of them, unless the user names one.

- Pull both repos first, with a merge (`git pull --no-rebase`). A server also commits and pushes `data/userdata/`, so the local copy is often behind.
- When a local change in `data/userdata/` touches a file the pull also changes, commit it first and then pull. `mnemonic-images.jsonl` then merges by itself through `merge=union`, and a media file that both sides added merges through `merge=ours` (see "Two Machines"). A conflict in `media/` means the clone misses `git config merge.ours.driver true`. Any other conflict, like one in `study_materials_extra.json`, is resolved by hand.
- Commit and push each repo on its own.
- Afterwards, return the working directory to the main project root.

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
- Preload handles `mock.module("fs/promises")` (an in-memory file map in front of the real `readFile`) and lazy repository init — Bun's `mock.module()` is process-global, so it must live in one place
- The preload seeds the two fixtures from `src/test/fixtures/` into the mock under their real paths, `./data/userdata/mnemonic-images.jsonl` and `./data/userdata/study_materials_extra.json`. It seeds them at start and again in `resetFsMock()`, so no test depends on user-specific data. A read of those two paths, or of a path under `data/userdata/media/`, never reaches the real disk: a removed entry answers `ENOENT`. The check compares the exact path, because a fixture file has the same base name as its seeded path
- The `fs/promises` mock keeps the written files in a map, so a read after a write sees the new content like a real disk does. The study material upsert reads the file on every save, so without it a second save would start from the fixture again. The map keys go through `path.normalize`, so `./data/x` and `data/x` are one file. The map holds `string | Buffer`, and `readFile` without an encoding answers a `Buffer`. `setFileContent(path, data)` puts content there without recording a write, for a change made outside the app; `setStudyMaterialFile(file)` in `src/test/study-material-fixture.ts` wraps it for that one file
- The `fs/promises` mock also has `appendFile`, `rename`, `unlink`, `stat`, `readdir` and a no-op `mkdir`. An atomic save shows up in `writeCalls` under the real path: `writeFile` records the `<path>.<uuid>.tmp` path, `rename` moves that entry to the real path, `unlink` drops it. A failed save leaves no `.tmp` entry behind. `writeCalls[].data` is `string | Buffer`, so a test wraps it in `String()` before it parses it
- The mocked `stat` answers `{ mtimeMs, size }`. `mtimeMs` is a version number that grows on every `writeFile`, `appendFile`, `rename` and `setFileContent`, and `resetFsMock()` never resets it. So `createReloadingFile` sees every change, also the seed after a reset. `readdir` lists the files of the map directly under a folder
- `setFsError(op, err)` makes one mocked op throw: `readFile`, `writeFile`, `appendFile`, `rename`, `unlink`, `stat` or `readdir`. It is the only way to test a failed read or write, because `mock.module` is process-global and set once. `resetFsMock()` clears it again
- `bun test` runs every file in one process, so module-level state survives a file. A file that writes through the fs mock, or changes a seeded file, calls `resetFsMock()` in `beforeEach` and in `afterEach`. Otherwise its media files, registry lines and study material records leak into the next file
- **Repository tests** (`src/server/repository/__tests__/`): test repository functions directly, use a simple fetch mock from `setup.ts`
- **Script unit tests** (`scripts/lib/__tests__/`): test the pure script helpers directly, no mock needed
- **API E2E tests** (`src/server/__tests__/`): test full API through `api.request()` (Hono handles directly, no HTTP server), use `src/test/fetch-interceptor.ts` which routes by URL pattern (AnkiConnect, WaniKani SVGs/audio/pages)
- The fetch interceptor answers every AnkiConnect action with success. `setAnkiError({ action, message, onCall })` makes one action answer an error. `onCall` picks one call of it, counted from 1, so a test can fail the second `sync` of an add and keep the first. `resetFetchInterceptor()` clears it and the call counts. `externalFetches` lists every URL that is not AnkiConnect, so a test can check that a cache hit made no request
- The preload also calls `installDom()` from `src/test/dom.ts`, which puts one happy-dom window on `globalThis`. It must run before any test file imports `react-dom`: react-dom reads the DOM globals when it loads, and without them its change events never reach `onChange`
- **Client tests** (`src/client/**/__tests__/`): the api layer installs its own `createFetchMock` from `src/test/fetch-utils.ts`. A view state is checked with `renderToStaticMarkup` from `react-dom/server`. For behavior, `src/test/render.tsx` has `mount`, `click`, `typeInto`, `pressKey` and `settle`: it renders with `createRoot`, dispatches real DOM events inside `flushSync`, and `settle()` awaits the save. `mountCard(element)` wraps the card in a `SearchContext.Provider`, on the first render and on every `rerender`, because `RelatedSubjectsSection` throws without one
- `installApiMock()` from `src/test/api-mock.ts` answers the study material saves. It is called once at the top of a test file and registers the whole lifecycle of that file: it clears itself and the client store before each test, unmounts every mounted view and clears the store after each test, and puts the old `fetch` back at the end. So a failed assertion still leaves no live React root and no saved record behind. Its `answerLater(id, data)` and `failLater(id, message)` hold an answer back until the test calls `resolve()`, which is how the store tests put two saves in flight and choose the order of the answers
- `src/test/study-material-fixture.ts` holds `loadStudyMaterialFixture()`, `setStudyMaterialFile()`, `lastWrite()` and `resetStudyMaterialState()` for every file that writes local study materials. `resetStudyMaterialState()` is just `resetFsMock()`, which seeds the file again
- Each test type installs its own fetch mock at file top level — no conflict between them
- The preload sets the three `AZURE_TTS_*` values as plain assignments, not `??=`, because every add reads them. `bun test` loads the root env file on its own, and the real voice list would change the sentence clip names in the snapshots from machine to machine. `azure-tts.test.ts` saves and puts back its own values

### Manual Testing

After making changes, verify functionality in browser at http://localhost:5173 (dev server must be running).

### Test Scenarios

See `docs/prompts/test-scenarios.md` for manual test scenarios.
