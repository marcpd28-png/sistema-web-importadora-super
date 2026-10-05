/** Fixed overlays use layout coordinates; DOM rectangles include the body's zoom. */
export function getAdminViewportBounds(element: HTMLElement) {
  const scale = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
  const rect = element.getBoundingClientRect();

  return {
    top: rect.top / scale,
    right: rect.right / scale,
    bottom: rect.bottom / scale,
    left: rect.left / scale,
    viewportWidth: window.innerWidth / scale,
    viewportHeight: window.innerHeight / scale,
  };
}
