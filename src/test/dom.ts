import { Window } from "happy-dom";

let installed = false;

// DOMPurify and react-dom both need a DOM at import time. Every DOM test file shares this one
// window: bun test runs all files in one process, so a second window would only shadow the first.
export function installDom(): void {
  if (installed) return;
  const window = new Window({ url: "http://localhost/" });
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    DocumentFragment: window.DocumentFragment,
    HTMLTemplateElement: window.HTMLTemplateElement,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLFormElement: window.HTMLFormElement,
    Node: window.Node,
    Element: window.Element,
    NodeFilter: window.NodeFilter,
    NamedNodeMap: window.NamedNodeMap,
    DOMParser: window.DOMParser,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  });
  installed = true;
}
