---
name: add-iknow-vocab
description: Add the next batch of iKnow Core 1000 words to the Anki vocabulary deck, then triage the words that failed. Use when the user says "add iknow vocab", "add N iknow words", "add more core 1000 words", or asks to continue the iKnow course import. Also use it when the user wants only the iKnow words whose kanji are already in Anki, or only the new radicals of the next iKnow words.
---

# Add iKnow vocabulary

`scripts/add-iknow-vocab.ts` does the whole import loop. Your job is to run it and read the result.
Do not write your own loop and do not call the API word by word for the normal path.

## 1. How many words

The skill takes a count. When the user gives none, ask before running.

The count is words really added, or radicals with `--new-radicals`. The script skips a word that is
already in Anki or already in `problems` without using up the budget.

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

**Run the script once per request, and keep its whole output.** Every real run writes notes to
Anki, so a second run adds a second batch. Do not pipe the output into `tail`, `head` or `grep`.
The report in step 4 needs every added line, and a long run puts them far apart. When the output
still gets cut, never run the script again to see it. Get the missing facts from Anki instead, for
example `findNotes` with `added:1` on the note type, which lists the notes added today.

When the script stops with a note type field mismatch, nothing was recorded for that word. Do not
retry and do not add words by hand. Pass on the fix steps the script prints. The field step needs a
real terminal, so the user must run it.

### Only words with known kanji

When the user wants only words that bring no new kanji into Anki, add `--known-kanji-only`:

```bash
bun run add-iknow-vocab -- --known-kanji-only --limit <count>
```

It adds kana words and words whose kanji are all in the Anki kanji deck already, and skips the
rest. It starts at the saved index and walks on into the next course files until the limit. It
never writes the status file, so the index stays and no `problems` entry is added. A normal run
later reaches every skipped word, and skips the added ones as already in Anki.

Skip step 5 for such a run. The words it did not find are not recorded, and the normal run that
reaches them later triages them.

### Only new radicals

When the user wants the radicals of the next words that are not in Anki yet, add `--new-radicals`:

```bash
bun run add-iknow-vocab -- --new-radicals --limit <count>
```

It adds no word. For every next word that is not in Anki, it adds the radicals of the word's kanji
that are not in the Anki radical deck. `--limit` counts radicals, so a run can stop in the middle of
a word. Like `--known-kanji-only`, it walks on into the next course files and never writes the
status file. Skip step 5 for this run too. The two flags exclude each other.

After the run, check every added radical. Some radicals have no story of their own: the mnemonic is
only `This radical is the same as the kanji. It means <radical>friend</radical>.` and the
radical has no picture. Such a card teaches nothing without the kanji, so add that kanji too. This
prints what the check needs, with the primary names of the added radicals:

```bash
bun -e '
const radicals = JSON.parse(await Bun.file("data/userdata/radicals.json").text());
const kanji = JSON.parse(await Bun.file("data/userdata/kanji.json").text());
const registry = (await Bun.file("data/userdata/mnemonic-images.jsonl").text()).trim().split("\n").map((l) => JSON.parse(l));
for (const name of ["Friend", "Fur"]) {
  const r = radicals.find((r) => !r.data.hidden_at && r.data.meanings.some((m) => m.primary && m.meaning === name));
  const picture = registry.find((l) => l.page === r.data.document_url)?.image ?? "none";
  const k = kanji.find((k) => !k.data.hidden_at && k.data.characters === r.data.characters);
  console.log(r.data.characters, name, "| picture:", picture, "| kanji:", k ? k.id : "none");
  console.log("  " + r.data.meaning_mnemonic);
}'
```

- Add the kanji only when both are true: the picture is `none` or `null`, and the mnemonic only
  points to the kanji. A radical with a real story keeps its card alone, picture or not.
- Look up the kanji id in `/api/anki-notes?type=kanji` first. When it is already there, add
  nothing.
- Otherwise add it with `{"id": <kanji id>, "type": "kanji"}` and read the answer for `"ok":true`.
  This kanji does not count against `--limit`.
- In the report, list every radical that matched and say whether its kanji was added or was already
  in Anki.

## 4. Report

Pass on the script summary: added, already in Anki, not found, errors, and where the next run starts.
List the words that were added, or the radicals with the word each one came from.

## 5. Triage the new failures

The interesting part. Look at the `problems` entries the run just appended.

About one iKnow word in five is not in the WaniKani data — 218 of the Core 1000. Sort each new one:

- **Grammar word WaniKani does not teach** (なる, そう, どうぞ, もっと, とても). Nothing to do. Say so
  and leave the entry in `problems`.
- **WaniKani spells it differently** (すぐ → 直ぐ, あと → 後). Search the spelling you expect:

  ```bash
  curl -s -G --data-urlencode "q=<alternative>" -d type=vocabulary http://localhost:5173/api/search
  ```

  Let curl encode the word. Raw Japanese in the URL gets a `400` with an empty body from Node's
  HTTP parser, before the app sees the request, and it is easy to misread as "not found".

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
