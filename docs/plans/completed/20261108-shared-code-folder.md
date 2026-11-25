# Shared Code Folder `src/shared/`

## Overview

Three parts of the project import code from each other: the server (`src/server/`), the web client (`src/client/`) and the scripts (`scripts/`). Today the code they share lives in three folders: `src/model/` (8 files), `src/utils/` (only `mnemonic-utils.ts`) and `src/config/` (only `theme.ts`). Nothing marks these folders as shared. Nothing stops a script from importing `src/server/`, except a sentence in `CLAUDE.md`.

The rule of this change: **code that two or more parts use lives in `src/shared/`**. This covers code that two parts import, and code that two parts hold as a copy.

The change does four things:

1. It moves the three folders into `src/shared/`, grouped by topic, with a new `@shared/*` alias. Every import uses the alias, also in the scripts.
2. It puts each copy between the parts into `src/shared/` once: the data file paths, the deck type, the atomic JSON save, `readJson`, the error message helper and the AnkiConnect call.
3. The scripts call the dev server through a typed Hono client (`hc<ApiType>`), like the web client. So the 4 hand-written route answer types in `scripts/` go away.
4. An ESLint rule checks the borders. The check is the real win, not the new names.

It runs after the text vocabulary import feature is merged, as its own change. It must cover the new files of that feature.

## Context (from discovery)

Users of each shared file today (non-test code, by part):

| File                         | server | client | scripts | shared |
| ---------------------------- | ------ | ------ | ------- | ------ |
| `model/wanikani.ts`          | 9      | 15     | 10      | 6      |
| `model/subject-utils.ts`     | 8      | 5      | 5       | 1      |
| `model/kanji-utils.ts`       | 1      | 1      | 0       | 0      |
| `model/radical-utils.ts`     | 1      | 2      | 0       | 0      |
| `model/vocabulary-utils.ts`  | 1      | 1      | 1       | 0      |
| `model/custom-subject-utils` | 4      | 0      | 3       | 0      |
| `model/validation-error.ts`  | 3      | 0      | 0       | 2      |
| `model/anki-models.ts`       | 1      | 0      | 2       | 0      |
| `utils/mnemonic-utils.ts`    | 1      | 2      | 0       | 0      |
| `config/theme.ts`            | 0      | 5      | 0       | 1      |

Every file is used by two parts or more. `theme.ts` reaches the server through `mnemonic-utils.ts`. `validation-error.ts` reaches the scripts through `custom-subject-utils.ts`.

Import styles today: 83 import lines use `@/model/` (61 in code, 22 in tests), 6 use `@/config/`, 3 use `@/utils/`. The runtime code of the scripts uses relative paths (`../src/model/...`, `../../src/model/...`, 22 imports). The script tests use `@/model/`. Bun resolves the tsconfig aliases at run time, so a script can use an alias.

Code that crosses a border today:

- `src/client/api.ts`: `import type { ApiType } from "@server/api.ts"`. This is the only client import from the server.
- `scripts/lib/__tests__/data-paths.test.ts` imports `@server/repository/data-paths.ts`. It goes away in Task 3.
- `src/test/` (the preload and the two fixtures) imports the server. That is test setup and stays allowed.
- The two tests that move to `src/shared/files/__tests__/` in Task 5 (`file-utils.test.ts`, `json-utils.test.ts`) import `@/test/preload.ts`. So shared tests need `@/test/`.

Copies between the parts:

- **Data file paths.** `src/server/repository/data-paths.ts` holds the 4 paths the server writes. `src/server/repository/data-loader.ts` types the 4 subject files, `study_materials.json`, `verb_conjugations.json` and `sentence_readings.json` again. The scripts type them again: `download-subjects.ts`, `download-study-materials.ts`, `patch-subjects.ts` (plus `SUBJECT_FILE_NAMES` in `scripts/lib/subject-patches.ts`), `add-references.ts`, `add-iknow-vocab.ts` (iKnow folder, status file), `generate-verb-conjugations.ts`, `generate-sentence-readings.ts`, `scripts/lib/vocabulary-data.ts`. `scripts/lib/data-paths.ts` copies `CUSTOM_SUBJECTS_PATH`, and `scripts/lib/__tests__/data-paths.test.ts` checks that both are equal.
- **Deck type** `"radical" | "kanji" | "vocabulary"`: `AnkiDeckType` in `src/server/services/anki-connect.ts`, `ANKI_DECK_TYPES` in `src/server/api.ts`, a private `AnkiDeckType` in `scripts/lib/dev-server-api.ts`, `ReferenceType` in `scripts/lib/references.ts`, `NOTE_TYPES` in `scripts/add-references.ts`.
- **`SubjectType`**: a local copy in `scripts/download-subjects.ts`. `src/model/wanikani.ts` already has `SUBJECT_TYPES` and `SubjectType`.
- **Atomic JSON save.** `saveJsonAtomic` in `src/server/utils/json-utils.ts` (through `writeFileAtomic` in `file-utils.ts`), and a copy in `scripts/lib/llm-utils.ts`. The copy is on purpose today, because scripts must not import `src/server/`. `llm-utils.test.ts` repeats the `saveJsonAtomic` cases of `json-utils.test.ts`. Both copies write the same bytes (`JSON.stringify(data, null, 2) + "\n"`).
- **`readJson`**: `src/server/utils/json-utils.ts`, and `readJsonFile` in `scripts/add-references.ts`.
- **Error message.** `getErrorMessage` in `src/server/utils/error-utils.ts` (it also reads an object with a `message`, like `AnkiConnectError`). `formatError` in `scripts/lib/format-error.ts` (only `Error` or `String`), used by 12 script files.
- **AnkiConnect call.** A private `ankiInvoke` in `anki-connect.ts`, and an exported `ankiInvoke` in `scripts/lib/anki-templates.ts` (also used by `add-references.ts`, `sync-anki-fields.ts` and `sync-anki-templates.ts`). `ANKI_CONNECT_URL` is typed 3 times: `anki-connect.ts`, `anki-templates.ts`, `src/test/fetch-interceptor.ts`. The two calls differ in their errors:
  - server: a plain object `AnkiConnectError` `{ message, action, params }` from `createAnkiError`, a log line `[Anki] Error from <action>:` (only for an error answer, not for a failed connection), and the text `Failed to connect to Anki. Is Anki running?`. The add route checks `err.action === "validateModelFields"` for `reason: "fields"`.
  - scripts: `new Error("AnkiConnect error (<action>): <error>")` and `Failed to connect to Anki. Is Anki running with AnkiConnect?`.
