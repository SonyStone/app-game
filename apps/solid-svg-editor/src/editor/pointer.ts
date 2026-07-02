export function setPointerCaptureSafely(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events in tests do not always create an active pointer.
  }
}
