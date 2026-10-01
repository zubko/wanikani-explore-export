# Media cache and two-machine safe data files

## Overview

- Keep every downloaded or generated media file in `data/userdata/media/`: radical SVGs, radical mnemonic pictures, WaniKani reading clips and Azure sentence clips. An add or a re-sync reads a file from disk when it is there and goes to the network only once per file. The cards still build when WaniKani drops a file, and a full `sync-anki-notes` no longer calls Azure for every word.
- Make the mnemonic image registry safe for two machines. Today `mnemonic-images.json` is loaded once at startup and the whole map is written back after a search, so an entry pulled from the other machine is overwritten and pushed back. The registry becomes an append-only JSONL file that git merges line by line.
- Reread a data file when the other machine changed it. A new helper checks the file's mtime and size on every read and loads the file again when they differ. The registry uses it from the start, the local study materials as the last step.
- Closes three backlog items: "Cache sentence audio", "Cache radical images", "Make the files in `data/userdata/` safe for two machines".
- No backward compatibility. The user converts both machines by hand before the next start (see Post-Completion). The code reads only the new layout.

Design rules behind this plan, decided on 2026-10-01:

- Two servers read and write `data/userdata/`, the Mac by hand and the Debian box through an auto-pull job that commits every few minutes. Correctness beats performance here. One person uses the app at a time, so a stat per request is fine.
- A file the server reads and the other machine may change is never cached for the process lifetime.
- A bad data file that appears while the server runs (a hand edit, a pull) fails every request that needs it, loudly, until the file is fixed. No restart is needed after the fix. A bad file at startup still fails the start.
- A write is an append of one line, or an atomic write-and-rename. Never a rewrite of a whole file from a memory copy.
- Long clear names over jargon: the parameter is `nameWithoutExtension`, not `stem`.

## Context (from discovery)

