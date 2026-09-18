# Manual Test Scenarios

## URL and Navigation

- Search state is stored in URL (`?type=kanji&q=後`)
- Tab switching only changes local state - does NOT change URL or clear results
- Results stay visible until a new search is performed
- Browser back/forward navigates search history
- Page title updates to reflect current search

## Tab Navigation

- Switch between Radicals, Kanji, and Vocabulary tabs
- Verify the search placeholder updates for each tab type
- Verify results stay visible when switching tabs

## Radicals Search

- Search for `一` in Radicals tab
- Should show: character with blue badge, name ("Ground"), primary name, alternative names if present, user synonyms option, mnemonic with description and image, note section, "Found In Kanji" collapsible section with clickable kanji tiles
- Clicking a kanji tile in "Found In Kanji" should navigate to that kanji search

## Kanji Search

- Search for `校` in Kanji tab
- Should show: character with pink badge, meaning ("School"), radical combination section with clickable radicals (blue badges), meaning section, readings section, "Visually Similar Kanji" section with clickable kanji tiles, "Found In Vocabulary" section with clickable vocabulary tiles
- Below kanji card: indented full radical card(s) with name, mnemonic, image, and notes
- Clicking radical badge in "Radical Combination" should smooth-scroll to the corresponding radical card
- Clicking tile in "Visually Similar Kanji" should navigate to that kanji search (new URL, back button works)
- Clicking tile in "Found In Vocabulary" should navigate to that vocabulary search

## Vocabulary Search

- Search for `毎晩` in Vocabulary tab
- Should show: character with purple badge, meaning title ("Every Night"), meaning section with primary meaning, alternative meanings ("Nightly"), user synonyms option, word type (noun), explanation mnemonic, note section, reading section with hiragana, clickable audio buttons (KYOKO/KENICHI), reading mnemonic, note section, context sentences (Japanese + English), kanji composition section with clickable pink kanji badges
- For verbs (e.g., `入る`): Should also show "Conjugations" row under "Word Type" with dictionary, masu, te, and nai forms
- Below vocabulary card: indented kanji card(s) with meaning, radical combination, readings, mnemonics, "Visually Similar Kanji" and "Found In Vocabulary" sections
- Below each kanji card: further indented radical card(s) with name, mnemonic, image
- Clicking kanji badge in "Kanji Composition" should smooth-scroll to the corresponding kanji card
- Clicking radical badge in kanji's "Radical Combination" should smooth-scroll to the radical card
- Clicking tiles in kanji's "Visually Similar" or "Found In Vocabulary" sections should navigate to new search

## Kana Vocabulary Search (via Vocabulary tab)

- Search for `ここ` in Vocabulary tab (kana vocabulary is merged into vocabulary search)
- Should show: character with purple badge, meaning ("Here"), meaning section, context sentences
- Should NOT show: Reading section (kana vocabulary doesn't have readings), Kanji Composition section (no kanji components)

## Own Notes and Synonyms

Edited in place on every card. The values are stored in `data/userdata/study_materials_extra.json`.

- Search `校` in Kanji: a section with no note shows "+ Add Note". Click it, type a text, click the check button. The note appears with a small "local" tag
- Click the pencil button, change the text, save. The new text is still there after a page reload
- Open the editor and press Esc, or click the cancel button: the draft is dropped and the old note is back
- Open the editor, clear the whole text and save: the local note goes away. A subject with a WaniKani note (kanji `川` has the reading note "Kawai") shows that note again, without the "local" tag
- Search `一` in Radicals and `ここ` in Vocabulary: each shows one Note section for the meaning and no reading note
- Click "+ Add Synonym", type a word, press Enter: the word appears as a gray chip with a × button. Press Esc instead: the input closes and nothing is added
- Add a synonym that is already there, a local one or a WaniKani one (`アメリカ人` has "usa person"): a toast says it is already a synonym and the list does not change
- Click the × on a local chip: the chip goes away. WaniKani chips have no × and cannot be removed
- Edit a note on a kanji card shown under a vocabulary word, then search that kanji on its own: the note is there
- Search a word whose two kanji share a radical (`一万`, `毎年`, `土地`): the radical gets one card under each kanji. Add a synonym on the first card, then add another one on the second card. Both cards show both words, and nothing is lost
- Stop the dev server, then save a note: a red toast shows the fetch error and the editor opens again with the text. Cancel after that shows the last saved value, not the draft
- Run "Add to Anki" for a word with a local note and a local synonym, then check the fields in Anki. Kanji synonyms are the one thing that does not reach Anki, the kanji note type has no field for them

## Empty/No Results

- Verify "Enter a search term to find items" message appears before searching
- Verify "No [type] found for [query]" message appears for searches with no results

## Server Error in Search

- Open the app, then stop the dev server and press Enter in the search input
- Should show: red "Could not reach the server. Is the dev server running?" and a Retry button
- Should NOT show: "No [type] found" text
- Start the server again and click Retry: the card appears, the URL and the input text do not change
- An answer with a bad status shows "Server error (500)" with the same Retry button

## Anki Cards

Checked in Anki after `bun run sync-anki-templates`.

- Answer side of a verb card (`入る`, `食べる`): the masu form sits right under the purple badge, gray, 50% of the badge size
- Same card in light mode and in dark mode: the masu form stays readable in both
- Answer side of a non-verb card (`毎晩`) and a kana card (`ここ`): no extra line under the badge
- Answer side of a long verb (`生まれる`): the badge and the masu form still fit on one line after the font scaling runs
