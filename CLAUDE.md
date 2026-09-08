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
    utils/              # Client-side utility functions (non-React)
  server/               # Hono backend
    index.ts            # Server entry, middleware setup
    api.ts              # API routes (exports ApiType for client)
    utils/              # Server-side utility functions
    repository/         # Data access layer (singleton, use initRepository() first)
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
    preload.ts            # Shared mock.module + repository init (configured in bunfig.toml)
    fetch-interceptor.ts  # Fetch mock for API E2E tests (AnkiConnect, WaniKani media/pages)
    fetch-utils.ts        # Shared fetch mock utilities

scripts/                # Utility scripts. Top level holds only entry points, shared code goes to lib/
  download-subjects.ts
  download-study-materials.ts
  generate-verb-conjugations.ts  # LLM-powered verb conjugation generator
  generate-sentence-readings.ts  # LLM-powered kana readings for context sentences
  sync-anki-fields.ts            # Add missing note-type fields to Anki (interactive, needs a TTY)
  sync-anki-templates.ts         # Sync Anki templates to Anki via AnkiConnect
  sync-anki-notes.ts             # Re-generate all Anki notes through the dev server API
  lib/                           # Modules shared by the scripts, never run directly
    anki-templates.ts            # Shared by the two sync scripts: template table, ankiInvoke, field diff
    anki-template-fields.ts      # Pure markdown parsing of the template files (unit-tested)
    format-error.ts              # formatError(err) shared by all scripts
    generator-cli.ts             # Shared by the two LLM scripts: flags, log, summary, stop rule
    llm-utils.ts                 # Shared by the two LLM scripts: chunk, JSON answers, atomic save
    vocabulary-data.ts           # Shared by the two LLM scripts: load vocabulary, primary reading
    sentence-reading-check.ts    # Order check of a kana reading against its sentence (unit-tested)
    __tests__/                   # Unit tests for the pure script helpers, fixtures in fixtures/
  .env                  # Script-specific env vars (WANIKANI_API_TOKEN, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)
                        # Loaded via --env-file in package.json scripts

data/                   # Data files
  userdata/             # User-specific data, gitignored
                        #   Downloaded WaniKani subjects, study materials, mnemonic image cache
                        #   Populated via download scripts
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
bun run generate-verb-conjugations     # Generate verb conjugations via LLM
bun run generate-sentence-readings     # Generate kana readings for context sentences via LLM
bun run sync-anki-fields               # Add missing note-type fields to Anki (interactive, needs a TTY)
bun run sync-anki-templates            # Sync Anki templates to Anki
bun run sync-anki-notes                # Sync all Anki vocabulary notes (requires dev server running)
```

The verb conjugation script has CLI options: `--limit <n>`, `--batch-size <n>` (default 20), `--dry-run`, `--show-prompt`, `--help`

The sentence readings script has CLI options: `--limit <n>`, `--batch-size <n>` (default 20), `--dry-run`, `--show-prompt`, `--help`

Both LLM scripts only fill ids that are missing in their data file, so a rerun continues where the last run stopped. They send one JSON array of items per request, check every answer item, save after every batch, and stop after 3 batches in a row without a usable answer. An item that fails a check is logged and skipped, a rerun picks it up. `--batch-size 1` helps with the last stubborn items. The model is `LLM_MODEL` from `scripts/.env`

The sync Anki notes script has CLI options: `--base-url <url>`, `--limit <n>`, `--dry-run`, `--help`

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
- Use `toast.promise()` from `react-hot-toast` for async operations with loading/success/error feedback
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
- A failed request must never fall into an "empty result" state. `src/client/api.ts` throws `HttpStatusError` for a bad status and lets the fetch `TypeError` of a dead server through. `searchErrorMessage` in `src/client/utils/search-error.ts` turns a thrown value into the text the user sees, and the page keeps it in its own `error` state. A missing item and a broken server must look different on screen

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

| Method | Path                | Description                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/search?type=&q=`  | Search by type (`radical`, `kanji`, `vocabulary`) and query string. Falls back to name/meaning search if character search fails. 400 if params missing, 404 if not found, 200 with `{ found: true, data }` on success                                                                                                                                                                                                         |
| GET    | `/anki-notes?type=` | List all Anki notes for a subject type (`radical`, `kanji`, `vocabulary`). Returns `{ ok: true, data: AnkiNoteItem[] }`. 400 if type missing/invalid.                                                                                                                                                                                                                                                                         |
| POST   | `/add-to-anki`      | Add subject to Anki. Body: `{ id: number, type: SubjectType, sync?: boolean }`. Looks up enriched subject, creates/updates Anki notes for the subject and its components (radicals, kanji), downloads media, then syncs to AnkiWeb unless `sync` is `false`. 400 if params missing, 404 if subject not found, 200 with `{ ok: true, data: AnkiAddResult }` on success, 200 with `{ ok: false, error }` on AnkiConnect failure |
| POST   | `/anki-sync`        | Sync the Anki collection to AnkiWeb once. No body. 200 with `{ ok: true }`, 200 with `{ ok: false, error }` on AnkiConnect failure. `sync-anki-notes` adds every note with `sync: false` and calls this once at the end                                                                                                                                                                                                       |

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
- **Repository tests** (`src/server/repository/__tests__/`): test repository functions directly, use a simple fetch mock from `setup.ts`
- **Script unit tests** (`scripts/lib/__tests__/`): test the pure script helpers directly, no mock needed
- **API E2E tests** (`src/server/__tests__/`): test full API through `api.request()` (Hono handles directly, no HTTP server), use `src/test/fetch-interceptor.ts` which routes by URL pattern (AnkiConnect, WaniKani SVGs/audio/pages)
- **Client tests** (`src/client/__tests__/`, `src/client/utils/__tests__/`): test the client api layer and the pure client helpers. `src/client/__tests__/api.test.ts` replaces `globalThis.fetch` with `createFetchMock` from `src/test/fetch-utils.ts`, keeps the answer in a `let` handler so each test sets its own, and puts the real `fetch` back in `afterAll`. The project has no React component tests, so components are checked by hand
- Each test type installs its own fetch mock at file top level — no conflict between them
- The preload also replaces `Math.random` with one seeded generator shared by the whole run, and exports `resetRandom()`. Each vocabulary add consumes two values (voice gender, sentence voice), so a test file that snapshots audio fields must call `resetRandom()` in `beforeEach`. Then test order does not matter and a single test can run alone

### Manual Testing

After making changes, verify functionality in browser at http://localhost:5173 (dev server must be running).

### Test Scenarios

See `docs/prompts/test-scenarios.md` for manual test scenarios.