- **Route answer types.** `SearchResponse`, `AnkiNotesResponse`, `AddToAnkiResponse` and `AnkiSyncResponse` are written by hand in `scripts/lib/dev-server-api.ts`. `scripts/sync-anki-notes.ts` writes three of them again (no `SearchResponse`), with its own `fetch` calls and its own `AnkiNoteItem`. A changed route answer still compiles in the scripts.

Copies that stay: `hash.ts`, `createSaveQueue`, `saveJsonWithRetry`, `saveJsonAtomicIfUnchanged`, `saveJsonIfMissing` and `createReloadingFile` are used by the server only. The client utils are used by the client only.

Tools: ESLint 9.39 flat config (`eslint.config.js`, today only the recommended sets), typescript-eslint 8.52, vite 7 with its own `resolve.alias`, tsconfig `paths`. The server build is `bun build src/server/index.ts`, which reads the tsconfig paths.

## Development Approach

- **testing approach**: Regular (code first, then tests)
- complete each task fully before moving to the next
- make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
  - most tasks are moves: the existing tests move with the code and must pass unchanged
  - a merged helper keeps one test set and loses the copy
  - tests cover both success and error scenarios
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- run `bun run tsc`, `bun run lint` and `bun test` after each task
- move files with `git mv`, so git keeps the history
- no behavior change, except the script error texts and the one server log line named in Task 7
- each task updates the lines in `CLAUDE.md` and `scripts/CLAUDE.md` that it makes wrong, so no task leaves a stale doc behind
- work on the branch the user picks. Do not create a branch, and commit only when the user asks

## Testing Strategy

- **unit tests**: every moved module keeps its tests, moved next to it. The merged helpers keep one test set.
- **integration tests**: the project has API E2E tests in `src/server/__tests__/` (through `api.request()`). This change adds no create, update or delete behavior. But Tasks 5 and 7 swap the code under the create, update and delete paths: the atomic file writes under `POST`/`PUT`/`DELETE /custom-subjects` and `PATCH /study-materials`, and the AnkiConnect call under `POST /add-to-anki`. So `api.custom-subjects.test.ts`, `api.study-materials.test.ts` and `api.add-to-anki.test.ts` must pass **unchanged**, with no snapshot update, after those tasks. A needed snapshot update there is a sign of a behavior change and must be explained in this plan first.
- **script tests**: `dev-server-api.test.ts` covers the Hono client in Task 8. Its request checks (URL, `Content-Type`, body) stay, so the wire format is proven to stay the same. One check changes: `hc` always sends `method: "GET"`, so the search test expects `"GET"` and not `undefined`.
- **lint rule**: Task 9 proves the rule with temporary bad imports. They are deleted again in the same task.
- **e2e UI tests**: the project has none. Task 11 checks the app by hand in the browser.

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope
- keep plan in sync with actual work done

## Solution Overview

### Target layout

```
src/shared/
  wanikani/
    wanikani.ts
    subject-utils.ts
    kanji-utils.ts
    radical-utils.ts
    vocabulary-utils.ts
    custom-subject-utils.ts
    validation-error.ts
    mnemonic-utils.ts
    __tests__/              # the 3 tests of src/model/__tests__/
  anki/
    anki-models.ts          # + ANKI_DECK_TYPES, AnkiDeckType, isAnkiDeckType
    anki-connect-invoke.ts  # not for the client: ANKI_CONNECT_URL, AnkiConnectError, invokeAnkiConnect
  files/                    # Node only (fs/promises, crypto)
    file-utils.ts           # moved whole from src/server/utils/
    json-file.ts            # readJson, saveJsonAtomic, formatJsonFile
    __tests__/
  data-paths.ts             # every path under data/, no imports
  error-message.ts          # getErrorMessage
  theme.ts
```

Why these places:

- `mnemonic-utils.ts` goes to `wanikani/`, not `anki/`. It styles the WaniKani mnemonic tags, and the web client uses it too (`MnemonicText.tsx`, `sanitize-html.ts`).
- `validation-error.ts` goes to `wanikani/`, because only the subject checks throw it.
- `file-utils.ts` moves whole. Its write helpers share one private core (`writeAndRename`), and a split would cut it in two. The server-only helpers in it (`writeFileAtomicIfUnchanged`, `writeFileIfMissing`, `readFileVersion`, `isMissingFile`) come along. That is the one place where server-only code sits in `src/shared/`, and it is cheaper than a split.
- `json-utils.ts` is split. `readJson`, `saveJsonAtomic` and the private `formatJsonFile` (now exported) go to `src/shared/files/json-file.ts`. The queue and the retry stay in `src/server/utils/json-utils.ts`, which imports the shared module.
- `anki-connect-invoke.ts` uses only `fetch`, so it could run in the browser. The client must still never import it, because the server owns every Anki write.
- `data-paths.ts` holds every path under `data/`, also the four that only one script uses (`USERDATA_DIR`, `IKNOW_DIR`, `IKNOW_STATUS_PATH`, `WANIKANI_FIXES_PATH`). The rule for this one module is "every data path lives here", not "used by two parts". So no reader has to guess where a path is.
- No `shared/api/` folder. The route answer types come from the server routes through `ApiType`.

