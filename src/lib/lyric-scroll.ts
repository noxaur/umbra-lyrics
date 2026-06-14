export function isOutsideCenterThird(
  element: HTMLElement,
  container: HTMLElement,
): boolean {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const elementCenter = elementRect.top + elementRect.height / 2
  const third = containerRect.height / 3
  const centerTop = containerRect.top + third
  const centerBottom = containerRect.top + 2 * third
  return elementCenter < centerTop || elementCenter > centerBottom
}

export function getScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? "auto" : "smooth"
}
