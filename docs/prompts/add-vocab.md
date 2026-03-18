Add vocabulary words from @docs/lists/n5-vocabulary.md to Anki using the API.

This prompt accepts a number argument for how many words to add. If not provided, ask the user how many words they want to add before proceeding.

## Steps

1. Start the dev server (`bun run dev`) in the background if it's not already running. Wait a few seconds for it to start, then verify it's up by calling the search API.

2. Read `docs/lists/n5-vocabulary.md` and `data/userdata/n5-vocabulary-status.json` (create empty `{}` if missing). Find the next line whose Japanese word (the characters before the opening parenthesis) is not a key in the status file.

3. For each such line (up to the requested count):

   a. Extract the Japanese word (the characters before the opening parenthesis).

   b. Search for it via the API:

   ```
   GET http://localhost:5173/api/search?type=vocabulary&q={word}
   ```

   The response is `{ found: true, data: { id, ... } }` or `{ found: false }`.

   c. If found, add it to Anki:

   ```
   POST http://localhost:5173/api/add-to-anki
   Content-Type: application/json
   Body: { "id": <id from search>, "type": "vocabulary" }
   ```

   The response is `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`.

   d. If the search found the item AND it was successfully added to Anki, write `{ "status": "added", "wkId": <id from search> }` to the status file for that word.

   e. If the item was not found, write `{ "status": "not_found" }` to the status file for that word. If adding to Anki returned an error, write `{ "status": "error", "error": "<error message>" }` to the status file.

   f. Proceed to the next word not in the status file.

4. After finishing, save the updated status JSON to `data/userdata/n5-vocabulary-status.json` and report how many words were added successfully, how many were not found, and how many had errors.