### Import rule

Every import of shared code uses `@shared/...`: the server, the client, the scripts and every test. The `@/` alias stays, because `@/test/` and `@/server/` still use it. No file imports `@/shared/`.

### Border rule (ESLint)

`@typescript-eslint/no-restricted-imports`, because only that version has `allowTypeImports`:

| Files                          | Must not import                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `src/shared/**`                | the server, the client, the scripts, `src/test/`                                                         |
| `src/shared/**/__tests__/**`   | the server, the client, the scripts (`src/test/` is allowed, for the fs mock and the fetch mock)         |
| `src/shared/data-paths.ts`     | anything (so the test preload can load it before `mock.module` runs)                                     |
| `src/server/**`                | the client, the scripts                                                                                  |
| `src/client/**`                | the server, except `import type` from `@server/api.ts`; `src/shared/files/` and `anki-connect-invoke.ts` |
| `scripts/**`                   | the server, except `import type` from `@server/api.ts`; the client                                       |
| every file outside `src/test/` | `@/shared/...` (one spelling, so the client ban cannot be passed with another one)                       |

`src/test/**` is not restricted. The test setup imports the server on purpose.

## Technical Details

⚠️ A test in `src/shared/**/__tests__/` imports the module under test with a relative path (`../json-file.ts`), like every other sibling test. "Every test uses `@shared/...`" in "Import rule" holds only for tests outside `src/shared/`.

### `src/shared/data-paths.ts`

One module, no imports, every path the code reads or writes under `data/`:

```ts
export const USERDATA_DIR = "./data/userdata";
export const RADICALS_PATH = "./data/userdata/radicals.json";
export const KANJI_PATH = "./data/userdata/kanji.json";
export const VOCABULARY_PATH = "./data/userdata/vocabulary.json";
export const KANA_VOCABULARY_PATH = "./data/userdata/kana_vocabulary.json";
export const SUBJECT_FILE_PATHS = {
  radical: RADICALS_PATH,
  kanji: KANJI_PATH,
  vocabulary: VOCABULARY_PATH,
  kana_vocabulary: KANA_VOCABULARY_PATH,
} as const;
export const STUDY_MATERIALS_PATH = "./data/userdata/study_materials.json";
export const LOCAL_STUDY_MATERIALS_PATH = "./data/userdata/study_materials_extra.json";
export const MNEMONIC_IMAGES_PATH = "./data/userdata/mnemonic-images.jsonl";
export const MEDIA_ROOT_PATH = "./data/userdata/media";
export const CUSTOM_SUBJECTS_PATH = "./data/userdata/custom_subjects.json";
export const IKNOW_DIR = "./data/userdata/iknow";
export const IKNOW_STATUS_PATH = "./data/userdata/iknow-vocabulary-status.json";
export const VERB_CONJUGATIONS_PATH = "./data/verb_conjugations.json";
export const SENTENCE_READINGS_PATH = "./data/sentence_readings.json";
export const WANIKANI_FIXES_PATH = "./data/wanikani-fixes.yaml";
```

- The names are a draft. Keep the 4 existing names (`LOCAL_STUDY_MATERIALS_PATH`, `MNEMONIC_IMAGES_PATH`, `MEDIA_ROOT_PATH`, `CUSTOM_SUBJECTS_PATH`), because many tests import them.
- `add-iknow-vocab.ts` writes `data/userdata/iknow...` today with no `./`. The paths go through `readFile` and `join`, so `./` changes nothing. Check its log lines and the tests for an exact path string.
- `SUBJECT_FILE_NAMES` in `scripts/lib/subject-patches.ts` goes away. `patch-subjects.ts` and `subject-patches.test.ts` use `SUBJECT_FILE_PATHS`. `bun test` runs from the repo root, like `data-loader.test.ts` that already reads `./data/userdata/radicals.json`. Keep the `patch-subjects` log lines the same. When the pure lib needs the bare file name in its output, derive it with `basename`.
- `download-subjects.ts` uses `SUBJECT_FILE_PATHS` and `USERDATA_DIR` (for `.gitkeep`). Its log line that names `data/wanikani-fixes.yaml` (line 143 today) uses `WANIKANI_FIXES_PATH`.
- `scripts/lib/data-paths.ts` and `scripts/lib/__tests__/data-paths.test.ts` are deleted.
- Test code imports the constants and never types a path again (user rule). `data-loader.test.ts` line 508 uses `RADICALS_PATH`. The media path literals in the `api.add-to-anki.test.ts` snapshots stay: they are the expected output.

### Deck type in `src/shared/anki/anki-models.ts`

```ts
export const ANKI_DECK_TYPES = ["radical", "kanji", "vocabulary"] as const;
export type AnkiDeckType = (typeof ANKI_DECK_TYPES)[number];
export function isAnkiDeckType(value: string): value is AnkiDeckType { ... }
```

