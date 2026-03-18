# Investigating: Anki "Details" Button Unreliable Click

## Problem

The "Details" button on the back-short view of Anki cards (radicals, kanji, vocabulary) sometimes doesn't respond to clicks. The hover state works (CSS `:hover` applies), but clicking once often does nothing - requires 3-5 clicks or selecting button text first to make it work.

## Environment

- Anki desktop app (Qt WebEngine / Chromium-based webview)
- Button uses `addEventListener("click", ...)` in a `<script>` tag
- Button is styled as a simple clickable element with hover effects

## Research

Anki's Qt WebEngine webview can intercept or consume click events before they reach JavaScript handlers. This is a known category of issues with embedded browser engines where the host application processes mouse events at a higher level.

Key observations:

- Hover CSS works fine (purely CSS, no JS needed)
- Click events are unreliable (JS event handler)
- Selecting text first "fixes" it (changes focus/event handling state)
- Suggests the webview is consuming the click event during bubbling

## Experiment 1: stopPropagation (DIDN'T HELP)

Added `e.stopPropagation()` to the click handler to prevent the event from bubbling up to Anki's webview handlers:

```javascript
document.getElementById("details-btn").addEventListener("click", function (e) {
  e.stopPropagation();
  document.getElementById("back-short").style.display = "none";
  document.getElementById("back-full").style.display = "block";
});
```

Result: Still unreliable. The button still requires multiple clicks.

## Experiment 2: Inline onclick + user-select: none (DIDN'T HELP)

Switched from `addEventListener("click", ...)` to inline `onclick` attribute on the button element. Inline handlers are processed differently by the engine - they're part of the element's own event processing rather than the DOM event listener system, so Anki's webview may not intercept them the same way.

Also added `user-select: none` CSS to the button to prevent text selection from interfering with click detection.

```html
<button
  class="details-btn"
  onclick="document.getElementById('back-short').style.display='none'; document.getElementById('back-full').style.display='block';"
>
  Details
</button>
```

```css
.details-btn {
  user-select: none;
  -webkit-user-select: none;
}
```

Result: Still unreliable. Inline onclick didn't bypass the interception either.

## Experiment 3: Inline onmousedown (DIDN'T HELP)

Switched from `onclick` to `onmousedown`. The `mousedown` event fires before `click` in the event sequence (mousedown → mouseup → click). Since Anki's webview appears to intercept at the `click` level, using `mousedown` should bypass the interception entirely as it fires earlier in the chain.

```html
<button
  class="details-btn"
  onmousedown="document.getElementById('back-short').style.display='none'; document.getElementById('back-full').style.display='block';"
>
  Details
</button>
```

Result: Still unreliable.

## Experiment 4: addEventListener mousedown + preventDefault + stopPropagation (CURRENT)

Back to `addEventListener` but using `mousedown` event instead of `click`, combined with both `preventDefault()` and `stopPropagation()`. This combination ensures the event fires early (before click) and is fully blocked from reaching Anki's webview handlers in both the default action and bubbling paths.

```javascript
document.getElementById("details-btn").addEventListener("mousedown", function (e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById("back-short").style.display = "none";
  document.getElementById("back-full").style.display = "block";
});
```

Result: Testing...

## If Still Unreliable - Next Experiments

1. **Use `pointerdown` event** - pointer events are a newer API that may bypass the issue
2. **Use `touchstart` event** - fires before mouse events entirely
3. **CSS `pointer-events` tricks** - manipulate pointer-events to control event flow
