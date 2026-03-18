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
  model/                # Shared TypeScript types and utilities
    wanikani.ts         # Wanikani data types
    subject-utils.ts    # Shared utilities (getPrimaryMeaning, findByIds, buildSubjectReferences, etc.)
    radical-utils.ts    # Radical-specific utilities
    kanji-utils.ts      # Kanji-specific utilities
    vocabulary-utils.ts # Vocabulary-specific utilities

  test/                   # Shared test infrastructure
    preload.ts            # Shared mock.module + repository init (configured in bunfig.toml)
    fetch-interceptor.ts  # Fetch mock for API E2E tests (AnkiConnect, WaniKani media/pages)
    fetch-utils.ts        # Shared fetch mock utilities

scripts/                # Utility scripts
  download-subjects.ts
  download-study-materials.ts
  generate-verb-conjugations.ts  # LLM-powered verb conjugation generator
  generate-sentence-readings.ts  # LLM-powered kana readings for context sentences
  sync-anki-templates.ts         # Sync Anki templates to Anki via AnkiConnect
  .env                  # Script-specific env vars (WANIKANI_API_TOKEN, LLM_BASE_URL, LLM_API_KEY)
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
bun run sync-anki-templates            # Sync Anki templates to Anki
bun run sync-anki-notes                # Sync all Anki vocabulary notes (requires dev server running)
```

The verb conjugation script has CLI options: `--limit <n>`, `--dry-run`, `--show-prompt`, `--help`

The sentence readings script has CLI options: `--limit <n>`, `--dry-run`, `--show-prompt`, `--help`

The sync Anki notes script has CLI options: `--base-url <url>`, `--limit <n>`, `--dry-run`, `--help`

### Anki Template Development

After editing Anki card templates in `src/anki-templates/`, **always** run:

```bash
bun run sync-anki-templates
```

to sync changes to Anki via AnkiConnect. Requires Anki to be running with AnkiConnect plugin.

**Important:** Always sync templates immediately after modifying them - do not wait for the user to ask.

### Anki Note Generation

After modifying note generation logic in `src/server/services/anki-connect.ts` (e.g., changing field content, adding new fields), suggest running the sync script to update all existing notes in Anki:

```bash
bun run dev                # Start dev server (if not already running)
bun run sync-anki-notes    # Re-generate all Anki notes
```

Requires Anki to be running with AnkiConnect plugin.

## Environment

Two `.env` files, each with a `.env.example` to copy from:

- **`.env`** (project root) — Azure TTS credentials for context sentence audio. Optional — if missing, sentence audio is silently skipped.
- **`scripts/.env`** — WaniKani API token (required for download scripts) and LLM credentials (for verb conjugation / sentence reading generation).

Get your WaniKani token from: https://www.wanikani.com/settings/personal_access_tokens

## API Documentation

- `docs/wanikani-api.md` - Wanikani API reference (endpoints, auth, pagination, data structures)
- `docs/anki-connect-typescript-api.md` - AnkiConnect API for Anki deck operations
- `docs/anki-decks-fields.md` - Anki deck field definitions for each subject type

## Anki Integration

AnkiConnect client is in `src/server/services/anki-connect.ts`. Card templates are in `src/anki-templates/`.

- AnkiConnect endpoint: `http://127.0.0.1:8765`
- Use `toast.promise()` from `react-hot-toast` for async operations with loading/success/error feedback
- Store media files with deck ID prefix to avoid filename collisions: `{deckId}_{slug}.svg`
- Mnemonic HTML tags (`<radical>`, `<kanji>`, etc.) must be pre-styled using `styleMnemonicHtml()` before storing
- Anki templates support JavaScript for dynamic behavior (e.g., font scaling, keyboard shortcuts)
- Variable-length data (like radical lists) should be pre-rendered as styled HTML for consistency
- Anki CSS supports `@media (prefers-color-scheme: dark)` for dark mode styling

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
- New API endpoints follow the same parameter conventions as existing ones (e.g., `?type=` for subject type filtering)
- API responses return flat, complete data — let consumers filter or transform as needed

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

| Method | Path                | Description                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/search?type=&q=`  | Search by type (`radical`, `kanji`, `vocabulary`) and query string. Falls back to name/meaning search if character search fails. 400 if params missing, 404 if not found, 200 with `{ found: true, data }` on success                                                                                                                                         |
| GET    | `/anki-notes?type=` | List all Anki notes for a subject type (`radical`, `kanji`, `vocabulary`). Returns `{ ok: true, data: AnkiNoteItem[] }`. 400 if type missing/invalid.                                                                                                                                                                                                         |
| POST   | `/add-to-anki`      | Add subject to Anki. Body: `{ id: number, type: SubjectType }`. Looks up enriched subject, creates/updates Anki notes for the subject and its components (radicals, kanji), downloads media. 400 if params missing, 404 if subject not found, 200 with `{ ok: true, data: AnkiAddResult }` on success, 200 with `{ ok: false, error }` on AnkiConnect failure |

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
- When a test has many `expect()` calls verifying an object's shape, snapshot the whole object instead
- When a snapshot exceeds 50 lines, use file-based `toMatchSnapshot()` instead of inline
- Repository tests use real data files but mock `globalThis.fetch` and `writeFile` to avoid side effects

### Test Architecture

- `bunfig.toml` configures `src/test/preload.ts` as a shared preload for all tests
- Preload handles `mock.module("fs/promises")` (real readFile, mock writeFile) and lazy repository init — Bun's `mock.module()` is process-global, so it must live in one place
- **Repository tests** (`src/server/repository/__tests__/`): test repository functions directly, use a simple fetch mock from `setup.ts`
- **API E2E tests** (`src/server/__tests__/`): test full API through `api.request()` (Hono handles directly, no HTTP server), use `src/test/fetch-interceptor.ts` which routes by URL pattern (AnkiConnect, WaniKani SVGs/audio/pages)
- Each test type installs its own fetch mock at file top level — no conflict between them

### Manual Testing

After making changes, verify functionality in browser at http://localhost:5173 (dev server must be running).

### Test Scenarios

See `docs/prompts/test-scenarios.md` for manual test scenarios.
