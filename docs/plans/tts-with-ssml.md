# Sentence audio with SSML word readings

Status: not started. Written on 2026-09-06 after the listening check of the data migration. This is a feature plan, not part of the migration.

## Overview

- The vocabulary card plays the shortest context sentence, made by Azure TTS. Since the migration the input is the plain kanji sentence, read by the Dragon HD voices `ja-JP-Nanami:DragonHDLatestNeural` and `ja-JP-Masaru:DragonHDLatestNeural`.
- The listening check on 2026-09-06 showed that plain kanji is not enough. 外面 in 彼女の外面にだまされない方がいいですよ。 was read as がいめん. The word is taught as そとづら. 平壌 was read as ぴょんやん, which is right.
- Before the migration the input was the kana reading from `data/sentence_readings.json`. That makes every reading right by construction, but the voice gets no kanji, so it has fewer cues for word grouping and pitch. The decision on 2026-09-06 was to keep the kanji input for now and to fix the readings with SSML instead.
- The fix: send the kanji sentence, and wrap every kanji block in `<sub alias="reading">block</sub>`. The voice keeps the kanji context for grouping and pitch, and every reading is forced to the one we reviewed. The readings come from the reviewed `data/sentence_readings.json`.
- Bonus: the same per-block data gives real ruby furigana on the Anki card through Anki's `{{furigana:...}}` filter, instead of the plain kana line the card shows today.

### Acceptance criteria

1. Every entry in `data/sentence_readings.json` has a third field, `furigana`, in Anki furigana format, for example ` 彼女[かのじょ]の 外面[そとづら]にだまされない 方[ほう]がいいですよ。`. Two checks hold for every entry: remove the brackets and their content and the spaces before blocks, the result equals `ja`. Replace each block by its bracket content and remove the spaces, the result equals `reading`.
2. `generateSentenceAudio` sends SSML with one `<sub alias>` per kanji block. Aliases and text are XML-escaped. A sentence without kanji is sent as plain text, as today.
3. Listening check passes on the list under "Listening check" below, with the HD voices.
4. The Anki card shows furigana above the kanji of the sentence, or keeps the plain kana line through `{{kana:...}}`. Decide before implementing, see "Open decisions".
5. Unit tests cover the markup parser, the aligner and the SSML builder. The E2E test asserts the TTS request body for a word with a rare reading.

## Context (from discovery)

### Current code

- `src/server/services/azure-tts.ts`, `generateSentenceAudio(text)`: reads `AZURE_TTS_KEY`, `AZURE_TTS_REGION`, `AZURE_TTS_VOICES` from the root `.env`. Picks one voice at random from the comma list. Builds `<speak version='1.0' xml:lang='ja-JP'><voice name='...'>escapeXml(text)</voice></speak>`. The language tag is the first two dash parts of the voice name, which works with the colon in HD names. Output format header `audio-24khz-160kbitrate-mono-mp3`. Returns `ArrayBuffer | null`, null when the env is missing or the text is empty.
- `src/server/services/anki-connect.ts`, `addOrUpdateVocabularyCore`: calls `generateSentenceAudio(shortestSentence.ja)`. The comment above that line says the HD voice is on trial to read the kanji itself. That comment goes away with this plan. The result is stored as `{deckId}_{slug}_sentence.mp3`. `buildVocabularyNoteFields` writes `sentence_jap: shortestSentence.ja`, `sentence_jap_furigana: shortestSentence.reading ?? ""`, `sentence_jap_audio: [sound:filename]`.
- `src/server/repository/data-loader.ts`: `SentenceReadingEntry = { ja: string; reading: string }`, loaded once from `./data/sentence_readings.json` into `sentenceReadings`. `src/server/repository/vocabulary.ts` line 28: the entry is attached to the context sentence whose `ja` equals the entry's `ja`, as `reading`. A stale entry silently drops, the reading stays undefined.
- `src/model/wanikani.ts`: `ContextSentence = { en, ja, reading? }`. `getShortestSentence` in `src/model/vocabulary-utils.ts` picks the first sentence with the smallest `ja.length`. The script and the server share that function, so both pick the same sentence.
- `src/client/components/VocabularyCard.tsx` line 194 shows `sentence.reading` as a gray line under the sentence.
- `src/anki-templates/vocabulary.md`: `sentence_jap_furigana` is rendered raw at two places, the short back (line ~72, class `short-sentence-reading`) and the full back (line ~137, class `sentence-reading`). The Fields list describes it as "Japanese sentence with furigana (placeholder)". `docs/anki-decks-fields.md` lists the field name only.
- `src/test/fetch-interceptor.ts` answers any URL containing `.tts.speech.microsoft.com` with 100 bytes of audio. The request body is not inspected today. `api.add-to-anki.test.ts` sets `AZURE_TTS_VOICES=ja-JP-TestNeural` and snapshots the note fields, including `sentence_jap_furigana`, so a format change updates those snapshots.
- `src/test/preload.ts` seeds `Math.random`. Each vocabulary add consumes two values, voice gender and sentence voice. Tests that snapshot audio call `resetRandom()` in `beforeEach`.

