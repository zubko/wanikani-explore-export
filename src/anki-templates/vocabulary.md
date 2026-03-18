# Japanese Vocabulary - Anki Card Templates

Configure these templates in Anki: Tools → Manage Note Types → Japanese Vocabulary → Cards

## Fields

- `characters` - Vocabulary characters
- `kanji_composition` - Pre-styled HTML with kanji badges and meanings
- `primary_meaning` - Primary meaning
- `extra_meanings` - Alternative meanings (comma-separated)
- `user_synonyms` - User synonyms (comma-separated)
- `word_type` - Parts of speech (comma-separated)
- `conjugations` - Verb conjugations: dictionary, masu, te, nai (or empty)
- `meaning_explanation` - Styled HTML mnemonic with colored tags
- `meaning_note` - User note for meaning
- `reading` - Primary reading in hiragana (empty for kana vocabulary)
- `reading_audio_female` - Audio filename for female voice (only one gender is filled per card)
- `reading_audio_male` - Audio filename for male voice (only one gender is filled per card)
- `reading_explanation` - Styled HTML mnemonic for reading (empty for kana vocabulary)
- `reading_note` - User note for reading
- `sentence_jap` - Japanese context sentence (shortest)
- `sentence_jap_furigana` - Japanese sentence with furigana (placeholder)
- `sentence_jap_audio` - Sentence audio filename (Azure TTS)
- `sentence_eng` - English translation
- `sentence_eng_audio` - English audio filename (placeholder)

## Front Template

```html
<div class="front"><span id="front">{{characters}}</span></div>
<script>
  (function () {
    var el = document.getElementById("front");
    /* Use the container width instead of window.innerWidth for scaling.
       Anki limits the card container width and centers it, so the container
       can be narrower than the viewport. Using vw units would overshoot. */
    var container = el.parentElement;
    var maxWidth = container.offsetWidth * 0.75;
    var fontSize = maxWidth * 0.3;
    el.style.fontSize = fontSize + "px";
    while (el.offsetWidth > maxWidth && fontSize > 5) {
      fontSize -= container.offsetWidth * 0.01;
      el.style.fontSize = fontSize + "px";
    }
  })();
</script>
```

## Back Template

```html
<!-- Back Short - centered, scaled display -->
<div id="back-short" class="back-short">
  <div class="header-scaled" id="header-scaled">
    <div class="badge">{{characters}}</div>
    <div class="header-text">
      <h1>{{primary_meaning}}</h1>
      {{#reading}}
      <div class="reading-top">{{reading}}</div>
      {{/reading}}
    </div>
  </div>
  <button id="details-btn" class="details-btn">Details</button>
  {{#sentence_jap}}
  <div class="short-sentence">
    <div class="short-sentence-jap">{{sentence_jap}}</div>
    {{#sentence_jap_furigana}}
    <div class="short-sentence-reading">{{sentence_jap_furigana}}</div>
    {{/sentence_jap_furigana}} {{#sentence_eng}}
    <div class="short-sentence-eng">{{sentence_eng}}</div>
    {{/sentence_eng}}
  </div>
  {{/sentence_jap}}
</div>

<!-- Back Full - detailed content -->
<div id="back-full" class="back-full">
  <div class="card">
    <div class="header">
      <div class="badge">{{characters}}</div>
      <div class="header-text">
        <h1>{{primary_meaning}}</h1>
        {{#reading}}
        <div class="reading-top">{{reading}}</div>
        {{/reading}}
      </div>
    </div>

    {{#kanji_composition}}
    <div class="section">
      <h2>Kanji Composition</h2>
      <div class="kanji-list">{{kanji_composition}}</div>
    </div>
    {{/kanji_composition}}

    <div class="section">
      <h2>Meaning</h2>
      <div class="row"><span class="label">Primary</span> <b>{{primary_meaning}}</b></div>
      {{#extra_meanings}}
      <div class="row"><span class="label">Alternative</span> {{extra_meanings}}</div>
      {{/extra_meanings}} {{#user_synonyms}}
      <div class="row"><span class="label">Synonyms</span> {{user_synonyms}}</div>
      {{/user_synonyms}}
      <div class="row"><span class="label">Word Type</span> {{word_type}}</div>
      {{#conjugations}}
      <div class="row"><span class="label">Conjugations</span> {{conjugations}}</div>
      {{/conjugations}}
      <div class="mnemonic">{{meaning_explanation}}</div>
      {{#meaning_note}}
      <div class="note"><span class="label">Note</span> {{meaning_note}}</div>
      {{/meaning_note}}
    </div>

    <div class="section">
      <h2>Reading</h2>
      {{#reading}}
      <div class="reading-large">{{reading}}</div>
      {{/reading}}
      <!-- Only one gender is populated per card to prevent Anki from auto-playing both -->
      <div class="audio-row">
        {{#reading_audio_female}}[sound:{{reading_audio_female}}]{{/reading_audio_female}}
        {{#reading_audio_male}}[sound:{{reading_audio_male}}]{{/reading_audio_male}}
      </div>
      {{#reading_explanation}}
      <div class="mnemonic">{{reading_explanation}}</div>
      {{/reading_explanation}} {{#reading_note}}
      <div class="note"><span class="label">Note</span> {{reading_note}}</div>
      {{/reading_note}}
    </div>

    {{#sentence_jap}}
    <div class="section">
      <h2>Example</h2>
      <div class="sentence-jap">{{sentence_jap}}</div>
      {{#sentence_jap_furigana}}
      <div class="sentence-reading">{{sentence_jap_furigana}}</div>
      {{/sentence_jap_furigana}} {{#sentence_eng}}
      <div class="sentence-eng">{{sentence_eng}}</div>
      {{/sentence_eng}} {{#sentence_jap_audio}}
      <div class="audio-row">[sound:{{sentence_jap_audio}}]</div>
      {{/sentence_jap_audio}}
    </div>
    {{/sentence_jap}}
  </div>
</div>

<script>
  (function () {
    // mousedown with preventDefault+stopPropagation: Anki's Qt WebEngine
    // intercepts click events, making the button unresponsive (requires 3-5
    // clicks). mousedown fires before click, and both prevent/stop block the
    // event from reaching Anki's handlers.
    document.getElementById("details-btn").addEventListener("mousedown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById("back-short").style.display = "none";
      document.getElementById("back-full").style.display = "block";
    });

    var header = document.getElementById("header-scaled");
    /* Use the container width instead of window.innerWidth for scaling.
       Anki limits the card container width and centers it, so the container
       can be narrower than the viewport. Using vw units would overshoot. */
    var container = header.parentElement;
    var maxWidth = container.offsetWidth * 0.85;
    var fontSize = maxWidth * 0.15;
    header.style.fontSize = fontSize + "px";
    while (header.offsetWidth > maxWidth && fontSize > 1) {
      fontSize *= 0.9;
      header.style.fontSize = fontSize + "px";
    }
  })();
</script>
```

