# Backlog

Ideas and to-dos for later. Pick from here when choosing what to work on next.

- Cache sentence audio in `data/userdata/`. Note generation calls Azure TTS for every word on every sync. Store each clip in the user data folder and reuse it when the file is already there, so a full re-sync does not regenerate audio for every word.
- `--show-prompt` in the two LLM scripts prints nothing when every item is already done, because it needs at least one item to build a batch. Let it build the prompt from the first item of the data set in that case.
- The fetch interceptor in `src/test/fetch-interceptor.ts` always answers AnkiConnect with success. Add a `setAnkiError(action, message)` helper so the E2E tests can cover the error paths of `/add-to-anki` and `/anki-sync`.
- Cache radical images in `data/userdata/`. `fetchAndStoreSvg` in `src/server/services/anki-connect.ts` downloads every radical image from WaniKani on each note add or sync. Store the file itself, not just its URL, and read it from the user data folder next time, so the cards still build when WaniKani drops the image.
