# Add the vocabulary of a text to Anki

## Overview

- A new skill, `.claude/skills/add-text-vocab/`, next to `add-custom-word` and `add-iknow-vocab`. It takes a Japanese text, as screenshots or as a text block, and adds every word of it to the Anki vocabulary deck.
- The flow has six steps. The LLM does the parts that need it: read the screenshots, extract the words, give the dictionary forms. Scripts do the deterministic parts: the Anki check, the WaniKani split, the final add loop. The `add-custom-word` skill does the interactive part, one word at a time, for the words WaniKani does not have.
- Every step writes one buffer file in a run folder, so a stopped run continues where it stopped, and the user can check and edit each file by hand before the next step.
- Two new scripts, `split-text-vocab` and `add-text-vocab`, follow the conventions of the other scripts: they talk to the dev server API only, sync with AnkiWeb once at the start, the add script syncs once more at the end, every add sends `sync: false`, and the skill runs `add-references` after the adds and commits `data/userdata/`.
- The dev server calls that `add-iknow-vocab.ts` (four) and `add-references.ts` (three, it has no search) each hold as a copy move into one shared module, `scripts/lib/dev-server-api.ts`. The two old scripts switch to it, the two new scripts use it.

Decisions from the planning dialog of 2026-11-07, do not reopen:

- The buffer files live in `tmp/text-vocab/<run>/` in the project root. `tmp/` goes into `.gitignore`. The data repo is wrong for them, because the Linux auto-pull job commits every few minutes and would push half-done buffers.
- Two scripts, not three. The Anki check and the WaniKani split run back to back with nothing interactive between them, so `split-text-vocab` does both and writes both buffers. `add-text-vocab` does the final loop.
- Order B of the user's two options: split the whole list first, add all custom words, then add the whole list to Anki in one pass. The interactive part stays in one place and the final add is one plain loop.
- Two LLM passes for the words, not one. The first pass writes the words as they appear in the text. The second writes the dictionary form of each with its kana reading. The skill shows the second file as a table "surface form, dictionary form, reading", so a wrong dictionary form is easy to spot. One pass would hide the surface form the dictionary form came from.
- A shared `scripts/lib/dev-server-api.ts`, and the two old scripts switch to it.
- Katakana loanwords (コーヒー, パソコン) go through the pipeline like any other word. The ones WaniKani lacks reach the custom-word loop, where the user can skip each one.
- A match on the kana reading is never the same word. 要る and いる share a reading and mean different things. So the scripts check Anki and search WaniKani with the dictionary spelling only. The reading is a hint: the split reports a word that the search finds by its reading only, and the user decides, see Solution Overview.

## Context (from discovery)

