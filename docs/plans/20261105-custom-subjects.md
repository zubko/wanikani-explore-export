# Custom subjects: user-written words next to the WaniKani data

## Overview

- Let the user add their own vocabulary and kana vocabulary words. They live in one file apart from the WaniKani data, `data/userdata/custom_subjects.json`, and the server treats them like WaniKani words: the search finds them, the web app shows them, the add to Anki writes them, and the local notes and synonyms work on them.
- The main use case is the iKnow Core 1000 words that WaniKani does not teach (そう, どうぞ, くれる, もっと, いつも, みんな in `iknow-vocabulary-status.json` `problems`). The new skill adds such a word as a custom subject and to Anki, and drops its `problems` entry. A later iKnow run skips it as already in Anki. A word that comes up in a future course file is found by the search like a WaniKani word.
- A DELETE does not remove the record. It sets `hidden_at`, like WaniKani hides a subject. The server then treats the word as absent everywhere through `isVisibleSubject`, the id stays taken, and a local notes entry of that id still passes the start check.
- A custom id starts at 1,000,000, far above the WaniKani ids (9,539 today), so a glance tells the source and the two never clash.
- The only writer for now is an AI agent, through five new API routes and a new skill. No web UI to add a word is planned. That goes to the backlog.
- Custom kanji and radicals are not part of this plan. The file shape allows them later, the checks refuse them now. That goes to the backlog too.

Decisions from the brainstorm of 2026-11-05, do not reopen:

- The file is read through `createReloadingFile`, like the local notes, and merged into the WaniKani pool on every request. A `git pull` on the other machine shows a new word with no restart. The four WaniKani arrays stay read once at start.
- Back links (a kanji card lists the custom words that use it) are computed at load from the custom word's own kanji ids. Nothing is written into the WaniKani files and no patch is needed.
- POST stores only. The reading clips and the sentence clip are made on the first add to Anki through the media cache, like today.
- A custom word has `level: 0`. The web UI shows a "custom" badge. The Anki vocabulary note has no level field, so Anki changes nothing here.
- A clash is "same `characters` as a visible WaniKani word", vocabulary and kana vocabulary as one pool. POST refuses it with 409, PUT cannot change the characters, the loader and the download script only warn.
- Reading audio of a custom word comes from Azure TTS, one clip per reading, with the gender hash of today and the voice at that gender's position in `AZURE_TTS_VOICES` (female first, male second).

## Context (from discovery)

- `src/server/repository/data-loader.ts` exports the arrays `radicals`, `kanji`, `vocabulary`, `kanaVocabulary`, read once in `initRepository`. It also holds the reloading file of the local notes, `findSubjectTypeById(id)` (sync, scans the four arrays) and `checkLocalStudyMaterialSubjects({ records, unknownSubject })`, which the notes `parse` calls in `"skip"` mode and `initRepository` in `"fail"` mode.
- `src/server/utils/reloading-file.ts`: `createReloadingFile({ path, parse })`, `parse` is sync and gets `null` for a missing file.
- `src/server/repository/data-paths.ts` holds the three path constants and has no imports, because `src/test/preload.ts` loads it before the `fs/promises` mock.
- Readers of the two vocabulary arrays: `src/server/repository/vocabulary.ts` (`findAndBuildVocabulary`, `getVocabulary`, `getKanaVocabulary`), `src/server/repository/kanji.ts` (`buildSubjectReferences(vocabulary, amalgamation_subject_ids)` for `foundInVocabulary`), `src/server/api.ts` (`resolveWkSubject`, sync, called once per deck note by `/anki-notes`, imports `vocabulary as vocabularyData`). `radical.ts` and `study-material.ts` do not read them. `src/server/repository/__tests__/study-material.test.ts` calls `findSubjectTypeById` without `await`.
- `BaseSubjectDataFields` in `src/model/wanikani.ts` holds `document_url: string` for all four types. The wrapper field `url` is read nowhere in `src/` or `scripts/`.
- `vocabulary.ts` fills `conjugations` from `verbConjugations[id]` and the sentence `reading` from `sentenceReadings[id]`, both keyed by id from the two LLM files in `data/`.
- `src/server/repository/study-material.ts`: the write pattern to copy. One module-level `queue`, `LOCAL_STUDY_MATERIAL_SAVE_ATTEMPTS = 3`, `readFileVersion` before the read, `saveJsonAtomicIfUnchanged` after the merge, a log line per failed attempt.
- `src/server/services/anki-connect.ts`: `preferredReadingGender(vocabulary)` hashes `reading-gender:${primaryReading}`; `pickReadingAudios` picks the WaniKani clips by gender; `storeReadingAudio` caches `readings/{slug}_{gender}_{shortHash(pronunciation)}.mp3`; `storeSentenceAudio` builds SSML with `buildSentenceSsml`, names the clip with `sentenceAudioHash(ssml)` and fetches with `generateSentenceAudio({ ssml, config })`.
- `src/server/services/azure-tts.ts`: `readAzureTtsConfig()` splits `AZURE_TTS_VOICES` and refuses an empty entry. `pickSentenceVoice(voices, slug)` hashes the slug.
- `src/model/wanikani.ts`: `VocabularyData` / `KanaVocabularyData` wrap `data` with `document_url: string`, and the enriched `Vocabulary` / `KanaVocabulary` have `documentUrl: string`. `VerbConjugations` is `{ type: "verb", dictionary, masu, te, nai }`.
- `src/model/anki-models.ts`: `VOCABULARY_EXPECTED_FIELDS` has no level field.
- `src/client/components/card-components/CardHeader.tsx` already renders the WaniKani link only when `documentUrl` is set, but the prop type is `string | undefined`. No component shows the level.
- `scripts/generate-verb-conjugations.ts` detects a verb by `parts_of_speech` holding `ichidan verb` or `godan verb`, plus an irregular id list.
- `src/test/preload.ts`: `SEEDED_FILES` seeds the two fixtures under their real paths at start and in `resetFsMock()`. `setFileContent(path, data)` changes a file like an outside edit. `writeCalls` records the atomic writes under the real path.
- `src/test/fetch-interceptor.ts` answers `.tts.speech.microsoft.com` with 100 bytes of `audio/mpeg` and lists the URL in `externalFetches`. Every TTS call has the same URL, so the list only counts calls, and the file name holds only a hash of the SSML. A test cannot see the spoken text or the voice today. The plan adds `ttsRequests`, the SSML body of every TTS call, cleared by `resetFetchInterceptor()`.
- `src/test/preload.ts` sets `AZURE_TTS_VOICES = "ja-JP-TestNeural"`, one voice. Every sentence clip name in the snapshots depends on it, also the inline snapshot at `api.add-to-anki.test.ts:465-468` (one WaniKani reading path, one sentence path). Inline snapshots are updated with the scoped command, never by hand.
- Snapshots that hold a vocabulary object and change with a new field: `src/server/repository/__tests__/__snapshots__/vocabulary.test.ts.snap`, `kanji.test.ts.snap`, `src/server/__tests__/__snapshots__/api.search.test.ts.snap`, `api.add-to-anki.test.ts.snap`. Typed vocabulary objects in `src/client/components/__tests__/VocabularyCard.test.tsx` and `SearchResult.test.tsx`.
- `CardHeader` declares a `subtitle` prop but never renders it. The phone grid puts the title in row 2.
- `add-iknow-vocab.ts` never comes back to a word in `problems`: the saved index moved past it, and `problemWords` skips it in later course files too.
- The skill style to copy: `.claude/skills/add-iknow-vocab/SKILL.md` (frontmatter, numbered sections, `curl` against the dev server, read the body not the status).
- `scripts/download-subjects.ts`: `main()` fetches, groups and calls `saveToFiles`. A script may import types and pure helpers from `src/model/` with a relative path.

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
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- run `bun test`, `bun run tsc` and `bun run lint:fix` after each task
- no backward compatibility is needed: the file is new, a missing file is created empty

