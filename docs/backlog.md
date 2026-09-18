# Backlog

Ideas and to-dos for later. Pick from here when choosing what to work on next.

- Cache sentence audio in `data/userdata/`. Note generation calls Azure TTS for every word on every sync. Store each clip in the user data folder and reuse it when the file is already there, so a full re-sync does not regenerate audio for every word.
- `--show-prompt` in the two LLM scripts prints nothing when every item is already done, because it needs at least one item to build a batch. Let it build the prompt from the first item of the data set in that case.
- The fetch interceptor in `src/test/fetch-interceptor.ts` always answers AnkiConnect with success. Add a `setAnkiError(action, message)` helper so the E2E tests can cover the error paths of `/add-to-anki` and `/anki-sync`.
- Cache radical images in `data/userdata/`. `fetchAndStoreSvg` in `src/server/services/anki-connect.ts` downloads every radical image from WaniKani on each note add or sync. Store the file itself, not just its URL, and read it from the user data folder next time, so the cards still build when WaniKani drops the image.
- Add a `user_synonyms` field to the Anki kanji note type. Local kanji synonyms stay on screen today, because the note type has no field for them. It needs the interactive `bun run sync-anki-fields`, the field in `KANJI_EXPECTED_FIELDS`, in the `## Fields` list and the Back template of `src/anki-templates/kanji.md`, and a row in `docs/anki-decks-fields.md`.
- Show in the web interface which items are already in Anki. When the search finds a word, the server should ask Anki whether that word and its whole package (the kanji and the radicals) already have notes, and put that state into the data it sends to the front end. First step: the front end only shows it, so the user can see what is new. Later step: use the same state on add, and skip the notes that are already there instead of writing them again.
- search of vocabulary should return multiple results and do a substring search, the web app should adapt accordingly to show the search results UI if there is more than 1 find and allow to click the result to proceed to the details of that item
- search of kanji and vocabulary should also work by hiragana, matching against the spelling
- run the dev server and anki/anki connect on my debian machine so i can add from my phone