- `.claude/skills/add-iknow-vocab/SKILL.md`, `add-custom-word/SKILL.md`, `add-references/SKILL.md`: the skill style to copy. Frontmatter with `name` and `description`, numbered sections, the dev server check with `curl -s -m 5 ".../api/anki-notes?type=vocabulary"` and "read the body, not the status", `curl -G --data-urlencode` for every Japanese query, "run the script once and keep its whole output". `add-iknow-vocab` has the rule "the alternative spelling is a guess about meaning, ask before adding" and searches the kanji spelling of a kana word in its triage.
- `add-custom-word/SKILL.md`: step 1 is the server check, step 2 searches the word and stops on a WaniKani hit, step 3 reads the kanji and stops on a missing one, steps 4 and 5 draft, show and save (a 409 stops), step 6 adds to Anki with the default sync, step 7 drops the iKnow `problems` entry, step 8 runs `add-references` and commits the data repo (commit, `pull --no-rebase`, push).
- `scripts/add-iknow-vocab.ts`: the add loop to copy. `parseArgs` with `--base-url` (default `http://localhost:5173`), `--limit`, `--dry-run`, `--help`. A failed start sync exits 1. `fetchAnkiContents`, `anki.words.has(item.word)` as the in-Anki check, a `counts` object the loop updates, end sync, a summary block, `process.exit(1)` on a stop or a failed end sync. `reason: "fields"` stops the run and prints the two fix commands. The search answers `vocabulary` and `kana_vocabulary` from one pool, so the add sends `found.data.object`.
- `scripts/add-references.ts`: the second holder of the API calls. Its `addToAnki` takes a `MissingReference` and names `reference.characters` in the non-JSON error, the iKnow one takes `id` and `type`. Both check the `content-type` of the answer before `json()`. It has no `search`, it reads the subject files instead. Its `findNotes` and `notesInfo` calls go through `ankiInvoke` to AnkiConnect, not to the dev server, and stay as they are. It reads the notes of the last `--days` days, default 1.
- `scripts/lib/references.ts` and `scripts/lib/iknow-vocab.ts`: the pure helpers of a script live in `scripts/lib/`, with tests in `scripts/lib/__tests__/` and fixtures in `fixtures/`. `scripts/lib/format-error.ts` has `formatError(err)`.
- `src/server/api.ts` `/search`: `findVocabularyByCharacters(q)` matches `data.characters` exactly, the first visible entry of `getWords()`, then `findVocabularyByMeaning(q)` matches the primary meaning in lower case. A kana query finds only a kana word, a kanji query only a kanji word, and a Japanese query never matches a meaning. A Latin query can match an English meaning. The answer is `{ found: true, data }` with `data.id`, `data.object`, `data.meanings` and `data.isCustom`, or 404 `{ found: false }`. The route has no try/catch: a broken `custom_subjects.json` answers a plain-text 500.
- `src/server/api.ts` `/anki-notes?type=vocabulary`: `AnkiNoteItem[]` with `characters`, `meaning`, `wkId`, `wkType`. `resolveWkSubject` picks the first visible word with exactly equal `characters`, the same rule as the search. So "the hit id is a `wkId` of the deck" is the same as "the spelling is a `characters` of the deck".
- `src/server/api.ts` `/add-to-anki`: 400 and 404 are JSON `{ ok: false, error }`. A plain body comes only from an uncaught error (Hono's default 500 for a bad JSON body) or from Node's empty 400.
- `AnkiDeckType` lives in `src/server/services/anki-connect.ts`, which a script must not import. The shared module declares its own `"radical" | "kanji" | "vocabulary"` union.
- `src/model/custom-subject-utils.ts` has `CHARACTERS_PATTERN` (kana, kanji, ー, 々) and `KANA_PATTERN` (hiragana, katakana, ー) as private constants. `getPrimaryMeaning(meanings)` in `src/model/subject-utils.ts` takes the `meanings` array of a subject.
- `data/userdata/vocabulary.json` has 73 visible words with `〜` (U+301C): `〜冊`, `〜枚`, `〜匹`, `〜歳`, `〜回`, `〜円`, `〜階`, `〜台`, `〜屋`, `〜的`, `各〜`, `超〜` and more. Many have no bare form. `CHARACTERS_PATTERN` refuses `〜`, so a custom word can never hold it.
- `src/test/fetch-utils.ts`: `createFetchMock(handler)` and `resolveUrl(input)`, for a test that replaces `globalThis.fetch`. `src/server/services/__tests__/azure-tts.test.ts` saves and puts back its own values, the pattern to copy for a module-level replacement.
- `package.json`: one `"name": "bun run scripts/<name>.ts"` entry per script, every name starts with a verb. `tsc`, `eslint` and `prettier` cover `src` and `scripts` only, not `.claude/`. lint-staged formats `*.md` on commit.
- `.gitignore` has no `tmp/` entry.
- `README.md` has a "Data Scripts" table around line 158 that lists neither `add-iknow-vocab` nor `add-references`, and a feature list around line 13 that names the custom words and the `add-custom-word` skill.
- `docs/backlog.md` names the `--base-url` default as a known problem for a second worktree. This plan keeps the default, like the other scripts.

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
- the two old scripts must behave as before after the switch to the shared module. Accepted changes: the non-JSON error of `add-references` names the id and type instead of the characters. The non-JSON error of `add-iknow-vocab` names the type before the id (`Add <type> <id> failed with status <n>`), and its status file stores that text in `problems`. A plain-text answer to the notes read or to the sync now throws `<what> failed with status <n>` in both scripts, instead of a bare JSON parse error

## Testing Strategy

- **unit tests**: required for every task. The pure parts of the two scripts live in `scripts/lib/text-vocab.ts` and get table-driven tests in `scripts/lib/__tests__/text-vocab.test.ts`. The one async helper takes the search as a function, so its tests pass a stub and need no fetch mock. The shared API module is the one script test with a replaced `globalThis.fetch`: set at file load, put back in `afterAll`, like `azure-tts.test.ts` does with its values. CLAUDE.md names it as the second exception to "no mock needed" (Task 7).
- **integration tests**: the project has API E2E tests in `src/server/__tests__/` through `api.request()`. This plan adds no route and changes no create, update or delete path on the server, so no integration test changes. The scripts are not run in tests, like the other scripts.
- **e2e tests**: none in the project.
- **manual test**: the two migrated scripts in dry-run mode, the two new scripts against the dev server, and one real run of the skill, see Task 6 and Post-Completion.

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope
- keep plan in sync with actual work done

## Solution Overview

The run folder `tmp/text-vocab/<run>/`, one file per step, numbered in step order:

| File                    | Written by (skill step)    | Content                                                                  |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `0-text.txt`            | the skill, step 3          | the text, as given or as read from the screenshots                       |
| `1-surface.txt`         | the skill, step 4          | the words as they appear in the text, one per line, in text order        |
| `2-dictionary.tsv`      | the skill, step 5          | `<dictionary form>\t<kana reading>`, one per line, no word twice         |
| `3-not-in-anki.tsv`     | `split-text-vocab`, step 6 | the entries of file 2 whose word is not in the Anki vocabulary deck      |
| `4-not-in-wanikani.tsv` | `split-text-vocab`, step 6 | the entries of file 3 whose dictionary spelling the search does not find |

`<run>` is a slug the skill picks: the date, the time and the first word, like `20261107-1432-図書館`. The name sorts by time, so the newest run is the last name. Both scripts take `--run <name>` and look the name up under `tmp/text-vocab/`.

The dictionary spelling is the one check key. The search and the Anki check match `characters` exactly, so the LLM gives the dictionary spelling the way WaniKani writes it: the kanji spelling of the text when the text used kanji, the usual kanji spelling when the text used kana for a word that is usually written with kanji (わかる → 分かる), and the kana spelling for a word that is usually written in kana. For a kana word both columns are the same. A counter, a prefix or a suffix is written the WaniKani way, with `〜` (U+301C) in the place of the number or the stem: 三冊 → `〜冊`, 各国 stays 各国. The reading column of such a word holds the kana of the kanji part only.

The reading column is a hint for the user, never a key. The LLM picks 殆ど and WaniKani has ほとんど. The split tells such a case apart from a real miss, and the user decides, because a reading hit can be another word (要る and いる). There is no kana to kanji fallback, because the server has no reading search. A kana word that WaniKani spells in kanji depends on the LLM rule above, and the custom-word loop checks it once more.

One rule for both scripts, `classifyWord` in `scripts/lib/text-vocab.ts`:

1. The spelling equals the `characters` of a deck note: `in-anki`, no search. This is the `anki.words.has(item.word)` check of `add-iknow-vocab`, and it covers a note that resolves to no subject, like a deleted custom word.
2. Search the spelling. A hit is `in-wanikani`, with the hit kept (`id`, `object`, `characters`, `meaning`).
3. No hit, and the reading differs from the spelling: search the reading. A hit is `found-by-reading`, with the hit kept, so the report can name its characters and meaning, and say when those characters are in the deck.
4. Otherwise `not-in-wanikani`.

The search is passed in as a function, so the rule is pure and tested without a fetch mock. A hit for a custom word that an earlier run saved is a hit like a WaniKani word, that is the resume path.

`split-text-vocab --run <name> [--base-url <url>]`:

1. Reads `2-dictionary.tsv`. A bad line fails the run and names the line number, see `parseWordList` in Technical Details.
2. Syncs with AnkiWeb once. A failed start sync stops the run with exit 1, because every lookup would be stale. Then reads `/api/anki-notes?type=vocabulary` once into the `characters` set.
3. Runs `classifyWord` on every entry. A failed search (a thrown error, like the plain-text 500 of a broken data file) stops the run with exit 1 and writes neither file. A miss taken for a real miss would send every word into the custom-word loop.
4. Writes `3-not-in-anki.tsv` (`in-wanikani`, `found-by-reading` and `not-in-wanikani`) and `4-not-in-wanikani.tsv` (`found-by-reading` and `not-in-wanikani`), with `formatWordList`, so the lines are normalized. Both files every time, also when a list is empty, so a rerun after a change in file 2 never keeps an old list.
5. Prints every word with its group. A `found-by-reading` line shows the hit: `殆ど → ほとんど (Most, kana_vocabulary id=9213, not in Anki)`. A hit on a saved custom word shows `custom` before its type. Then the four counts. It writes nothing to Anki, so it needs no `--dry-run` and no end sync.

A rerun of the split is the resume of the custom-word step: a word that `add-custom-word` saved is found by the search and leaves file 4 on its own. A `found-by-reading` word that the user accepts leaves it the same way, after the skill changed its spelling in file 2.

`add-text-vocab --run <name> [--base-url <url>] [--dry-run]`:

1. Reads `3-not-in-anki.tsv`. A missing file fails with `<path> is missing, run split-text-vocab first`.
2. Syncs with AnkiWeb once, exit 1 when it fails, then reads the vocabulary deck once.
3. Runs `classifyWord` on every entry, in file order. `in-anki` is skipped, the rerun path. `in-wanikani` is added with `/api/add-to-anki`, `sync: false`, with the `object` of the hit. `found-by-reading` and `not-in-wanikani` are listed as not in WaniKani: a custom word the user skipped, or a reading hint the user did not accept. A failed search counts as an error and the loop goes on. `reason: "fields"` stops the run at once, like in `add-iknow-vocab`. Any other failed add is logged and the loop goes on. `parseWordList` refuses a repeated word and the search is exact, so no word is added twice in one run.
4. Syncs with AnkiWeb once at the end when at least one word was added.
5. Prints a summary from a `counts` object the loop updates: added, already in Anki, not in WaniKani, errors, synced. Exits 1 after a stop, a failed add, a failed search or a failed end sync, so the skill sees it.

The add writes no buffer file. The Anki deck is the state, and a rerun skips what is there.

The skill, `.claude/skills/add-text-vocab/SKILL.md`:

1. Check the dev server and Anki, like the other skills.
2. Pick the run. A new text gets a new folder. "Continue" takes the run name the user gives, or the last name under `tmp/text-vocab/`. The run continues from the first missing file. A file on disk does not mean the user approved it, because the session may have stopped at an OK prompt. So when the first missing file is `1-surface.txt` and the text came from screenshots, show `0-text.txt` and wait for the OK of step 3 again. When it is `3-not-in-anki.tsv`, show the table of file 2 and wait for the OK of step 5 again. In every other case there is no repeated OK. When all five files exist, run the split again and continue at step 6. A refused reading hint and a skipped custom word come up again in a new session, because no file stores them. Within one session a hint is asked once, also when a later split run prints it again.
3. Write `0-text.txt`: the text as given, or the text read from the screenshots. When it came from screenshots, show the text and wait for an OK, because a misread character gives a wrong word, and a misread found later means writing files 1 and 2 again.
4. Write `1-surface.txt`. Rules: every content word, in text order, once. Nouns, verbs, い and な adjectives, adverbs, expressions, katakana loanwords, counters with their number. Not: particles, proper names, bare numbers, pure punctuation, a single kana grammar bit. A compound verb or a する verb stays as the text has it.
5. Write `2-dictionary.tsv`: the dictionary form and the kana reading of every line of file 1, with the spelling rules above (kanji the WaniKani way, `〜` for a counter, prefix or suffix). A verb in its plain form, an adjective in its base form, a conjugated form as the plain one. A する word whose noun stands alone becomes the noun (勉強する → 勉強). A one-kanji する verb stays a verb (愛する, 関する, 察する), because the kanji alone is not the word. No word twice. Show a table "surface form, dictionary form, reading" and wait for an OK, because a wrong dictionary form adds a wrong card.
6. Run `bun run split-text-vocab -- --run <name>`. Pass on the counts. For every `found-by-reading` line, show the hit (characters, primary meaning, type, in Anki or not) and ask, like `add-iknow-vocab` asks about an alternative spelling. On a yes, change the word column of that line in file 2 to the hit's `characters`, or delete the line when those characters already stand on another line of file 2. On a no, leave the line, the word is treated as not in WaniKani. After the answers, run the split again when a line changed.
7. Walk `4-not-in-wanikani.tsv` top to bottom. A word with `〜` can never be a custom word, because the server refuses the character: say so and skip it. For a kana word, search its usual kanji spelling once, and for a kanji word the katakana form of its reading (林檎 → リンゴ). Ask about a hit like a reading hint, the triage of `add-iknow-vocab`. On a yes, change the line in file 2 like in step 6. Otherwise follow steps 2 to 5 of the `add-custom-word` skill with that word: search, kanji, draft, show, save. Its step 1 is done, and its steps 6 to 8 are skipped: the add, the iKnow entry and the data repo commit come later, once for the whole run. A hit in its step 2 that the user already refused in step 6 or in this step does not stop, go on to its step 3. Every other stop of its steps 2 to 5 (a missing kanji, a 409) skips this word, and the loop goes on. The user can skip a word. A skipped word stays in the file and `add-text-vocab` prints it as not in WaniKani. After the last word, when `git status --porcelain` shows a change in the data repo files of step 9, also from an earlier session, commit and push them (searches append registry lines too) in the order of `add-custom-word` step 8 (commit, `pull --no-rebase`, push, a conflict in that file is fixed by hand), so the other machine sees the new words and never gives their ids to other words. Then run the split again, so a saved custom word leaves file 4, and show what is left.
8. Run `bun run add-text-vocab -- --run <name>`. Keep the whole output.
9. After every real add run, also one that added nothing, because a resumed run may have added its words in an earlier session: follow the `add-references` skill with `--days` set to the days since the run folder's date plus one, because a continued run can cross midnight. Drop the iKnow `problems` entry of every word of the run that is in Anki now (an `added` or `already in Anki` line, also in the last split run; match on `word`, and on the old spelling of a changed line). Add one more day to `--days` for a run that started before 4 a.m., when the Anki day starts. Then commit and push the data repo when `git -C data/userdata status --porcelain` shows a change, the standing rule for every add.
10. Report: the run folder, the counts of every step, the words added, the custom words created, the reading hints accepted and refused, the words skipped and why (`〜`, a stop, the user), and every stop with its reason.

`add-custom-word/SKILL.md` gets a short note at its top: inside `add-text-vocab`, do steps 2 to 5 only; a hit the user already refused there does not stop; any other stop skips the word and the loop goes on; the rest happens once for the whole run.

`scripts/lib/dev-server-api.ts`, the shared module:

- a private `AnkiDeckType = "radical" | "kanji" | "vocabulary"`, the four response types moved from the two scripts (`AddToAnkiResponse` holds `AnkiAddResult`), and `DEFAULT_BASE_URL`.
- `searchVocabulary(baseUrl, word)`: `SearchResponse`, `?type=vocabulary` always. Throws on a status that is not ok and not 404, with the word and the status (the iKnow rule).
- `fetchAnkiNotes(baseUrl, type)`: `AnkiNoteItem[]`, throws on `ok: false` with the error text.
- `addToAnki({ baseUrl, id, type })`: `AddToAnkiResponse` with `reason?: "fields"`. Always sends `sync: false`, because every caller is a batch. A JSON `ok: false` of any status is answered, not thrown. Throws `Add <type> <id> failed with status <n>` when the answer is not JSON.
- `syncAnkiWeb(baseUrl)`: `AnkiSyncResponse`.
- every call reads the answer through one private check: a plain-text answer throws `<what> failed with status <n>`.
- `syncAnkiWebAtStart(baseUrl)` (the start sync, exit 1 on a failure) and `fetchVocabularyInAnki(baseUrl)` (the `characters` set of the deck), used by the two new scripts.

## Technical Details

`scripts/lib/text-vocab.ts`, pure, unit-tested:

```ts
export type WordEntry = { word: string; reading: string };

export type VocabularyHit = {
  id: number;
  object: "vocabulary" | "kana_vocabulary";
  characters: string;
  meaning: string;
};

export type WordGroup = "in-anki" | "in-wanikani" | "found-by-reading" | "not-in-wanikani";

export type ClassifiedWord = WordEntry &
  (
    | { group: "in-anki" | "not-in-wanikani"; hit: null }
    | { group: "in-wanikani" | "found-by-reading"; hit: VocabularyHit }
  );

export const RUNS_DIR = "tmp/text-vocab";

export function runDir(name: string | undefined): string;
// join(RUNS_DIR, name); throws on a missing name, `.`, `..` and a name with `/` or `\`

export async function readWordList(params: {
  path: string;
  missingHint: string | null;
}): Promise<WordEntry[]>;
// `<path> is missing` plus the hint, and `<path> line <n>: <reason>` for a bad line

export function parseWordList(text: string): WordEntry[];
// one entry per non-empty line, columns trimmed; throws `line <n>: <reason>` for:
// no tab, an empty column, a third column, whitespace inside a column (U+3000 included),
// a word that is not CHARACTERS_PATTERN with at most one 〜 (U+301C) at its start or end
// (isWordSpelling, built on CHARACTERS_PATTERN), a full-width ～ (U+FF5E) with its own message,
// a reading that is not kana (KANA_PATTERN), and a word that came before
// (`line 7: 食べる is already on line 3`)

export function formatWordList(entries: WordEntry[]): string;
// `${word}\t${reading}\n` per entry, the inverse of parseWordList

export function toVocabularyHit(response: SearchResponse): VocabularyHit | null;
// found: false is null; a hit keeps id, object, characters, getPrimaryMeaning(data.meanings), isCustom

export async function classifyWord(params: {
  entry: WordEntry;
  charactersInAnki: Set<string>;
  search: (spelling: string) => Promise<SearchResponse>;
}): Promise<ClassifiedWord>;
// the four steps of Solution Overview; no reading search for a word with 〜, because its reading
// holds only the kana of the kanji part (猛〜 もう would find the word もう); a thrown search
// error is not caught

export function splitClassifiedWords(words: ClassifiedWord[]): { notInAnki; notInWaniKani };
// file 3 and file 4 of the split

export function addRunFailed(params: { stopped; errors; added; dryRun; synced }): boolean;
// the exit 1 rule of the add
```

`CHARACTERS_PATTERN` and `KANA_PATTERN` become exports of `src/model/custom-subject-utils.ts`, so the scripts and the server share one definition. A Latin "word" would reach the meaning search and could match an English primary meaning. A kanji in the reading would make the reading search the same as the first one.

The scripts pass `(spelling) => searchVocabulary(baseUrl, spelling)` as `search`, and `classifyWord` reads the answer with `toVocabularyHit`. The split deletes files 3 and 4 before it reads file 2, so a failed run never leaves an old list for the add.

The file format is TSV with two columns, not JSON, so the user can edit a buffer with any editor and the LLM writes it in one go. The files hold no ids: the add script searches again, the dev server is local and a search is cheap, and a file with ids would go stale when a custom word is deleted and made again.

`.claude/skills/add-text-vocab/SKILL.md` frontmatter:

```yaml
name: add-text-vocab
description: Add every word of a Japanese text to the Anki vocabulary deck. The text comes as screenshots or as a text block. Use when the user says "add the words of this text", "add this text's vocabulary", "add the vocabulary from these screenshots", or gives a Japanese text and asks for its words in Anki. Also use it to continue a stopped text run.
```

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): tasks achievable within this codebase - code changes, tests, documentation updates
- **Post-Completion** (no checkboxes): items requiring external action - manual testing, changes in consuming projects, deployment configs, third-party verifications

