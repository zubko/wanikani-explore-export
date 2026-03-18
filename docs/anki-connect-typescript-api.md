# AnkiConnect HTTP API (v5) — TypeScript Integration Guide (Notes2Anki)

This document is a **practical API guide** for integrating with **AnkiConnect** from **TypeScript** (Node.js or browser/extension). It is written to be “LLM-friendly”: it explains **what to call**, **when to call it**, **what JSON to send**, and **what to expect back**.

> **API model:** One local HTTP endpoint (`POST http://127.0.0.1:8765`) that accepts JSON requests with `{action, version, params}` and returns `{result, error}`.

---

## Prerequisites & runtime assumptions

### Install & run

- Install the AnkiConnect add-on in Anki using add-on code **2055492159**, then restart Anki.
- **Anki must remain running** for clients to connect. You can verify the server is up by visiting `localhost:8765` in a browser.
- AnkiConnect starts a minimal HTTP server on **port 8765**.

### Network binding (security)

- By default, AnkiConnect binds only to `127.0.0.1` (localhost).
- If you intentionally need LAN access, set `ANKICONNECT_BIND_ADDRESS` (e.g. `0.0.0.0`). ⚠️ This exposes powerful operations on your collection to other machines—treat it as sensitive.

---

## Transport

### Single endpoint

**HTTP**

- Method: `POST`
- URL: `http://127.0.0.1:8765`
- Body: JSON

AnkiConnect “routes” by **action name** (not by URL path).

### Request schema

```ts
type AnkiConnectRequest = {
  action: string;
  version: number; // use 5
  params?: Record<string, unknown>;
};
```

Every request contains:

- `action`: the operation name (e.g. `deckNames`, `addNotes`)
- `version`: API version (use `5`)
- `params`: action-specific parameters

### Response schema

```ts
type AnkiConnectResponse<T> = {
  result: T;
  error: string | null;
};
```

- `result` is the return value for the action.
- `error` is `null` on success, or a message string on failure.

### Always send `version: 5`

If you omit `version`, it defaults to 4; for version ≤ 4, responses may not include an `error` field. Always send version 5 so you can reliably handle errors and remain forward compatible.

---

## TypeScript client (recommended)

### Minimal `invoke` wrapper (Node 18+/modern browsers)

```ts
export type AnkiConnectError = {
  message: string;
  action: string;
  params?: unknown;
  raw?: unknown;
};

export async function ankiInvoke<T>(
  action: string,
  params: Record<string, unknown> = {},
  {
    url = "http://127.0.0.1:8765",
    version = 5,
    signal,
  }: { url?: string; version?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const body = JSON.stringify({ action, version, params });

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });
  } catch (e) {
    throw <AnkiConnectError>{
      message: "failed to connect to AnkiConnect (is Anki running?)",
      action,
      params,
      raw: e,
    };
  }

  const rawText = await resp.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw <AnkiConnectError>{
      message: "AnkiConnect returned non-JSON response",
      action,
      params,
      raw: rawText,
    };
  }

  if (data?.error) {
    throw <AnkiConnectError>{
      message: String(data.error),
      action,
      params,
      raw: data,
    };
  }

  if (!("result" in data)) {
    throw <AnkiConnectError>{
      message: "AnkiConnect response missing result",
      action,
      params,
      raw: data,
    };
  }

  return data.result as T;
}
```

### Handshake / health check

First call should usually be:

```ts
const apiVersion = await ankiInvoke<number>("version");
```

The API defines versions 1–5, and the README recommends calling `version` first to verify communication.

---

## LLM integration rules of thumb

When generating scripts or deciding what actions to call:

1. **Prefer non-GUI actions** for automation:
   - Use `findNotes` / `findCards` for searching instead of `guiBrowse` when possible.
2. **Batch operations**:
   - Use `addNotes` instead of many `addNote` calls.
   - Use `multi` to bundle several actions into one HTTP round-trip.
3. **Idempotency strategy (recommended)**:
   - Store an external stable identifier in a tag (e.g. `n2a:SOURCE_ID`) or in a dedicated field.
   - On re-import, locate existing notes via `findNotes` query (e.g. `tag:n2a:SOURCE_ID`) and use `updateNoteFields` to update instead of creating duplicates.
4. **Duplicate avoidance**:
   - Use `canAddNotes` to preflight whether each candidate note can be created.
5. **Media handling**:
   - For local binaries, upload via `storeMediaFile` (base64) then reference the filename in fields.
   - For remote audio, optionally let AnkiConnect download via the `audio` member in `addNote`/`addNotes`.

---

## Actions reference

All actions below are invoked via the single HTTP endpoint with `POST` and `{action, version: 5, params}`.

### Miscellaneous

#### `version`

**Purpose:** Get the API version exposed by the plugin (recommended first call).
**Params:** none
**Result:** `number` (e.g. `5`)

Request:

```json
{ "action": "version", "version": 5 }
```

#### `upgrade`

**Purpose:** Prompt user to upgrade AnkiConnect from the project's master branch; returns whether it upgraded.
**Params:** none
**Result:** `boolean`