## Testing Strategy

- **unit tests**: `src/model/__tests__/custom-subject-utils.test.ts` for the pure checks and helpers, with an in-file fixture.
- **integration tests** (the API E2E tests through `api.request()`): the project has them in `src/server/__tests__/`, so every create, update and delete path gets one there. `api.custom-subjects.test.ts` covers POST, PUT, DELETE and GET, the 409 and 400 answers, the atomic write through `writeCalls`, and a GET after an outside change through `setFileContent`. `api.search.test.ts` and `api.add-to-anki.test.ts` get one custom word each.
- **repository tests**: `data-loader.test.ts` for the parse and the start checks, `custom-subject.test.ts` for the write queue and the version retry, `vocabulary.test.ts` and `kanji.test.ts` for the merged getters and the back links.
- **client tests**: `VocabularyCard.test.tsx` for the badge and the hidden link.
- **fixtures**: `src/test/fixtures/custom_subjects.json` holds `[]`. A test that needs a custom word writes it with `setFileContent(CUSTOM_SUBJECTS_PATH, ...)` from a shared helper `src/test/custom-subject-fixture.ts`, so the fixture records live in one place.
- no e2e browser tests in this project.

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope
- keep plan in sync with actual work done

## Solution Overview

- One new data file, one new repository module for writes, five new routes, one new skill.
- The custom file holds records in the WaniKani wrapper shape, so the enrich code in `vocabulary.ts` needs no second path. The only extra fields are `data.conjugations` for a verb and `reading` inside each context sentence. A custom id tells the enrich step to read these inline instead of the LLM files.
- Two async getters replace the direct array reads for the vocabulary types. Every reader of `vocabulary` or `kanaVocabulary` goes through them, so no module can forget the custom words.
- The pure checks live in `src/model/`, so the loader, the routes and the download script run the same rules. The loader warns on a WaniKani clash, the routes refuse it.
- The write path copies `upsertLocalStudyMaterial`: a queue, a read inside the queue, a version check before the rename, three attempts.

## Technical Details

### File shape

`data/userdata/custom_subjects.json`, a JSON array. One record:

```json
{
  "id": 1000001,
  "object": "kana_vocabulary",
  "url": null,
  "data_updated_at": "2026-11-05T10:00:00.000Z",
  "data": {
    "created_at": "2026-11-05T10:00:00.000Z",
    "level": 0,
    "slug": "どうぞ",
    "hidden_at": null,
    "document_url": null,
    "characters": "どうぞ",
    "meanings": [{ "meaning": "Please", "primary": true, "accepted_answer": true }],
    "auxiliary_meanings": [],
    "parts_of_speech": ["adverb"],
    "meaning_mnemonic": "...",
    "context_sentences": [{ "en": "...", "ja": "...", "reading": "..." }],
    "pronunciation_audios": [],
    "lesson_position": 0,
    "spaced_repetition_system_id": 0
  }
}
```

A `vocabulary` record adds `readings`, `reading_mnemonic` and `component_subject_ids`. A verb of either type adds `conjugations: { dictionary, masu, te, nai }`. Kana-only verbs like くれる and あげる are `kana_vocabulary`, like every kana word in the WaniKani data, so the kana type carries conjugations too. A deleted record has `hidden_at` set to the time of the delete.

The agent sends only the content. The server fills the fixed fields. The POST and PUT body of a kana verb:

```json
{
  "object": "kana_vocabulary",
  "data": {
    "characters": "くれる",
    "meanings": [...],
    "auxiliary_meanings": [],
    "parts_of_speech": ["ichidan verb"],
    "meaning_mnemonic": "...",
    "context_sentences": [{ "en": "...", "ja": "...", "reading": "..." }],
    "conjugations": { "dictionary": "くれる", "masu": "くれます", "te": "くれて", "nai": "くれない" }
  }
}
```

A `vocabulary` body adds `readings`, `reading_mnemonic` and `component_subject_ids` with at least one id, and its `characters` hold at least one kanji. The server sets `url: null`, `level: 0`, `slug` = `characters`, `hidden_at: null`, `document_url: null`, `pronunciation_audios: []`, `lesson_position: 0`, `spaced_repetition_system_id: 0`, `created_at` and `data_updated_at`.

Types in `src/model/wanikani.ts`:

