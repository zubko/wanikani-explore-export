export function scrollToElement(elementId: string): void {
  document.getElementById(elementId)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
