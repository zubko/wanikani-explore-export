# Wanikani API Documentation

Base URL: `https://api.wanikani.com/v2/`

API Revision: `20170710`

## Authentication

All requests require bearer token authentication via HTTPS.

### Getting Your Token

Get your API token from: https://www.wanikani.com/settings/personal_access_tokens

### Required Headers

```
Authorization: Bearer <api_token>
Wanikani-Revision: 20170710
```

### Example Request

```bash
curl "https://api.wanikani.com/v2/<endpoint>" \
  -H "Authorization: Bearer <api_token>" \
  -H "Wanikani-Revision: 20170710"
```

```javascript
const requestHeaders = new Headers({
  Authorization: "Bearer " + apiToken,
  "Wanikani-Revision": "20170710",
});

fetch("https://api.wanikani.com/v2/" + endpoint, {
  method: "GET",
  headers: requestHeaders,
}).then((response) => response.json());
```

---

## Response Structure

### Resource (Single Item)

```json
{
  "id": 123,
  "object": "kanji",
  "url": "https://api.wanikani.com/v2/subjects/123",
  "data_updated_at": "2023-01-15T12:00:00.000000Z",
  "data": { ... }
}
```

### Collection (Multiple Items)

```json
{
  "object": "collection",
  "url": "https://api.wanikani.com/v2/subjects",
  "pages": {
    "next_url": "https://api.wanikani.com/v2/subjects?page_after_id=500",
    "previous_url": null,
    "per_page": 500
  },
  "total_count": 9000,
  "data_updated_at": "2023-01-15T12:00:00.000000Z",
  "data": [ ... ]
}
```

### Object Types

- **Singular**: assignment, kanji, radical, vocabulary, kana_vocabulary, review, review_statistic, spaced_repetition_system, study_material, user, level_progression, reset, voice_actor
- **Collection**: collection, report

### Data Types

- Strings, integers, booleans, arrays, objects
- Dates: ISO 8601 format, rounded to microsecond

---

## Pagination

Cursor-based pagination using resource IDs.

### Limits Per Page

- Default endpoints: 500 items
- Reviews and Subjects: 1,000 items

### Pages Object

| Attribute      | Type        | Description                                |
| -------------- | ----------- | ------------------------------------------ |
| `next_url`     | String/null | URL for next page, null if no more results |
| `previous_url` | String/null | URL for previous page, null if at start    |
| `per_page`     | Integer     | Max items per page for this endpoint       |

### Navigation Parameters

| Parameter        | Description                         |
| ---------------- | ----------------------------------- |
| `page_after_id`  | Returns results after specified ID  |
| `page_before_id` | Returns results before specified ID |

### Example

Given resources with IDs 1, 2, 3, 4:

- `?page_after_id=2` → returns 3, 4
- `?page_before_id=3` → returns 1, 2

---

## Filters

Optional query parameters to narrow results. Format: `?param=value&other=value`

### Array Parameters

Comma-delimited lists:

- Single: `?subject_ids=8`
- Multiple: `?subject_ids=8,16,64`

### Common Filters (Most Endpoints)

| Parameter       | Type  | Description                      |
| --------------- | ----- | -------------------------------- |
| `ids`           | Array | Match specific resource IDs      |
| `updated_after` | Date  | Records modified after timestamp |

### Assignment Filters

| Parameter                           | Type    | Description                                 |
| ----------------------------------- | ------- | ------------------------------------------- |
| `available_after`                   | Date    | Available after timestamp                   |
| `available_before`                  | Date    | Available before timestamp                  |
| `burned`                            | Boolean | Filter by burn status                       |
| `hidden`                            | Boolean | Filter by hidden state                      |
| `levels`                            | Array   | Subject levels (1-60)                       |
| `srs_stages`                        | Array   | SRS stage values (0-9)                      |
| `started`                           | Boolean | Started status                              |
| `subject_ids`                       | Array   | Specific subjects                           |
| `subject_types`                     | Array   | kanji, radical, vocabulary, kana_vocabulary |
| `unlocked`                          | Boolean | Unlock status                               |
| `immediately_available_for_lessons` | Boolean | Ready for lessons now                       |
| `immediately_available_for_review`  | Boolean | Ready for review now                        |
| `in_review`                         | Boolean | Currently reviewable                        |

### Example

Burned kanji from levels 8 and 42:

```
GET /assignments?levels=8,42&subject_types=kanji&burned=true
```

---

## Study Materials

User-created notes and synonyms for subjects.

### Data Structure

| Attribute          | Type    | Description                                 |
| ------------------ | ------- | ------------------------------------------- |
| `created_at`       | Date    | Creation timestamp                          |
| `subject_id`       | Integer | Associated subject ID                       |
| `subject_type`     | String  | radical, kanji, vocabulary, kana_vocabulary |
| `meaning_note`     | String  | Custom meaning notes                        |
| `reading_note`     | String  | Custom reading notes                        |
| `meaning_synonyms` | Array   | User synonyms (accepted in reviews)         |
| `hidden`           | Boolean | Subject hidden from lessons/reviews         |

### Endpoints

#### Get All Study Materials

```
GET /study_materials
```

**Filters**: `hidden`, `ids`, `subject_ids`, `subject_types`, `updated_after`

