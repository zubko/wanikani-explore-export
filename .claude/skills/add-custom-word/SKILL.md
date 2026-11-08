---
name: add-custom-word
description: Add a word that WaniKani does not have as a custom word, then add it to the Anki vocabulary deck. Use when the user says "add a custom word", "add my own word", "add <word> as a custom word", or "WaniKani does not have <word>". Also use it for an iKnow word in `problems` that WaniKani does not teach, like そう, どうぞ, くれる or もっと.
---

# Add a custom word

Inside the `add-text-vocab` skill, do steps 2 to 5 only. A hit in step 2 that the user already
refused in `add-text-vocab` does not stop. Go on to step 3. A custom hit with the same characters
means the word is saved already. Go on with the next word. Any other stop skips the word, and the
loop goes on with the next one. The add to Anki, the iKnow entry and the data repo commit happen
once for the whole run.

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
- `{"ok":false, "error": ...}`: the dev server is up, but something failed. Do **not** start
  another dev server. Read the error text:
  - An AnkiConnect error, like a refused connection to `127.0.0.1:8765`: Anki is not reachable.
    Ask the user to open Anki, then check again.
  - An error that names a data file, like `custom_subjects.json`, `study_materials_extra.json` or
    `mnemonic-images.jsonl`: that file is broken. **Stop** and show the error to the user.
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

The `id` of every kanji goes into `component_subject_ids`, in the order of the word. 々 is a
WaniKani kanji too (id 856), so search it and list it like the others. The server checks that the
ids name exactly the kanji of `characters`, in this order.

**Stop** when a kanji is not found. The word cannot be a custom word yet, because a custom word
can only use WaniKani kanji. Tell the user which kanji is missing.

## 4. Draft the word and show the mnemonics

Draft the whole body (templates below). Then show the user each mnemonic block before anything is
saved. A kana word has only the meaning block. A word with kanji has the meaning block and the
reading block.

### Look at existing mnemonics first

Before you write, read what already exists. Use these sources for ideas. Do not copy a text
unless the user picks it.

- **WaniKani data.** The kanji search of step 3 gives the meaning and reading mnemonics of every
  kanji of the word. A story can build on them, like WaniKani's own words do.
- **WaniKani Community Mnemonics 2 (WKCM2).** Mnemonics that WaniKani users wrote and voted on.
  The read needs no key. Ask for the word (`type=v`) and for each of its kanji (`type=k`):

  ```bash
  curl -sL -m 60 -G --data-urlencode "exec=get" --data-urlencode "type=v" \
    --data-urlencode "item=<word>" \
    "https://script.google.com/macros/s/AKfycby_Kqff92G40TGXr0PSulvQ2gqx6bkHVEl6LplZ-zc5ZIHhJGwe7AA8I4nDErKMiu2GEw/exec"
  ```

  The answer is `null` when nobody wrote one. That is the usual case for a custom word, because
  WKCM2 only knows WaniKani items. Otherwise `Meaning_Mnem` and `Reading_Mnem` are JSON strings
  in the shape `{"<user>": ["<text>", ...]}`, and `Meaning_Score` / `Reading_Score` hold the
  votes. A `"!"` key is a request for a mnemonic, not a mnemonic. The texts use `[kan]`, `[voc]`,
  `[rad]` and `[read]` tags. Turn them into the WaniKani tags when you save one.

Pick at most two existing mnemonics per block, the ones with the best score that fit this word.
The sources state no license, so a picked text keeps a short credit at its end, like
`(WKCM2, by <user>)`.

### Reuse the sound hooks

WaniKani ties every sound to one hook word, and uses that word in every story with that sound:
どう is always a doughnut, じん is always jeans. The learner knows the hook already, so a new story
must use the same hook word. A new hook for a known sound breaks the link.

Before you write a story with a sound hook, look up the sound in the WaniKani data and in the
custom words:

```bash
bun -e '
const sound = process.argv.at(-1);
for (const file of ["kanji", "vocabulary", "kana_vocabulary", "custom_subjects"]) {
  for (const subject of JSON.parse(require("fs").readFileSync(`data/userdata/${file}.json`, "utf8"))) {
    if (subject.data.hidden_at) continue;
    for (const text of [subject.data.reading_mnemonic, subject.data.meaning_mnemonic]) {
      for (const sentence of (text ?? "").split(/(?<=[.!?])\s+/)) {
        if (sentence.includes(`(${sound})`)) console.log(`${subject.data.characters}: ${sentence.trim()}`);
      }
    }
  }
}' どう
```

It prints every mnemonic sentence that marks the sound, like `<reading>dou</reading>ghnut (どう)`.

- Look up every sound that a story uses: the whole kana word (どう), and each part of a reading
  (に, ほん and じん of にほんじん).
- Use the hook word that the sentences use. When a sound has two hooks, take the one most stories
  use, and name both to the user.
- When nothing is found, pick a new hook word, and say in the draft that it is new.

### The meaning mnemonic

Write three options of your own. Each one holds a short story, where the word is used, and its
nuance. Make them differ: another sound hook, another scene. When the meaning of the word is not
the kanji meanings put together, every option says so in one line.

### The reading mnemonic

Pick the case by the reading each kanji has in this word:

