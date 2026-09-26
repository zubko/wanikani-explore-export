# Alternative Meanings on the Short Back

## Overview

- The short back (`#back-short`) of the kanji and vocabulary Anki cards shows only the primary meaning and the reading.
- Add one line under the main meaning with all other meanings: WaniKani alternatives and the user's synonyms. It is less prominent: muted color, smaller font.
- The card does not tell WaniKani and user meanings apart there. The server joins them into one new field, `alternative_meanings`.
- The Details view (`#back-full`) keeps the split: an "Alternative" row and a "Synonyms" row. Kanji gets a new `user_synonyms` field for that, so kanji synonyms reach Anki for the first time.
- Radicals are out of scope.

## Context (from discovery)

- Templates: `src/anki-templates/kanji.md`, `src/anki-templates/vocabulary.md`. Each has `#back-short` with a `#header-scaled` block that JS scales to a share of the container width: 75% on kanji, 85% on vocabulary (`maxWidth = container.offsetWidth * 0.85`).
  - Kanji header is one row (badge left, meaning + reading right, `nowrap`).
  - Vocabulary header is a column (badge, masu form, meaning, reading), followed by the Details button and a short sentence.
- The short sentence uses fixed `rem` sizes and muted colors: `.short-sentence-jap` is `1.2rem`, `#888`, dark mode `#aaa`.
- Note builders: `buildKanjiNoteFields` and the vocabulary builder in `src/server/services/anki-connect.ts`. Both call `mergeStudyMaterialForAnki`, which returns HTML-escaped `meaningSynonyms`.
- `getExtraMeanings(meanings)` in `src/model/subject-utils.ts` returns the non-primary accepted meanings joined with `", "`.
- Field lists: `*_EXPECTED_FIELDS` in `src/model/anki-models.ts`, note field types in `anki-connect.ts`, `## Fields` in the template files, `docs/anki-decks-fields.md`. `scripts/lib/__tests__/anki-template-fields.test.ts` checks the order and every `{{...}}` reference.
- `src/client/components/KanjiCard.tsx` shows a "not in Anki" hint next to the synonym row while `KANJI_EXPECTED_FIELDS` has no `user_synonyms`. `UserSynonymsRow` has a `hint` prop only for this. `KanjiCard.test.tsx` and `UserSynonymsRow.test.tsx` test it.
- `src/server/__tests__/api.add-to-anki.test.ts` snapshots the AnkiConnect calls (file snapshots and inline ones), including a test with local synonyms `["a & b", "c < d"]`.

## Development Approach

- **testing approach**: Regular (code first, then tests)
- complete each task fully before moving to the next
- make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- run tests after each change
- snapshot updates are always scoped to one file: `bun test <file> --update-snapshots`
- do NOT run `bun run sync-anki-templates` during implementation: the new fields do not exist in Anki yet, so the script blocks. The user runs the rollout (see Post-Completion)

## Testing Strategy

- **unit tests**: `getAlternativeMeanings` in `src/model/__tests__/subject-utils.test.ts`.
- **integration tests**: the API E2E tests in `src/server/__tests__/api.add-to-anki.test.ts` cover the create and update paths of the Anki notes. The new fields must show up there for kanji and vocabulary, created and updated notes alike, including a case with local synonyms and HTML escaping.
- **field consistency**: `scripts/lib/__tests__/anki-template-fields.test.ts` must pass with the new fields in `*_EXPECTED_FIELDS` and the templates.
- **client tests**: `KanjiCard.test.tsx` and `UserSynonymsRow.test.tsx` after the hint is removed.
- no browser e2e tests in this project. Anki templates are checked by hand (Post-Completion).

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope

## Solution Overview

- One joined field `alternative_meanings` for the short back, built on the server. The template stays simple: `{{#alternative_meanings}}...{{/alternative_meanings}}`. Mustache cannot join two optional fields with a comma, and the card does not need to know the source.
- The separate `extra_meanings` and `user_synonyms` fields stay for the Details view.
- One shared CSS class `.alt-meanings` in both templates: `font-size: 1.2rem`, `color: #888`, dark mode `#aaa`. A fixed `rem` size gives the same size on both card types and does not follow the header scaling.
- Kanji: the line sits right after `#header-scaled`, centered, before the Details button, with `max-width: 75%` like the header. It is outside the scaled header, so the scaling JS does not change.
- Vocabulary: the line sits inside `.header-text`, between `<h1>` and the reading. The scaling JS measures the header width, so it sets the line's `max-width` to the same `maxWidth` before the loop. The line wraps inside that width and never starts the shrink loop. `maxWidth` is rounded down first: `offsetWidth` is an integer, so with a fractional limit a full-width line can measure 512 against 511.7. Its fixed `rem` size does not shrink with the header, so the loop would run until `fontSize` reaches 1.

## Technical Details