## Implementation Steps

### Task 1: Shared dev server API module

**Files:**

- Create: `scripts/lib/dev-server-api.ts`
- Create: `scripts/lib/__tests__/dev-server-api.test.ts`
- Modify: `scripts/add-iknow-vocab.ts`
- Modify: `scripts/add-references.ts`

- [x] create `scripts/lib/dev-server-api.ts` with `AnkiDeckType`, the four response types and `searchVocabulary`, `fetchAnkiNotes`, `addToAnki`, `syncAnkiWeb`, as described in Solution Overview
- [x] switch `scripts/add-iknow-vocab.ts` to the module: delete its four response types and the four functions, keep the `AnkiContents` build
- [x] switch `scripts/add-references.ts` to the module: delete its three response types and `fetchAnkiNotes`, `addToAnki`, `syncAnkiWeb`; its `addToAnki` call passes `reference.id` and `reference.type`
- [x] write tests with a replaced `globalThis.fetch` (`createFetchMock` from `src/test/fetch-utils.ts`, set at file load, the old `fetch` put back in `afterAll`): the URL and body of every call, `type=vocabulary` and the encoded word in the search URL, `sync: false` in the add body
- [x] write tests for the error paths: `searchVocabulary` throws on a 500 and answers `found: false` on a 404; `fetchAnkiNotes` throws with the error text on `ok: false`; `addToAnki` answers `ok: false` on a JSON 404 and throws with the status on a plain-text answer
- [x] run `bun test scripts`, `bun run tsc`, `bun run lint:fix` - must pass before task 2

