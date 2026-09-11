---
name: add-iknow-vocab
description: Add the next batch of iKnow Core 1000 words to the Anki vocabulary deck, then triage the words that failed. Use when the user says "add iknow vocab", "add N iknow words", "add more core 1000 words", or asks to continue the iKnow course import.
---

# Add iKnow vocabulary

`scripts/add-iknow-vocab.ts` does the whole import loop. Your job is to run it and read the result.
Do not write your own loop and do not call the API word by word for the normal path.

## 1. How many words

The skill takes a count. When the user gives none, ask before running.

The count is words really added. The script skips a word that is already in Anki or already in
`problems` without using up the budget.

## 2. Start the dev server

The script needs the dev server **and** Anki with AnkiConnect. Check both at once:

```bash
curl -s -m 5 "http://localhost:5173/api/anki-notes?type=vocabulary" | head -c 200
```

Read the answer, do not trust the HTTP status. This endpoint answers 200 with `{"ok":false,...}`
when AnkiConnect is down, so a status check alone can pass with Anki closed.

- No answer or a connection error — the dev server is down. Start `bun run dev` in the background,
  wait a few seconds, check again.
- `{"ok":false, "error": ...}` — the dev server is up but Anki is not reachable. Do **not** start
  another dev server. Ask the user to open Anki, then check again.
- `{"ok":true, ...}` — both are up. Go on.

## 3. Run it

```bash
bun run add-iknow-vocab -- --limit <count>
```

Use `--dry-run` first only when the user asks to preview. The script saves
`data/userdata/iknow-vocabulary-status.json` after every word, so a stop in the middle loses nothing.

Adding a word downloads media and syncs to AnkiWeb, so a run of 15 takes a few minutes. Give it a
long timeout.

## 4. Report

Pass on the script summary: added, already in Anki, not found, errors, and where the next run starts.
List the words that were added.

## 5. Triage the new failures

The interesting part. Look at the `problems` entries the run just appended.

About one iKnow word in five is not in the WaniKani data — 218 of the Core 1000. Sort each new one:

- **Grammar word WaniKani does not teach** (なる, そう, どうぞ, もっと, とても). Nothing to do. Say so
  and leave the entry in `problems`.
- **WaniKani spells it differently** (すぐ → 直ぐ, あと → 後). Search the spelling you expect:

  ```bash
  curl -s "http://localhost:5173/api/search?type=vocabulary&q=<alternative>"
  ```

  Show the user the hit — characters, primary meaning, level — and **ask before adding**. The
  alternative spelling is a guess about meaning, and a wrong guess puts a wrong card in the deck.

  On a yes, add it with the type the search reports in `data.object`:

  ```bash
  curl -s -X POST http://localhost:5173/api/add-to-anki -H 'Content-Type: application/json' \
    -d '{"id": <id>, "type": "<data.object>"}'
  ```

  Remove that entry from `problems` **only after** the answer body says `"ok":true`. An AnkiConnect
  failure comes back as HTTP 200 with `{"ok":false}`, so curl's exit code proves nothing. On
  anything but `ok:true`, leave the entry alone and report the error — a dropped entry is gone for
  good.

- **`reason: "error"`**. A real failure — a server or AnkiConnect problem. Read the message and report
  it. Do not retry blindly.

Resolve a word by adding it now, in this session. The saved index has already moved past it, so a
later run never comes back to it. Dropping an entry from `problems` alone does nothing.
