# Japanese Kanji - Anki Card Templates

Configure these templates in Anki: Tools → Manage Note Types → Japanese Kanji → Cards

## Fields

- `character` - Kanji character
- `radicals` - Pre-styled HTML with radical badges and names
- `primary_meaning` - Primary meaning
- `primary_reading` - Primary reading (the one marked primary in Wanikani)
- `extra_meanings` - Alternative meanings (comma-separated)
- `meaning_mnemonic` - Styled HTML mnemonic with colored tags
- `meaning_hint` - Styled HTML hint
- `meaning_note` - User note
- `readings_onyomi` - On'yomi readings (primary bold), comma-separated
- `readings_kunyomi` - Kun'yomi readings (primary bold), comma-separated
- `readings_nanori` - Nanori readings (primary bold), comma-separated
- `reading_mnemonic` - Styled HTML mnemonic with colored tags
- `reading_hint` - Styled HTML hint
- `reading_note` - User note

## Front Template

```html
<div class="front">{{character}}</div>
```

## Back Template

```html
<!-- Back Short - centered, scaled display -->
<div id="back-short" class="back-short">
  <div class="header-scaled" id="header-scaled">
    <div class="badge">{{character}}</div>
    <div class="header-text">
      <h1>{{primary_meaning}}</h1>
      {{#primary_reading}}
      <div class="reading-top">{{primary_reading}}</div>
      {{/primary_reading}}
    </div>
  </div>
  <button id="details-btn" class="details-btn">Details</button>
</div>

<!-- Back Full - detailed content -->
<div id="back-full" class="back-full">
  <div class="card">
    <div class="header">
      <div class="badge">{{character}}</div>
      <div class="header-text">
        <h1>{{primary_meaning}}</h1>
        {{#primary_reading}}
        <div class="reading-top">{{primary_reading}}</div>
        {{/primary_reading}}
      </div>
    </div>

    <div class="section">
      <h2>Radicals</h2>
      <div class="radicals">{{radicals}}</div>
    </div>

    <div class="section">
      <h2>Meaning</h2>
      <div class="row"><span class="label">Primary</span> <b>{{primary_meaning}}</b></div>
      {{#extra_meanings}}
      <div class="row"><span class="label">Alternative</span> {{extra_meanings}}</div>
      {{/extra_meanings}}
      <div class="mnemonic">{{meaning_mnemonic}}</div>
      {{#meaning_hint}}
      <div class="hint">{{meaning_hint}}</div>
      {{/meaning_hint}} {{#meaning_note}}
      <div class="note"><span class="label">Note</span> {{meaning_note}}</div>
      {{/meaning_note}}
    </div>

    <div class="section">
      <h2>Readings</h2>
      <div class="readings-grid">
        {{#readings_onyomi}}
        <div class="reading-col">
          <span class="reading-label primary">On'yomi</span>
          <span class="reading-value">{{readings_onyomi}}</span>
        </div>
        {{/readings_onyomi}} {{#readings_kunyomi}}
        <div class="reading-col">
          <span class="reading-label">Kun'yomi</span>
          <span class="reading-value">{{readings_kunyomi}}</span>
        </div>
        {{/readings_kunyomi}} {{#readings_nanori}}
        <div class="reading-col">
          <span class="reading-label">Nanori</span>
          <span class="reading-value">{{readings_nanori}}</span>
        </div>
        {{/readings_nanori}}
      </div>
      <div class="mnemonic">{{reading_mnemonic}}</div>
      {{#reading_hint}}
      <div class="hint">{{reading_hint}}</div>
      {{/reading_hint}} {{#reading_note}}
      <div class="note"><span class="label">Note</span> {{reading_note}}</div>
      {{/reading_note}}
    </div>
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
    var maxWidth = container.offsetWidth * 0.75;
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
  font-size: 40vw;
  line-height: 1;
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
  align-items: center;
  gap: 0.75em;
  white-space: nowrap;
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
  text-align: left;
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

.header-text {
  display: flex;
  flex-direction: column;
}

.reading-top {
  color: #888;
  font-size: 1.1rem;
}

.badge {
  background: #ff00aa;
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

.radicals {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.radical-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.radical-badge {
  background: #00aaff;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 1.2rem;
}

.radical-img {
  height: 1.2rem;
  /* make SVG images white to match text radicals on the blue badge background */
  filter: brightness(0) invert(1);
}

.readings-grid {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
}

.reading-col {
  display: flex;
  flex-direction: column;
}

.reading-label {
  font-size: 0.9rem;
  color: #666;
}

.reading-label.primary {
  font-weight: 600;
  color: #333;
}

.reading-value {
  font-size: 1.1rem;
}

.mnemonic {
  line-height: 1.6;
  margin-top: 12px;
}

.hint {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  margin-top: 12px;
  line-height: 1.6;
}

.note {
  margin-top: 12px;
  padding: 8px;
  background: #fffde7;
  border-radius: 4px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .section {
    border-top-color: #444;
  }

  .reading-top {
    color: #aaa;
  }

  .label,
  .reading-label {
    color: #999;
  }

  .reading-label.primary {
    color: #ccc;
  }

  .hint {
    background: #333;
  }

  .note {
    background: #3a3520;
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