### Task 2: Pure helpers of the text vocabulary scripts

**Files:**

- Create: `scripts/lib/text-vocab.ts`
- Create: `scripts/lib/__tests__/text-vocab.test.ts`
- Modify: `src/model/custom-subject-utils.ts`

- [x] export `CHARACTERS_PATTERN` and `KANA_PATTERN` from `src/model/custom-subject-utils.ts`, nothing else changes there
- [x] create `scripts/lib/text-vocab.ts` with the types, `RUNS_DIR`, `runDir`, `parseWordList`, `formatWordList`, `toVocabularyHit`, `classifyWord` from Technical Details
- [x] write tests for `parseWordList`: a kanji word with a reading, a kana word with the same value twice, a katakana word, `〜冊` and `各〜`, blank lines and a trailing newline skipped, trimmed columns
- [x] write tests for the `parseWordList` errors, each with the line number: no tab, an empty column, three columns, a U+3000 inside a column, a Latin word, `～冊` with the full-width message, `〜` in the middle or twice, a kanji in the reading, a repeated word with both line numbers
- [x] write tests for `formatWordList` as the inverse of `parseWordList`
- [x] write tests for `toVocabularyHit`: `found: false` is `null`, a hit keeps `id`, `object`, `characters` and the primary meaning
- [x] write tests for `classifyWord` with a stub search that records its calls: a spelling in the characters set is `in-anki` with no call; a hit is `in-wanikani` with the hit and one call; a miss with a reading hit is `found-by-reading` with the hit and two calls; a miss on both is `not-in-wanikani`; a kana word with a miss makes one call only; a thrown search error passes through
- [x] run `bun test`, `bun run tsc`, `bun run lint:fix` - must pass before task 3