- `src/server/repository/mnemonic-image-fetcher.ts`: `MnemonicImageFetcher` holds the map, `saveIfNeeded` writes the whole map with `saveJsonAtomic`. `fetchMnemonicImageUrl` does not check `response.ok`, so a WaniKani 5xx page is cached as `null`. `data-loader.ts` creates the fetcher in `initRepository` and exports `saveCache()`, called twice in `src/server/api.ts` (after a search, after an add). `src/server/repository/radical.ts` calls `imageFetcher.get(documentUrl)` in `buildRadical`. Its test is `src/server/repository/__tests__/mnemonic-image-fetcher.test.ts`, which builds the class with a map and tests `saveIfNeeded`.
- `src/server/services/anki-connect.ts`: `fetchAndStoreSvg(url, filename)` (radical note and the kanji's radical list), `fetchAndStoreAudio(url, filename)` (reading clips), `storeAudioData` (sentence clip), all end in `storeMediaFile(filename, base64)`. `buildRadicalNoteFields` writes `mnemonic_image: radical.mnemonicImageUrl ?? ""`. `addOrUpdateVocabularyCore` picks the gender with `Math.random`, names the sentence clip `${deckId}_${slug}_sentence.mp3`. `shortHash(text)` is a private function there, the first 8 hex chars of SHA-1. `anki-connect.ts` imports `azure-tts.ts`, so `azure-tts.ts` must not import from it.
- The API metadata already carries the media type: `getRadicalSvgUrl` picks the `image/svg+xml` image, `selectReadingAudios` in `src/model/vocabulary-utils.ts` keeps only `audio/mpeg`. The reading audio URLs have no `.mp3` in them. Only the mnemonic picture URL comes with no type, the four sampled ones answer `image/svg+xml`.
- `src/server/services/azure-tts.ts`: `generateSentenceAudio(text)` picks a voice with `Math.random` from `AZURE_TTS_VOICES`, returns `ArrayBuffer | null` (null when env is missing or text is blank). `docs/plans/tts-with-ssml.md` will later change the SSML to `<sub alias>` per kanji block, so the clip name must hash the SSML and not the plain text.
- `src/server/utils/json-utils.ts`: `readJson`, `saveJsonAtomic` (write `.tmp`, rename, unlink on error).
- `src/server/repository/vocabulary.ts`: `getVocabulary` is async, `getKanaVocabulary` is sync and both read `localStudyMaterials`. `src/server/api.ts` line 60: `(await getVocabulary(id)) ?? getKanaVocabulary(id)`. `vocabulary.test.ts` calls `getKanaVocabulary` without `await`.
- `src/test/preload.ts`: mocks `fs/promises` with `readFile`, `writeFile`, `rename`, `unlink` over one in-memory `files` map of strings. Redirects reads of `mnemonic-images.json` and `study_materials_extra.json` to `src/test/fixtures/`. Seeds `Math.random`, exports `resetRandom()`. Each vocabulary add consumes two seeded values today. `writeCalls[].data` is a string: `lastWrite()` in `src/test/study-material-fixture.ts` parses it and `study-material.test.ts` calls `.endsWith` on it.
- `src/test/fetch-interceptor.ts`: answers `files.wanikani.com` with `<svg></svg>` and no content type, `.tts.speech.microsoft.com` with 100 bytes and `audio/mpeg`. Counts only AnkiConnect calls in `ankiCalls`.
- `src/server/__tests__/api.add-to-anki.test.ts`: `beforeEach` resets the interceptor and the random seed but not the fs mock. "add vocabulary (毎晩, id=3766)" adds the word, two later tests add the same id with `setMediaStatus(404)` and expect "Failed to download audio (404)" and "Failed to download SVG (500)". The action snapshot of "add radical (一, id=1)" lists every AnkiConnect call. Radical 一 is the only fixture page with a picture.
- `src/server/repository/__tests__/radical.test.ts` expects a registry hit with no fetch and snapshots the fixture URL; `api.search.test.ts` snapshots the same URL.
- Git: both `union` and the custom `ours` driver were verified in a scratch repo on 2026-10-01. `*.jsonl merge=union` works with the attributes file alone. `merge=ours` needs `git config merge.ours.driver true` in each clone, then an add/add binary conflict resolves to the merging side with no prompt and the other side fast-forwards.
- Data repo files: `data/userdata/README.md` (file table), `data/userdata/.gitignore` (already ignores `*.tmp`). `docs/hosting-on-linux.md` lists the data repo clone as a prerequisite bullet in "What you need", there is no clone step.
- CLAUDE.md passages that change: the Local Study Materials notes on `localStudyMaterials`, `setLocalStudyMaterials` and "the memory copy is only filled at startup"; "Caching with Parallel Operations" (load once, save once); the Git Workflow line on the `mnemonic-images.json` conflict; the Test Architecture lines on the preload redirect, the fs mock ops and the `localStudyMaterials` reset; the paragraph on the seeded `Math.random` and "Each vocabulary add consumes two values"; the repository line "Call `saveCache()` at the end"; the media name example `{deckId}_{slug}.svg`.
- `docs/hosting-on-linux.md`: the box runs `bun run dev` in a tmux/screen session, not as a systemd unit.

## Development Approach

- **testing approach**: Regular (code first, then tests)
- complete each task fully before moving to the next
- make small, focused changes
- every task includes new or updated tests for its code changes, success and error paths
- all tests must pass before the next task starts
- update this plan file when scope changes during implementation
- run `bun run lint:fix` on the edited files after each task
- every task that touches `src/test/preload.ts` ends with a full `bun test` and `bun run tsc`, because the mock is process-global and `bun test` does not type-check
- snapshot updates are scoped to one file: `bun test <file> --update-snapshots`, then read the `.snap` diff
- no backward compatibility with the old file layout, on purpose

## Testing Strategy

- **unit tests**: `src/server/utils/__tests__/reloading-file.test.ts`, `src/server/utils/__tests__/hash.test.ts`, `scripts/lib/__tests__/note-refresh.test.ts`, `src/server/repository/__tests__/media-cache.test.ts`, `src/server/repository/__tests__/mnemonic-image-fetcher.test.ts` (rewritten), `src/server/services/__tests__/azure-tts.test.ts`
- **integration (API E2E) tests**: `src/server/__tests__/api.add-to-anki.test.ts` runs the add path through `api.request()`. It covers the create and update paths of the media cache: first add downloads and writes, second add reads from disk, a failed download on a miss still fails the add. `api.search.test.ts` covers the registry read and append through the search route: a page not in the fixture appends one line, a second search makes no scrape
- **e2e UI tests**: none in the project. The web UI does not change
- the `fs/promises` mock is process-global and lives in `src/test/preload.ts`, so every new fs call (`stat`, `appendFile`, `readdir`, `mkdir`) is added there first, in the task that needs it

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope

## Solution Overview

- **Media cache** `src/server/repository/media-cache.ts`: one function `getOrFetchMedia`. Folder plus name without extension in, file name plus bytes out. A hit never touches the network, a miss fetches, writes atomically and returns. The Anki name is built by the caller as `${deckId}_${fileName}`, so files on disk carry no deck id. The SVG and picture names hold a hash of the URL, so a changed URL refetches. The reading clips keep today's hash of the pronunciation, so their Anki names do not change.
- **Registry** `data/userdata/mnemonic-images.jsonl`: one line per page, appended after each scrape, read through the reloading helper before every lookup. One module-level instance, exported as `getMnemonicImageUrl(documentUrl)`, so `data-loader.ts` no longer owns it.
- **Reloading file** `src/server/utils/reloading-file.ts`: `createReloadingFile({ path, parse })` with `get()`. A stat per call, a reread when mtime or size changed. Async `fs/promises` only, so the test mock sees it.
- **Sentence voice from the slug, reading gender from the reading**: the voice is `voiceList[hashNumber(slug) % voiceList.length]`, the gender is `hashNumber(primaryReading) % 2`. A word always gets the same voice and gender, so every clip name is stable and a re-sync is a hit for every file. The name hashes the exact SSML that is sent, so a changed sentence, voice list or SSML format regenerates by itself.
- **Git**: `.gitattributes` in the data repo, `*.jsonl merge=union` and `media/** merge=ours`, plus one config line per clone.

## Technical Details

### Hash helpers

`src/server/utils/hash.ts`: `shortHash(text)` moves here from `anki-connect.ts` unchanged (first 8 hex chars of SHA-1), plus `hashNumber(text)` = `parseInt(shortHash(text), 16)`. Both `anki-connect.ts` and `azure-tts.ts` import from here, no cycle.

### Atomic write

`writeFileAtomic(path, data: string | Buffer)` in `src/server/utils/json-utils.ts`: write `${path}.${randomUUID()}.tmp`, rename over `path`, unlink the temp file on error. `saveJsonAtomic` calls it. `randomUUID` from `crypto`, not `Math.random`, so the seeded test random is not consumed. Two concurrent misses of one name then write two temp files and the second rename wins with the same content.

### Media cache

```ts
type MediaFolder = "radicals" | "mnemonics" | "readings" | "sentences";

export type FetchedMedia = { data: Buffer; extension: string };

export async function getOrFetchMedia(params: {
  folder: MediaFolder;
  nameWithoutExtension: string;
  fetch: () => Promise<FetchedMedia>;
}): Promise<{ fileName: string; data: Buffer }>;
```

- Root `./data/userdata/media/`, folder path `${root}/${folder}`.
- Hit: `readdir(folderPath)` (an `ENOENT` of the folder is an empty list), keep the entries that are exactly `${nameWithoutExtension}.${ext}` with no dot in `ext` (this skips `.tmp` files). One match: `readFile` it, return `{ fileName, data }`. Two matches throw `Two cached files for ...`, never pick one. A read error on a hit throws, it never falls back to the network.
- Miss: `mkdir(folderPath, { recursive: true })`, `fetch()`, `fileName = ${nameWithoutExtension}.${extension}`, `writeFileAtomic`. The box commits on a timer, a half file must never land in git.
- Log `[Media] Cache hit: readings/hito_female_ab12cd34.mp3` and `[Media] Cache miss: ... (12.3 KB)`.
- `extensionOfContentType(contentType)` in the same module: `image/svg+xml` → `svg`, `image/png` → `png`, `image/jpeg` → `jpg`, `image/gif` → `gif`. Only the mnemonic picture uses it, the clips pass `mp3` themselves. The part after `;` is dropped. Anything else, or a missing header, throws `Unknown media content type: ...`. Never guess.

### Call sites in `anki-connect.ts`

- `downloadMedia({ url, extension? })`: fetch, bad status throws `createAnkiError("Failed to download media (status): url", "downloadMedia")`. With `extension` given it is used as is, else `extensionOfContentType(response.headers.get("content-type"))`. Replaces `fetchAndStoreSvg`, `fetchAndStoreAudio` and `storeAudioData`.
- `storeMediaFile(filename, data: Buffer)` does the base64 itself.
- Radical SVG, two places (radical note, kanji radical list): `getOrFetchMedia({ folder: "radicals", nameWithoutExtension: `${radical.slug}_${shortHash(svgUrl)}`, fetch: () => downloadMedia({ url: svgUrl, extension: "svg" }) })`. The type is known from the API metadata, `getRadicalSvgUrl` picks the `image/svg+xml` image. Anki name `${deckId}_${fileName}`.
- Radical mnemonic picture, new: when `radical.mnemonicImageUrl` is set, `getOrFetchMedia({ folder: "mnemonics", nameWithoutExtension: `${radical.slug}_mnemonic_${shortHash(url)}`, fetch: () => downloadMedia({ url }) })`, the extension from the response header. Anki name `${deckId}_${fileName}`, `storeMediaFile`, and `mnemonic_image` holds the full tag `<img src="${ankiName}" class="mnemonic-img">`, like the `character` field holds the SVG tag. Anki's Check Media keeps only files that a field references through an `<img>` or `[sound:]` tag, a bare name in a field is not a reference and the file would be deleted. The template line becomes `{{#mnemonic_image}}{{mnemonic_image}}{{/mnemonic_image}}` and is synced with `bun run sync-anki-templates`. Without a URL the field stays `""`. `buildRadicalNoteFields` takes `{ radical, storedSvgFilename, storedMnemonicFilename }`.
- Reading clips, the gender from the primary reading hash: `getOrFetchMedia({ folder: "readings", nameWithoutExtension: `${slug}_${gender}_${shortHash(pronunciation)}`, fetch: () => downloadMedia({ url: audio.url, extension: "mp3" }) })`. `selectReadingAudios` already keeps `audio/mpeg` only. Anki name `${deckId}_${fileName}`.
- Sentence clip: `const { voices } = readAzureTtsConfig()`; when the sentence is not blank: `const voice = pickSentenceVoice(voices, slug)`, `const ssml = buildSentenceSsml({ text, voice })`, `getOrFetchMedia({ folder: "sentences", nameWithoutExtension: `${slug}_${shortHash(ssml)}`, fetch: () => generateSentenceAudio(ssml) })`. Anki name `${deckId}_${fileName}`.
- The reading gender comes from the primary reading, not from `Math.random`: `hashNumber(primaryReading) % 2 === 0 ? "female" : "male"`, with `getPrimaryReading(vocabulary.readings)` for vocabulary and `characters` for kana vocabulary. A word always gets the same gender, so a re-sync is a cache hit for every file. The owner chose the reading as the hash input. It also keeps the gender independent of the sentence voice: with two voices, female first, a slug hash for both would always give the reading the same gender as the sentence. Write that reason as a code comment. No `Math.random` is left in the server code, so the seeded random in `src/test/preload.ts` and `resetRandom()` go away.

### `azure-tts.ts`

- `readAzureTtsConfig(): { key, region, voices }`: reads the three env vars and throws `Missing AZURE_TTS_KEY in the root env file` (the first missing name) when one is absent. The root env file is required from now on, there is no silent skip: `src/server/index.ts` calls it before `initRepository()`, and the add path calls it again before the cache lookup. `bun run preview` then fails at start. Under `bun run dev` the vite plugin loads the entry on the first `/api` request, so vite starts and the first API request fails with `Missing AZURE_TTS_KEY ...` in the dev server log, the same way a bad data file fails today. The owner decided this on 2026-10-02: every env value is required to run the server, or the server fails loudly. Both machines must hold the same `AZURE_TTS_VOICES` list, because the voice is part of the clip name.
- `pickSentenceVoice(voices, slug)`: `voices[hashNumber(slug) % voices.length]`.
- `buildSentenceSsml({ text, voice })`: the SSML string built today inside `generateSentenceAudio`, XML-escaped. The SSML plan later changes only this function, and every clip name changes with it.
- `generateSentenceAudio(ssml): Promise<FetchedMedia>`: posts the SSML with the key and region from `readAzureTtsConfig()`, returns `{ data, extension: "mp3" }`. It never returns null. The log line shows the first 50 chars of the SSML text.

### Registry

- Path `./data/userdata/mnemonic-images.jsonl`. Line shape `{"page": string, "image": string | null}`.
- `parseMnemonicImageLines(content: string | null): Map<string, string | null>`: `null` is an empty map; split on `\n`, skip blank lines, `JSON.parse` each, check `page` is a string and `image` is a string or null, else throw `Invalid ./data/userdata/mnemonic-images.jsonl line N: ...`.
- Two lines for one page are merged without looking at their order, because git's union driver puts the lines of both sides in no fixed order: an identical duplicate is fine, a URL beats `null`, and two different URLs throw `Invalid ... page <url> has two images, delete one line`. Both machines scrape the same page, so two different URLs only happen when WaniKani changed the picture in between, and the user picks the line to keep.
- The module holds one `createReloadingFile` and one `pendingFetches` map, and exports two functions: `getMnemonicImageUrl(documentUrl)` and `loadMnemonicImageRegistry()`, which `initRepository` awaits so a broken line fails the start. The class, `createMnemonicImageFetcher`, `imageFetcher` in `data-loader.ts`, `saveIfNeeded`, `hasUnsavedChanges`, `saveCache` and both `await saveCache()` lines in `api.ts` go away.
- `getMnemonicImageUrl` awaits `registry.get()`, looks the page up, and on a miss scrapes once (through `pendingFetches`) and then `appendFile(path, JSON.stringify({ page, image }) + "\n")`. The pending entry is deleted in a `finally` after the append, so a second call in between waits instead of scraping again. A failed append fails the request. No memory patch after the append, the next `get()` rereads because the mtime changed. `appendFile` creates the file on the first scrape.
- `fetchMnemonicImageUrl` throws on a bad status. A failed scrape appends nothing and the subject still builds with `null`, as today, so the next search retries. Only a page that was really read is recorded, because a `null` in an append-only file shared by two machines stays forever.

### Reloading file

```ts
export function createReloadingFile<T>(params: {
  path: string;
  parse: (content: string | null) => T;
}): { get: () => Promise<T> };
```

- `get()`: `stat(path)`; `ENOENT` means `content = null`, any other error throws. When `mtimeMs` and `size` equal the last seen pair, return the held value. Else `readFile(path, "utf-8")`, `parse`, then hold the value and the pair, return. The pair is stored only after `parse` succeeded, so a bad file throws on every `get()` and a fix is picked up by the next one.
- `parse` is sync and gets `null` for a missing file. It decides what empty means. Creating a missing file is not its job.
- Two concurrent `get()` calls may both read, both parse the same content. No lock.

### Test infrastructure

- `src/test/preload.ts`:
  - The two fixtures are seeded into the `files` map under their real paths (`./data/userdata/mnemonic-images.jsonl`, `./data/userdata/study_materials_extra.json`), read with `readFileSync` from `fs`, once at preload start and again in `resetFsMock()`. The seed goes through `setFileContent`, so it bumps the version. The two `readFile` redirects go away. (In Task 2 the old `.json` fixture is seeded under the old `.json` path, Task 3 switches it to `.jsonl`.)
  - Map keys are normalized with `path.normalize`, so `./data/x` and `data/x` are one key. `writeCalls[].path` keeps the raw path, the existing tests compare it with `./data/...`.
  - The map holds `string | Buffer`. `writeCalls[].data` becomes `string | Buffer`; the three readers wrap it in `String()`: `lastWrite()` in `study-material-fixture.ts`, the `.endsWith` check in `study-material.test.ts`, the `JSON.parse` in `mnemonic-image-fetcher.test.ts`.
  - One global version counter that only grows and that `resetFsMock` never resets. `writeFile`, `appendFile`, `rename` (target) and `setFileContent` bump the version of their path. `setFileContent` accepts `string | Buffer`.
  - `stat(path)` answers `{ mtimeMs: version, size: byte length }` from the map, `ENOENT` (an error with `code`) when the path is not in the map. It never calls the real `stat`.
  - `appendFile(path, data)` concatenates onto the map entry (creates it) and records a write.
  - `readdir(dir)` lists the base names of the map entries directly under `dir`, `ENOENT` when there is none.
  - `mkdir` is a no-op.
  - `readFile` without encoding returns the `Buffer`, with encoding the string. A path not in the map still falls through to the real `readFile`, that is how the subject JSON files load. A path under `data/userdata/media/` and the two seeded paths never fall through: once a test removes a seeded entry with the mocked `unlink`, a read of it answers `ENOENT` instead of the user's real file. The check compares the normalized path with the two seeded paths exactly, never with `includes`, because `loadStudyMaterialFixture` reads `src/test/fixtures/study_materials_extra.json` through the same mock and that file has the same base name.
  - `FsOp` gains `stat`, `appendFile`, `readdir`; `setFsError` and `resetFsMock` cover them.
  - The seeded `Math.random` and `resetRandom()` are removed, nothing in the server code is random any more. `api.add-to-anki.test.ts` drops its `resetRandom()` call.
- `src/test/fetch-interceptor.ts`: every `files.wanikani.com` URL answers with `Content-Type: image/svg+xml` (the mnemonic picture is the only caller that reads it). Add `export const externalFetches: string[]` with every non-AnkiConnect URL, cleared in `resetFetchInterceptor`. It is added in Task 3, the registry test needs it first.
- `api.search.test.ts` gets `beforeEach(resetFsMock)` and `afterEach(resetFsMock)`: earlier tests and earlier files may already have appended a page, and a failed assertion in the broken-file test of Task 9 must not leak into the next test.
- `azure-tts.test.ts` installs its own `createFetchMock` from `src/test/fetch-utils.ts` to read the request body, restores `fetch` in `afterAll`, and saves and restores the `AZURE_TTS_*` env vars, because both are process-global.
- The three `AZURE_TTS_*` test values move from the top of `api.add-to-anki.test.ts` into `src/test/preload.ts`, because `readAzureTtsConfig()` now runs in every add and `index.ts` is not part of the tests. They stay plain assignments, not `??=`: `bun test` loads the root env file on its own, and the real two-voice list would change the SSML hash in the snapshot from machine to machine. `azure-tts.test.ts` sets and restores its own values.
- `api.add-to-anki.test.ts`: `beforeEach` and `afterEach` also call `resetFsMock()`, otherwise the clips of 毎晩 stay cached and the two 404 tests of the same id become hits. Both expected messages become "Failed to download media (404)" / "(500)" with the failing URL asserted.

### Git and docs

- `data/userdata/.gitattributes`:
  ```
  *.jsonl merge=union
  media/** merge=ours
  ```
- Per clone, once: `git -C data/userdata config merge.ours.driver true`. Without it git ignores the `ours` attribute and shows the conflict as before.

## Implementation Steps

### Task 1: Add the hash helpers and the atomic write helper

**Files:**

- Create: `src/server/utils/hash.ts`
- Create: `src/server/utils/__tests__/hash.test.ts`
- Modify: `src/server/utils/json-utils.ts`
- Modify: `src/server/services/anki-connect.ts` (import `shortHash` from the new module)
- Modify: `src/server/utils/__tests__/json-utils.test.ts`
- Modify: `scripts/lib/llm-utils.ts` (the second copy of `saveJsonAtomic`, CLAUDE.md says change both)

- [x] create `src/server/utils/hash.ts` with `shortHash` (moved from `anki-connect.ts`) and `hashNumber`
- [x] add `writeFileAtomic(path, data)` with the `randomUUID` temp name to `json-utils.ts`, make `saveJsonAtomic` call it; give the copy in `scripts/lib/llm-utils.ts` the same temp name
- [x] write tests for `shortHash` (8 hex chars, stable) and `hashNumber` (a number, stable, differs for two slugs)
- [x] `json-utils.test.ts`: the temp path check matches `/\.[0-9a-f-]{36}\.tmp$/` instead of the exact `.tmp` name; `study-material.test.ts` (a failed save leaves no temp entry) must still pass
- [x] run `bun test`, `bun run tsc` and lint - must pass before task 2

### Task 2: Add the reloading file helper

**Files:**

- Create: `src/server/utils/reloading-file.ts`
- Create: `src/server/utils/__tests__/reloading-file.test.ts`
- Modify: `src/test/preload.ts`
- Modify: `src/test/study-material-fixture.ts`, `src/server/repository/__tests__/study-material.test.ts`, `src/server/repository/__tests__/mnemonic-image-fetcher.test.ts` (`String(data)`)
- ➕ Modify: `src/server/utils/json-utils.ts`, `src/server/repository/data-loader.ts` (`isMissingFile` moved to `json-utils.ts`, so the reloading file and the later media cache share it)

- [x] preload: seed the two fixtures into the map through `setFileContent` (the registry still under its old `.json` path in this task), drop the two redirects, normalize the map keys and keep `writeCalls[].path` raw, add the global version counter and `stat`, let `writeFile`, `rename` and `setFileContent` bump the version, `FsOp` and `resetFsMock` cover `stat`
- [x] preload: `files` and `writeCalls` hold `string | Buffer`, `readFile` without encoding returns a `Buffer`; wrap the three `.data` readers in `String()`
- [x] `json-utils.test.ts`: add one `writeFileAtomic` test with `Buffer` data, now that the mock keeps the bytes
- [x] create `createReloadingFile({ path, parse })` with `get()` as described in Technical Details
- [x] write tests, with `resetFsMock` in `beforeEach` and `afterEach`: first `get()` reads and parses; second `get()` with the same stat does not read again (`setFsError("readFile")` after the first call); `setFileContent` from outside makes the next `get()` return the new value; a missing file gives `parse(null)`; a stat error other than `ENOENT` throws; a `parse` error is thrown on every `get()` and a fixed file is picked up by the next one
- [x] run `bun test`, `bun run tsc` and lint - must pass before task 3

### Task 3: Turn the mnemonic image registry into an append-only JSONL file

**Files:**

- Modify: `src/server/repository/mnemonic-image-fetcher.ts`
- Modify: `src/server/repository/data-loader.ts`
- Modify: `src/server/repository/radical.ts`
- Modify: `src/server/api.ts`
- Modify: `src/test/preload.ts`
- Modify: `src/test/fetch-interceptor.ts` (`externalFetches`)
- Rename: `src/test/fixtures/mnemonic-images.json` → `src/test/fixtures/mnemonic-images.jsonl`
- Rewrite: `src/server/repository/__tests__/mnemonic-image-fetcher.test.ts`
- Modify: `src/server/__tests__/api.search.test.ts`

- [x] add `appendFile` to the mock (concatenate, bump the version, record a write)
- [x] convert the fixture to JSONL (one `{"page","image"}` line per entry, same content) and seed it under the `.jsonl` path instead of the `.json` one
- [x] interceptor: push every non-AnkiConnect URL to `externalFetches`, cleared in `resetFetchInterceptor`
- [x] rewrite `mnemonic-image-fetcher.ts`: `parseMnemonicImageLines`, one module-level reloading file and `pendingFetches`, `getMnemonicImageUrl(documentUrl)` and `loadMnemonicImageRegistry()`, append one line after a scrape and clear the pending entry after it, `fetchMnemonicImageUrl` throws on a bad status; delete the class and `createMnemonicImageFetcher`
- [x] `radical.ts` calls `getMnemonicImageUrl`; `data-loader.ts` drops `imageFetcher` and `saveCache`, `initRepository` awaits `loadMnemonicImageRegistry()`; delete both `await saveCache()` in `api.ts`
- [x] rewrite `mnemonic-image-fetcher.test.ts`, with the reset in `beforeEach` and `afterEach` because the bad-line test leaves a broken registry in the shared mock: a known page answers without a fetch; an unknown page scrapes once and appends one line (check `writeCalls`); two calls at once scrape once (the old dedup test); a failed scrape appends nothing and answers `null`; a bad status appends nothing; a failed append (`setFsError("appendFile")`) throws; a line put in with `setFileContent` from outside is found on the next call without a scrape; a bad line fails with its line number; a blank line is skipped; two identical lines for a page are fine; a URL line beats a `null` line in both orders; two different URL lines for a page fail with the page
- [x] `api.search.test.ts`: add `beforeEach(resetFsMock)` and `afterEach(resetFsMock)`; a search for a radical whose page is not in the fixture appends one line, a second search makes no scrape (check `externalFetches`); `radical.test.ts` needs no change, its hit and its snapshot stay
- [x] run `bun test`, `bun run tsc` and lint - must pass before task 4

### Task 4: Add the media cache module

**Files:**

- Create: `src/server/repository/media-cache.ts`
- Create: `src/server/repository/__tests__/media-cache.test.ts`
- Modify: `src/test/preload.ts`

- [x] add `readdir` and the no-op `mkdir` to the mock; a `readFile` under `data/userdata/media/` never falls through to the real disk
- [x] create `getOrFetchMedia` and `extensionOfContentType` in `src/server/repository/media-cache.ts` as described in Technical Details, with the `[Media]` log lines
- [x] write tests, with `resetFsMock` in `beforeEach` and `afterEach`: a miss calls `fetch` once and the file shows in `writeCalls` under the real path with no temp entry left; a second call for the same name is a hit, does not call `fetch` and returns the same bytes; a `.tmp` file next to the name is not a hit; two files with the same name and different extensions throw; a `writeFile` error leaves no temp entry and throws; a `readFile` error on a hit throws and does not call `fetch`
- [x] write tests for `extensionOfContentType`: the four known types, a `; charset=utf-8` suffix, an unknown type and a `null` header throw
- [x] run `bun test`, `bun run tsc` and lint - must pass before task 5

### Task 5: Route the radical SVG and the mnemonic picture through the cache

**Files:**

- Modify: `src/server/services/anki-connect.ts`
- Modify: `src/test/fetch-interceptor.ts`
- Modify: `src/anki-templates/radicals.md`
- Modify: `src/server/__tests__/api.add-to-anki.test.ts`
- Modify: `src/server/__tests__/__snapshots__/api.add-to-anki.test.ts.snap`

- [x] interceptor: `files.wanikani.com` answers with `Content-Type: image/svg+xml`
- [x] add `downloadMedia({ url, extension? })`, change `storeMediaFile` to take a `Buffer` (`storeAudioData` passes `Buffer.from(audio)` until Task 6 deletes it); delete `fetchAndStoreSvg`
- [x] radical note and kanji radical list: `getOrFetchMedia` with folder `radicals` and `${slug}_${shortHash(svgUrl)}`, extension `svg` from the metadata, Anki name `${deckId}_${fileName}`
- [x] radical mnemonic picture: `getOrFetchMedia` with folder `mnemonics` and `${slug}_mnemonic_${shortHash(url)}`, extension from the header, the full `<img src="..." class="mnemonic-img">` tag in `mnemonic_image`; `buildRadicalNoteFields` takes a params object
- [x] `radicals.md`: the template line becomes `{{#mnemonic_image}}{{mnemonic_image}}{{/mnemonic_image}}`, the Fields line says "mnemonic picture as an `<img>` tag of a media file" (`docs/anki-decks-fields.md` lists bare names only, nothing to change there); run `bun run sync-anki-templates` (needs Anki running, ask the user if it is not) (template push deferred to migration step 5, user decision)
- [x] add tests: `beforeEach` and `afterEach` call `resetFsMock()`, the file writes media files and registry lines that must not leak into the next file; a radical add (一, the fixture page with a picture) stores the picture and the field holds the `<img>` tag with the Anki file name; a second add of the same radical makes no request to `files.wanikani.com` (check `externalFetches`) but still calls `storeMediaFile`; a second add of a radical with an SVG (8766) makes no request to `files.wanikani.com`; the SVG 500 test expects "Failed to download media (500)" and the URL
- [x] update the snapshot scoped: `bun test src/server/__tests__/api.add-to-anki.test.ts --update-snapshots`, then check the `.snap` diff: the "add radical (一, id=1)" action list gains `deckNamesAndIds` and a `storeMediaFile`, nothing else changes
- [x] run `bun test`, `bun run tsc` and lint - must pass before task 6

### Task 6: Route the reading clips and the sentence clip through the cache

**Files:**

- Modify: `src/server/services/anki-connect.ts`
- Modify: `src/server/services/azure-tts.ts`
- Modify: `src/server/index.ts`
- Modify: `src/test/preload.ts` (remove the seeded random, add the Azure test values)
- Modify: `src/server/__tests__/api.add-to-anki.test.ts`
- Modify: `src/server/__tests__/__snapshots__/api.add-to-anki.test.ts.snap`
- Create: `src/server/services/__tests__/azure-tts.test.ts`

- [x] `azure-tts.ts`: `readAzureTtsConfig()` that throws with the missing name, `pickSentenceVoice(voices, slug)`, `buildSentenceSsml({ text, voice })`, `generateSentenceAudio(ssml)` returning `FetchedMedia` and never null, no `Math.random`; `src/server/index.ts` calls `readAzureTtsConfig()` before `initRepository()`
- [x] move the three `AZURE_TTS_*` test values from `api.add-to-anki.test.ts` into `src/test/preload.ts`, as plain assignments
- [x] reading clips: `getOrFetchMedia` with folder `readings` and `${slug}_${gender}_${shortHash(pronunciation)}`, extension `mp3`; delete `fetchAndStoreAudio` and `storeAudioData`
- [x] sentence clip: gate on a non-blank sentence only, name `${slug}_${shortHash(ssml)}`, Anki name `${deckId}_${fileName}`
- [x] reading gender from `hashNumber(primaryReading)`; remove the seeded `Math.random` and `resetRandom()` from `src/test/preload.ts` and the `resetRandom()` call from `api.add-to-anki.test.ts`
- [x] write `azure-tts.test.ts` with its own fetch mock and env save/restore: `pickSentenceVoice` is stable for one slug and uses both voices over a set of slugs; `readAzureTtsConfig()` throws with the name of the first missing variable; `buildSentenceSsml` escapes `<` and `&` and holds the voice name; `generateSentenceAudio` posts the SSML as the body with the three headers and returns `extension: "mp3"`; a bad status throws
- [x] update the add tests: a second add of the same word makes no request to `files.wanikani.com` and none to Azure, but every clip is still pushed with `storeMediaFile`; the sentence tag holds `${slug}_<hash>.mp3`; the audio 404 test expects "Failed to download media (404)" and the audio URL
- [x] update the snapshot scoped and check the diff touches only the audio tags (the gender of a word may flip once, the hash decides)
- [x] run `bun test`, `bun run tsc` and lint - must pass before task 7

### Task 7: Give `sync-anki-notes` a radical pass

**Files:**

- Modify: `scripts/sync-anki-notes.ts`
- Create: `scripts/lib/note-refresh.ts`
- Create: `scripts/lib/__tests__/note-refresh.test.ts`
- Modify: CLAUDE.md (the "Anki Note Generation" paragraph, the script table line, and the `--limit` sentence "counts words and kanji together. A dry run lists all words and all kanji notes")

A radical added on its own from the web UI, with no kanji of it in the deck, is never reached by a word or kanji add. After this plan its `mnemonic_image` field still holds the old URL, and the new template would show that URL as text. So the script gets a third pass, the same pattern it already uses for kanji.

- [ ] fetch the radical notes right after the kanji fetch, with `fetchResolvedNotes(baseUrl, "radical")`, so the dry run (which returns early before any batch) can list them, the "No items to update" check counts them, and a failed fetch exits before any write; the dry run says that a real run skips the radicals a word or kanji update refreshed
- [ ] keep the kanji pass results (today `await updateNotes(...)` drops them) and collect the radical names from `data.radicals` of every word and kanji result, like `refreshedKanji` collects the kanji characters; `AnkiAddResult.radicals[].name` is the primary meaning, the same value the radical note holds in `characters` and `meaning`
- [ ] add the radicals that are not in that set with `type: "radical"` under the remaining `--limit` budget; log "Updating N radicals with no kanji"; count the batch in `updated`, which gates the final AnkiWeb sync and the exit code, and add a `Radicals:` line to the summary
- [ ] create `scripts/lib/note-refresh.ts` with `pickNotesToRefresh({ notes, refreshed, remaining })`: drops the notes whose `characters` is in `refreshed`, then takes at most `remaining`; generic over `{ characters: string }` so the script's local `AnkiNoteItem` type fits; both the kanji pass and the radical pass call it
- [ ] write `note-refresh.test.ts`: a refreshed name is skipped, an unknown name is kept, `remaining` cuts the list, `remaining: 0` gives an empty list (the usual case for the radical pass under `--limit`), `remaining` undefined keeps all
- [ ] run `bun test`, `bun run tsc` and lint - must pass before task 8

### Task 8: Git attributes and data repo docs

**Files:**

- Create: `data/userdata/.gitattributes`
- Modify: `data/userdata/README.md`
- Modify: `docs/hosting-on-linux.md`

- [ ] add `.gitattributes` with `*.jsonl merge=union` and `media/** merge=ours`
- [ ] README: replace the `mnemonic-images.json` row with `mnemonic-images.jsonl`, add a `media/` row with the four subfolders, add a "Two machines" section with the config line `git config merge.ours.driver true` and why it is needed
- [ ] hosting doc: add the config line to the data repo bullet in "What you need"
- [ ] no test for docs; `bunx prettier --write docs/hosting-on-linux.md` (`bun run format` covers only `src` and `scripts`, and prettier skips `data/userdata/`), line up the README table by hand

### Task 9: Reread the local study materials on change

**Files:**

- Modify: `src/server/repository/data-loader.ts`
- Modify: `src/server/repository/study-material.ts`
- Modify: `src/server/repository/radical.ts`, `kanji.ts`, `vocabulary.ts` (four builders: radical, kanji, vocabulary, kana vocabulary)
- Modify: `src/server/api.ts` (line 60, `await getKanaVocabulary(id)`)
- Modify: `src/test/study-material-fixture.ts`
- Modify: `src/server/repository/__tests__/vocabulary.test.ts` (`await getKanaVocabulary`), `data-loader.test.ts` (the create-file test moves to the new function)
- Modify: `src/test/preload.ts` (the two seeded paths never fall through to the real disk)
- Modify: `src/server/repository/__tests__/study-material.test.ts`, `src/server/__tests__/api.study-materials.test.ts` (they read `localStudyMaterials` in about 14 assertions)
- Modify: `src/server/__tests__/api.add-to-anki.test.ts`, `api.search.test.ts` and any other test importing `setLocalStudyMaterials`

- [ ] replace `export let localStudyMaterials` and `setLocalStudyMaterials` with a module-level `createReloadingFile` whose `parse` runs `JSON.parse` (a bad JSON throws `Cannot read <path>` like today), then `parseLocalStudyMaterials`, then `checkLocalStudyMaterialSubjects`; `parse(null)` throws `<path> is missing`, because a git pull never deletes the file and a deletion by hand at runtime must fail loudly like a bad file; export `getLocalStudyMaterials(): Promise<Record<string, LocalStudyMaterial>>`
- [ ] move the create branch of `readLocalStudyMaterials` into `ensureLocalStudyMaterialsFile()`, which only `initRepository` calls before the first `get()`; `readLocalStudyMaterials` throws `<path> is missing` on `ENOENT` from then on, so a save after a deletion at runtime fails and writes nothing instead of quietly writing a file with one record; then `initRepository` awaits `getLocalStudyMaterials()` once after the subject arrays are loaded, so a bad file still fails the start
- [ ] `src/test/preload.ts`: the two seeded paths never fall through to the real `readFile`, a removed entry answers `ENOENT`; exact path compare, not `includes`, so the fixture file with the same base name still loads
- [ ] the four subject builders await `getLocalStudyMaterials()`; `getKanaVocabulary` becomes async and `api.ts` line 60 awaits it; the upsert keeps its own `readLocalStudyMaterials()` inside the queue and drops the `setLocalStudyMaterials` call
- [ ] update the two comments in `data-loader.ts` that say the file is only checked at the start, and the comment in `study-material.ts` above the reread in the queue that talks about the memory copy
- [ ] `study-material-fixture.ts`: `resetStudyMaterialState` becomes just `resetFsMock()`, which reseeds the file, and the `setLocalStudyMaterials` import goes; `loadStudyMaterialFixture` stays as it is, it only fills the compare object; the tests that called `setLocalStudyMaterials` call `setStudyMaterialFile`, and the reload picks the change up through the version counter
- [ ] `study-material.test.ts` and `api.study-materials.test.ts` read `await getLocalStudyMaterials()` where they read the variable; the "unreadable file" test keeps its `writeCalls` check and asserts that the get throws, the memory check goes
- [ ] write tests: a record put into the file with `setStudyMaterialFile` after startup shows in the next search answer without a save; a file made invalid after startup fails the next search with a 500 and a fixed file answers again without a restart; a file removed after startup (through the mocked `unlink`) fails the next search, and a save after that throws and writes nothing (`study-material.test.ts`); a valid file read through the getter gives the fixture records (in `study-material.test.ts`, which initializes the repository in `beforeAll`; the getter's parse needs the subject arrays); the two search tests go into `api.search.test.ts`; the create-file test in `data-loader.test.ts` targets `ensureLocalStudyMaterialsFile()` and removes the seeded entry with the mocked `unlink` first, so it works whether ensure checks with `stat` or `readFile`, plus one test that ensure on the seeded file records no write; `vocabulary.test.ts` awaits `getKanaVocabulary`
- [ ] run `bun test`, `bun run tsc` and lint - must pass before task 10

### Task 10: Verify acceptance criteria

- [ ] a radical add, a kanji add and a vocabulary add each hit the cache on the second run and make no external request
- [ ] a page scraped on this machine is one appended line, a page pulled from the other machine needs no scrape
- [ ] the file names on disk carry no deck id, the Anki names do
- [ ] a failed scrape or a failed download writes nothing
- [ ] run full test suite: `bun test`
- [ ] run `bun run tsc` and `bun run lint:fix`

### Task 11: [Final] Update documentation

- [ ] CLAUDE.md structure tree: `media/` with its four subfolders, `mnemonic-images.jsonl`, `media-cache.ts`, `reloading-file.ts`, `hash.ts`, `scripts/lib/note-refresh.ts`
- [ ] CLAUDE.md: add a "Two machines" section under Data Scripts with the design rules from the Overview and the git attributes
- [ ] CLAUDE.md Local Study Materials: replace the `localStudyMaterials` / `setLocalStudyMaterials` / "only filled at startup" sentences with `getLocalStudyMaterials()` and the reread rule
- [ ] CLAUDE.md: rewrite "Caching with Parallel Operations" (the load-once/save-once pattern is gone, point to the registry and `createReloadingFile`); rewrite the Git Workflow line about the `mnemonic-images.json` conflict (union merge now does it); rewrite the Test Architecture lines on the preload fixtures, the fs mock ops and the `localStudyMaterials` reset; drop the paragraph on the seeded `Math.random` and `resetRandom()`
- [ ] CLAUDE.md Anki Integration: `mnemonic_image` holds an `<img>` tag of a media file; "Reading audio: one gender per card, picked at random" becomes "picked from the hash of the primary reading"; the media name line shows `{deckId}_{slug}_{urlHash}.svg`; `shortHash` lives in `src/server/utils/hash.ts`; the repository line "Call `saveCache()` at the end" goes; "`checkLocalStudyMaterialSubjects` runs at the end of `initRepository`" becomes "runs on every reread"; "write `<path>.tmp`" becomes "write `<path>.<uuid>.tmp`"
- [ ] `docs/plans/tts-with-ssml.md`: rewrite every line that mentions the random voice, the two seeded values, `ArrayBuffer | null` or the old clip name, among them the four lines on `generateSentenceAudio` (the one that sends the `<sub>` SSML, the random voice and `ArrayBuffer | null`, the `{deckId}_{slug}_sentence.mp3` name, the one that builds the `<sub>` tags): the SSML comes from `buildSentenceSsml`, the voice from the slug hash, the result is `FetchedMedia`, the name is `{slug}_{ssmlHash}.mp3`, so the change regenerates every clip
- [ ] CLAUDE.md Environment and `docs/hosting-on-linux.md` step 9: the root env file is required; without the three Azure values `bun run preview` fails at start and `bun run dev` fails on the first API request with the missing name in its log; both machines need the same `AZURE_TTS_VOICES` list
- [ ] `docs/backlog.md`: remove the three items
- [ ] move this plan to `docs/plans/completed/`

## Post-Completion

**Migration by hand, before the next server start.** The box runs the old code until its main repo is updated, and its old `saveIfNeeded` would recreate `mnemonic-images.json` and push it back. So the order matters.

0. Stop the dev server on both machines: `bun run dev` in its tmux/screen session on the box, and the one on the Mac. Then make the data repo quiet: pause the box's auto-commit job, let it push its last commit, and on the Mac commit the open change to `mnemonic-images.json` (`git -C data/userdata status` shows one today; do not stash it, the conversion reads the working tree and a later pop would conflict with the deleted file). Pull the data repo on the Mac and check that it is clean. Start no server before step 5.

1. On the Mac, convert the registry and drop the old file, from the project root:

   ```bash
   bun -e 'const m = JSON.parse(await Bun.file("data/userdata/mnemonic-images.json").text()); await Bun.write("data/userdata/mnemonic-images.jsonl", Object.entries(m).filter(([, image]) => image !== null).map(([page, image]) => JSON.stringify({ page, image })).join("\n") + "\n")'
   rm data/userdata/mnemonic-images.json
   ```

   The `null` entries are dropped on purpose. The old scraper also wrote `null` for an error page, so the new one, which throws on a bad status, checks those 16 pages again once.

2. The `ours` driver, once per clone, on both machines:

   ```bash
   git -C data/userdata config merge.ours.driver true
   ```

3. Commit and push the data repo from the Mac: `.gitattributes`, the `.jsonl`, the removed `.json`. Commit and push the main repo.

4. On the box, with its server still stopped: pull the main repo and the data repo, and put the same `AZURE_TTS_*` values into its root env file (the first API request fails without them now).

5. Push the new radical template, then fill the cache and rewrite every note, with Anki running on the Mac:

   ```bash
   bun run sync-anki-templates
   bun run dev               # in its own terminal, it does not return
   bun run sync-anki-notes   # in a second terminal
   ```

   This run calls Azure once per word one last time, because every sentence clip has a new name, and it rewrites every word, kanji and radical note, the radicals through the new third pass. Later runs download nothing: the voice, the gender and every file name are fixed per word. The old `{deckId}_{slug}_sentence.mp3` files in Anki are unreferenced after it; Anki's Check Media removes them. Commit and push the data repo again, it now holds `media/`.

6. On the box: pull the data repo once more so it holds `media/`, resume the auto-commit job, then start the dev server. The Mac server keeps running from step 5. On each machine open the app and run one search, because a missing env value only shows on the first API request.

**Manual verification**

- Open a radical with a mnemonic picture in Anki and check that the picture shows from the media folder.
- Edit `study_materials_extra.json` by hand while the server runs and search the subject: the note must show without a restart.
- Break one line of `mnemonic-images.jsonl` while the server runs: the next radical search answers a 500, the server log names the line number, and the search works again after the fix.