- `getAlternativeMeanings(meanings: Meaning[], synonyms: string[]): string[]` in `src/model/subject-utils.ts`, next to `getExtraMeanings`:
  - the non-primary accepted meanings (same filter as `getExtraMeanings`), then the synonyms
  - a blank synonym (empty after trim) is dropped. `mergeStudyMaterial` keeps blank strings and a hand-edited file may hold one, which would show as `Nightly, , foo`
  - a synonym equal to any meaning (the primary one too) or to an earlier synonym is dropped
  - the compare key is `trim().toLowerCase().normalize("NFC")`. `UserSynonymsRow.tsx` already has this normalizer; move it to `subject-utils.ts` as one exported function and use it in both places
  - it works on raw text and returns the list, not a joined string
- The dedup must run before HTML escaping: an escaped `a &amp; b` never matches a raw `a & b`. So the builders take the raw synonyms from `mergeStudyMaterial(...)`, not the escaped ones from `mergeStudyMaterialForAnki`, then map the result through `escapeHtml` and join with `", "`. Escaping the WaniKani meanings too is harmless.
- New field order:
  - kanji: `character, radicals, primary_meaning, primary_reading, extra_meanings, user_synonyms, alternative_meanings, meaning_mnemonic, ...`
  - vocabulary: `characters, kanji_composition, primary_meaning, extra_meanings, user_synonyms, alternative_meanings, word_type, ...`
- Kanji `user_synonyms` = `studyMaterial.meaningSynonyms.join(", ")`, like vocabulary.
- Kanji Details view gets the same Synonyms row as vocabulary:
  ```html
  {{#user_synonyms}}
  <div class="row"><span class="label">Synonyms</span> {{user_synonyms}}</div>
  {{/user_synonyms}}
  ```
- Short back markup (both templates):
  ```html
  {{#alternative_meanings}}
  <div class="alt-meanings" id="alt-meanings">{{alternative_meanings}}</div>
  {{/alternative_meanings}}
  ```
- Vocabulary JS: `var maxWidth = Math.floor(container.offsetWidth * 0.85);`, then before the shrink loop: `var alt = document.getElementById("alt-meanings"); if (alt) alt.style.maxWidth = maxWidth + "px";`. No `white-space` rule is needed: the vocabulary header has no `nowrap`, and the kanji line sits outside the `nowrap` header.

## What Goes Where

- **Implementation Steps**: code, templates, tests, docs in this repo.
- **Post-Completion**: Anki schema change, template sync, note re-sync, visual check. Only the user can run those.

## Implementation Steps

### Task 1: Add getAlternativeMeanings helper

**Files:**

- Modify: `src/model/subject-utils.ts`
- Modify: `src/model/__tests__/subject-utils.test.ts`
- Modify: `src/client/components/card-components/UserSynonymsRow.tsx` (use the moved normalizer)

- [x] move the synonym normalizer from `UserSynonymsRow.tsx` to `subject-utils.ts`, import it back
- [x] add `getAlternativeMeanings(meanings, synonyms)` next to `getExtraMeanings`
- [x] write tests: alternatives only, synonyms only, both, nothing (empty list)
- [x] write tests: a synonym equal to an alternative or to the primary meaning in another case / with spaces is dropped, repeated synonyms appear once, non-accepted meanings are left out
- [x] write tests: a meaning `"a & b"` and a synonym `"A & B"` give one entry (the helper works on raw text)
- [x] write tests: blank synonyms (`["", "   "]`) give an empty list, blanks mixed with real meanings are dropped
- [x] run `bun test src/model/__tests__/subject-utils.test.ts src/client` - must pass before task 2

### Task 2: Add the new fields to the field lists and note builders, remove the kanji "not in Anki" hint

**Files:**

- Modify: `src/model/anki-models.ts`
- Modify: `src/server/services/anki-connect.ts`
- Modify: `src/anki-templates/kanji.md` (`## Fields` only)
- Modify: `src/anki-templates/vocabulary.md` (`## Fields` only)
- Modify: `docs/anki-decks-fields.md`
- Modify: `src/server/__tests__/api.add-to-anki.test.ts` and its snapshots
- Modify: `src/client/components/KanjiCard.tsx`
- Modify: `src/client/components/card-components/UserSynonymsRow.tsx`
- Modify: `src/client/components/__tests__/KanjiCard.test.tsx`
- Modify: `src/client/components/__tests__/UserSynonymsRow.test.tsx`