#### Get Specific Study Material

```
GET /study_materials/<id>
```

#### Create Study Material

```
POST /study_materials
```

**Body**:

```json
{
  "study_material": {
    "subject_id": 123,
    "meaning_note": "My note",
    "reading_note": "Reading tip",
    "meaning_synonyms": ["synonym1", "synonym2"]
  }
}
```

Only one study material per subject allowed.

#### Update Study Material

```
PUT /study_materials/<id>
```

**Body**: Same as create (only include fields to update)

---

## Subjects

Core learning materials: radicals, kanji, vocabulary, kana_vocabulary.

### Endpoints

#### Get All Subjects

```
GET /subjects
```

Returns 1,000 items per page.

**Filters**:

| Parameter       | Type    | Description                                                  |
| --------------- | ------- | ------------------------------------------------------------ |
| `ids`           | Array   | Filter by subject IDs                                        |
| `types`         | Array   | Filter by type (radical, kanji, vocabulary, kana_vocabulary) |
| `slugs`         | Array   | Filter by URL slug                                           |
| `levels`        | Array   | Filter by level (1-60)                                       |
| `hidden`        | Boolean | Include/exclude hidden                                       |
| `updated_after` | Date    | Modified after timestamp                                     |

#### Get Specific Subject

```
GET /subjects/<id>
```

### Common Attributes (All Types)

| Attribute                     | Type      | Description                                         |
| ----------------------------- | --------- | --------------------------------------------------- |
| `characters`                  | String    | UTF-8 representation (null for image-only radicals) |
| `created_at`                  | Date      | Creation timestamp                                  |
| `document_url`                | String    | WaniKani page URL                                   |
| `hidden_at`                   | Date/null | If hidden from lessons/reviews                      |
| `level`                       | Integer   | Level (1-60)                                        |
| `lesson_position`             | Integer   | Position in level's lessons                         |
| `meanings`                    | Array     | Primary and alternative meanings                    |
| `slug`                        | String    | URL-friendly identifier                             |
| `spaced_repetition_system_id` | Integer   | SRS system ID                                       |

### Meaning Object

```json
{
  "meaning": "Love",
  "primary": true,
  "accepted_answer": true
}
```

### Auxiliary Meanings

```json
{
  "meaning": "Affection",
  "type": "whitelist" // or "blacklist"
}
```

- `whitelist`: Accepted as correct
- `blacklist`: Marked incorrect

### Radical-Specific

| Attribute                  | Type  | Description                                  |
| -------------------------- | ----- | -------------------------------------------- |
| `amalgamation_subject_ids` | Array | Kanji using this radical                     |
| `character_images`         | Array | SVG images (for radicals without characters) |

**Character Image**:

```json
{
  "url": "https://...",
  "content_type": "image/svg+xml",
  "metadata": { "inline_styles": true }
}
```

### Kanji-Specific

| Attribute                      | Type   | Description                      |
| ------------------------------ | ------ | -------------------------------- |
| `component_subject_ids`        | Array  | Radical components               |
| `readings`                     | Array  | Onyomi, kunyomi, nanori readings |
| `reading_mnemonic`             | String | Reading memory aid               |
| `meaning_hint`                 | String | Meaning hint                     |
| `amalgamation_subject_ids`     | Array  | Vocabulary using this kanji      |
| `visually_similar_subject_ids` | Array  | Similar-looking kanji            |

**Reading Object**:

```json
{
  "reading": "あい",
  "type": "kunyomi",
  "primary": true,
  "accepted_answer": true
}
```

Types: `onyomi`, `kunyomi`, `nanori`

### Vocabulary-Specific

| Attribute               | Type  | Description       |
| ----------------------- | ----- | ----------------- |
| `component_subject_ids` | Array | Kanji components  |
| `context_sentences`     | Array | Usage examples    |
| `parts_of_speech`       | Array | Grammatical types |
| `pronunciation_audios`  | Array | Voice recordings  |
| `readings`              | Array | Pronunciations    |

**Context Sentence**:

```json
{
  "en": "I love sushi.",
  "ja": "私はすしが大好きです。"
}
```

**Pronunciation Audio**:

```json
{
  "url": "https://...",
  "content_type": "audio/mpeg",
  "metadata": {
    "gender": "female",
    "pronunciation": "あい",
    "voice_actor_id": 1,
    "voice_actor_name": "Kyoko",
    "voice_description": "Tokyo accent"
  }
}
```

### Kana Vocabulary-Specific

Hiragana/katakana-only words. Same as vocabulary but without kanji components.

| Attribute              | Type   | Description       |
| ---------------------- | ------ | ----------------- |
| `context_sentences`    | Array  | Usage examples    |
| `meaning_mnemonic`     | String | Memory aid        |
| `parts_of_speech`      | Array  | Grammatical types |
| `pronunciation_audios` | Array  | Voice recordings  |

### Markup in Text Fields

Some attributes (mnemonics, hints) support markup:

- `<radical>...</radical>` - Radical reference
- `<kanji>...</kanji>` - Kanji reference
- `<vocabulary>...</vocabulary>` - Vocabulary reference
- `<meaning>...</meaning>` - Meaning highlight
- `<reading>...</reading>` - Reading highlight