### The readings data

- `data/sentence_readings.json` has 6829 entries, one per vocabulary item with context sentences, keyed by id, `{ ja, reading }`. Regenerated on 2026-09-06 with `gpt-5.6-sol`, then reviewed: automatic checks on all entries (no kanji, every kana and symbol of the sentence kept in order), and a human read of every changed and every new reading. Known corrections were applied by hand. Treat the `reading` values as ground truth for this plan.
- Readings keep katakana, digits, punctuation and symbols. 珈琲 is written コーヒー. ヶ in 二ヶ所 becomes か. Whitespace inside a sentence is kept in the reading in most entries.
- The generating script is `scripts/generate-sentence-readings.ts`. It only fills missing ids. Shared code: `scripts/lib/llm-utils.ts` (`askForJsonObject`, `parseJsonObject`, `chunk`, `loadJsonFile`, `saveJsonAtomic`), `scripts/lib/generator-cli.ts` (`--limit`, `--batch-size`, `--dry-run`, `--show-prompt`, `log`, `logSummary`, stop after `MAX_FAILED_BATCHES_IN_A_ROW` batches without an answer), `scripts/lib/vocabulary-data.ts` (`loadVocabulary`, `getVocabularyReading`), `scripts/lib/sentence-reading-check.ts` (`getReadingProblem`). The model comes from `LLM_MODEL` in `scripts/.env`, the proxy at `LLM_BASE_URL`. `gpt-5.6-sol` did about 22 seconds per batch of 20 and needs no reasoning tokens for this kind of task.
- The migration plan asks for one more prompt rule for future readings runs: the given reading is for the word on its own, a compound keeps its natural reading with rendaku (アマゾン川 → アマゾンがわ). Not related to this plan, but the same script.

### Alignment: most of it needs no LLM

Given the sentence and its full kana reading, the split into per-block readings is almost mechanical. The non-kanji characters of the sentence appear in the reading in the same order (that is what the order check guarantees), so they act as anchors. Each kanji block's reading is the kana between two anchors.

Experiment on 2026-09-06 over all 6829 entries, a regular expression with one lazy group per kanji block and the non-kanji runs as literals, compared to the same pattern with greedy groups:

| Result    | Count | Meaning                                                                                                                                                                                                                                                                             |
| --------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unique    |  6512 | Lazy and greedy give the same split. Safe to take without a model.                                                                                                                                                                                                                  |
| Ambiguous |   310 | The splits differ. A kanji block's reading ends with the same kana as the anchor after it, or starts with the same kana as the anchor before it. Examples: 母は as は+は or はは+は, 日本に as にほん+に or にほんに+ほん... in 十月に日本にいきます, 三才半 in この子は三才半です. |
| No match  |     7 | All have a space or tab inside the sentence. Strip whitespace on both sides before matching and they match.                                                                                                                                                                         |

So a mechanical aligner settles about 95 percent. The 310 ambiguous ones need a tie-breaker:

