// Sends a real left mouse click at a screen point (points, top-left origin).
// Usage: osascript -l JavaScript click.js 814 688
// The card templates listen for mousedown, and a System Events "click" is an accessibility
// press that never fires it.
ObjC.import("CoreGraphics");

function run(argv) {
  const point = $.CGPointMake(Number(argv[0]), Number(argv[1]));
  for (const type of [$.kCGEventMouseMoved, $.kCGEventLeftMouseDown, $.kCGEventLeftMouseUp]) {
    $.CGEventPost(
      $.kCGHIDEventTap,
      $.CGEventCreateMouseEvent(null, type, point, $.kCGMouseButtonLeft)
    );
    delay(0.08);
  }
  return "clicked";
}