#### `multi`

**Purpose:** Execute multiple actions in one HTTP request.
**Params:**

```ts
{
  actions: Array<{ action: string; params?: Record<string, unknown> }>;
}
```

**Result:** `any[]` results in the same order as `actions`.

Example:

```json
{
  "action": "multi",
  "version": 5,
  "params": {
    "actions": [
      { "action": "deckNames" },
      { "action": "findCards", "params": { "query": "deck:current" } }
    ]
  }
}
```

---

### Decks

#### `deckNames`

**Purpose:** List deck names.
**Params:** none
**Result:** `string[]`

#### `deckNamesAndIds`

**Purpose:** Map deck names to deck IDs.
**Params:** none
**Result:** `Record<string, number>`

#### `getDecks`

**Purpose:** Given card IDs, group them by deck name.
**Params:** `{ cards: number[] }`
**Result:** `Record<string, number[]>`

#### `changeDeck`

**Purpose:** Move cards to another deck; creates deck if it doesn't exist.
**Params:** `{ cards: number[]; deck: string }`
**Result:** `null`

#### `deleteDecks`

**Purpose:** Delete decks; optionally delete contained cards.
**Params:** `{ decks: string[]; cardsToo?: boolean }`
**Result:** `null`

#### `getDeckConfig`

**Purpose:** Get the configuration group object for a deck.
**Params:** `{ deck: string }`
**Result:** `object` (deck config group)

#### `saveDeckConfig`

**Purpose:** Save a configuration group object; returns success.
**Params:** `{ config: object }`
**Result:** `boolean`

#### `setDeckConfigId`

**Purpose:** Assign an existing config group ID to decks; returns `true` on success.
**Params:** `{ decks: string[]; configId: number }`
**Result:** `boolean`

#### `cloneDeckConfigId`

**Purpose:** Clone a config group; returns new config ID (or `false`).
**Params:** `{ name: string; cloneFrom?: number }`
**Result:** `number | false`

#### `removeDeckConfigId`

**Purpose:** Remove a config group by ID; returns `true` if successful.
**Params:** `{ configId: number }`
**Result:** `boolean`

---

### Models (Note Types)

#### `modelNames`

**Purpose:** List note type names.
**Params:** none
**Result:** `string[]`

#### `modelNamesAndIds`

**Purpose:** Map note type names to IDs.
**Params:** none
**Result:** `Record<string, number>`

#### `modelFieldNames`

**Purpose:** List field names for a note type.
**Params:** `{ modelName: string }`
**Result:** `string[]`

#### `modelFieldsOnTemplates`

**Purpose:** For a note type, list which fields appear on the question/answer side per card template.
**Params:** `{ modelName: string }`
**Result:** `Record<string, [string[], string[]]>`

---

### Notes

#### `addNote`

**Purpose:** Create one note in a deck using a note type, fields, and tags; returns new note ID or `null`.
**Params:**

```ts
{
  note: {
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags?: string[];
    audio?: {
      url: string;
      filename: string;
      skipHash?: string;
      fields: string; // which field(s) to inject audio into (per README examples)
    };
  };
}
```

**Result:** `number | null`

Notes:

- The `audio` member is optional; when provided, `url` and `filename` must be defined; `skipHash` can avoid saving stub/error downloads.

#### `addNotes`

**Purpose:** Create multiple notes in one call; returns an array of note IDs (or `null` for failures).
**Params:** `{ notes: Array<addNote.note> }`
**Result:** `(number | null)[]`

#### `canAddNotes`

**Purpose:** Preflight whether candidate notes could be added; returns booleans per note.
**Params:** `{ notes: Array<addNote.note> }`
**Result:** `boolean[]`

#### `updateNoteFields`

**Purpose:** Modify fields of an existing note.
**Params:**

```ts
{
  note: {
    id: number;
    fields: Record<string, string>;
  }
}
```

**Result:** `null`

#### `addTags`

**Purpose:** Add tags to notes (by note ID).
**Params:** `{ notes: number[]; tags: string }`
**Result:** `null`

#### `removeTags`

**Purpose:** Remove tags from notes (by note ID).
**Params:** `{ notes: number[]; tags: string }`
**Result:** `null`

#### `getTags`

**Purpose:** List all tags in the collection.
**Params:** none
**Result:** `string[]`

#### `findNotes`

**Purpose:** Search notes using Anki browser query syntax; returns note IDs.
**Params:** `{ query: string }`
**Result:** `number[]`

#### `notesInfo`

**Purpose:** Fetch note details (fields/tags/model) by note IDs.
**Params:** `{ notes: number[] }`
**Result:** `Array<{ noteId: number; modelName: string; tags: string[]; fields: Record<string, { value: string; order: number }> }>`

---

### Cards

#### `suspend`

**Purpose:** Suspend cards by card ID; returns `true` if at least one changed.
**Params:** `{ cards: number[] }`
**Result:** `boolean`

#### `unsuspend`

**Purpose:** Unsuspend cards by card ID; returns `true` if at least one changed.
**Params:** `{ cards: number[] }`
**Result:** `boolean`