- Simplest: send only those to the LLM, in batches of 20, with the sentence, the full reading and the list of kanji blocks, and ask for the reading of each block. About 16 calls.
- Offline alternative: score each candidate split with known readings. `data/userdata/kanji.json` has on'yomi, kun'yomi and nanori per kanji, `data/userdata/vocabulary.json` has the readings of every word. A split whose block readings are made of known readings wins. Good enough for 母は, since は is not a reading of 母 and はは is. Not needed for the first version.

Rules for the kanji block: a maximal run of `[一-鿿㐀-䶿々〆ヶヵ]`. ヶ and ヵ belong to the block because their reading か or が is kana, not a kept symbol. Digits stay outside the block, they are kept as digits in the reading (10ぷん) except in a few old entries that spell them out, so the literal for a digit run must accept digits or kana. Okurigana stays outside the block: 食べる is 食[た]べる, 見せ所 is 見[み]せ 所[どころ].

### Anki furigana format

- Syntax `漢字[かんじ]`, ASCII brackets. The reading applies to the text since the last space or since the start of the string. So a block that follows kana needs a space before it: `日本語[にほんご]を 勉強[べんきょう]する`. The space is removed when rendered. A block at the very start needs no space.
- Filters on the card: `{{furigana:F}}` renders ruby, `{{kana:F}}` renders only the readings and the plain text (that is exactly the kana line the card shows today), `{{kanji:F}}` renders only the base text. So one field in this format can serve three views.
- A value without brackets renders unchanged under all three filters. So the field can move to the new format entry by entry: plain kana entries keep looking as before while the furigana ones already render as ruby. No big-bang needed.
- The template test in `scripts/lib/__tests__/anki-template-fields.test.ts` already accepts filters before a field name (`{{furigana:text:field}}`), so `{{furigana:sentence_jap_furigana}}` passes the field check.

### Azure SSML

- `<sub alias="そとづら">外面</sub>` replaces the spoken text by the alias. Supported for `ja-JP`. The alias and the text must be XML-escaped: `&`, `<`, `>`, `"`, `'`. `escapeXml` in `azure-tts.ts` already does that for the whole text, the builder must apply it per part.
- A `<sub>` per block is the whole change to the SSML. No `<phoneme>` is needed. `<phoneme>` support for Japanese is uncertain on Azure, do not plan on it. `<lexicon uri>` would allow a custom pronunciation lexicon, but it needs a hosted PLS file, out of scope.
- Risk to check first: the Dragon HD voices support only a subset of SSML. It is not verified that `DragonHDLatestNeural` honors `<sub>`. Spike before any other work: one call through the dev server with a hand-built SSML for 外面, then listen. If HD ignores `<sub>`, the choices are the standard voices `ja-JP-NanamiNeural` and `ja-JP-KeitaNeural` for sentence audio, or kana input for HD, or a mix, HD for words and standard for sentences. A comparison of per-kanji-block `<sub>` against a kana-only alias on the whole sentence is part of the spike, to hear whether the kanji context really improves grouping and pitch.
- The voice is picked at random per call. The listening check should cover both voices.

### Where the pieces go

- `src/model/furigana.ts` (new, shared by server and scripts): `parseFurigana(markup)` to a list of parts `{ text, reading? }`, `stripFurigana(markup)` to the plain sentence, `expandFurigana(markup)` to the plain kana, `formatFurigana(parts)` back to markup with the spaces Anki needs. Pure, unit-tested in `src/model/__tests__/`.
- `scripts/lib/furigana-align.ts` (new): `alignFurigana({ sentence, reading })` returns the parts when the split is unique and `null` when it is ambiguous or does not match. Unit tests with the examples from the table above.
- `scripts/generate-sentence-furigana.ts` (new entry point) or a `--furigana` mode of the readings script. It fills the `furigana` field of entries that do not have one: aligner first, the LLM for the ambiguous rest, then the two hard checks, save after every batch with `saveJsonAtomic`. Same flags as the other generators. A rerun picks up the rest, like today.
- `src/server/repository/data-loader.ts` and `vocabulary.ts`: `SentenceReadingEntry` gets `furigana?: string`, attached to the context sentence next to `reading`. `ContextSentence` in `src/model/wanikani.ts` gets `furigana?: string`.
- `src/server/services/azure-tts.ts`: `generateSentenceAudio` takes the parts or the markup and builds the `<sub>` tags. The signature change is small, only one caller.
- `src/server/services/anki-connect.ts`: passes the furigana to TTS when present, else the plain sentence as today. `sentence_jap_furigana` gets the markup when present, else the plain reading.
- `src/anki-templates/vocabulary.md`: `{{furigana:sentence_jap_furigana}}` at both places, or `{{kana:...}}` on the short back and `{{furigana:...}}` on the full back. Then `bun run sync-anki-templates`. Ruby needs a bit more line height, check the CSS of `.short-sentence-reading` and `.sentence-reading` in both light and dark mode.
- `src/client/components/VocabularyCard.tsx`: keeps showing the plain `reading`. Out of scope, unless ruby in the web app is wanted too.
- Tests: `api.add-to-anki.test.ts` gets a test with 外面 (id 3875) that reads the TTS request body from the interceptor and asserts it contains `<sub alias="そとづら">外面</sub>`. The interceptor needs to record TTS bodies for that. Existing snapshots with `sentence_jap_furigana` change once the data has the new field.
- Docs: CLAUDE.md "Anki Integration" bullet about sentence audio, the Fields list in the template, `docs/anki-decks-fields.md` if it ever gets descriptions.

