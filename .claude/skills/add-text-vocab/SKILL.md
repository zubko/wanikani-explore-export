---
name: add-text-vocab
description: Add every word of a Japanese text to the Anki vocabulary deck. The text comes as screenshots or as a text block. Use when the user says "add the words of this text", "add this text's vocabulary", "add the vocabulary from these screenshots", or gives a Japanese text and asks for its words in Anki. Also use it to continue a stopped text run.
---

# Add the vocabulary of a text

You read the text and pick the words. Two scripts do the rest: `split-text-vocab` checks Anki and
WaniKani, `add-text-vocab` adds the words to Anki. The words that WaniKani does not have go through
the `add-custom-word` skill, one at a time, before the add.

Every step writes one file in a run folder, `tmp/text-vocab/<run>/`:

| File                    | Written by | Content                                                      |
| ----------------------- | ---------- | ------------------------------------------------------------ |
| `0-text.txt`            | step 3     | the text                                                     |
| `1-surface.txt`         | step 4     | the words as the text writes them, one per line              |
| `2-dictionary.tsv`      | step 5     | `<dictionary form>\t<kana reading>`, one per line            |
| `3-not-in-anki.tsv`     | the split  | the words of file 2 that are not in the Anki vocabulary deck |
| `4-not-in-wanikani.tsv` | the split  | the words of file 3 that the WaniKani search does not find   |

A stopped run goes on from these files. The user may edit any of them by hand between two steps,
so always read a file from disk before you use it. Write the files with the Write tool, so the text
never goes through the shell. The Write tool also creates the run folder. A Japanese word in the
run name is fine.

Change only file 2 when a word must change. The split writes files 3 and 4 again on every run.

Rules from the other skills that hold here too:

- Read the answer body, not the HTTP status. Many endpoints answer 200 with `{"ok":false}`.
- Let curl encode every Japanese query with `-G --data-urlencode`. Raw Japanese in the URL gets a
  `400` with an empty body from Node's HTTP parser, and that is easy to misread as "not found".
- Keep the whole output of every script run. Do not pipe it into `tail`, `head` or `grep`.
- Never retry a `fields` stop. Pass on the fix steps the script prints.

The scripts and the curl calls use `http://localhost:5173`. When the dev server runs on another
port, pass `--base-url <url>` to both scripts and to `add-references`. Use the same URL in every
curl call, also in the steps of `add-custom-word`.

## Learn from new cases

Real texts are varied. A text can bring a case that this skill does not cover yet: a new kind of
word, a new screen layout, a script output it does not explain, or a rule that gives a wrong
result. When that happens:

1. Do not guess. Check this skill and the skills it follows first. When they do not settle it,
   stop at that point and ask the user. Give 2 or 3 concrete options with one example from the
   text, and name your pick.
2. Apply the answer to the current run.
3. Write the answer into this skill as a rule, in the step where the case comes up, with the
   example from the text. Keep the style: short sentences, one idea each. Fix a rule that was
   wrong, do not add a second rule next to it.
4. When the answer needs a code change, like in `classifyWord` or a script, ask the user before
   you change the code, even when the answer is clear. A code change needs tests, and it follows
   `scripts/CLAUDE.md`. Update `scripts/CLAUDE.md` when it describes the changed code. A rule for
   the flow of this skill goes only into this file, see "Where Rules Go" in the root `CLAUDE.md`.
5. List every change in the report of step 10. The changes stay uncommitted in the main repo. The
   user decides when to commit them.

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
  - An error that names a data file, like `custom_subjects.json`: that file is broken. **Stop** and
    show the error to the user.
- An HTML page with `<title>Error</title>`: the server code failed when it loaded, often because of
  a bad value in the root env file. Do **not** start another dev server, and never read the env
  file. Find the message in the page (`const error = {"message": ...`), show it to the user and
  **stop**. The user fixes the value. The dev server then needs a restart, because it reads the env
  file only when it starts.
- `{"ok":true, ...}`: both are up. Go on.

## 2. Pick the run

A new text gets a new folder. Its name is the date, the time and the first word of the text, like
`20261107-1432-図書館`. The name sorts by time, so the newest run is the last name. The first word
is known only once the text is read, so step 3 picks the name.

When the user says "continue", take the run name the user gives. With no name, take the last name:

```bash
ls tmp/text-vocab/ | tail -n 1
```

The run goes on from the first missing file. A file on disk does not mean the user approved it,
because the last session may have stopped at an OK question. So:

- `0-text.txt` is missing: go to step 3.
- `1-surface.txt` is missing: when the text came from screenshots, or you cannot tell, show
  `0-text.txt` and wait for the OK of step 3 again. Then step 4.
