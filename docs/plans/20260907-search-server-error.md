# Show a server error in the search result instead of "not found"

## Overview

- When the dev server is down, or the API answers with an error, the web app shows `No kanji found for "働"`. The user thinks the item is missing from the data. On 2026-09-07 this cost a debugging session: 働 was in `data/userdata/kanji.json` all along, only the dev server was not running.
- The cause is the `catch` in `performSearch` in `src/client/components/SearchPage.tsx`. It maps every error to the `not_found` state. The client API in `src/client/api.ts` throws a bare `Failed to search` on any non-404 status, and lets the raw fetch error through on a network failure. Nothing tells the two apart from a real miss.
- This change adds an `error` state to the search result. The result area shows a red message and a Retry button. The message has two cases: the server cannot be reached, or the server answered with an HTTP error status. A 404 stays a normal "not found".

### Acceptance criteria

1. Dev server stopped, search 働 as kanji: the result area shows `Could not reach the server. Is the dev server running?` in red, with a Retry button. No "No kanji found" text.
2. Start the dev server, click Retry: the kanji card for 働 appears. The URL and the search input do not change.
3. The API answers 500: the result area shows `Server error (500)` with a Retry button.
4. The API answers 404: the result area shows `No kanji found for "..."` as before.
5. The mapping from a thrown error to the message text is a pure function with unit tests. `api.search` has unit tests against a mocked `fetch`.

## Context (from discovery)

- `src/client/components/SearchPage.tsx`: `performSearch` (line ~37) owns the request. Its `catch` sets `{ status: "not_found", query }`. `handleSearch` and `navigateTo` both push the URL and call `performSearch`. `SearchResult` is rendered with `type={resultType}`.
- `src/client/api.ts`: `api.search` calls the Hono RPC client and throws `new Error("Failed to search")` when `!res.ok && res.status !== 404`. A dead server makes `fetch` reject with a `TypeError` (`Failed to fetch` in Chrome, `Load failed` in Safari), which passes through untouched.
- `src/client/types.ts`: `SearchResult<T>` is a union of `idle`, `loading`, `found`, `not_found`. No error state.
- `src/client/components/SearchResult.tsx`: renders one branch per status. The `not_found` branch is a gray centered `div`. The Retry button gets the same look as the search button in `SearchInput.tsx` but with a gray border, so it does not compete with the main action.
- The Hono client (`node_modules/hono/dist/client/client.js` line 92) calls the global `fetch(url, init)` with a plain string URL like `/api/search?type=kanji&q=%E5%83%8D`. A test can replace `globalThis.fetch` and read the URL from the first argument.
- `src/test/fetch-utils.ts` exports `createFetchMock(handler)` and `resolveUrl(input)`. Existing tests install their fetch mock at file top level. `src/server/repository/__tests__/mnemonic-image-fetcher.test.ts` restores the real `fetch` in `afterAll`, the new client test does the same.
- `bunfig.toml` preloads `src/test/preload.ts` for every test file. It mocks `fs/promises` and seeds `Math.random`. It does not touch `fetch`, so a client test can install its own mock.
- `src/client/utils/__tests__/sanitize-html.test.ts` shows a client test that imports through the `@client/*` alias. Aliases work in `bun test`.
- The project has no React component tests and no `@testing-library/react`. The user chose not to add them. The React parts of this change are covered by a manual check.
- Test baseline on `main` before this change: `131 pass / 0 fail` across 12 files.

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
- **CRITICAL: all tests must pass before starting next task** - no exceptions. Baseline is `131 pass / 0 fail`, so the gate is 0 failures
- **CRITICAL: update this plan file when scope changes during implementation**
- run tests after each change
- run `bun run lint:fix` and `bun run tsc` after editing files under `src/`
- maintain backward compatibility: the `found` and `not_found` paths, the URL handling and the page title stay as they are

## Testing Strategy

- **unit tests**: required for every task (see Development Approach above)
  - `searchErrorMessage` is a pure function. Test every branch: HTTP status error, network `TypeError`, other `Error`, non-Error value
  - `api.search` is tested with `globalThis.fetch` replaced by `createFetchMock` from `src/test/fetch-utils.ts`. Cover 200, 404, 500 and a rejected fetch
