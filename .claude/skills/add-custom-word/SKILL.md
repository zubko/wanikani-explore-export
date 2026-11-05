---
name: add-custom-word
description: Add a word that WaniKani does not have as a custom word, then add it to the Anki vocabulary deck. Use when the user says "add a custom word", "add my own word", "add <word> as a custom word", or "WaniKani does not have <word>". Also use it for an iKnow word in `problems` that WaniKani does not teach, like そう, どうぞ, くれる or もっと.
---

# Add a custom word

A custom word lives in `data/userdata/custom_subjects.json`, apart from the WaniKani data. The
server treats it like a WaniKani word: the search finds it, the web app shows it with a "custom"
badge, and `/api/add-to-anki` writes its note. Its id starts at 1,000,000.

You write the content: meanings, mnemonics, context sentences, and conjugations for a verb. The
server fills every other field. The user sees every mnemonic before anything is saved.

Only `vocabulary` (a word with at least one kanji) and `kana_vocabulary` (kana only) exist. Custom
kanji and radicals do not.

Let curl encode every Japanese query with `-G --data-urlencode`. Raw Japanese in the URL gets a
`400` with an empty body from Node's HTTP parser, and that is easy to misread as "not found".

## 1. Check the dev server and Anki

```bash
curl -s -m 5 "http://localhost:5173/api/anki-notes?type=vocabulary" | head -c 200
```

Read the answer, do not trust the HTTP status:

- No answer or a connection error: the dev server is down. Start `bun run dev` in the background,
  wait a few seconds, check again.
- `{"ok":false, "error": ...}`: the dev server is up but Anki is not reachable. Do **not** start
  another dev server. Ask the user to open Anki, then check again.
- `{"ok":true, ...}`: both are up. Go on.

## 2. Search the word first

Search the spelling, and for a word with kanji also its kana spelling:

```bash
curl -s -G --data-urlencode "q=<spelling>" -d type=vocabulary http://localhost:5173/api/search
```

- `{"found":false}` for every spelling: go on to step 3.
- A hit with `"isCustom":false`: WaniKani has the word, maybe under this spelling, maybe under
  another one. **Stop.** Tell the user the hit (characters, primary meaning, level). When the
  spelling differs, the user decides whether that word is the one they mean.
- A hit with `"isCustom":true` and the same `characters`: an earlier run already saved this word.
  This is the resume path after a failed Anki add. Take its `id` and skip to step 6.

## 3. Read the kanji

Skip this step for a kana word.

For every kanji of the word:

```bash
curl -s -G --data-urlencode "q=<kanji>" -d type=kanji http://localhost:5173/api/search
```

Note its `id`, its `meanings`, its `readingMnemonic`, and every entry of `readings` with
`reading`, `primary`, `accepted_answer` and `type`. A taught reading has `accepted_answer: true`.
WaniKani lists untaught readings too, like なま for 生.

The `id` of every kanji goes into `component_subject_ids`, in the order of the word.

**Stop** when a kanji is not found. The word cannot be a custom word yet, because a custom word
can only use WaniKani kanji. Tell the user which kanji is missing.

## 4. Draft the word and show the mnemonics

Draft the whole body (templates below). Then show the user each mnemonic block before anything is
saved. A kana word has only the meaning block. A word with kanji has the meaning block and the
reading block.

### The meaning mnemonic

One draft. It holds a short story, where the word is used, and its nuance. When the meaning of the
word is not the kanji meanings put together, add a line that says so.

### The reading mnemonic

Pick the case by the reading each kanji has in this word:

1. Every kanji uses its primary taught reading. One draft in the WaniKani style, with no new story.
   For a jukugo word, WaniKani writes "This is a jukugo word, which usually means on'yomi
   readings from the kanji. If you know the readings of your kanji you'll know how to read this
   as well."
2. A kanji uses a taught reading that is not its primary one. One draft that names it as the other
   reading WaniKani teaches for that kanji. Reuse that kanji's reading mnemonic where it fits.
3. An untaught reading, or an exception (a sound change, a special reading). Two or three story
   options, each with the reading in `<reading>` tags.

### The answer of the user

Show every block as one draft or as two or three options. For each block the user can answer in
one of five ways:

1. Accept the draft as is.
2. Pick one of the options.
3. Write the whole text.
4. Give a hint, a correction or a direction. You write the block again.
5. Pick an option or the draft and add a note. You work the note in.

After every change, show the new text again. Save nothing the user has not seen.

### The rest of the body

- Mnemonic tags as in the WaniKani data: `<vocabulary>`, `<kanji>`, `<radical>`, `<reading>`.
- `meanings`: exactly one `primary: true`, every one with `accepted_answer: true`. Title case, like
  WaniKani (`To Give Me`, `Please`).