- `api.ts` uses `isAnkiDeckType` instead of `ANKI_DECK_TYPES.includes(type as AnkiDeckType)`.
- `references.ts` drops `ReferenceType` and uses `AnkiDeckType`. Its own `LOOKUP_ORDER` stays, because the order differs (vocabulary first).
- `add-references.ts` uses `ANKI_DECK_TYPES` instead of `NOTE_TYPES`. Both lists have the same order, so the output does not change.
- `download-subjects.ts` imports `SubjectType` from `@shared/wanikani/wanikani.ts` and drops its local copy.

### `src/shared/files/`

- `file-utils.ts` moves as is.
- `json-file.ts` holds `readJson`, `saveJsonAtomic` and `formatJsonFile`.
- `scripts/lib/llm-utils.ts` drops its `saveJsonAtomic`. Every script that imports it from there imports `@shared/files/json-file.ts` instead (`download-subjects.ts`, `download-study-materials.ts`, `patch-subjects.ts`, `add-iknow-vocab.ts`, both LLM scripts, and the rest found by grep).
- `add-references.ts` drops `readJsonFile` and uses `readJson`.
- The two `saveJsonAtomic` copies write the same bytes, so the scripts write the same files as before.
- `src/server/utils/__tests__/json-utils.test.ts` holds only four `saveJsonAtomic` cases: the success case, a failed rename removes the temp file, a failed rename plus a failed cleanup still reports the write error, and every write gets its own temp file. The whole file moves to `src/shared/files/__tests__/json-file.test.ts`. No test is left for `src/server/utils/json-utils.ts`, the same as today (the queue and the retry are covered through the repository and API tests).
- Add one new `readJson` case to `json-file.test.ts`: it parses a file from the fs mock. It is new coverage, not a moved one.
- `llm-utils.test.ts` drops its `saveJsonAtomic` cases.
- The moved tests import `@/test/preload.ts`. The ESLint block for `src/shared/**/__tests__/**` allows that.
- The note "`saveJsonAtomic` exists twice" goes away from `CLAUDE.md`.

### `src/shared/error-message.ts`

- `getErrorMessage` moves from `src/server/utils/error-utils.ts`. That file is deleted.
- `scripts/lib/format-error.ts` is deleted. The 12 script files call `getErrorMessage`. For an `Error` it gives the same text as `formatError`. For an `AnkiConnectError` object it gives the message instead of `[object Object]`.

### `src/shared/anki/anki-connect-invoke.ts`

```ts
export const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
export type AnkiConnectError = { message: string; action: string; params?: unknown };
export function createAnkiError(
  message: string,
  action: string,
  params?: unknown
): AnkiConnectError;
export async function invokeAnkiConnect<T>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<T>;
```

- The body is the server version: the same request, the server texts, and the thrown `AnkiConnectError` objects. So the server tests and snapshots do not change.
- `params` keeps its default `{}`. Without it, a call like `sync` or `deckNamesAndIds` would send no `params` key in the request body.
- The server keeps a private `ankiInvoke` in `anki-connect.ts`. It calls `invokeAnkiConnect`, and on any thrown error it logs `[Anki] Error from <action>:` and throws again. So the rule "a service exposes business functions, not `ankiInvoke`" stays true. `createAnkiError` is used for the server's own errors too (`getDeckId`, `validateModelFields`, `downloadMedia`), and those keep working.
- Behavior change on the server: a failed connection now logs the `[Anki] Error from <action>:` line too. Today only an error answer logs it. Both errors are the same `AnkiConnectError` shape, so the wrapper cannot tell them apart without a match on the text. One more log line is cheaper than a hook in the shared module. No test checks the log text.
- `scripts/lib/anki-templates.ts` drops its `ankiInvoke` and its URL. It, `add-references.ts`, `sync-anki-fields.ts` and `sync-anki-templates.ts` call `invokeAnkiConnect` directly. There is no service layer in the scripts.
- `src/test/fetch-interceptor.ts` imports `ANKI_CONNECT_URL`.
- Behavior change in the scripts: a failed connection prints `Failed to connect to Anki. Is Anki running?`. An AnkiConnect error prints the bare error text with no `AnkiConnect error (<action>):` prefix. The `catch` blocks of the scripts print through `getErrorMessage` (Task 6), so the object error prints its message. If the action name is needed in the output, a script can print `err.action`. Check the 4 scripts for a match on the old text.

### Hono client in `scripts/lib/dev-server-api.ts`

```ts
import { hc } from "hono/client";
import type { ApiType } from "@server/api.ts";

function apiClient(baseUrl: string) {
  return hc<ApiType>(`${baseUrl}/api`);
}
```

- `searchVocabulary`, `fetchAnkiNotes`, `addToAnki` and `syncAnkiWeb` keep their names and their parameters. They call `client.search.$get`, `client["anki-notes"].$get`, `client["add-to-anki"].$post` and `client["anki-sync"].$post`.
- `readJsonAnswer` keeps its `Content-Type` check, because an unhandled server error answers plain text. It takes the typed `hc` response and calls its own `json()`, so it needs no cast to a caller-chosen type.
- The answer types are derived with `InferResponseType` and **no status filter**. The routes call `c.json(x)` with no status for the 200 answer, so Hono types that status as `ContentfulStatusCode`, not `200`. A filter like `InferResponseType<..., 200>` is `never` (checked with tsc). For the same reason `if (res.status === 404)` does not narrow `res.json()`.
  - `AnkiNotesResponse` and `AnkiSyncResponse`: the plain derived type. The 400 answer of `/anki-notes` has the same `{ ok: false; error }` shape.
  - `SearchResponse`: `Exclude<InferResponseType<typeof client.search.$get>, { error: string }>`, then narrowed to `Vocabulary | KanaVocabulary`, because `text-vocab.ts` and `add-iknow-vocab.ts` rely on it. The derived data of those two types is assignable to the model types both ways. The route answers any subject type, so `searchVocabulary` checks `data.object` at run time and throws on any other type.
  - `AddToAnkiResponse`: the derived type **loses `reason`**. tsc shows `{ ok: false; error: string } | { ok: false; error: string }` for the two error answers of the route (`api.ts:285`), so `result.reason` fails at `add-iknow-vocab.ts` (two checks) and `add-text-vocab.ts`. Fix: first try `c.json(..., 200)` with an explicit status on the answers of this route in `api.ts`, which changes nothing on the wire. If `reason` is still lost, add the one missing member by hand, `| { ok: false; error: string; reason: "fields" }`, with a comment that Hono drops it, and the callers check `"reason" in result`. The field mismatch stop of both scripts must keep working; their tests prove it.