- `2-dictionary.tsv` is missing: go to step 5.
- `3-not-in-anki.tsv` is missing: build the table of step 5 again. File 2 has no surface column,
  so give the dictionary form of every line of file 1 again, and find that line in file 2. Show a
  line of file 2 that no line of file 1 gives with an empty surface form. Show the table and wait
  for the OK of step 5 again. Then step 6.
- `4-not-in-wanikani.tsv` is missing, or all five files exist: go to step 6. There is no repeated
  OK.

No file stores a refused reading hint or a skipped custom word. So they come up again in a new
session. Within one session, ask about each hint once, also when a later split run prints it again.

## 3. The text

For a new text, pick the run name first. Take the date and the time from `date +%Y%m%d-%H%M`, then
a dash and the first word of the text. List `tmp/text-vocab/`. When the name is there already, add
`-2` to it, so a new run never writes into an old folder.

Write `0-text.txt` into `tmp/text-vocab/<name>/`:

- A text block: write it as given.
- Screenshots: write the text you read from them, by the rules below. Show the text to the user and
  **wait for an OK**. A misread character gives a wrong word, and a misread found later means
  writing files 1 and 2 again.

### Reading screenshots

Screenshots often come from a reader app or a book. Read only the Japanese text of the story or
the article. Everything else on the screen is not part of it.

- **Several screenshots are one text.** Put them in page order. Take the order from a page number
  the screen shows, like `2/4`, not from the order of the files. With no page number, use the order
  the user gave. When the order is still unclear, ask.
- **Leave out the app around the text:** the status bar, the title bar, the book title, buttons,
  menus, page numbers, progress bars, and hints like "Tap here to show the translation".
- **Leave out translations and notes**, also when they sit right above or below a sentence. A
  translation is in another language. A note or a word list is a separate box, not the story.
- **Leave out pictures** and the text inside them.
- **Keep a heading that is part of the text**, like a chapter title in Japanese (一、こんにちは。猫ちゃん).
- **Furigana is not text.** Furigana is the small kana above a kanji, or next to it in vertical
  text. Leave it out of the text. It tells the reading of that kanji, so use it for the reading
  column in step 5, and do not guess another one.
- **Ignore the marks of the app:** colored or boxed particles, the highlight of the current
  sentence, bold letters. Take the characters only.
- **No spaces inside Japanese text.** A space between two Japanese characters comes from the
  layout, like `私 は` or `京 都`. Drop it, also the full-width space that indents a paragraph.
- **Join the lines of one paragraph.** A line break inside a paragraph comes from the screen width.
  A new paragraph starts with an indent or with a new 「 on a new line. Keep one line per paragraph.
- **Join the pages.** When a page ends inside a sentence, the next page goes on with the same
  sentence. Join the two parts with no line break and no space: `ここ` at the end of one page and
  `は京都大学です。` at the top of the next one give `ここは京都大学です。`. A sentence ends with
  `。`, `！`, `？` or a closing `」`.
- **Write a repeated line once.** When two screenshots overlap after a scroll, the same lines show
  at the bottom of one and the top of the next.
- **One page can hold several text blocks**, like two columns or text around a picture. Read them
  in reading order and join them. Vertical text reads from top to bottom, and the columns go from
  right to left.
- **Keep the characters as the text writes them**, also full-width digits (２３歳).

When you show the text, also list in one line what you left out, like "the title bar, the English
translations, the page numbers 1/4 to 4/4". Name every character you are not sure about. The user
then checks only those places.

## 4. The words as they appear

Write `1-surface.txt`: every content word, in text order, each one once, one per line.

- Take: nouns, verbs, い and な adjectives, adverbs, expressions, katakana loanwords, counters
  with their number (三冊), and sounds like うーん, あ or うん. A sound is a kana word, and WaniKani
  teaches some of them (うん).
- Leave out: particles, the names of people and animals, bare numbers, pure punctuation, and a
  single kana grammar bit. A name suffix like さん or ちゃん is a grammar bit too.
- Keep the names of places and countries. WaniKani teaches many of them, like 日本 and 京都.
- Write the word as the text has it, also a conjugated form. A compound verb or a する verb stays as
  the text has it (読み始める, 勉強した).

## 5. The dictionary forms

Write `2-dictionary.tsv`. One line per dictionary form: the dictionary form, one tab, the reading
in kana. Several lines of file 1 can share one line, like two forms of one verb. No word twice.

The dictionary form is the one key. The scripts check Anki and search WaniKani with this spelling
only, and the match must be exact. So write it the way WaniKani writes it:

- A verb in its plain form, an adjective in its base form. A conjugated form becomes the plain one
  (食べました → 食べる).
- The kanji spelling, when the text used kanji.
- The usual kanji spelling, when the text used kana for a word that is usually written in kanji
  (わかる → 分かる).