- `url: string | null` on `BaseSubjectWrapper`. Nothing reads it.
- `document_url` moves out of `BaseSubjectDataFields` into the four data-fields types: `string` for radical and kanji, `string | null` for the two vocabulary types. `documentUrl: string | null` on the enriched `Vocabulary` and `KanaVocabulary`.
- `conjugations?: Omit<VerbConjugations, "type">` on `VocabularyDataFields` and on `KanaVocabularyDataFields`. A WaniKani record never has it, a custom verb record does. So a custom record is a plain `VocabularyData` or `KanaVocabularyData`, and the getters answer `VocabularyData[]` with no new union. `CustomSubject = VocabularyData | KanaVocabularyData` is only a name for the records of the custom file.
- `conjugations: Conjugations | null` on the enriched `KanaVocabulary` too, so `buildVocabularyNoteFields` in `anki-connect.ts` and the conjugation rows of `VocabularyCard` read it from either type. A WaniKani kana word answers `null` there, as today's `vocabulary` words with no entry do.
- `CustomSubjectInput`, the body above, built from `Pick` of the data-fields types.
- `isCustom: boolean` on `Vocabulary` and `KanaVocabulary`.
- `CUSTOM_SUBJECT_ID_FLOOR = 1_000_000` in `src/model/wanikani.ts` next to `SUBJECT_TYPES`.

### Checks

`src/model/custom-subject-utils.ts`, pure:

The `validate...` functions throw and answer nothing. Each throws a `ValidationError` from a new import-free module `src/model/validation-error.ts`, whose message names the path of the bad value, like `data.meanings[1].primary must be a boolean`. A caller that needs a status catches that class right around the one call it means: the write module catches it around `validateCustomSubjectInput` only and turns it into a `CustomSubjectWriteError` with status 400 and the same message, and the route answers the message as `error`. The file read, `readCustomSubjects()`, catches the error of `validateCustomSubjects` and throws a plain `Error`, `Invalid <path>: <message>`. So a badly shaped file is a 500 on a write and on a request, and a failed start at boot, never a 400. `validateCustomSubjects` adds the record id in front of the message. The three functions sit at three levels: `validateCustomSubjectInput` checks the body an agent sends, `validateCustomSubjectRecord` checks one stored record (the fixed fields, then the body check on the rest), `validateCustomSubjects` checks the whole file (an array, every record, no duplicate id or spelling). The first one has the one rule that needs outside data, the kanji ids, which is why the write module passes them in and the record check passes `null`.

The two existing helpers in `src/model/subject-utils.ts` get the same shape in this plan, so one rule holds for every check in `src/model/`: `localStudyMaterialValueProblem(field, value)` becomes `validateLocalStudyMaterialValue(field, value)` and `readingNoteProblem(type)` becomes `validateReadingNote(type)`, both throw a `ValidationError` instead of answering a string. These two keep their bare text as today (`must be a string`, `must be an array of strings`, `a <type> has no reading`), because their callers add the place. Their callers change with them: `validateStudyMaterialPatch` in `api.ts` throws a `ValidationError` with the full text for its three cases (`Missing required parameter: ...`, `Invalid field: ...`, `Invalid <field>: <message>`) and the PATCH route catches it around that one call and answers 400; the route catches `validateReadingNote` around its call too and answers 400 `Invalid reading_note: <message>`, so the outer `catch` stays a plain 500 and a `ValidationError` from a deeper call never turns into a 400; `data-loader.ts` catches it and throws `invalidFile` with `subject <id> field <field>` in front, as today. The messages stay the same, so `data-loader.test.ts` and `api.study-materials.test.ts` pass with no edit. Only the plumbing of `string | null` goes away. `CLAUDE.md` names the two old helpers in "Local Study Materials", the rename goes there too.