- `type` uses `AnkiDeckType` from Task 4.
- The search query: `hc` builds it with `URLSearchParams`, and the old code used `encodeURIComponent`. Both encode 図書館 the same way, so the URL check of the test stays. A space would differ (`+` vs `%20`), and the server decodes both.
- `hc` calls `(opt?.fetch || fetch)(...)` at request time, so the fetch that `dev-server-api.test.ts` puts on `globalThis` at file load is used.
- `hc` sends `method: "GET"` for a GET. The search test expects `undefined` today and must expect `"GET"`.
- `scripts/sync-anki-notes.ts` drops its 3 `fetch` helpers, its 3 answer types and its `AnkiNoteItem`. It uses the module. Today its `fetchAnkiNotes` answers `{ ok: false }`, while the module throws. `sync-anki-notes` catches the throw and prints the same `FAILED` and `Error:` lines, then exits 1.
- `CLAUDE.md` says today that `sync-anki-notes` keeps its own API calls. That line changes.

### ESLint rule

A draft for `eslint.config.js`. Each block sets the whole option list, because a later block replaces the options of an earlier one for the same file:

```js
const SERVER = ["@server/**", "**/server/**"];
const CLIENT = ["@client/**", "**/client/**"];
const SCRIPTS = ["**/scripts/**"];
const TEST = ["@/test/**", "**/test/**"];
const OTHER_SHARED_SPELLING = ["@/shared/**"];
const CLIENT_NO_SHARED = ["@shared/files/**", "**/shared/files/**", "@shared/anki/anki-connect-invoke*", "**/shared/anki/anki-connect-invoke*"];
const API_TYPE_ONLY = {
  name: "@server/api.ts",
  allowTypeImports: true,
  message: "Import only the ApiType type from the server.",
};

{ files: ["src/shared/**"], ...: patterns SERVER + CLIENT + SCRIPTS + TEST + OTHER_SHARED_SPELLING },
{ files: ["src/shared/**/__tests__/**"], ...: patterns SERVER + CLIENT + SCRIPTS + OTHER_SHARED_SPELLING },  // no TEST
{ files: ["src/shared/data-paths.ts"], rules: { "@typescript-eslint/no-restricted-imports": ["error", {
  patterns: [{ group: ["*"], message: "data-paths.ts must stay free of imports, the test preload loads it before mock.module." }],
}] } },
{ files: ["src/server/**"], ...: patterns CLIENT + SCRIPTS + OTHER_SHARED_SPELLING },
{ files: ["src/client/**"], ...: paths [API_TYPE_ONLY], patterns [SERVER with "!@server/api.ts", CLIENT_NO_SHARED, OTHER_SHARED_SPELLING] },
{ files: ["scripts/**"], ...: paths [API_TYPE_ONLY], patterns [SERVER with "!@server/api.ts", CLIENT, OTHER_SHARED_SPELLING] },
```

The order matters: the `__tests__` block comes after the `src/shared/**` block, and `data-paths.ts` comes last of the shared blocks, so each later block replaces the options of the earlier one.

Checked by the Fable review with a temporary config against the real code:

- `**/server/**` matches `../../src/server/x.ts` and `@/server/x.ts`, but not `@server/x.ts` (one segment) or `@hono/vite-dev-server`. That is why `@server/**` is listed apart.
- `**/client/**` does not match `hono/client` or `react-dom/client`.
- With the `!@server/api.ts` negation, `import type { ApiType }` and `import { type ApiType }` pass, and a value import of `@server/api.ts` fails through the `paths` entry.
- `*` catches `fs/promises` and `./theme.ts` in `data-paths.ts`.
- `**/test/**` matches a relative `../../test/preload.ts`. `**/src/test/**` would not.
- The flat config replaces the rule options in the order above.

To check while building it:

- The client ban must also catch `@/shared/files/...` and `../shared/files/...`. `CLIENT_NO_SHARED` and `OTHER_SHARED_SPELLING` cover both.
- `src/test/**` gets no block.
- The rule replaces the sentence "Exception: a script may import shared types and constants from `src/model/` with a relative path" in `CLAUDE.md`.

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): file moves, import updates, merges, the ESLint rule, the tests and the doc updates in this repo.
- **Post-Completion** (no checkboxes): the run of the scripts against a real dev server and Anki, and the second machine.

## Implementation Steps

### Task 1: Add the `@shared/*` alias

**Files:**

- Create: `src/shared/` (with the first files of Task 2)
- Modify: `tsconfig.json`
- Modify: `vite.config.ts`

- [x] add `"@shared/*": ["src/shared/*"]` to `compilerOptions.paths` in `tsconfig.json`
- [x] add `"@shared": path.resolve(__dirname, "src/shared")` to `resolve.alias` in `vite.config.ts`
- [x] no test needed for an alias on its own: Task 2 proves it through `tsc` and `bun test`, Task 11 through `bun run dev` and `bun run build`
- [x] run `bun run tsc` - must pass before task 2

