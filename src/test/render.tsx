import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { SearchContext } from "@client/context/SearchContext.tsx";

export type Mounted = {
  container: HTMLElement;
  html: () => string;
  find: <T extends HTMLElement = HTMLElement>(selector: string) => T;
  findByLabel: (label: string) => HTMLElement;
  findAllByLabel: (label: string) => HTMLElement[];
  rerender: (element: ReactElement) => void;
  unmount: () => void;
};

type PressKeyParams = {
  node: HTMLElement;
  key: string;
  metaKey?: boolean;
};

// A save awaits the queue of its subject, then the request, then the state update
const SETTLE_TURNS = 3;

const mountedViews: Mounted[] = [];

export function mount(element: ReactElement): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  let live = true;

  const view: Mounted = {
    container,
    html: () => container.innerHTML,
    find: (selector) => findOrThrow(container, selector),
    findByLabel: (label) => findByLabelOrThrow(container, label),
    findAllByLabel: (label) => findAllByLabel(container, label),
    rerender: (next) => flushSync(() => root.render(next)),
    unmount: () => {
      if (!live) return;
      live = false;
      root.unmount();
      container.remove();
    },
  };
  mountedViews.push(view);
  return view;
}

/** Mounts a card. `RelatedSubjectsSection` throws without a `SearchContext`. */
export function mountCard(element: ReactElement): Mounted {
  const view = mount(withSearchContext(element));
  return { ...view, rerender: (next) => view.rerender(withSearchContext(next)) };
}

/** Called after every test, so a failed assertion leaves no live React root behind. */
export function unmountAll(): void {
  for (const view of mountedViews) view.unmount();
  mountedViews.length = 0;
}

export function click(node: HTMLElement): void {
  flushSync(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export function typeInto(node: HTMLElement, value: string): void {
  // React tracks the node value, so a plain assignment is not seen as a change
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "value")?.set;
  flushSync(() => {
    setter?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function pressKey({ node, key, metaKey = false }: PressKeyParams): void {
  flushSync(() => {
    node.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey, bubbles: true }));
  });
}

/** Lets the pending promises of a save run and React apply the state updates. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < SETTLE_TURNS; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function withSearchContext(element: ReactElement): ReactElement {
  return (
    <SearchContext.Provider value={{ navigateTo: () => {} }}>{element}</SearchContext.Provider>
  );
}

function findOrThrow<T extends HTMLElement>(container: HTMLElement, selector: string): T {
  const node = container.querySelector(selector);
  if (!node) throw new Error(`No element for selector ${selector}`);
  return node as unknown as T;
}

function findByLabelOrThrow(container: HTMLElement, label: string): HTMLElement {
  const node = findAllByLabel(container, label)[0];
  if (!node) throw new Error(`No clickable element labelled "${label}"`);
  return node;
}

/** Finds buttons by their visible text or, for an icon button, by their title. */
function findAllByLabel(container: HTMLElement, label: string): HTMLElement[] {
  return [...container.querySelectorAll("button, a")].filter(
    (item) => item.textContent?.trim() === label || item.getAttribute("title") === label
  ) as HTMLElement[];
}