- **integration tests**: the project has API E2E tests in `src/server/__tests__/`. This change touches only the client. No create, update or delete path changes, so the integration tests stay as they are
- **e2e tests**: the project has no browser e2e tests. The React rendering is checked by hand, see Post-Completion

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope
- keep plan in sync with actual work done

## Solution Overview

- A new pure module `src/client/utils/search-error.ts` holds an `HttpStatusError` class and a `searchErrorMessage(err)` function. The class carries the status. The function turns any thrown value into the text the user sees.
- `api.search` throws `HttpStatusError` for a non-404 error status. It does not catch the network error, so `TypeError` reaches the page as is.
- `SearchPage` gets a new `error` result state from the `catch` and passes a retry callback to `SearchResult`.
- `SearchResult` renders the `error` state: red message, Retry button. Retry calls `performSearch` with the type and query of the shown result. It does not push the URL again, because the URL already holds that search.

Why a separate util module and not a method on the api object: the mapping is pure and easy to test alone. The api module stays a thin transport layer, like the guideline for services says.

## Technical Details

### `src/client/types.ts`

```ts
export type SearchResult<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; item: T }
  | { status: "not_found"; query: string }
  | { status: "error"; query: string; message: string };
```

### `src/client/utils/search-error.ts`

```ts
export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`Server error (${status})`);
    this.name = "HttpStatusError";
  }
}

export const SERVER_UNREACHABLE_MESSAGE = "Could not reach the server. Is the dev server running?";

export function searchErrorMessage(err: unknown): string {
  if (err instanceof HttpStatusError) return err.message;
  // fetch rejects with a TypeError when it cannot open the connection
  if (err instanceof TypeError) return SERVER_UNREACHABLE_MESSAGE;
  const detail = err instanceof Error ? err.message : String(err);
  return `Search failed: ${detail}`;
}
```

The third branch is a fallback. It covers a body that is not JSON, for example when some other server answers on port 5173. The user asked for two cases, and the two main cases are the first two branches. The fallback only keeps a strange error from turning into a lie.

### `src/client/api.ts`

```ts
search: async (type: SubjectType, query: string) => {
  const res = await client.search.$get({ query: { type, q: query } });
  if (!res.ok && res.status !== 404) throw new HttpStatusError(res.status);
  return res.json();
},
```

### `src/client/components/SearchPage.tsx`

- `catch (err)` sets `{ status: "error", query, message: searchErrorMessage(err) }`
- `retrySearch = useCallback(() => performSearch(resultType, currentQuery), [resultType, currentQuery, performSearch])`. `currentQuery` is set inside `performSearch`, so it always holds the query of the shown result
- `<SearchResult type={resultType} result={result} onRetry={retrySearch} />`

### `src/client/components/SearchResult.tsx`

- new prop `onRetry: () => void`
- new branch before the `switch`:

```tsx
if (result.status === "error") {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="text-red-600">{result.message}</div>
      <button
        onClick={onRetry}
        className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-100"
      >
        Retry
      </button>
    </div>
  );
}
```

### Processing flow

1. User submits a search. `performSearch` sets `loading` and calls `api.search`.
2. `fetch` rejects (server down) or `api.search` throws `HttpStatusError` (bad status).
3. `catch` maps the error with `searchErrorMessage` and sets the `error` state with the query.
4. `SearchResult` shows the message and the Retry button.
5. Retry calls `performSearch(resultType, currentQuery)`. The request id counter in `performSearch` already drops a late answer from an older request.

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): tasks achievable within this codebase - code changes, tests, documentation updates
- **Post-Completion** (no checkboxes): items requiring external action - manual testing, changes in consuming projects, deployment configs, third-party verifications

## Implementation Steps

### Task 1: Add the error mapping util

**Files:**

- Create: `src/client/utils/search-error.ts`
- Create: `src/client/utils/__tests__/search-error.test.ts`

- [x] create `src/client/utils/search-error.ts` with `SERVER_UNREACHABLE_MESSAGE`, `HttpStatusError` and `searchErrorMessage` as shown in Technical Details
- [x] write tests: `HttpStatusError(500)` gives `Server error (500)`, and `.status` is 500
- [x] write tests: `new TypeError("Failed to fetch")` and `new TypeError("Load failed")` give `SERVER_UNREACHABLE_MESSAGE`
- [x] write tests: a plain `Error("Unexpected token <")` gives `Search failed: Unexpected token <`, and a thrown string gives `Search failed: <the string>`
- [x] run `bun test src/client/utils/__tests__/search-error.test.ts`, then `bun run lint:fix` and `bun run tsc` - must pass before task 2