- `isCustomSubjectId(id)`: integer at or above the floor. It lives here and not in `subject-utils.ts`, next to the other custom helpers.
- `needsConjugations(partsOfSpeech)`: `ichidan verb` or `godan verb`. WaniKani has no tag for an irregular verb, the LLM script keeps an id list for those. A custom record may carry `conjugations` on any word, and must on these two.
- `validateCustomSubjectInput({ input, kanjiIds })` throws on the first bad value. Every required field is listed with its type, nothing is implied: `object` is `vocabulary` or `kana_vocabulary`; `characters` is a non-empty string of kana, kanji, `ー` and `々` only (`^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]+$`), because it becomes `slug` and `slug` is part of the media file names; `meanings` is a non-empty array of `{ meaning, primary, accepted_answer }` with exactly one primary; `auxiliary_meanings` is an array of `{ meaning, type }`; `parts_of_speech` is a non-empty array of strings; `meaning_mnemonic` is a non-empty string; `context_sentences` is an array of `{ en, ja, reading }`, all non-empty strings; a `vocabulary` input has `readings` (non-empty, one primary, the three fields), a non-empty `reading_mnemonic`, `component_subject_ids` as a non-empty array of integers each in `kanjiIds`, and at least one kanji in `characters`; a `kana_vocabulary` input has none of those three and no kanji in `characters`; `conjugations` on either type, when present, has the four non-empty strings, and is present when `needsConjugations`; no unknown key.
- `validateCustomSubjectRecord(record)`: the stored shape. The wrapper fields and the fixed data fields have the right value, `hidden_at` is `null` or a string. Then it strips the fixed data fields (`slug`, `level`, `hidden_at`, `document_url`, `created_at`, `pronunciation_audios`, `lesson_position`, `spaced_repetition_system_id`) and passes `{ object: record.object, data: rest }` to the input check with no kanji list (`kanjiIds: null` skips the kanji rule), so the "no unknown key" rule still holds. The file also comes from the other machine through git, so a wrong shape fails loudly.
- `validateCustomSubjects(records)`: the root is an array, every record passes `validateCustomSubjectRecord`, no two records share an `id`, no two visible records share `characters`. It never checks the kanji ids. A kanji that WaniKani hides later, or one that only the other machine's newer download knows, must not fail the start or block every write. The enrich step already drops a hidden or unknown kanji id through `findVisibleByIds`.
- `findWaniKaniClash({ customSubjects, wanikaniWords })` answers `{ customId, wanikaniId, characters }[]`: same `characters`, both sides visible, `wanikaniWords` already filtered by `isVisibleSubject`.
- `findCustomSubject(customSubjects, id)`: the record or `null`, hidden ones included.
- `nextCustomSubjectId(records)`: the largest id plus one, hidden ones included, or the floor. A delete keeps its record, so an id is never given twice.
- `buildCustomRecord({ id, input, now })` and `buildCustomWordsByKanji(records)` (a `Map<number, number[]>` from the visible `vocabulary` records' `component_subject_ids`, in file order).

### Loader

`src/server/repository/data-loader.ts`:

- `createReloadingFile` in `src/server/utils/reloading-file.ts` takes `parse: (content) => T | Promise<T>` and awaits it. The notes `parse` can then read the custom list itself, so a `reading_note` on a custom kana word is refused on a reread like one on a WaniKani radical. No other caller changes.
- `const customSubjectsFile = createReloadingFile({ path: CUSTOM_SUBJECTS_PATH, parse })`. `parse` fails on `null` with `<path> is missing` like the notes file, parses the JSON, runs `validateCustomSubjects`, logs one `[Repository]` warning per visible record with a `component_subject_ids` entry that is not a visible kanji (the record is kept, the enrich step drops that id), logs one warning per `findWaniKaniClash` hit, and holds `{ records, wordsByKanji }`. The map is built once per file version here, not per request.
- `initRepository`: after the four files, fail when any WaniKani id passes `isCustomSubjectId` (`WaniKani id <id> reached CUSTOM_SUBJECT_ID_FLOOR`), then `ensureCustomSubjectsFile()` (`saveJsonIfMissing(path, [])`), then one `getCustomSubjects()` read so a bad file fails the start. Then the notes check in `"fail"` mode gets the loaded list.
- `getCustomSubjects()`, `getVocabularyData()` (WaniKani `vocabulary` plus the custom `vocabulary` records, hidden ones included, the readers filter with `isVisibleSubject` like today), `getKanaVocabularyData()`, `getCustomWordsByKanji()`.
- `findSubjectTypeById(id)` stays sync over the four arrays. The PATCH route looks a custom id up with `findCustomSubject(await getCustomSubjects(), id)` and treats a hidden record as not found. Today the type lookup, its 404 and the `reading_note` 400 sit before the route's `try`. They move inside it, so a broken or missing custom file answers the JSON 500 like a broken notes file and not Hono's plain-text 500.
- `checkLocalStudyMaterialSubjects({ records, unknownSubject, customSubjects })`. A custom-range id is looked up in `customSubjects`, hidden records included, like the check accepts a hidden WaniKani id, and gets the same `reading_note` rule by its type. The notes `parse` awaits `getCustomSubjects()` and passes the list with `"skip"`. The start passes the loaded list with `"fail"`, so an unknown custom id fails the start like an unknown WaniKani id.

### Writes

`src/server/repository/custom-subject.ts`:

- `createCustomSubject(input)`, `updateCustomSubject(id, input)`, `deleteCustomSubject(id)`. Every one runs `runInQueue(step)` with the same queue shape as the notes: `const run = queue.then(step); queue = run.catch(() => {}); return run;`.
- A step, up to `CUSTOM_SUBJECT_SAVE_ATTEMPTS = 3` times: `readFileVersion`, `readCustomSubjects()` (the raw read and `validateCustomSubjects`, shared with the loader, no kanji check), compute the new list, `saveJsonAtomicIfUnchanged`. A changed version logs and retries, three changes fail with nothing written.
- The create step runs `validateCustomSubjectInput` with the visible kanji ids, then the clash check of the new `characters` against the visible records of the file and the visible WaniKani pool, picks the id with `nextCustomSubjectId`, builds the record with `now`, and answers it.
- The update step refuses an unknown or hidden id (404), a changed `object` or a changed `characters` (400), or an input problem (400), then builds the record again with the old `created_at` and a new `data_updated_at`. `characters` is immutable because the Anki note is found by its characters, not by the id: a new spelling would leave the old note behind and create a second one. A new spelling is a DELETE and a POST. With `object` and `characters` fixed, an update needs no clash check.
- The delete step refuses an unknown or hidden id (404) and sets `hidden_at` to `now`. A later POST of the same `characters` gets a new id.
- Ids are given once per machine. Two machines that create at the same time before a pull can pick the same id. Git then conflicts on the file, and the fix is by hand: renumber one record and its notes entry in `study_materials_extra.json`. The duplicate-id check fails loudly until then.
- The refusals are typed: `CustomSubjectWriteError` with `status: 400 | 404 | 409` and the message, so the route maps them with no string matching. A read or write error stays a plain `Error` (500).

### Routes

`src/server/api.ts`, in the chain for the RPC types:

| Method | Path                   | Answer                                                                                                                    |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/custom-subjects`     | `{ ok: true, data: CustomSubject[] }`, hidden records included, 500 on a broken file                                      |
| GET    | `/custom-subjects/:id` | `{ ok: true, data: CustomSubject }`, hidden record included, 404 unknown id, 400 when `:id` is not a custom id            |
| POST   | `/custom-subjects`     | body `{ object, data }`, 201 `{ ok: true, data: CustomSubject }`, 400 on a bad body or check, 409 on a clash              |
| PUT    | `/custom-subjects/:id` | body `{ object, data }`, 200 `{ ok: true, data }`, 400 on a bad body, a changed `object` or `characters`, or a check, 404 |
| DELETE | `/custom-subjects/:id` | 200 `{ ok: true }`, 404 unknown or hidden id, 400 when `:id` is not a custom id                                           |

Every error answer is `{ ok: false, error }` with `as const`. The id of GET by id, PUT and DELETE must pass `isCustomSubjectId`, a WaniKani id answers 400 with `not a custom subject id`. Hono RPC types `param: { id }` from the path. The Anki note and the notes entry of a deleted word stay. No client calls in `src/client/api.ts`: no UI uses them, the backlog item names them.

### Readers

- `vocabulary.ts`: the three `find` calls use the getters. `mapVocabularyDataToVocabulary` sets `isCustom`, and for a custom id takes `conjugations` from `data.conjugations` and leaves the context sentences as they are (the `reading` is inline). `documentUrl` passes `null` through.
- `kanji.ts`: `foundInVocabulary` is built from `await getVocabularyData()` with `[...amalgamation_subject_ids, ...(customWordsByKanji.get(id) ?? [])]`, so `amalgamationSubjectIds` lists the custom word too.
- `api.ts`: `/anki-notes` reads the two getters once before `deckNotes.map` and passes the arrays into `resolveWkSubject`, which stays sync. One `stat` per request, not one per note. The PATCH route falls back to the custom lookup when `findSubjectTypeById` answers `null`.

### Anki

`anki-connect.ts`:

- `pickReadingAudios` stays for WaniKani words. A new branch for `isCustom` in `addOrUpdateVocabularyCore`: `readings` of a `vocabulary` word (primary first), or `[characters]` of a kana word. The gender is `preferredReadingGender(vocabulary)`. For every reading: `voice = pickVoiceForGender(voices, gender)`, `ssml = buildSentenceSsml({ text: reading, voice })`, `storeCachedMedia({ deckId, folder: "readings", nameWithoutExtension: \`${slug}_${gender}\_${sentenceAudioHash(ssml)}\`, fetch: () => generateSentenceAudio({ ssml, config }) })`. The tags go into the field of that gender, space separated, like today.
- `azure-tts.ts`: `pickVoiceForGender(voices, gender)` answers `voices[0]` for female and `voices[1]` for male. `readAzureTtsConfig` fails with `AZURE_TTS_VOICES needs exactly two voices, female first` for any other count. A third voice would have no gender.
- `src/test/preload.ts` sets two test voices, `ja-JP-TestFemaleNeural,ja-JP-TestMaleNeural`. `pickSentenceVoice` then picks by hash from two, so every sentence clip name in the snapshots changes. The WaniKani reading clip names do not change, the test checks that.
- `src/test/fetch-interceptor.ts` records the body of every TTS call in `ttsRequests`, so a test can assert the reading text and the voice name in the SSML, and the order of the calls.
- A custom word logs `[Anki] Reading audio <slug>: TTS (custom word)` so the console tells the two paths apart.

### Web UI

- `CardHeader` takes `documentUrl?: string | null` and a new `badge?: string`. `VocabularyCard` passes `badge="custom"` when `isCustom`. The badge is a small rounded label with `text-gray-500` and a gray border, rendered inside the same element as the title, so it moves with the title on the phone (row 2 of the grid). Desktop first: the plain classes are the desktop style, `max-sm:` overrides only when a phone check shows a need.

### Download warning

`scripts/download-subjects.ts`: after `saveToFiles`, read `custom_subjects.json` when it exists, run `findWaniKaniClash` with the visible downloaded vocabulary and kana vocabulary, and print one line per hit: `Warning: custom subject <id> "<characters>" has the same characters as WaniKani <id>`. Exit 0. A missing or broken custom file prints one line and does not fail the download, because the download is the long step.

### Skill

`.claude/skills/add-custom-word/SKILL.md`, the flow in numbered sections:

1. Check the dev server like the iKnow skill.
2. Search the spelling and the kana spelling with `/api/search?type=vocabulary`. A hit with `isCustom: false` is a WaniKani word, stop and tell the user. A hit with `isCustom: true` is a custom word that an earlier run already saved, so skip to step 6 with its id. That is the resume path after a failed Anki add.
3. For a word with kanji, search every kanji with `/api/search?type=kanji`, note every reading with `reading`, `primary`, `accepted_answer` and `type`, and its `readingMnemonic`. A taught reading is one with `accepted_answer: true`; WaniKani lists untaught readings too, like なま for 生.
4. Draft the record and show the mnemonic blocks to the user before anything is saved. A kana word has only the meaning block. Each block comes as one draft or as two or three options. Reading mnemonic rules: every kanji uses its primary taught reading, one draft that states it in the WaniKani style with no new story; a non-primary taught reading, one draft that names it as the other reading WaniKani teaches and reuses that kanji's reading mnemonic where it fits; an untaught reading or an exception, two or three story options. Meaning mnemonic: one draft with the story, where the word is used, its nuance, and a line when the word's meaning is not the kanji meanings put together. The user answers in one of five ways, for each block: accept the draft as is; pick an option; write the whole text; give a hint, a correction or a direction and the agent writes the block again; or pick an option or the draft and add a note, and the agent works the note in. The agent shows the new text after every change and saves nothing the user did not see. Mnemonic tags like `<vocabulary>`, `<kanji>`, `<reading>` as in the WaniKani data. Every context sentence with `en`, `ja` and a kana `reading`. A verb gets `conjugations`.
5. POST the body, read the answer. A 409 names the clashing id, stop.
6. Add to Anki with `/api/add-to-anki`, read the body. On `"ok":false` stop and show the error, the custom record stays and the next run resumes from step 2.
7. When the word sits in `problems` of `iknow-vocabulary-status.json`, drop that entry. The iKnow script never comes back to it, and the next run skips the word as already in Anki.
8. Run the `add-references` skill, then commit and push the data repo (standing rule). The commit holds the custom file, the media, the registry lines and the status file.

`.claude/skills/add-iknow-vocab/SKILL.md` sends the "WaniKani does not teach this word" case of its triage to the new skill.

### Docs

- `CLAUDE.md`: a "Custom Subjects" section under Data Scripts, the five routes in the API table, `custom_subjects.json` in the structure tree, the skill under the skills, the new fixture in Test Architecture, the `AZURE_TTS_VOICES` rule (exactly two, female first) in Environment, the reading clip name of a custom word (`{slug}_{gender}_{ssmlHash}.mp3`, next to the `shortHash` rule of a WaniKani clip), and a line that `custom_subjects.json` has no merge driver: a conflict, or two machines that pick the same id, is fixed by hand, and the duplicate-id check fails loudly until then.
- `docs/backlog.md`: "A web UI to add and edit custom words, on top of the custom-subjects routes. The client api calls do not exist yet" and "Custom kanji and radicals, the file shape allows them".
- `data/userdata/README.md`: the file in the table.

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): tasks achievable within this codebase - code changes, tests, documentation updates
- **Post-Completion** (no checkboxes): items requiring external action - manual testing, changes in consuming projects, deployment configs, third-party verifications

## Implementation Steps

### Task 1: Types, the id floor and the pure checks

**Files:**

- Modify: `src/model/wanikani.ts`
- Create: `src/model/validation-error.ts`
- Modify: `src/model/subject-utils.ts`
- Modify: `src/model/__tests__/subject-utils.test.ts`
- Modify: `src/server/api.ts`
- Modify: `src/server/repository/data-loader.ts`
- Create: `src/model/custom-subject-utils.ts`
- Create: `src/model/__tests__/custom-subject-utils.test.ts`

- [x] create `src/model/validation-error.ts` with `ValidationError`, no imports; rename `localStudyMaterialValueProblem` to `validateLocalStudyMaterialValue` and `readingNoteProblem` to `validateReadingNote` in `subject-utils.ts`, both throw it with the bare text of today; `validateStudyMaterialPatch` in `api.ts` throws it with the full text and the PATCH route catches it around that call and around `validateReadingNote`, answering 400 with the same text as today; `data-loader.ts` catches it and throws `invalidFile` with `subject <id> field <field>` in front; update `subject-utils.test.ts` to `toThrow` with the same messages; `data-loader.test.ts` and `api.study-materials.test.ts` keep their message checks and must pass with no edit
- [x] `src/model/wanikani.ts`: `CUSTOM_SUBJECT_ID_FLOOR`, `CustomSubject`, `CustomSubjectInput`; `url: string | null` on the wrapper; `document_url` moved into the four data-fields types, `string | null` for the vocabulary ones; `conjugations?` on both vocabulary data-fields types; `documentUrl: string | null` and `isCustom: boolean` on `Vocabulary` and `KanaVocabulary`, `conjugations: Conjugations | null` on `KanaVocabulary`
- [x] create `src/model/custom-subject-utils.ts` with `isCustomSubjectId`, `needsConjugations`, `validateCustomSubjectInput`, `validateCustomSubjectRecord`, `validateCustomSubjects`, `findWaniKaniClash`, `findCustomSubject`, `nextCustomSubjectId`, `buildCustomRecord`, `buildCustomWordsByKanji`
- [x] fix the type errors with `bun run tsc`: `CardHeader` prop, the two card components, `isCustom: false` in the typed objects of `VocabularyCard.test.tsx` and `SearchResult.test.tsx`; `vocabulary.ts` sets `isCustom: false` for now
- [x] update the two snapshots that hold a vocabulary object and gained `isCustom` (and `conjugations: null` on kana words), one file at a time: `bun test src/server/repository/__tests__/vocabulary.test.ts --update-snapshots`, then `src/server/__tests__/api.search.test.ts`; read each diff and expect only the new fields
- [x] write tests for the input check: a good kana input, a good kana verb input, a good vocabulary input, wrong `object`, kana input with readings or with a kanji in `characters`, vocabulary input without readings, with two primary readings, with no kanji id or with no kanji in `characters`, unknown kanji id, `kanjiIds: null` skips the kanji rule, every bad case checked with `toThrow` on the message path, godan verb without conjugations on either type, conjugations on a noun accepted, missing `meaning_mnemonic`, a sentence with no `reading`, `characters` with a slash, a space or Latin letters, unknown key
- [x] write tests for the record and file checks: a good record, id below the floor, non-integer id, level not 0, `hidden_at` set accepted, duplicate ids, duplicate characters of two visible records, duplicate characters with one hidden record accepted, root not an array
- [x] write tests for `findWaniKaniClash` (hit, hidden WaniKani word skipped, hidden custom record skipped, no hit), `nextCustomSubjectId` (empty list, gaps, the max is hidden), `buildCustomRecord` (the fixed fields, `slug` = `characters`) and `buildCustomWordsByKanji` (two words on one kanji in file order, hidden word skipped)
- [x] run `bun test`, `bun run tsc`, `bun run lint:fix` - must pass before task 2

### Task 2: The data file in the loader and the test preload

**Files:**

- Modify: `src/server/repository/data-paths.ts`
- Modify: `src/server/utils/reloading-file.ts`
- Modify: `src/server/repository/data-loader.ts`
- Modify: `src/server/utils/__tests__/reloading-file.test.ts`
- Create: `src/test/fixtures/custom_subjects.json`
- Create: `src/test/custom-subject-fixture.ts`
- Modify: `src/test/preload.ts`
- Modify: `src/server/repository/__tests__/data-loader.test.ts`

- [ ] add `CUSTOM_SUBJECTS_PATH` to `data-paths.ts`, no imports
- [ ] `reloading-file.ts`: `parse` may answer a promise, `get` awaits it; a test in `reloading-file.test.ts` with an async `parse` that throws keeps the old value out, like the sync case
- [ ] add the reloading file with `{ records, wordsByKanji }` held per file version, `readCustomSubjects()` (raw read and `validateCustomSubjects`, shared with the write module), `getCustomSubjects()`, `ensureCustomSubjectsFile()`, `getVocabularyData()`, `getKanaVocabularyData()`, `getCustomWordsByKanji()` to `data-loader.ts`
- [ ] `findSubjectTypeById` stays sync; add `customSubjects` to `checkLocalStudyMaterialSubjects` with the lookup through `findCustomSubject` and the `reading_note` rule by the custom type; the notes `parse` becomes async and awaits `getCustomSubjects()`
- [ ] `initRepository`: the floor check on the four arrays, `ensureCustomSubjectsFile`, one read (the `parse` logs the unknown kanji ids and the clash warnings), then the notes check with the loaded list
- [ ] seed `src/test/fixtures/custom_subjects.json` (`[]`) under `CUSTOM_SUBJECTS_PATH` in `SEEDED_FILES`; create `src/test/custom-subject-fixture.ts` with four records (a kana word, a kana verb with conjugations, a `vocabulary` verb with one WaniKani kanji from the real data and two readings with the primary listed second, a hidden word) and `setCustomSubjectsFile(records)`
- [ ] write tests in `data-loader.test.ts`: the seeded empty file answers `[]`; a `setCustomSubjectsFile` change shows on the next `getCustomSubjects()`; a broken file throws with the path; a missing file throws `is missing`; an unknown kanji id logs a warning and keeps the record; a WaniKani clash logs a warning and keeps the record; `getCustomWordsByKanji` lists the verb and not the hidden word; the notes check accepts a custom id and a hidden custom id in `"fail"` mode, fails on an unknown custom id, and refuses a `reading_note` on the custom kana word in both modes; a pulled notes file with a `reading_note` on the custom kana word fails `getLocalStudyMaterials()` until the file is fixed
- [ ] run `bun test`, `bun run tsc`, `bun run lint:fix` - must pass before task 3

### Task 3: The readers use the merged pool

**Files:**

- Modify: `src/server/repository/vocabulary.ts`
- Modify: `src/server/repository/kanji.ts`
- Modify: `src/server/api.ts`
- Modify: `src/server/repository/__tests__/vocabulary.test.ts`
- Modify: `src/server/repository/__tests__/kanji.test.ts`
- Modify: `src/server/__tests__/api.search.test.ts`
- Modify: `src/server/__tests__/api.anki-notes.test.ts`
- Modify: `src/server/__tests__/api.study-materials.test.ts`
- Modify: `src/server/__tests__/api.add-to-anki.test.ts`

- [ ] `vocabulary.ts`: the three `find` calls use `getVocabularyData()` and `getKanaVocabularyData()`; set `isCustom`; read `conjugations` from the record for both types and keep the inline sentence `reading` for a custom id; pass `documentUrl` through as `null`
- [ ] `anki-connect.ts` and `VocabularyCard.tsx`: read `conjugations` from either vocabulary type
- [ ] `kanji.ts`: build `foundInVocabulary` from the merged vocabulary with the ids of `getCustomWordsByKanji()` appended
- [ ] `api.ts`: `/anki-notes` reads the two getters once and passes the arrays to `resolveWkSubject`; the PATCH route moves the type lookup, its 404 and the `reading_note` 400 inside its `try`, falls back to `findCustomSubject(await getCustomSubjects(), id)` and treats a hidden record as not found; drop the `vocabulary` and `kanaVocabulary` imports from `data-loader.ts` everywhere (`bun run tsc` finds the rest)
- [ ] add `resetFsMock` in `beforeEach` and `afterEach` to `vocabulary.test.ts`, `kanji.test.ts` and `api.anki-notes.test.ts`, because they will change a seeded file
- [ ] write tests: `vocabulary.test.ts` finds the fixture kana word by characters and by id with `isCustom: true`, `conjugations` from the record, `documentUrl: null`, does not find the hidden fixture word, and a WaniKani word still has `isCustom: false`; `kanji.test.ts` lists the fixture verb under its kanji's `foundInVocabulary` and `amalgamationSubjectIds`
- [ ] write tests: `api.search.test.ts` finds the custom word (file snapshot), does not find the hidden one, and the kanji card lists the verb; `api.anki-notes.test.ts` resolves a note with the custom characters to the custom id and leaves a note of the hidden word unresolved; `api.study-materials.test.ts` saves a note on the custom word, answers 404 for the hidden one, 400 for a `reading_note` on the custom kana word, and a JSON 500 with no write when the custom file is broken (`setFileContent` before the request); `api.add-to-anki.test.ts` answers 404 for the hidden word
- [ ] update the new file snapshots one file at a time with the scoped command; read each diff and expect only the new cases
- [ ] run `bun test`, `bun run tsc`, `bun run lint:fix` - must pass before task 4

### Task 4: The write module with the queue

**Files:**

- Create: `src/server/repository/custom-subject.ts`
- Create: `src/server/repository/__tests__/custom-subject.test.ts`

- [ ] create `custom-subject.ts` with `CustomSubjectWriteError`, `createCustomSubject`, `updateCustomSubject`, `deleteCustomSubject`, the queue and the three attempts with `readFileVersion` and `saveJsonAtomicIfUnchanged`
- [ ] the create step: `validateCustomSubjectInput` with the visible kanji ids, the clash check against the visible records of the file and the visible WaniKani pool, `nextCustomSubjectId`, `buildCustomRecord`
- [ ] the update step: unknown or hidden id, changed `object` or `characters`, input check, keep `created_at`, bump `data_updated_at`
- [ ] the delete step: unknown or hidden id, set `hidden_at`
- [ ] write tests: create writes one record with the floor id and the next one with floor + 1; the written file parses and `writeCalls` holds the real path only; update replaces and keeps `created_at`; an update that changes `component_subject_ids` moves the word to the other kanji in `getCustomWordsByKanji()`; delete sets `hidden_at`, keeps the record and drops it from `getCustomWordsByKanji()`; a create after a delete of the newest word gets a new id; a create with the characters of a hidden word is accepted; two creates at once land both records with two ids; a create after a refused create still works (the queue recovers)
- [ ] write tests for the errors: a WaniKani spelling, a second visible custom word with the same characters, a godan verb without conjugations, an unknown id and a hidden id on update and delete, a changed `object`, a changed `characters`, a `setFsError("rename")` leaves the file unchanged and no `.tmp` entry, a changed version during the save retries (use `holdFsOp("writeFile")` and `setFileContent` while held), three changed versions in a row fail with nothing written, a file with a bad shape fails the write with the path and a plain `Error`, not a `CustomSubjectWriteError`
- [ ] run `bun test src/server/repository/__tests__/custom-subject.test.ts`, `bun run tsc`, `bun run lint:fix` - must pass before task 5

### Task 5: The five routes

**Files:**

- Modify: `src/server/api.ts`
- Create: `src/server/__tests__/api.custom-subjects.test.ts`

- [ ] add GET (list and by id), POST, PUT and DELETE `/custom-subjects` to the Hono chain, with `[API]` log lines, the body shape check (`object` and `data` present, `data` an object), the `isCustomSubjectId` check on `:id`, and the error mapping from `CustomSubjectWriteError.status`
- [ ] write tests for the success paths: GET answers the seeded list with the hidden record; GET by id answers one record, also a hidden one, and 404 for an unknown id; POST answers 201 with the id and the timestamps and the file holds it; PUT answers the new record; DELETE answers `{ ok: true }`, GET lists the record with `hidden_at` and `/search` no longer finds it; GET after `setCustomSubjectsFile` shows the outside change
- [ ] write one chain test through the routes, not the fixture: POST a word, `/search` finds it with `isCustom: true`, `/add-to-anki` with the answered id answers `ok: true`, PUT a new primary meaning and `/search` shows it, DELETE, then `/search`, `/add-to-anki` and PATCH `/study-materials` answer 404
- [ ] write tests for the error paths: POST with a WaniKani spelling 409 naming both ids, POST of the same word twice 409, POST missing `data` 400, POST with a non-JSON body 400, POST with `characters` holding a slash 400, POST with an unknown kanji id 400, PUT with two primary meanings 400, PUT and DELETE of an unknown id 404, PUT and DELETE of a hidden id 404, GET by id, PUT and DELETE of a WaniKani id 400, and with a non-numeric `:id` 400, PUT with a changed `object` or `characters` 400, a `setFsError("readFile")` set before the first request of the test answers 500 (a held value with no version change never reads the file)
- [ ] run `bun test src/server/__tests__`, `bun run tsc`, `bun run lint:fix` - must pass before task 6

### Task 6: Reading audio of a custom word from Azure TTS

**Files:**

- Modify: `src/server/services/azure-tts.ts`
- Modify: `src/server/services/anki-connect.ts`
- Modify: `src/test/preload.ts`
- Modify: `src/test/fetch-interceptor.ts`
- Modify: `src/server/services/__tests__/azure-tts.test.ts`
- Modify: `src/server/__tests__/api.add-to-anki.test.ts`

- [ ] `azure-tts.ts`: `pickVoiceForGender(voices, gender)`, and the exactly-two-voices rule in `readAzureTtsConfig`, checked after the empty-entry rule so the existing `${VOICES[0]},,${VOICES[1]}` test keeps its "Empty voice" error
- [ ] `src/test/preload.ts`: two test voices, female first; `src/test/fetch-interceptor.ts`: `ttsRequests` with the SSML body of every TTS call, cleared by `resetFetchInterceptor()`
- [ ] update the snapshots that the second voice changed, scoped: `bun test src/server/__tests__/api.add-to-anki.test.ts --update-snapshots`; read the diff and expect only new sentence clip names, no changed WaniKani reading clip name
- [ ] `anki-connect.ts`: the `isCustom` branch that makes one clip per reading through `storeCachedMedia` in `readings/` with the SSML hash name, primary first, into the field of the picked gender; the Azure config is read before the first write like today, so the two-voice rule fails the add with no note written
- [ ] write tests in `azure-tts.test.ts`: `pickVoiceForGender` both genders; `readAzureTtsConfig` fails on one voice and on three
- [ ] write tests in `api.add-to-anki.test.ts`: add the fixture verb with two readings (the primary listed second), snapshot the note fields (a `[sound:]` tag per reading in one gender field, primary first, the other field empty, `meaning_explanation` from the record) and the cached `readings/` paths in `writeCalls`; assert `ttsRequests` holds the primary reading first, then the other, then the sentence, with the voice of the hashed gender; a second add writes no `readings/` file and makes no TTS call (cache hit); add the fixture kana word with the characters as the one reading; a one-voice config fails the add with `ok: false` and no `addNote` call
- [ ] update the new snapshots scoped with the same command; read the diff and expect only the new cases
- [ ] run `bun test`, `bun run tsc`, `bun run lint:fix` - must pass before task 7

### Task 7: The custom badge in the web UI

**Files:**

- Modify: `src/client/components/card-components/CardHeader.tsx`
- Modify: `src/client/components/VocabularyCard.tsx`
- Modify: `src/client/components/__tests__/VocabularyCard.test.tsx`

- [ ] `CardHeader`: `documentUrl?: string | null`, a `badge?: string` rendered inside the title element with `text-gray-500` and a gray border
- [ ] `VocabularyCard`: `badge="custom"` when `isCustom`
- [ ] write tests: a custom word renders the badge and no WaniKani link; a WaniKani word renders the link and no badge
- [ ] check the phone layout at 321×695 and the desktop at 1440px in the browser with a long custom word, no element wider than the screen
- [ ] run `bun test src/client`, `bun run tsc`, `bun run lint:fix` - must pass before task 8

### Task 8: The download warning

**Files:**

- Modify: `scripts/download-subjects.ts`

- [ ] after `saveToFiles`, read `custom_subjects.json` with `readFile` (skip with one line when missing), run `findWaniKaniClash` with the visible downloaded words, print one warning line per hit, exit 0
- [ ] a broken custom file prints `Could not read custom_subjects.json: <error>` and exits 0
- [ ] the pure part is `findWaniKaniClash`, tested in task 1; check the script by hand with a temporary custom record that copies a WaniKani word, then remove the record
- [ ] run `bun run tsc`, `bun run lint:fix` - must pass before task 9

### Task 9: The add-custom-word skill

**Files:**

- Create: `.claude/skills/add-custom-word/SKILL.md`
- Modify: `.claude/skills/add-iknow-vocab/SKILL.md`

- [ ] write the frontmatter (`name`, `description` with the trigger phrases "add a custom word", "add my own word", "add <word> as a custom word", "WaniKani does not have <word>")
- [ ] write the eight numbered sections from Technical Details, with the `curl` commands, the body template for a kana word and for a verb, the three reading mnemonic cases, the five ways the user can answer a shown mnemonic block, and the resume path through an `isCustom` search hit
- [ ] write the stop rules: a WaniKani search hit, a 409, a failed add (the record stays, the next run resumes), a kanji that is not in WaniKani (the word cannot be a custom word yet, say so)
- [ ] `add-iknow-vocab/SKILL.md`: the "WaniKani does not teach this word" triage case points to the new skill
- [ ] run the skill once by hand on どうぞ with the dev server, check the card in the browser and in Anki, then drop the `problems` entry of どうぞ in `iknow-vocabulary-status.json`
- [ ] no tests, a skill is prose; check that `bun run format` leaves the file alone

### Task 10: Verify acceptance criteria

- [ ] verify all requirements from Overview are implemented
- [ ] verify edge cases are handled: a missing file at start, a deleted file while running, a pulled change, a WaniKani clash, a deleted word with an Anki note and a local note, a create after a delete, an id at the floor on the WaniKani side
- [ ] run full test suite: `bun test`
- [ ] run `bun run tsc`, `bun run lint:fix`, `bun run format`
- [ ] run `bun run sync-anki-notes --dry-run` against the dev server and check that the custom word is listed
- [ ] run the refactor-simplifier agent on the changed files, as CLAUDE.md asks after a change

### Task 11: [Final] Update documentation

- [ ] `CLAUDE.md`: the "Custom Subjects" section, the API table rows, the structure tree, the fixture in Test Architecture, the skill, the voice rule, the custom reading clip name, the no-merge-driver line, the two renamed helpers in "Local Study Materials"
- [ ] `docs/backlog.md`: the two items
- [ ] `data/userdata/README.md`: the file
- [ ] move this plan to `docs/plans/completed/`

## Post-Completion

**Manual verification**:

- Add どうぞ through the skill on the Mac, pull on the Linux box, search it there with no restart.
- Add the word to Anki from the phone through the Linux box and check that the reading clip plays.
- Run `bun run download-subjects` once and check the warning path with a temporary clashing record.

**External system updates**:

- Both machines need two voices in `AZURE_TTS_VOICES`, female first. They already hold the same two-voice list.
- The data repo gets `custom_subjects.json` on the first start. Commit it with the first word.