### Task 2: Move `src/model/`, `src/utils/` and `src/config/` into `src/shared/`

**Files:**

- Move: `src/model/{wanikani,subject-utils,kanji-utils,radical-utils,vocabulary-utils,custom-subject-utils,validation-error}.ts` → `src/shared/wanikani/`
- Move: `src/model/__tests__/*` → `src/shared/wanikani/__tests__/`
- Move: `src/model/anki-models.ts` → `src/shared/anki/anki-models.ts`
- Move: `src/utils/mnemonic-utils.ts` → `src/shared/wanikani/mnemonic-utils.ts`
- Move: `src/config/theme.ts` → `src/shared/theme.ts`
- Modify: every file that imports them (about 61 files in `src/` and `scripts/`, found by grep)
- Modify: `CLAUDE.md`, `scripts/CLAUDE.md`

- [x] `git mv` the files, then delete the empty `src/model/`, `src/utils/` and `src/config/`
- [x] rewrite every import to `@shared/...`: the `@/model/`, `@/utils/`, `@/config/` imports and the relative `../src/model/` and `../../src/model/` imports in `scripts/`. The moved files' own imports between each other stay relative (`./wanikani.ts`), but `mnemonic-utils.ts` imports `@shared/theme.ts` and `anki-models.ts` needs nothing
- [x] grep for `src/model`, `src/utils/mnemonic`, `src/config`, `@/model`, `@/utils`, `@/config` in `src/`, `scripts/` and `.claude/skills/`: no hit left in code
- [x] update the "Project Structure" tree and every path in `CLAUDE.md` and `scripts/CLAUDE.md` that names the old files
- [x] the 3 moved test files pass unchanged; run `bun run tsc`, `bun run lint`, `bun test` - all must pass before task 3

### Task 3: One data paths module `src/shared/data-paths.ts`

**Files:**

- Move: `src/server/repository/data-paths.ts` → `src/shared/data-paths.ts`
- Delete: `scripts/lib/data-paths.ts`, `scripts/lib/__tests__/data-paths.test.ts`
- Modify: `src/server/repository/data-loader.ts`, `custom-subject.ts`, `study-material.ts`, `media-cache.ts`, `mnemonic-image-fetcher.ts`
- Modify: `src/test/preload.ts`, `src/test/study-material-fixture.ts`, `src/test/custom-subject-fixture.ts`, the server tests that import the 4 paths
- Modify: `scripts/download-subjects.ts`, `download-study-materials.ts`, `patch-subjects.ts`, `scripts/lib/subject-patches.ts`, `add-references.ts`, `add-iknow-vocab.ts`, `generate-verb-conjugations.ts`, `generate-sentence-readings.ts`, `scripts/lib/vocabulary-data.ts`
- Modify: `scripts/lib/__tests__/subject-patches.test.ts`, `src/server/repository/__tests__/data-loader.test.ts`
- Modify: `CLAUDE.md`

