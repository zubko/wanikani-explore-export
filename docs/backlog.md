# Backlog

Ideas and to-dos for later. Pick from here when choosing what to work on next.

- Cache sentence audio in `data/userdata/`. Note generation calls Azure TTS for every word on every sync. Store each clip in the user data folder and reuse it when the file is already there, so a full re-sync does not regenerate audio for every word.