- The kana spelling, for a word that is usually written in kana. Both columns are then the same.
- A する verb stays a する verb when the text uses it as a verb (勉強しています → 勉強する). A noun
  stays a noun. WaniKani often teaches the noun and the する verb as two words, and often only one
  of them. The split handles that: for a する verb it also looks up the noun, and adds both when
  WaniKani has both. For a noun that WaniKani does not have, it tries the する verb (運転 → 運転する).
  It does this only for a noun of two or more characters that ends with a kanji. A one-kanji する
  verb stays a verb (愛する, 関する, 察する), because the kanji alone is not the same word.
- A counter, a prefix or a suffix has `〜` (U+301C) in the place of the number or the stem:
  三冊 → `〜冊`. Its reading holds the kana of the kanji part only: `〜冊`, a tab, `さつ`. A word
  that is written as one, like 各国, stays as it is. Never use the full-width `～` (U+FF5E), the
  split refuses it.

The reading is only a hint. The split uses it to find a word that WaniKani spells another way, and
then you ask the user. The split does not search the reading of a `〜` word, because that reading
holds only a part of the word.

Show the user a table "surface form, dictionary form, reading", one row per line of file 1, and
**wait for an OK**. A wrong dictionary form adds a wrong card.

## 6. Split the list

```bash
bun run split-text-vocab -- --run <name>
```

It deletes files 3 and 4 first. Then it syncs with AnkiWeb, reads the vocabulary deck, prints one
line per word with its group, and writes files 3 and 4 again. It writes nothing to Anki, so it is
safe to run again. The summary has four counts: already in Anki, in WaniKani, found by reading, not
in WaniKani. Pass them on. An `in WaniKani` line lists every word the line adds, like
`勉強する (べんきょうする) — in WaniKani (勉強する vocabulary id=3886, 勉強 vocabulary id=3320)`. A hit
on a saved custom word shows `custom` before its type.

- `Error: <path> line <n>: <reason>`: a bad line in file 2. Fix that line and run again.
- `Syncing with AnkiWeb... FAILED`: every lookup would be stale. Report the error and stop.
- `SEARCH FAILED` and `Search failed, no file written`: a server problem, often a broken data
  file. Report the error and stop.

A failed run leaves neither file 3 nor file 4 on disk, so a later step never reads an old list.

A line `found by its reading only` looks like this:

```text
殆ど (ほとんど) — found by its reading only: 殆ど → ほとんど (Most, kana_vocabulary id=9213, not in Anki)
```

The reading found another WaniKani word. It can be the same word in another spelling, or another
word with the same reading (要る and いる). Look up the hit's meanings and readings:

- **The same word, only kanji and kana differ:** the hit has the meaning of the word in the text,
  and it accepts the reading of the text. Use the hit with no question. WaniKani's spelling wins.
  Example: 殆ど in the text, ほとんど (Most) in WaniKani. Name the change in the report.
- **Another word, or you are not sure:** show the user the hit: characters, primary meaning, type,
  and whether it is in Anki. **Ask before you use it.** A wrong guess puts a wrong card in the
  deck. Example: 要る (to need) in the text, いる (to exist) in WaniKani.

To use a hit, change the word of that line in file 2 to the hit's characters. When those
characters already stand on another line of file 2, delete this line instead. A refused hit stays:
the word goes on as not in WaniKani.

When a line of file 2 changed, run the split again.

## 7. The words WaniKani does not have

Walk `4-not-in-wanikani.tsv` from top to bottom. The user can skip any word. A skipped word stays
in the file, and the add of step 8 prints it as `not in WaniKani`.

1. A word with `〜` can never be a custom word, because the server refuses that character. Say so
   and skip it.
2. Search one other spelling once:
   - A kana word that has a kanji spelling: that kanji spelling, also when the word is usually
     written in kana. WaniKani teaches many such words under the kanji: 有る for ある, 出来る for
     できる, 嬉しい for うれしい, 可愛い for かわいい.
   - A kanji word: its reading in katakana. WaniKani writes some words in katakana only, like
     リンゴ for 林檎.

   ```bash
   curl -s -G --data-urlencode "q=<other spelling>" -d type=vocabulary http://localhost:5173/api/search
   ```

   Treat a hit like a reading hint in step 6: the same word with the same meaning is used with no
   question, like 可愛い for かわいい, 良い for いい (WaniKani accepts いい) and 有る for ある.
   Ask about any other hit. When you use the hit, change file 2 like in step 6 and go to the next
   word.

