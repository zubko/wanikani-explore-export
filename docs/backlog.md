# Backlog

Ideas and to-dos for later. Pick from here when choosing what to work on next.

- `--show-prompt` in the two LLM scripts prints nothing when every item is already done, because it needs at least one item to build a batch. Let it build the prompt from the first item of the data set in that case.
- Show in the web interface which items are already in Anki. When the search finds a word, the server should ask Anki whether that word and its whole package (the kanji and the radicals) already have notes, and put that state into the data it sends to the front end. First step: the front end only shows it, so the user can see what is new. Later step: use the same state on add, and skip the notes that are already there instead of writing them again.
- search of vocabulary should return multiple results and do a substring search, the web app should adapt accordingly to show the search results UI if there is more than 1 find and allow to click the result to proceed to the details of that item
- search of kanji and vocabulary should also work by hiragana, matching against the spelling