### Task 2: Make `api.search` throw a typed status error

**Files:**

- Modify: `src/client/api.ts`
- Create: `src/client/__tests__/api.test.ts`

- [x] import `HttpStatusError` from `./utils/search-error.ts` in `src/client/api.ts` and throw it with `res.status` in place of `new Error("Failed to search")`
- [x] create `src/client/__tests__/api.test.ts`. Install a fetch mock at file top level with `createFetchMock` from `@/test/fetch-utils.ts`. Keep the current handler in a `let` so each test can set its own answer. Save the real `fetch` and put it back in `afterAll`
- [x] write test: a 200 answer `{ found: true, data: { id: 809 } }` is returned as parsed JSON, and the request URL is `/api/search?type=kanji&q=%E5%83%8D`
- [x] write test: a 404 answer `{ found: false }` is returned, not thrown
- [x] write test: a 500 answer rejects with an `HttpStatusError` whose `status` is 500
- [x] write test: a fetch that rejects with `TypeError("Failed to fetch")` makes `api.search` reject with that same `TypeError`
- [x] write test: a 200 answer with the body `<!doctype html>` makes `api.search` reject with a `SyntaxError`, which is the case the fallback branch of `searchErrorMessage` is for
- [x] run `bun test src/client`, then `bun run lint:fix` and `bun run tsc` - must pass before task 3

### Task 3: Add the `error` result state and the Retry UI

**Files:**

- Modify: `src/client/types.ts`
- Modify: `src/client/components/SearchPage.tsx`
- Modify: `src/client/components/SearchResult.tsx`

- [ ] add the `error` member to `SearchResult<T>` in `src/client/types.ts`
- [ ] in `SearchPage.tsx`, catch the error as `err`, set `{ status: "error", query, message: searchErrorMessage(err) }`, keep the request id guard
- [ ] in `SearchPage.tsx`, add `retrySearch` with `useCallback` and pass it as `onRetry` to `SearchResult`
- [ ] in `SearchResult.tsx`, add the `onRetry` prop and the `error` branch with the red message and the Retry button
- [ ] no React test harness exists, so the covered behavior is the mapping and the api tests from tasks 1 and 2. Check the UI by hand: stop the dev server, search, see the message and Retry, start the server, click Retry, see the card
- [ ] run `bun test`, `bun run lint:fix` and `bun run tsc` - must pass before task 4

### Task 4: Verify acceptance criteria

- [ ] verify all requirements from Overview are implemented
- [ ] verify edge cases are handled: a late answer from an older request is dropped, 404 still shows not found. The UI cannot send a bad type or an empty query, so the 400 case is covered by the Task 2 unit test only
- [ ] run full test suite: `bun test`. Gate: 0 failures
- [ ] run `bun run lint` and `bun run tsc`
- [ ] the project has no e2e tests

### Task 5: [Final] Update documentation

- [ ] add a line to the "Test Architecture" list in `CLAUDE.md`: client tests live in `src/client/__tests__/` and `src/client/utils/__tests__/`, and a client api test replaces `globalThis.fetch` with `createFetchMock`
- [ ] README.md needs no change
- [ ] run the refactor-simplifier agent on the changed files
- [ ] run `/learn` to capture anything new for `CLAUDE.md`
- [ ] check `gh issue list` for an issue this change closes
- [ ] move this plan to `docs/plans/completed/`

## Post-Completion

**Manual verification:**

- Stop the dev server. Open `http://localhost:5173/?type=kanji&q=働`. The page itself will not load without Vite, so start the server, open the page, then stop the server and press Enter in the search input. Expect the red unreachable message and the Retry button.
- Start the server, click Retry. Expect the kanji card for 働.
- Search with a normal miss like `zzz`. Expect `No kanji found for "zzz"` as before.
- Check the Retry button in dark mode. The app has no explicit dark mode classes today, so gray border and red text should be readable on the default light background.