### Listening check

Words and what to listen for, both voices:

| Word          | Sentence                                 | Expect                                                                       |
| ------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| 外面 (3875)   | 彼女の外面にだまされない方がいいですよ。 | そとづら, not がいめん. Failed on 2026-09-06 with plain kanji.               |
| 平壌 (7973)   | 平壌で英語を教えていたことがあります。   | ぴょんやん. Passed with plain kanji, must still pass.                        |
| 川 (2506)     | この川はアマゾン川です。                 | かわ first, がわ at the end.                                                 |
| 土 (2508)     | これはふじ山の土なんだよ。               | ふじさん, not ふじやま. The model itself got this wrong in the readings run. |
| 高校 (2950)   | 高校まで、車で行けば十分ですよ。         | じゅっぷん, ten minutes, not じゅうぶん.                                     |
| 敗者 (4008)   | 私は敗者にはなりたくありません。         | わたしは はいしゃ, two は in a row.                                          |
| 非常口 (4246) | この建物には非常口が二ヶ所あります。     | にかしょ.                                                                    |
| 食べる (2923) | 毎日ドーナッツを食べる。                 | everyday word, general voice quality.                                        |

## Open decisions

- Card rendering: ruby on both backs, or kana line on the short back and ruby on the full back. Ruby is smaller and harder to read on the short card.
- Tie-breaker for the 310 ambiguous sentences: LLM, or the offline scoring with kanji and vocabulary readings. LLM is less code.
- Block granularity for `<sub>`: per kanji block as described, or merge a block with its okurigana into one alias (食べる as one `<sub alias="たべる">`). Per block is what the furigana format gives for free. Merging may sound more natural, test in the spike.
- Whether to keep the plain `reading` field once `furigana` exists. `expandFurigana` can produce it, but the review tooling and the client use `reading` today. Keep both for now.
- Whether `sentence_jap` should stay a separate field or be derived from the markup with `{{kanji:...}}`. Keep it, the Anki search and the note lookup use it.

## Development approach

1. Spike first, no code merged: verify that the HD voice honors `<sub>`. Hand-build the SSML for 外面, call Azure through the dev server or a throwaway script that reads the root `.env` through `--env-file`, store the clip in Anki, listen. Compare per-block `<sub>` with a whole-sentence kana alias. This decides the voice and the granularity.
2. `src/model/furigana.ts` with tests.
3. `scripts/lib/furigana-align.ts` with tests, including the ambiguous cases, whitespace, digits and ヶ.
4. The generator script. Run the aligner over the whole file and print how many entries are left for the LLM. Then the LLM batches for the rest. Both hard checks on every result.
5. Repository, types, TTS builder, anki-connect, template, template sync, E2E test.
6. Listening check with the table above. Then `bun run sync-anki-notes`, which rebuilds every note and its audio.
7. Docs.

Test gate: no new failures against the baseline of the day. Never run a bare `bun test --update-snapshots`, scope it to one file.