3. Otherwise follow steps 2 to 5 of the `add-custom-word` skill with this word: search, kanji,
   draft, show, save. Its step 1 is done already. Skip its steps 6 to 8: the add, the iKnow entry
   and the data repo commit come later, once for the whole run.
   - A sound like うーん or あ is a `kana_vocabulary` word. Keep its mnemonic short: one or two
     sentences on what it means and when people say it. Write one draft, not three options, and skip
     the search for existing mnemonics.
   - A hit in its step 2 that the user already refused in step 6 or in this step does not stop. Go
     on to its step 3.
   - A hit with `"isCustom":true` and the same characters: the word is saved already. Go to the
     next word.
   - Every other stop of its steps 2 to 5, like a missing kanji or a 409, skips this word. Go on
     with the next one.

After the last word, push the new custom words. The other machine must see them, so it never
gives their ids to other words. A word saved in an earlier session counts too, so check the files,
not your memory. Every search can add lines to `mnemonic-images.jsonl`, and a pull stops on a file
with a local change. So the commit holds the same files as in step 9:

```bash
git -C data/userdata status --porcelain custom_subjects.json media mnemonic-images.jsonl iknow-vocabulary-status.json
```

When it shows a change, commit first, then pull:

```bash
git -C data/userdata add custom_subjects.json media mnemonic-images.jsonl iknow-vocabulary-status.json
git -C data/userdata commit -m "data: add the custom words of the text run <name>"
git -C data/userdata pull --no-rebase
git -C data/userdata push
```

A conflict in `custom_subjects.json` has no merge driver: resolve it by hand, like `add-custom-word`
step 8 says. Never force push.

Then, when a word was saved or a line of file 2 changed, run the split again. A saved custom word
leaves file 4 on its own, because the search finds it now. Show the user what is left in file 4.

## 8. Add the words

```bash
bun run add-text-vocab -- --run <name>
```

Use `--dry-run` first only when the user asks to preview. A real run adds media and can make TTS
clips, so it takes a few minutes. Give it a long timeout.

**Run the script once per request, and keep its whole output.** The report and step 9 need every
`added` line. It reads file 3 and prints one line per word it adds, so a する verb line can print
two:

- `— added <characters> (<type> id=<id>)`: that word is in Anki now.
- `— <characters> added above`: an earlier line of the run added the same word.
- `— already in Anki`: skipped. A rerun skips every word an earlier run added.
- `— not in WaniKani`: a skipped custom word, or a reading hint the user did not accept. With
  `(its reading finds <characters>)` for a reading hint.
- `— SEARCH FAILED <error>` and `— ERROR <error>`: counted as errors, the loop went on. Report
  them. Do not retry blindly.
- `— STOPPED <error>`: the Anki note type fields do not match the code. The run stopped at this
  word. Pass on the two fix commands the script prints. `sync-anki-fields` needs a real terminal,
  so the user must run it.

The summary counts the words added, and the lines already in Anki, not in WaniKani and with an
error. It says whether the end
sync worked. The script exits 1 after a stop, an error or a failed end sync.

## 9. References, iKnow entries and the data repo

Do this after every real add run, also after one that added nothing. A continued run may have added
its words in an earlier session. Skip it after a dry run.

1. Follow the `add-references` skill with `--days` set to the days since the date in the run name,
   plus one. A run of today gets `--days 1`, a run of yesterday `--days 2`. A continued run can
   cross midnight, so the plus one matters. Add one more when the time in the run name is before
   4 a.m., because the Anki day starts at 4 a.m.
2. Drop the `problems` entry in `data/userdata/iknow-vocabulary-status.json` of every word of the
   run that is in Anki now. That is a word with an `added` line in step 8, or with an
   `already in Anki` line in step 8 or in the last split run. A continued run may have added a word
   in an earlier session, and the split then prints it as `already in Anki`. Match the entry on
   `word`. For a line of file 2 that a reading hint or step 7 changed, also match the old spelling.
   Drop no entry of a word that is not in Anki.
3. Commit and push the data repo, the standing rule for every add. Check the same files that the
   commit holds:

   ```bash
   git -C data/userdata status --porcelain custom_subjects.json media mnemonic-images.jsonl iknow-vocabulary-status.json
   ```

   When it shows a change:

   ```bash
   git -C data/userdata add custom_subjects.json media mnemonic-images.jsonl iknow-vocabulary-status.json
   git -C data/userdata commit -m "data: add the words of the text run <name> to Anki"
   git -C data/userdata pull --no-rebase
   git -C data/userdata push
   ```

   A conflict outside `media/` and `*.jsonl` is resolved by hand. Never force push. The main repo
   needs its own request.

## 10. Report

- The run folder.
- The counts of every step: the words of file 1 and file 2, the four split counts, the add summary.
- The words added.
- The custom words created, each with its id.
- The iKnow `problems` entries dropped.
- The reading hints accepted and the ones refused.
- The words skipped and why: a `〜` word, a stop in `add-custom-word`, or the user.
- The items that `add-references` added.
- Every stop, with its reason.
- Every change to this skill or to the code that this run made, see "Learn from new cases".
