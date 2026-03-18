# Japanese Radicals - Anki Card Templates

Configure these templates in Anki: Tools → Manage Note Types → Japanese Radicals → Cards

## Fields

- `character` - Radical character or `<img>` tag for image radicals
- `primary_name` - Primary meaning
- `extra_names` - Alternative meanings (comma-separated)
- `user_synonyms` - User synonyms (comma-separated)
- `mnemonic_text` - Styled HTML mnemonic with colored tags
- `mnemonic_image` - Mnemonic illustration URL
- `note` - User note

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
    <h1>{{primary_name}}</h1>
  </div>
  <button id="details-btn" class="details-btn">Details</button>
</div>

<!-- Back Full - detailed content -->
<div id="back-full" class="back-full">
  <div class="card">
    <div class="header">
      <div class="badge">{{character}}</div>
      <h1>{{primary_name}}</h1>
    </div>

    <div class="section">
      <h2>Name</h2>
      <div class="row"><span class="label">Primary</span> <b>{{primary_name}}</b></div>
      {{#extra_names}}
      <div class="row"><span class="label">Alternative</span> {{extra_names}}</div>
      {{/extra_names}} {{#user_synonyms}}
      <div class="row"><span class="label">User Synonyms</span> {{user_synonyms}}</div>
      {{/user_synonyms}}
    </div>

    <div class="section">
      <h2>Mnemonic</h2>
      {{#mnemonic_image}}<img src="{{mnemonic_image}}" class="mnemonic-img" />{{/mnemonic_image}}
      <div class="mnemonic">{{mnemonic_text}}</div>
    </div>

    {{#note}}
    <div class="section">
      <h2>Note</h2>
      <div>{{note}}</div>
    </div>
    {{/note}}
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

.front img {
  width: 75%;
  max-width: 400px;
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

.header-scaled img {
  height: 2em;
}

.header-scaled .badge img {
  height: 1em;
  width: 1em;
  /* Prevent flexbox from shrinking the image when container is constrained;
     text characters don't shrink but replaced elements (img) do */
  min-width: 1em;
  min-height: 1em;
  /* SVG radicals have dark strokes; invert to white for contrast on the blue badge */
  filter: brightness(0) invert(1);
}

.header-scaled h1 {
  font-size: 1.5em;
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
  background: #00aaff;
  color: white;
  font-size: 2rem;
  padding: 8px 16px;
  border-radius: 8px;
}

.badge img {
  height: 2rem;
  /* SVG radicals have dark strokes; invert to white for contrast on the blue badge */
  filter: brightness(0) invert(1);
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

.mnemonic {
  line-height: 1.6;
}

.mnemonic-img {
  max-width: 300px;
  margin-top: 12px;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  padding: 8px;
  background-color: #eee;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .section {
    border-top-color: #444;
  }

  .label {
    color: #999;
  }

  .mnemonic-img {
    border-color: #444;
    background-color: #aaa;
    padding: 24px;
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

  .front img {
    filter: invert(1);
  }
}
```

## Color Reference

Mnemonic tags are pre-styled with these colors:

- Radical: `#00aaff` (blue)
- Kanji: `#ff00aa` (pink)
- Vocabulary: `#aa00ff` (purple)
- Reading: `#555` (gray)
