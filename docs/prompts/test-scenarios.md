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

## Empty/No Results

- Verify "Enter a search term to find items" message appears before searching
- Verify "No [type] found for [query]" message appears for searches with no results