### Task 3: The split script

**Files:**

- Create: `scripts/split-text-vocab.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [x] add `tmp/` to `.gitignore`
- [x] create `scripts/split-text-vocab.ts`: `main()` first, helpers below, `main().catch(...)` last, like the other scripts. `parseArgs` with `--run`, `--base-url`, `--help`. A missing `--run` fails with a clear message. A missing `2-dictionary.tsv` fails with its path
- [x] start sync with exit 1 on a failure, read the deck once into the `characters` set, wrap `searchVocabulary` with `toVocabularyHit`, run `classifyWord` per entry; a thrown search error ends the run before any write
- [x] write files 3 and 4 with `formatWordList` and `writeFile`, both every time
- [x] print every word with its group, the hit of a `found-by-reading` word with characters, meaning, type, id and whether its characters are in the deck, then the four counts, in the summary style of `add-iknow-vocab`
- [x] add `"split-text-vocab": "bun run scripts/split-text-vocab.ts"` to `package.json`
- [x] no new pure code in this task; the tests of Task 2 cover the rule. Run the script against the dev server on a hand-made folder and check the two files (done live on 2026-11-08 after the env fix: a real run of the text 20261108-2028-こんにちは (split twice, add of 12 words, `add-references --days 1`) and `add-iknow-vocab -- --dry-run --limit 1`)
- [x] run `bun test`, `bun run tsc`, `bun run lint:fix` - must pass before task 4

### Task 4: The add script

**Files:**

- Create: `scripts/add-text-vocab.ts`
- Modify: `package.json`

- [x] create `scripts/add-text-vocab.ts`: `parseArgs` with `--run`, `--base-url`, `--dry-run`, `--help`. A missing `3-not-in-anki.tsv` fails with `<path> is missing, run split-text-vocab first`
- [x] start sync with exit 1 on a failure, read the deck once, loop in file order with `classifyWord`: skip `in-anki`, add `in-wanikani` with `addToAnki` and the hit's `object`, list `found-by-reading` and `not-in-wanikani` as not in WaniKani
- [x] a failed search is an error, log it and go on. Stop at once on `reason: "fields"`, print the two fix commands like `add-iknow-vocab`, exit 1. Log any other failed add and go on
- [x] `--dry-run`: classify only, print `would add`, no add and no end sync
- [x] end sync when at least one word was added, a `counts` object the loop updates, summary block with added, already in Anki, not in WaniKani, errors, synced. Exit 1 after a stop, a failed add, a failed search or a failed end sync
- [x] add `"add-text-vocab": "bun run scripts/add-text-vocab.ts"` to `package.json`
- [x] no new pure code in this task; the tests of Task 2 cover the rule. Run the script with `--dry-run` against the dev server on the folder of Task 3 (done live on 2026-11-08 after the env fix: a real run of the text 20261108-2028-こんにちは (split twice, add of 12 words, `add-references --days 1`) and `add-iknow-vocab -- --dry-run --limit 1`)
- [x] run `bun test`, `bun run tsc`, `bun run lint:fix` - must pass before task 5

### Task 5: The skill

**Files:**

- Create: `.claude/skills/add-text-vocab/SKILL.md`
- Modify: `.claude/skills/add-custom-word/SKILL.md`

- [x] write the frontmatter from Technical Details
- [x] write the sections in the order of Solution Overview: the server check, the run folder and the resume rule with the repeated OK, the screenshot step with the OK, the surface word rules, the dictionary form rules with the TSV format, the `〜` rule and the table, the split run with the reading hint questions, the custom word loop with the `〜` skip, the kana word kanji check, steps 2 to 5 of `add-custom-word`, the stop rules and the data repo commit after it, the add run, `add-references` with `--days`, the iKnow entries and the data repo commit, the report
- [x] state the rules of the other skills that apply here: run each script once and keep its whole output, `curl -G --data-urlencode` for any hand search, read the body not the status, never retry a `fields` stop
- [x] add the note to `add-custom-word/SKILL.md`: inside `add-text-vocab`, steps 2 to 5 only, a refused hit does not stop, any other stop skips the word
- [x] write the file in the style of `add-iknow-vocab/SKILL.md`: short sentences, numbered sections, one code block per command
- [x] read the three skill files once more and check that no step of this skill contradicts them
- [x] no code in this task, so no test. Run `bunx prettier --write .claude/skills/add-text-vocab/SKILL.md .claude/skills/add-custom-word/SKILL.md`, because the project `format` script covers `src` and `scripts` only

### Task 6: Verify acceptance criteria

- [x] verify all requirements from Overview are implemented: the six steps, the five buffer files, the two scripts, the shared module, the skill, the note in `add-custom-word`
- [x] verify edge cases are handled: a bad TSV line of every kind, a `〜` word in both files, a missing buffer file, a word in Anki under a note that resolves to nothing, a reading hit on another word (要る with いる in the deck must not be skipped), a custom word found on a rerun of the split, a failed search in the split (no file written) and in the add (an error, exit 1), a failed start sync in both scripts, a `fields` stop, a skipped custom word at add time, an empty file 4, a word repeated in file 2 (checked in the code and the tests, no gap found, no fix needed)
- [x] run the full test suite: `bun test`
- [x] run `bun run tsc`, `bun run lint`, `bun run format:check`
- [x] run the two migrated scripts against the dev server: `bun run add-iknow-vocab -- --dry-run --limit 1` and `bun run add-references -- --dry-run` (done live on 2026-11-08 after the env fix: a real run of the text 20261108-2028-こんにちは (split twice, add of 12 words, `add-references --days 1`) and `add-iknow-vocab -- --dry-run --limit 1`)
- [x] run `bun run split-text-vocab -- --help` and `bun run add-text-vocab -- --help`, and both scripts with `--run` on a hand-made folder against the dev server, with `--dry-run` for the add (done live on 2026-11-08 after the env fix: a real run of the text 20261108-2028-こんにちは (split twice, add of 12 words, `add-references --days 1`) and `add-iknow-vocab -- --dry-run --limit 1`)

### Task 7: [Final] Update documentation

**Files:**

- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/backlog.md`