#### `areSuspended`

**Purpose:** For each card ID, return whether it is suspended.
**Params:** `{ cards: number[] }`
**Result:** `boolean[]`

#### `areDue`

**Purpose:** For each card ID, return whether it is due.
**Params:** `{ cards: number[] }`
**Result:** `boolean[]`

#### `getIntervals`

**Purpose:** Get recent (or complete) interval history per card. Negative intervals are seconds; positive are days.
**Params:** `{ cards: number[]; complete?: boolean }`
**Result:** `number[] | number[][]` (shape depends on `complete`)

#### `findCards`

**Purpose:** Search cards (same query syntax as `guiBrowse`) but without GUI for performance; returns card IDs.
**Params:** `{ query: string }`
**Result:** `number[]`

#### `cardsToNotes`

**Purpose:** Given card IDs, return the unique note IDs they belong to.
**Params:** `{ cards: number[] }`
**Result:** `number[]`

#### `cardsInfo`

**Purpose:** Get details for card IDs (front/back, CSS, deck/model names, intervals, etc.).
**Params:** `{ cards: number[] }`
**Result:** `Array<object>` (see README sample for keys)

---

### Media

#### `storeMediaFile`

**Purpose:** Store a file into the Anki media folder using base64 contents. Prefix filename with `_` to prevent Anki from removing “unused” files; these still sync.
**Params:** `{ filename: string; data: string /* base64 */ }`
**Result:** `null`

#### `retrieveMediaFile`

**Purpose:** Retrieve a media file as base64, or `false` if it doesn’t exist.
**Params:** `{ filename: string }`
**Result:** `string | false`

#### `deleteMediaFile`

**Purpose:** Delete a media file.
**Params:** `{ filename: string }`
**Result:** `null`

**Practical note:** After calling `storeMediaFile`, reference the stored filename in your HTML field content:

- images: `<img src="my_image.png">`
- audio: `[sound:my_audio.mp3]`

---

### Graphical (GUI automation)

These actions drive Anki’s UI. Prefer non-GUI actions for automation unless you explicitly want UI effects.

#### `guiBrowse`

**Purpose:** Open Card Browser and search; returns card IDs.
**Params:** `{ query: string }`
**Result:** `number[]`

#### `guiAddCards`

**Purpose:** Open the Add Cards dialog.
**Params:** none
**Result:** `null`

#### `guiCurrentCard`

**Purpose:** Get info about the current review card, or `null` if not reviewing.
**Params:** none
**Result:** `object | null`

#### `guiStartCardTimer`

**Purpose:** Start/reset the review timer for the current card.
**Params:** none
**Result:** `boolean`

#### `guiShowQuestion` / `guiShowAnswer`

**Purpose:** Show question/answer; returns `true` if in review mode.
**Params:** none
**Result:** `boolean`

#### `guiAnswerCard`

**Purpose:** Answer current card with given ease; returns success.
**Params:** `{ ease: 1 | 2 | 3 | 4 }`
**Result:** `boolean`

#### `guiDeckOverview`

**Purpose:** Open Deck Overview for a deck; returns success.
**Params:** `{ name: string }`
**Result:** `boolean`

#### `guiDeckBrowser`

**Purpose:** Open the Deck Browser dialog.
**Params:** none
**Result:** `null`

#### `guiDeckReview`

**Purpose:** Start review for a deck; returns success.
**Params:** `{ name: string }`
**Result:** `boolean`

#### `guiExitAnki`

**Purpose:** Ask Anki to close gracefully (async).
**Params:** none
**Result:** `null`

---

## Common workflows (recipes)

### 1) Add many notes safely (avoid duplicates)

1. `canAddNotes` on candidates → boolean array.
2. Filter to those `true`.
3. `addNotes` with remaining items → note IDs (or null).

### 2) Update existing notes by tag-based external ID

1. `findNotes` with `query: "tag:n2a:SOURCE_ID"` → note IDs.
2. If found, `updateNoteFields` with `{id, fields}`.
3. Optionally `addTags`/`removeTags` for lifecycle markers.

### 3) Upload an image/audio file from disk

1. Convert to base64 in Node:
   ```ts
   import { readFile } from "node:fs/promises";
   const data = (await readFile("image.png")).toString("base64");
   await ankiInvoke<null>("storeMediaFile", { filename: "image.png", data });
   ```
2. Reference it in note field HTML: `<img src="image.png">`.
3. Create/update note via `addNote`/`updateNoteFields`.

`storeMediaFile` stores base64 content in the media folder.

### 4) Efficient “sync” using `multi`

Bundle “query + info + update” into one network round-trip using `multi`.

---

## Troubleshooting

- If the HTTP request fails to connect, Anki is likely not running or AnkiConnect isn’t installed/loaded. (AnkiConnect must be running and listens on port 8765.)
- If you get `{"result": null, "error": "unsupported action"}`, you called a non-existent action (or mismatched API version).
- If you omitted `version`, error handling differs (defaults to v4). Always send `version: 5`.
