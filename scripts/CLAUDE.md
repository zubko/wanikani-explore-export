# Scripts

Rules for the code in `scripts/`. The root `CLAUDE.md` holds the rules for the whole project.

## Text Vocabulary Import

The code of `split-text-vocab`, `add-text-vocab` and `scripts/lib/text-vocab.ts`. The flow, the user questions and the commits live in `.claude/skills/add-text-vocab/SKILL.md`.

Every step writes one file in a run folder, `tmp/text-vocab/<run>/`. The run name is the date, the time and the first word, like `20261107-1432-図書館`, so the newest run is the last name. Both scripts take `--run <name>` and `--base-url <url>`. `runDir(name)` builds the path. It refuses a missing name, `.`, `..` and a name with a `/` or `\`, so a script never reads or writes outside `tmp/text-vocab/`.

| File                    | Written by         | Content                                                      |
| ----------------------- | ------------------ | ------------------------------------------------------------ |
| `0-text.txt`            | the skill          | the text, as given or as read from the screenshots           |
| `1-surface.txt`         | the skill          | the words as the text writes them, one per line, text order  |
| `2-dictionary.tsv`      | the skill          | `<dictionary form>\t<kana reading>`, one per line            |
| `3-not-in-anki.tsv`     | `split-text-vocab` | the words of file 2 that are not in the Anki vocabulary deck |
| `4-not-in-wanikani.tsv` | `split-text-vocab` | the words of file 3 that the WaniKani search does not find   |

A stopped run goes on from the first missing file. The user may edit any file by hand between two steps. A word changes only in file 2, because the split writes files 3 and 4 again on every run, also when a list is empty. The files hold no ids: the add searches again, and an id would go stale when a custom word is deleted and made again.

- The dictionary spelling is the one key. The Anki check and the search both match `characters` exactly.
- The reading is only a hint, never a key. A reading hit can be another word: 要る and いる share a reading. The server has no reading search, so there is no kana to kanji fallback.
- A counter, a prefix or a suffix has `〜` (U+301C) in the place of the number or the stem: 三冊 → `〜冊`. Its reading holds the kana of the kanji part only. So the reading of a `〜` word is never searched: `猛〜` has the reading もう, and もう is an unrelated WaniKani word. A custom word can never hold `〜`, because `CHARACTERS_PATTERN` refuses it.
- `readWordList({ path, missingHint })` reads files 2 and 3 and runs `parseWordList`. A missing file fails with `<path> is missing`, plus the hint. A bad line fails the run with `<path> line <n>: <reason>`: no tab, a third column, an empty column, a space inside a column (U+3000 too), a word that is not kana and kanji with at most one `〜` at its start or end, a full-width `～` (U+FF5E) with its own message, a reading that is not kana, and a word that came before (`line 7: 食べる is already on line 3`). `formatWordList` writes the lines back.
- The word and reading checks use `CHARACTERS_PATTERN` and `KANA_PATTERN`, exported from `src/model/custom-subject-utils.ts`, so the scripts and the server share one rule.
- `classifyWord({ entry, charactersInAnki, search })` is the one rule of both scripts. A spelling equal to the `characters` of a deck note is `in-anki`, with no search. This also covers a note that resolves to no subject, like a deleted custom word. Else a search hit on the spelling is `in-wanikani`. Then the する rule below. Else, when the reading differs from the spelling and the word holds no `〜`, a search hit on the reading is `found-by-reading`. Else the word is `not-in-wanikani`.
- `search` answers the `SearchResponse` of `searchVocabulary`, so the tests pass a stub. A thrown search error is not caught. A saved custom word is a hit like a WaniKani word, which is the resume path. The hit keeps `isCustom`, so the split prints `custom` for it.
- The する rule: WaniKani teaches 82 する verbs and their nouns as two words (勉強 and 勉強する), 49 only as the verb (運転する) and over a thousand nouns with no verb. So for a spelling that ends with する, `classifyWord` looks up the verb and its noun, and `in-wanikani` holds every hit that is not in Anki: one or two. It is `in-anki` when none is found and one of them is in Anki. For a noun that misses, it tries `<noun>する` before the reading. Both parts only fire for a noun of two or more characters that ends with a kanji and holds no `〜`, so 愛する, 口にする and kana words never do.
- `ClassifiedWord` is a union: `in-wanikani` holds `hits`, `found-by-reading` holds one `hit`, the other two hold none.

`bun run split-text-vocab -- --run <name>`:

- It deletes files 3 and 4 first, so a failed run never leaves an old list for the add.
- Then it reads file 2, syncs with AnkiWeb once, reads the vocabulary deck once and classifies every word. `splitClassifiedWords` picks the two lists: file 3 gets every group but `in-anki`, file 4 gets `found-by-reading` and `not-in-wanikani`.
- It prints one line per word. A `found-by-reading` line names the hit: its characters, meaning, type, id, and whether those characters are in Anki. Then it prints the four counts.
- A failed start sync exits 1. A failed search exits 1 and writes neither file, because a failed search taken for a miss would send the word into the custom word loop.
- It writes nothing to Anki, so it has no `--dry-run` and no end sync.

`bun run add-text-vocab -- --run <name>`:

- It reads file 3. A missing file fails with `<path> is missing, run split-text-vocab first`.
- It syncs with AnkiWeb once, reads the vocabulary deck once and classifies every word in file order. It skips `in-anki`, so a rerun goes on where the last run stopped.
- It adds every hit of `in-wanikani` through `/api/add-to-anki` with the `object` of the hit and `sync: false`. A hit whose id an earlier line of the run added is skipped, because a する verb line and a noun line can find the same word. It lists `found-by-reading` and `not-in-wanikani` as not in WaniKani: a custom word the user skipped, or a reading hint the user refused.
- A failed search or a failed add counts as an error, and the loop goes on. `reason: "fields"` stops the run and prints the fix steps, like in `add-iknow-vocab`.
- It syncs once more at the end when it added a word. The summary counts the words added, and the lines already in Anki, not in WaniKani and with an error. It exits 1 after a stop, an error or a failed end sync, through `addRunFailed`.
- `--dry-run` still syncs at the start and reads the deck. Then it classifies and prints `would add`, with no add and no end sync.
- The add writes no file: the Anki deck is the state.