## Styling (CSS)

```css
.card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 16px;
  text-align: left;
}

.front {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
  line-height: 1.2;
}

.front span {
  white-space: nowrap;
}

/* Back Short - centered display */
.back-short {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
  text-align: center;
}

.header-scaled {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75em;
  font-size: 15vw;
}

.header-scaled .badge {
  font-size: 2em;
  padding: 0.25em 0.5em;
}

.header-scaled h1 {
  font-size: 1.5em;
}

.header-scaled .header-text {
  display: flex;
  flex-direction: column;
  text-align: center;
}

.header-scaled .reading-top {
  font-size: 1em;
}

.details-btn {
  margin-top: 24px;
  min-height: 44px;
  padding: 0 24px;
  font-size: 1rem;
  cursor: pointer;
  background: #eee;
  border: none;
  border-radius: 8px;
  outline: none;
  box-shadow: none;
  /* Prevent text selection from interfering with click detection in Anki's webview */
  user-select: none;
  -webkit-user-select: none;
}

.details-btn:hover {
  background: #ddd;
  border: none;
  outline: none;
  box-shadow: none;
}

.back-full {
  display: none;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.badge {
  background: #aa00ff;
  color: white;
  font-size: 2rem;
  padding: 8px 16px;
  border-radius: 8px;
}

h1 {
  font-size: 1.5rem;
  font-weight: 300;
  margin: 0;
}

.header-text {
  display: flex;
  flex-direction: column;
}

.reading-top {
  color: #888;
  font-size: 1.1rem;
}

h2 {
  font-size: 1.1rem;
  font-weight: 500;
  margin: 0 0 12px;
}

.section {
  border-top: 1px solid #e5e5e5;
  padding: 16px 0;
}

.row {
  margin-bottom: 4px;
}

.label {
  color: #666;
  font-size: 0.9rem;
  margin-right: 4px;
}

.kanji-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.kanji-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kanji-badge {
  background: #ff00aa;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 1.2rem;
}

.reading-large {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.audio-row {
  margin-bottom: 12px;
}

.mnemonic {
  line-height: 1.6;
  margin-top: 12px;
}

.note {
  margin-top: 12px;
  padding: 8px;
  background: #fffde7;
  border-radius: 4px;
}

/* Extra margin to visually balance the space above the button,
   where .header-scaled's line-height adds invisible trailing space */
.short-sentence {
  margin-top: 28px;
  text-align: center;
}

.short-sentence-jap {
  color: #888;
  font-size: 1.2rem;
}

.short-sentence-reading {
  color: #aaa;
  font-size: 1rem;
  margin-top: 4px;
}

.short-sentence-eng {
  color: #888;
  font-size: 1.1rem;
  margin-top: 4px;
}

.sentence-jap {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.sentence-reading {
  color: #999;
  font-size: 1.1rem;
  margin-bottom: 8px;
}

.sentence-eng {
  color: #666;
  font-size: 0.95rem;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .section {
    border-top-color: #444;
  }

  .label {
    color: #999;
  }

  .reading-top {
    color: #aaa;
  }

  .note {
    background: #3a3520;
  }

  .short-sentence-jap {
    color: #aaa;
  }

  .short-sentence-reading {
    color: #888;
  }

  .short-sentence-eng {
    color: #aaa;
  }

  .sentence-reading {
    color: #777;
  }

  .sentence-eng {
    color: #999;
  }

  .details-btn {
    background: #444;
    color: white;
  }

  .details-btn:hover {
    background: #555;
    border: none;
    outline: none;
    box-shadow: none;
  }
}
```

## Color Reference

Mnemonic tags are pre-styled with these colors:

- Radical: `#00aaff` (blue)
- Kanji: `#ff00aa` (pink)
- Vocabulary: `#aa00ff` (purple)
- Reading: `#555` (gray)
