// Prints the window server id of the Anki window with the given title, for `screencapture -l`.
// Usage: osascript -l JavaScript window-id.js Preview
ObjC.import("CoreGraphics");

function run(argv) {
  const windows = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, 0));
  for (let i = 0; i < windows.count; i++) {
    const w = ObjC.deepUnwrap(windows.objectAtIndex(i));
    if (w.kCGWindowOwnerName === "Anki" && w.kCGWindowName === argv[0] && w.kCGWindowLayer === 0) {
      return String(w.kCGWindowNumber);
    }
  }
  // Window titles stay hidden until the terminal app has Screen Recording
  throw new Error(`No Anki window "${argv[0]}". Is Screen Recording on for the terminal app?`);
}
