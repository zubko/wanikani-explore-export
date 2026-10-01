---
name: anki-card-screenshots
description: Take screenshots of Anki cards from the Anki desktop Preview window, like the card images in docs/images/ and the README. Use when the user says "take screenshots of the cards", "update the card screenshots", "screenshot the Anki card", or asks for new README card images. Drives the Anki app on this Mac, so it always asks the user first.
---

# Anki card screenshots

The card images in `docs/images/` (`vocab-card-*.png`, `kanji-card-*.png`, `radical-card-*.png`)
are captures of the Anki desktop **Preview** window (Browser → Preview), in dark mode, with the
window shadow. Each is 1080×1582 px: a 428×679 pt window on a 2x screen. Each README row shows one
subject as front, back and details.

This skill takes over the user's screen. It brings Anki to the front, moves the mouse cursor,
clicks in Anki, and Anki plays the card audio. So **always confirm with the user** at the two
points below, even when the request already names the words. Never skip a confirmation because
an earlier run was approved.

## 1. Confirm the plan

Ask with `AskUserQuestion` before anything touches Anki:

- which subject for each row (vocabulary, kanji, radical), and which shots (front, back, details)
- that Anki will come to the front, the cursor will move, audio will play, and they should not
  use the mouse or keyboard until you say you are done

Suggest a subject that shows the feature being documented. A word with no alternative meanings,
for example, shows no alternative meanings line.

## 2. Check what is needed

```bash
curl -s -m 3 http://127.0.0.1:8765 -d '{"action":"version","version":6}'
system_profiler SPDisplaysDataType | grep -E "Resolution|UI Looks like|Main Display"
```

- AnkiConnect must answer. If not, ask the user to open Anki.
- The main screen must be 2x ("UI Looks like" is half the "Resolution"). On a 1x screen the image
  is half the size. Tell the user and ask before going on.
- The terminal app needs **Accessibility** (key presses, clicks) and **Screen Recording**
  (`screencapture`, window titles) in System Settings → Privacy & Security. Never change these
  yourself. Find the app with `ps -o comm= -p <pid>` up the parent chain of this shell. If a step
  below fails with "not allowed to send keystrokes" or "could not create image from window", ask
  the user to turn the switch on. macOS applies Screen Recording only after the app restarts, and
  that ends the session, so give them the `claude --resume <session-id>` command first.

## 3. Find the cards

```bash
curl -s http://127.0.0.1:8765 -d '{"action":"findCards","version":6,"params":{"query":"\"note:Japanese Vocabulary\" \"characters:時\""}}'
```

Kanji: `"note:Japanese Kanji" "character:時"`. Radicals: `"note:Japanese Radicals" "character:<char>"`.

## 4. Open the Preview window

Open the Browser on the card, then press Cmd+Shift+P in it. The Anki windows can sit on another
desktop (Space), and System Events only sees the current one, so activate Anki first.

```bash
curl -s http://127.0.0.1:8765 -d '{"action":"guiBrowse","version":6,"params":{"query":"cid:<cardId>"}}'
osascript -e 'tell application "Anki" to activate' -e 'delay 1' \
  -e 'tell application "System Events" to tell process "Anki"
    perform action "AXRaise" of (first window whose name starts with "Browse")
    delay 0.5
    keystroke "p" using {command down, shift down}
    delay 1.5
    set position of window "Preview" to {600, 300}
    set size of window "Preview" to {428, 679}
  end tell'
```

To switch to another card later, run `guiBrowse` with the next card id. The open Preview window
follows the Browser and starts on the question side again.

## 5. Capture

Before each capture, activate Anki and raise the Preview window, as in step 4. Scripts are in
`.claude/skills/anki-card-screenshots/scripts/`.

```bash
id=$(osascript -l JavaScript .claude/skills/anki-card-screenshots/scripts/window-id.js Preview)
screencapture -l "$id" -x /tmp/anki-shots/<name>.png
```

- **Front:** capture as it opens.
- **Back:** press the `>` button, wait 2 s, capture. A System Events click works for this Qt button:
  `click button ">" of group 2 of window "Preview"`.
- **Details:** the template opens it on `mousedown`, and a System Events click never fires that.
  Read the button position, then send a real click at its center with `click.js`:

```bash
osascript -e 'tell application "System Events" to tell process "Anki" to get {position, size} of button "Details" of group 1 of group 1 of group "previewer" of window "Preview"'
osascript -l JavaScript .claude/skills/anki-card-screenshots/scripts/click.js <x + w/2> <y + h/2>
```

Look at every image with Read. Check the size with `sips -g pixelWidth -g pixelHeight`: it must be
1080×1582. Retake a shot that shows the wrong side or the wrong card.

## 6. Confirm before replacing

Tell the user you are done with the screen. Show which files would be replaced in `docs/images/`,
and ask with `AskUserQuestion` before you copy anything there. Copy only what they approve. The
old images stay in git.

Commit only when the user asks. If the new images show another subject, check the README text
for the old one.