- [x] `git mv` the server module and add the new constants (see Technical Details). Keep its comment on why it has no imports
- [x] replace every typed data path in the server and the scripts with a constant. `SUBJECT_FILE_NAMES` goes away
- [x] point the preload, the fixtures and the tests at `@shared/data-paths.ts`; `data-loader.test.ts` uses `RADICALS_PATH`; `subject-patches.test.ts` uses `SUBJECT_FILE_PATHS` and `WANIKANI_FIXES_PATH`
- [x] delete `scripts/lib/data-paths.ts` and its test; drop their lines from `CLAUDE.md` (the "Custom Subjects" add-references note and the "Project Structure" tree)
- [x] grep `src/` and `scripts/` for `./data/`, `data/userdata`, `data/wanikani-fixes` and `` `${DATA_DIR} ``: only `src/shared/data-paths.ts`, test fixtures of their own (like `custom-subject-clash.test.ts`), snapshot strings, and help or error texts that name a path for the user are left
- [x] run `bun run tsc`, `bun run lint`, `bun test` - all must pass, with no snapshot update, before task 4

### Task 4: One deck type, and the `SubjectType` copy

**Files:**

- Modify: `src/shared/anki/anki-models.ts`
- Modify: `src/server/services/anki-connect.ts`, `src/server/api.ts`
- Modify: `scripts/lib/dev-server-api.ts`, `scripts/lib/references.ts`, `scripts/add-references.ts`, `scripts/download-subjects.ts`
- Create: `src/shared/anki/__tests__/anki-models.test.ts`

- [x] add `ANKI_DECK_TYPES`, `AnkiDeckType` and `isAnkiDeckType` to `anki-models.ts`
- [x] drop the copies: `AnkiDeckType` in `anki-connect.ts`, `ANKI_DECK_TYPES` in `api.ts`, the private type in `dev-server-api.ts`, `ReferenceType` in `references.ts`, `NOTE_TYPES` in `add-references.ts`, the local `SubjectType` in `download-subjects.ts`
- [x] write a test for `isAnkiDeckType`: true for the 3 deck types, false for `kana_vocabulary` and an empty string
- [x] the `/anki-notes` 400 tests for a bad type pass unchanged
- [x] run `bun run tsc`, `bun run lint`, `bun test` - all must pass before task 5

### Task 5: Shared file helpers `src/shared/files/`

**Files:**

- Move: `src/server/utils/file-utils.ts` → `src/shared/files/file-utils.ts`
- Move: `src/server/utils/__tests__/file-utils.test.ts` → `src/shared/files/__tests__/file-utils.test.ts`
- Create: `src/shared/files/json-file.ts`
- Move: `src/server/utils/__tests__/json-utils.test.ts` → `src/shared/files/__tests__/json-file.test.ts`
- Modify: `src/server/utils/json-utils.ts`, every server file that imports the moved functions
- Modify: `scripts/lib/llm-utils.ts`, `scripts/lib/__tests__/llm-utils.test.ts`, every script that imports `saveJsonAtomic`, `scripts/add-references.ts`
- Modify: `CLAUDE.md`

- [x] `git mv` `file-utils.ts` and its test; update the imports
- [x] move `readJson`, `saveJsonAtomic` and `formatJsonFile` into `json-file.ts`; `json-utils.ts` keeps the queue, the retry, `saveJsonAtomicIfUnchanged` and `saveJsonIfMissing` and imports `formatJsonFile`
- [x] drop the `saveJsonAtomic` copy in `llm-utils.ts` and point the scripts at `@shared/files/json-file.ts`
- [x] `add-references.ts` uses `readJson` and drops `readJsonFile`
- [x] `git mv` `json-utils.test.ts` to `src/shared/files/__tests__/json-file.test.ts` with its 4 cases; drop the `saveJsonAtomic` cases from `llm-utils.test.ts`
- [x] write one new `readJson` case in `json-file.test.ts`
- [x] `api.custom-subjects.test.ts` and `api.study-materials.test.ts` pass unchanged (they cover the create, update and delete writes)
- [x] update `CLAUDE.md`: the file paths in "Two Machines", "Local Study Materials" and "Project Structure", and drop the "`saveJsonAtomic` exists twice" paragraph
- [x] run `bun run tsc`, `bun run lint`, `bun test` - all must pass before task 6

### Task 6: Shared error message `src/shared/error-message.ts`

**Files:**

- Move: `src/server/utils/error-utils.ts` → `src/shared/error-message.ts`
- Delete: `scripts/lib/format-error.ts`
- Modify: `src/server/api.ts`, `src/server/services/anki-connect.ts`, the 12 script files that use `formatError`
- Create: `src/shared/__tests__/error-message.test.ts`
- Modify: `CLAUDE.md`

- [x] `git mv` the module; update the server imports
- [x] replace `formatError` with `getErrorMessage` in the scripts; delete `format-error.ts`
- [x] write tests for `getErrorMessage`: an `Error`, an object with `message`, a string, a number, `null`
- [x] update the "Project Structure" tree and `scripts/CLAUDE.md` where they name `format-error.ts` or `error-utils.ts`
- [x] run `bun run tsc`, `bun run lint`, `bun test` - all must pass before task 7

### Task 7: Shared AnkiConnect call `src/shared/anki/anki-connect-invoke.ts`

**Files:**

- Create: `src/shared/anki/anki-connect-invoke.ts`
- Create: `src/shared/anki/__tests__/anki-connect-invoke.test.ts`
- Modify: `src/server/services/anki-connect.ts`
- Modify: `scripts/lib/anki-templates.ts`, `scripts/add-references.ts`, `scripts/sync-anki-fields.ts`, `scripts/sync-anki-templates.ts`
- Modify: `src/test/fetch-interceptor.ts`
- Modify: `CLAUDE.md`

- [x] create the module from the server version (see Technical Details), with `params = {}` as the default
- [x] the server's private `ankiInvoke` calls it and logs every thrown error; `createAnkiError` and `AnkiConnectError` move into the shared module
- [x] `anki-templates.ts` drops `ankiInvoke` and `ANKI_CONNECT_URL`; it, `add-references.ts`, `sync-anki-fields.ts` and `sync-anki-templates.ts` call `invokeAnkiConnect`; check the 4 scripts for a match on the old error text
- [x] `fetch-interceptor.ts` imports `ANKI_CONNECT_URL`
- [x] write tests with a fetch mock: a result answer, an error answer (throws `{ message, action, params }`), a failed connection (throws the connect text), a call with no params (the body still holds `params: {}`)
- [x] `api.add-to-anki.test.ts` passes unchanged, also the `reason: "fields"` case
- [x] update `CLAUDE.md`: the "Architecture" line on `ankiInvoke`, the `anki-templates.ts` line in the scripts tree, and the "Anki Field Migration" note that names `ankiInvoke`
- [x] run `bun run tsc`, `bun run lint`, `bun test` - all must pass before task 8

### Task 8: Typed Hono client for the scripts

**Files:**

- Modify: `scripts/lib/dev-server-api.ts`
- Modify: `scripts/sync-anki-notes.ts`
- Modify: `scripts/lib/__tests__/dev-server-api.test.ts`
- Modify: `scripts/add-iknow-vocab.ts`, `scripts/add-text-vocab.ts` (the `reason` checks)
- Modify: `scripts/lib/text-vocab.ts` (only if the derived types need it)
- Modify: `src/server/api.ts` (only the explicit `200` status of the add route, if that keeps `reason`)
- Modify: `CLAUDE.md`

- [x] build the 4 calls on `hc<ApiType>` (see Technical Details); derive the answer types with no status filter
- [x] keep `reason: "fields"` in `AddToAnkiResponse`: try the explicit `200` in `api.ts` first, else the one hand-written member; the field mismatch stop of `add-iknow-vocab.ts` (two checks) and `add-text-vocab.ts` keeps working
  - ⚠️ the explicit `200` did not keep `reason`, so `api.ts` stays unchanged and `AddToAnkiResponse` has the hand-written member; the callers check `"reason" in result`
  - ⚠️ review fix: the cause is TypeScript subtype reduction, not Hono. The route now builds one typed failure value with an optional `reason`, the hand-written member is gone, and the callers use `isFieldMismatch(result)` from `dev-server-api.ts`
- [x] `searchVocabulary` throws when the hit is not `vocabulary` or `kana_vocabulary`
  - ⚠️ review fix: the search answer type filters the statuses `200 | 404`, so the `{ error }` check is gone. The status check above already throws for the 400
- [x] move `sync-anki-notes.ts` to the module; keep its output lines and its exit codes
- [x] keep the request checks in `dev-server-api.test.ts`; the search method check becomes `"GET"`; add a test for the new type check of `searchVocabulary`; add a test that a plain text 500 still throws the `readJsonAnswer` error; add a test that an add answer with `reason: "fields"` keeps the field
- [x] prove the type link: change one route answer in `api.ts` for a moment, see `bun run tsc` fail in `scripts/`, then put it back
- [x] update `CLAUDE.md`: the "Architecture" rule on scripts and the backend API, the `dev-server-api.ts` line in the tree ("sync-anki-notes keeps its own" goes)
- [x] run `bun run tsc`, `bun run lint`, `bun test` - all must pass before task 9

### Task 9: ESLint border rule

**Files:**

- Modify: `eslint.config.js`
- Modify: `CLAUDE.md`

- [x] add the blocks of Technical Details
- [x] `bun run lint` passes on the whole repo
- [x] prove each block with a temporary bad import, then delete it: a value import of `@server/...` in a script, a `../../src/server/...` import in a script, a value import of `@server/api.ts` in the client, an import of `@shared/files/json-file.ts`, `@/shared/files/json-file.ts` and `../shared/files/json-file.ts` in the client, an import of `@shared/anki/anki-connect-invoke.ts` in the client, an `@server/...` import in `src/shared/`, an `@/test/...` import in a non-test file of `src/shared/`, any import in `src/shared/data-paths.ts`, an `@client/...` import in the server, an `@/shared/...` import anywhere. Each must fail. `import type { ApiType } from "@server/api.ts"` in a script and in the client must pass, and so must `@/test/preload.ts` in `src/shared/files/__tests__/`
- [x] add the border rule to `CLAUDE.md` "Architecture": the `src/shared/` rule, the table of who may import what, and that ESLint checks it. It reaches all folders, so it stays in the root file (see "Where Rules Go")
- [x] run `bun run lint`, `bun run tsc`, `bun test` - all must pass before task 10

### Task 10: Docs, skills and open plans

**Files:**

- Modify: `CLAUDE.md`, `scripts/CLAUDE.md`
- Modify: `.claude/skills/**/SKILL.md` (only where they name a moved path)
- Modify: open plans in `docs/plans/` (not `completed/`), like `docs/plans/tts-with-ssml.md`

`docs/plans/20261107-add-text-vocab.md` belongs to the feature and moves to `completed/` with the feature merge. If it is still in `docs/plans/` when this task runs, leave it alone: it is a finished plan.

- [x] grep the repo (without `docs/plans/completed/` and `node_modules`) for every old path: `src/model`, `src/utils/mnemonic`, `src/config`, `@/model`, `@/utils`, `@/config`, `server/utils/file-utils`, `server/utils/error-utils`, `server/repository/data-paths`, `scripts/lib/data-paths`, `format-error`, `SUBJECT_FILE_NAMES`, `ReferenceType`, `formatError`
- [x] fix each hit; `tts-with-ssml.md` plans a new `src/model/furigana.ts`, which becomes `src/shared/wanikani/furigana.ts`
- [x] the "Project Structure" tree of `CLAUDE.md` shows `src/shared/` with its subfolders and drops `src/model/`, `src/utils/`, `src/config/`
- [x] read the whole diff of `CLAUDE.md` once: simple English, no line that names the old layout
- [x] no test needed for docs; run `bun run lint` and `bun test` once more

### Task 11: Verify acceptance criteria

- [x] `src/model/`, `src/utils/` and `src/config/` do not exist
- [x] every copy of the Context list is one module, except the ones named as staying
- [x] run the full checks: `bun run tsc`, `bun run lint`, `bun run format:check`, `bun test`
- [x] `bun run build`, then `bun run preview`, and one `/api/search` call: the built server finds the `@shared` modules
- [x] `bun run dev` and a search for a kanji, a word and a custom word in the browser: the cards and the mnemonic colors look as before (checked through the API only: `/api/search` for 校, 学校, the custom words 日本人 and どうぞ, and vite serves the client modules with `@shared` resolved to `/src/shared/...`, also `mnemonic-utils.ts` and `theme.ts`)
- [x] `bun run sync-anki-notes -- --dry-run` and `bun run add-iknow-vocab -- --dry-run --limit 1` against the dev server: the Hono client works at run time (needs Anki, see Post-Completion if Anki is not running)

### Task 12: [Final] Update documentation

- [x] update README.md if it names a moved path (today it names none) (checked README.md, CLAUDE.md and docs/\*.md: no moved path, nothing changed)
- [x] run `/learn` for the patterns of this change (deferred - the orchestrator runs it after the reviews)
- [x] move this plan to `docs/plans/completed/` (done by the orchestrator at the end)

## Post-Completion

_Items requiring manual intervention or external systems - no checkboxes, informational only_

**Manual verification:**

- Run one script that reads AnkiConnect directly (`bun run sync-anki-templates` or `bun run add-references -- --dry-run`) with Anki open, and once with Anki closed. The closed case prints the new connect text.
- Run one LLM script with `--dry-run`, and `bun run patch-subjects -- --dry-run`, to check the new paths.

**Second machine:**

- The Linux box runs the server from the main repo. After the merge it needs a pull and a server restart. No data file moves, so `data/userdata/` needs nothing.