- [x] add `user_synonyms` and `alternative_meanings` to `KANJI_EXPECTED_FIELDS`, and `alternative_meanings` to `VOCABULARY_EXPECTED_FIELDS`, in the order from Technical Details
- [x] add the fields to `KanjiNoteFields` / the vocabulary note fields type, fill them in both builders with `getAlternativeMeanings` on the raw synonyms, then `escapeHtml` + join (see Technical Details)
- [x] add the fields to the `## Fields` lists of both templates and to `docs/anki-decks-fields.md`
- [x] update the add-to-anki snapshots, scoped: `bun test src/server/__tests__/api.add-to-anki.test.ts --update-snapshots`, then review the diff: only the new fields change
- [x] escaping test: the `"a & b"` / `"c < d"` synonyms belong to the radical 一, which is out of scope. Add `meaning_synonyms` with `&` and `<` to the kanji entry `"958"` (晩) in that `describe`, and assert the escaped values in kanji `user_synonyms` and `alternative_meanings`. Also assert `alternative_meanings` in the vocabulary 毎晩 escape test
- [x] update path: in the "update existing verb vocabulary (入る)" test, assert `alternative_meanings` on the vocabulary `updateNoteFields` call, and `user_synonyms` / `alternative_meanings` on the kanji 入 `updateNoteFields` call (inline snapshot, like the existing asserts: the values come from the real `study_materials.json` and can change after a download)
- [x] the fixture 毎晩 has the WaniKani alternative "Nightly" and the local synonym "nightly": assert it appears once in `alternative_meanings`
- [x] escaped exactly once: in the 晩 case above, assert `&amp;` and not `&amp;amp;` in `alternative_meanings`. Dedup before escaping cannot be shown at builder level: no WaniKani meaning in `data/userdata/` holds `&` or `<` (checked 2026-09-26). The helper unit test in Task 1 covers it with a hand-built `Meaning` that holds `&`
- [x] adding `user_synonyms` to `KANJI_EXPECTED_FIELDS` makes the kanji "not in Anki" hint go away, so remove it in this task: drop `SYNONYM_HINT` and the `KANJI_EXPECTED_FIELDS` import from `KanjiCard.tsx`, and the `hint` prop from `UserSynonymsRow` (it has no other user)
- [x] replace the "says that kanji synonyms do not reach Anki" test with one that expects no "not in Anki" text; drop the hint test in `UserSynonymsRow.test.tsx`
- [x] run the full `bun test` - must pass before task 3

### Task 3: Show the alternative meanings on the short back and the kanji synonyms on the Details view

**Files:**

- Modify: `src/anki-templates/kanji.md`
- Modify: `src/anki-templates/vocabulary.md`

- [x] kanji: add the `.alt-meanings` div after `#header-scaled`, before the Details button; CSS: centered, `max-width: 75%`, small top margin, `1.2rem`, `#888`, dark mode `#aaa`
- [x] kanji: add the Synonyms row after the Alternative row in `#back-full`
- [x] vocabulary: add the `.alt-meanings` div in `.header-text` between `<h1>` and the reading; same size and colors, no `max-width` in CSS (the JS sets it)
- [x] vocabulary: round `maxWidth` down with `Math.floor` and set the line's `maxWidth` in the scaling JS before the shrink loop
- [x] run `bun test scripts/lib/__tests__/anki-template-fields.test.ts` (checks every `{{...}}` reference) - must pass before task 4

### Task 4: Verify acceptance criteria

- [ ] both templates render `alternative_meanings` on the short back, kanji renders `user_synonyms` on the Details view
- [ ] run full test suite: `bun test`
- [ ] run `bun run tsc`, `bun run lint:fix`, `bun run format`

### Task 5: [Final] Update documentation

- [ ] update CLAUDE.md: kanji synonyms now reach Anki (remove the "Kanji synonyms are the one exception" part and the `KanjiCard` "not in Anki" hint text); mention `alternative_meanings` as the joined field of the short back
- [ ] move this plan to `docs/plans/completed/`

## Post-Completion

_Items requiring manual intervention or external systems - no checkboxes, informational only_

**Rollout** (the user runs these, in this order):

From the moment this change is on the running server until step 2 is done, every kanji and vocabulary `add-to-anki` fails, `add-iknow-vocab` too: `validateModelFields` throws on a missing field. Run the rollout right after the merge.

1. Sync every other device to AnkiWeb, then sync this machine.
2. `bun run sync-anki-fields` (interactive, needs a TTY). It adds `user_synonyms` + `alternative_meanings` to kanji and `alternative_meanings` to vocabulary. Then choose upload on the one-way sync.
3. `bun run sync-anki-templates`.
4. `bun run dev`, then `bun run sync-anki-notes` to fill the new fields in the existing notes. It walks the vocabulary notes only, so a kanji is refreshed as a component of a word. A kanji note with no word in Anki keeps the new fields empty until it is added again.

**Manual verification**:

- short back of a kanji with several alternatives (万: "Ten Thousand, 10000"): line is centered under the header, muted, wraps on a narrow window
- short back of a vocabulary with a long list: the main meaning keeps its size, the line wraps. Resize the Anki window to several widths: the header must never collapse to a tiny font
- a subject with no alternatives and no synonyms: no empty line, no extra gap
- dark mode colors on both card types
- kanji Details view shows the Synonyms row for a kanji with a local synonym
