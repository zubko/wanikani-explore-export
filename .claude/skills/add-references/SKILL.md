---
name: add-references
description: After any add to Anki, add the WaniKani items that the new notes mention in their mnemonics, hints or notes, and check whether a new radical is only "the same as the kanji". Use it right after every POST to /api/add-to-anki (a word, a kanji or a radical), after every real run of add-iknow-vocab, add-text-vocab or sync-anki-notes, and when the user says they added words, kanji or radicals in the web UI or from the phone. Also use it when the user says "add the references", "check the new radicals" or "check radicals for kanji".
---

# Add the referenced items

A mnemonic, hint or note often names another kanji or word: "The reading comes from 狙い", "don't
confuse it with 午". The card makes sense only when that item is in Anki too. So every add is
followed by this check, and the items it finds are added with no question.

Some WaniKani radicals have no story of their own. The mnemonic is only
`This radical is the same as the kanji. It means <radical>district</radical>.` and the radical has
no picture. Such a mnemonic names the kanji by its meaning, not by its character, so the script
only lists these radicals. You decide in step 3.

Skip the whole skill only when the add failed.

## 1. Run the script

The dev server and Anki with AnkiConnect must run. Use the dev server that made the add. On the
Mac it is `http://localhost:5173`. On deb2 it can run on another port, find it with
`ss -ltnp | grep node` and pass `--base-url`.

```bash
bun run add-references
```

It syncs with AnkiWeb, then reads the notes added to Anki today, also the ones from the web UI, the
phone or a batch script. Use `--days <n>` when the adds were before today. `--dry-run` lists the
first round and adds nothing.

For every kanji run in the mnemonic, hint and note fields it looks for a WaniKani word with exactly
these characters, then a kanji, then a radical. An item that is not in Anki is added. A word add
brings its kanji and radicals with it. The new notes are checked the same way, round after round,
until nothing is missing. At the end it syncs once more.

It also prints:

- `No WaniKani item for: ...` — runs that match no item, like a phrase with a particle
  (`表情が曇る`). Nothing to do.
- Every new radical whose mnemonic says "same as the kanji", with its picture, the kanji id, and
  whether that kanji is in Anki. `ADD KANJI` marks a radical with no picture whose kanji is not in
  Anki.

The first failed add stops the run with exit 1. Read the error and report it. Do not retry blindly.

## 2. When it runs inside add-iknow-vocab

An item it adds does not count against `--limit`.

## 3. The "same as the kanji" radicals

Add the kanji only when both are true:

- the line says `ADD KANJI`
- the mnemonic only points to the kanji. A radical with a real story of its own keeps its card
  alone, picture or not. A short extra hint, like "don't confuse it with 辛", is not a story.

```bash
curl -s -X POST <base-url>/api/add-to-anki -H 'Content-Type: application/json' \
  -d '{"id": <kanji id>, "type": "kanji"}'
```

Read the answer body for `"ok":true`. The status is 200 on an AnkiConnect failure too. The new
kanji note has its own mnemonic, so run `bun run add-references` again after it.

## 4. Report

- The items the script added, each with the note that mentioned it. Only mention them, do not ask.
- Every "same as the kanji" radical, and whether its kanji was added now or was already in Anki.