- [x] `CLAUDE.md`: add the two scripts, `lib/dev-server-api.ts` and `lib/text-vocab.ts` to the Project Structure tree and the Data Scripts list, and a section "Text Vocabulary Import" after "iKnow Vocabulary Import" with the run folder, the five files, the dictionary spelling as the one key and the reading as a hint, the `〜` rule, `classifyWord`, the two scripts, the skill and the steps-2-to-5 rule of `add-custom-word`
- [x] `CLAUDE.md` Test Architecture: the "Script unit tests" line names `dev-server-api.test.ts` as the second exception, with a replaced `globalThis.fetch` put back in `afterAll`
- [x] `README.md`: the "Data Scripts" table gets `add-iknow-vocab`, `add-references`, `split-text-vocab` and `add-text-vocab`, and the feature list gets one line for the text import and its skill
- [x] `docs/backlog.md`: add the two new scripts to the item about the `--base-url` default
- [x] ➕ review fixes: no reading search for a `〜` word, the path in every word list error, the split deletes files 3 and 4 first, `runDir` checks the name, `isCustom` in the hit, one JSON check for every dev server call, a union `ClassifiedWord`, `splitClassifiedWords` and `addRunFailed` with tests, `syncAnkiWebAtStart` and `fetchVocabularyInAnki` in the shared module, a shared `DEFAULT_BASE_URL`, `/tmp/` in `.gitignore`, and the skill, CLAUDE.md, README and backlog fixes
- [x] ➕ the script rules of the text import moved from the root `CLAUDE.md` to a new `scripts/CLAUDE.md`. The root file keeps a short entry and a new "Where Rules Go" section. The flow stays only in the skill
- [x] ➕ the する rule of `classifyWord`: a する verb also looks up its noun and adds both, a noun that misses tries `<noun>する`; `in-wanikani` holds `hits`, the add skips an id it added above. Found in the first skill test, decided with the user
- [x] move this plan to `docs/plans/completed/`

## Post-Completion

**Manual verification**:

- One real run of the skill with a short text of about ten words. It should hold: a word not in Anki, a word WaniKani does not have, a counter with a number (三冊), a text kana word that WaniKani writes in kanji (わかる, checks the LLM spelling rule), and a word the LLM writes in kanji that WaniKani has in kana (殆ど, checks the reading hint path). Check the five files after each step, the reading hint question, the custom word dialog, the Anki notes, the `add-references` run and the two data repo commits.
- One run from screenshots of the same text, to check the text read and the OK step.
- A stopped run: delete `3-not-in-anki.tsv` and say "continue", the skill must pick the last folder by name, show the dictionary table and ask for the OK again, then run the split and go on. Then a second "continue" with all five files present, which must run the split and continue at the hint questions.

**External system updates**: none. The Linux box needs no change, the scripts run against its dev server with `--base-url` like the other scripts.