- `auxiliary_meanings`: more accepted answers as `{ "meaning": "...", "type": "whitelist" }`, or `[]`.
- `parts_of_speech`: the WaniKani values, like `noun`, `adverb`, `expression`, `interjection`,
  `な adjective`, `い adjective`, `godan verb`, `ichidan verb`, `transitive verb`,
  `intransitive verb`.
- `context_sentences`: two or three, each with `en`, `ja` and `reading`. `reading` is the whole
  `ja` sentence in kana, with the punctuation and katakana kept and no spaces. The iKnow course
  files in `data/userdata/iknow/` hold sentences for the iKnow words.
- A word with `godan verb` or `ichidan verb` needs `conjugations` with `dictionary`, `masu`, `te`
  and `nai`. Any other word may have them too, like an irregular verb.
- A `vocabulary` word also needs `readings` (exactly one `primary: true`), `reading_mnemonic` and
  `component_subject_ids`. A `kana_vocabulary` word must not have them.
- No other field. The server refuses an unknown key with a 400 that names it.

### Template: a kana word

```json
{
  "object": "kana_vocabulary",
  "data": {
    "characters": "どうぞ",
    "meanings": [{ "meaning": "Please", "primary": true, "accepted_answer": true }],
    "auxiliary_meanings": [{ "meaning": "Go Ahead", "type": "whitelist" }],
    "parts_of_speech": ["adverb"],
    "meaning_mnemonic": "...",
    "context_sentences": [
      { "en": "This way please.", "ja": "こちらへどうぞ。", "reading": "こちらへどうぞ。" }
    ]
  }
}
```

### Template: a verb with kanji

```json
{
  "object": "vocabulary",
  "data": {
    "characters": "下す",
    "meanings": [{ "meaning": "To Hand Down", "primary": true, "accepted_answer": true }],
    "auxiliary_meanings": [],
    "parts_of_speech": ["godan verb", "transitive verb"],
    "meaning_mnemonic": "...",
    "readings": [{ "reading": "くだす", "primary": true, "accepted_answer": true }],
    "reading_mnemonic": "...",
    "component_subject_ids": [451],
    "context_sentences": [
      {
        "en": "The judge handed down a decision.",
        "ja": "判事が判決を下した。",
        "reading": "はんじがはんけつをくだした。"
      }
    ],
    "conjugations": { "dictionary": "下す", "masu": "下します", "te": "下して", "nai": "下さない" }
  }
}
```

A kana verb like くれる is a `kana_vocabulary` with `conjugations`, like every kana word in the
WaniKani data.

## 5. Save the word

Write the body to a temp file, so the shell never touches the Japanese text, and POST it:

```bash
curl -s -X POST http://localhost:5173/api/custom-subjects -H 'Content-Type: application/json' \
  --data-binary @/tmp/custom-word.json
```

- `201` with `{"ok":true,"data":{...}}`: note `data.id` and `data.object`.
- `400` with `{"ok":false,"error":...}`: the error names the bad value, like
  `data.meanings[1].primary must be a boolean`. Fix the body and POST again. When the fix changes a
  mnemonic, show it to the user first.
- `409`: another word already has these characters. The error names the id. **Stop** and tell the
  user. A WaniKani id means step 2 missed the word.

To change a saved word, PUT the whole body to `/api/custom-subjects/<id>`. `object` and
`characters` cannot change: a new spelling is a DELETE and a new POST.

## 6. Add it to Anki

```bash
curl -s -X POST http://localhost:5173/api/add-to-anki -H 'Content-Type: application/json' \
  -d '{"id": <id>, "type": "<object>"}'
```

Read the body. The status is 200 on an AnkiConnect failure too.

- `"ok":true`: go on.
- `"ok":false`: **stop** and show the error. The custom word stays saved. The next run finds it in
  step 2 and resumes here.

The first add makes the reading clips with Azure TTS, because a custom word has no WaniKani audio.

## 7. Drop the iKnow problem

When the word sits in `problems` of `data/userdata/iknow-vocabulary-status.json`, drop that one
entry, and only after step 6 answered `"ok":true`. The iKnow script never comes back to an entry,
and a later run skips the word as already in Anki.

## 8. References and the data repo

Follow the `add-references` skill: the new note can name other items.

Then commit and push the data repo, the standing rule for every add. Pull first:

```bash
git -C data/userdata pull --no-rebase
git -C data/userdata add custom_subjects.json media mnemonic-images.jsonl iknow-vocabulary-status.json
git -C data/userdata commit -m "data: add the custom word <word> to Anki"
git -C data/userdata push
```

The commit holds the custom file, the new media, the registry lines and the status file. The main
repo needs its own request.

## Report

- The word, its id, its type, and the mnemonics as saved.
- The Anki result, and the items that `add-references` added.
- Every stop, with the reason: a WaniKani hit, a missing kanji, a 409, or a failed add.