1. Every kanji uses its primary taught reading. One draft in the WaniKani style, with no new story
   and no options. For a jukugo word, WaniKani writes "This is a jukugo word, which usually means
   on'yomi readings from the kanji. If you know the readings of your kanji you'll know how to
   read this as well."
2. A kanji uses a taught reading that is not its primary one. Three options that name it as the
   other reading WaniKani teaches for that kanji. Reuse that kanji's reading mnemonic where it
   fits.
3. An untaught reading, or an exception (a sound change, a special reading). Three story options,
   each with the reading in `<reading>` tags.

### Show it to the user

Show everything in one message, in this order:

1. Every mnemonic block as one numbered list: the existing mnemonics first, each with its source,
   author and score, then your three options.
2. The rest of the body: type, parts of speech, meanings, readings, conjugations and sentences.
3. The answers the user can give.

For each block the user can answer in one of these ways:

1. Pick one option as is.
2. Write the whole text.
3. Give a hint, a correction or a direction. You write three new options.
4. Pick an option and add a note. You work the note in.

The user can also change any part of the rest of the body.

After every change, show the new text again. Save nothing the user has not seen.

### The rest of the body

- Mnemonic tags as in the WaniKani data: `<vocabulary>`, `<kanji>`, `<radical>`, `<reading>`.
- `meanings`: exactly one `primary: true`, every one with `accepted_answer: true`. Title case, like
  WaniKani (`To Give Me`, `Please`). Every other meaning the card should show goes here too, with
  `primary: false`. The card and the Anki note show these as the alternative meanings.
- `auxiliary_meanings`: usually `[]`. Nothing shows them, not the card and not Anki. The synonym
  editor treats them as known meanings, so the user cannot add them as synonyms either. Use them
  only for an answer that should count but never show, as
  `{ "meaning": "...", "type": "whitelist" }`.
- `parts_of_speech`: the WaniKani values, like `noun`, `adverb`, `expression`, `interjection`,
  `な adjective`, `い adjective`, `godan verb`, `ichidan verb`, `transitive verb`,
  `intransitive verb`.
- `context_sentences`: two or three, each with `en`, `ja` and `reading`. `reading` is the whole
  `ja` sentence in kana, with the punctuation and katakana kept and no spaces. The iKnow course
  files in `data/userdata/iknow/` hold sentences for the iKnow words.
- A word with `godan verb` or `ichidan verb` needs `conjugations` with `dictionary`, `masu`, `te`
  and `nai`. Any other word may have them too, like an irregular verb.
- A `vocabulary` word also needs `readings` (exactly one `primary: true`, with
  `accepted_answer: true`), `reading_mnemonic` and `component_subject_ids`. A `kana_vocabulary` word must not have them.
- A reading holds only hiragana, katakana and ー. Azure TTS makes one reading clip for every reading
  with `accepted_answer: true`, so a reading the word does not use gets `accepted_answer: false`.
- `component_subject_ids` lists the kanji of `characters` in order, 々 included, and each kanji
  once. A kanji that comes twice in the word is listed at its first place only: 日曜日 is 日, 曜.
  A wrong, missing, extra or repeated id, or a wrong order, is refused with a 400.
- No other field. The server refuses an unknown key with a 400 that names it.

### Template: a kana word

```json
{
  "object": "kana_vocabulary",
  "data": {
    "characters": "どうぞ",
    "meanings": [
      { "meaning": "Please", "primary": true, "accepted_answer": true },
      { "meaning": "Go Ahead", "primary": false, "accepted_answer": true },
      { "meaning": "Here You Are", "primary": false, "accepted_answer": true },
      { "meaning": "Help Yourself", "primary": false, "accepted_answer": true }
    ],
    "auxiliary_meanings": [],
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
    "meanings": [
      { "meaning": "To Hand Down", "primary": true, "accepted_answer": true },
      { "meaning": "To Lower", "primary": false, "accepted_answer": true }
    ],
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

To change a saved word, PUT the whole body to `/api/custom-subjects/<id>`, with the same
`Content-Type` header and temp file. `object` and `characters` cannot change: a new spelling is a
DELETE and a new POST. After an update, POST the add to Anki again (step 6), so the note shows the
new content.

A DELETE hides the word, but its Anki note stays. Tell the user to delete that note in Anki by hand.
Otherwise every `sync-anki-notes` run lists it as a note that matches no subject.

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

Then commit and push the data repo, the standing rule for every add. Commit first, then pull. The
other server commits to this repo too, and a pull stops when it changes a file that has a local
change:

```bash
git -C data/userdata add custom_subjects.json media mnemonic-images.jsonl iknow-vocabulary-status.json
git -C data/userdata commit -m "data: add the custom word <word> to Anki"
git -C data/userdata pull --no-rebase
git -C data/userdata push
```

The commit holds the custom file, the new media, the registry lines and the status file. A conflict
in `custom_subjects.json` has no merge driver: resolve it by hand, like one in
`study_materials_extra.json`. When both sides gave the same id to two words, give one record a new
id. Then commit the merge and push. Never force push. The main repo needs its own request.

## Report

- The word, its id, its type, and the mnemonics as saved.
- The Anki result, and the items that `add-references` added.
- Every stop, with the reason: a WaniKani hit, a missing kanji, a 409, or a failed add.
