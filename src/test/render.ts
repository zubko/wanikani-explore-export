import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

export type Mounted = {
  container: HTMLElement;
  html: () => string;
  find: <T extends HTMLElement = HTMLElement>(selector: string) => T;
  findByLabel: (label: string) => HTMLElement;
  findAllByLabel: (label: string) => HTMLElement[];
  rerender: (element: ReactElement) => void;
  unmount: () => void;
};

export function mount(element: ReactElement): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));

  return {
    container,
    html: () => container.innerHTML,
    find: (selector) => findOrThrow(container, selector),
    findByLabel: (label) => findByLabelOrThrow(container, label),
    findAllByLabel: (label) => findAllByLabel(container, label),
    rerender: (next) => flushSync(() => root.render(next)),
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
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

export function pressKey(node: HTMLElement, key: string, metaKey = false): void {
  flushSync(() => {
    node.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey, bubbles: true }));
  });
}

/** Lets the pending promises of a save run and React apply the state updates. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
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
