/**
 * R3-B — visual-viewport anchoring for the mobile fixed elements (step-1 Next
 * bar, step-2 FloatingPreview FAB). Pure, no React, no DOM: the hook feeds it
 * window/visualViewport metrics, it answers "how many CSS px is the layout
 * viewport's bottom BELOW the visual viewport's bottom?" — i.e. the on-screen
 * keyboard inset. A position:fixed bottom element lifted by this much stays
 * pinned above the keyboard instead of being stranded mid-screen (iOS Safari
 * does not reflow fixed elements to the visual viewport).
 */

export interface VisualViewportMetrics {
  /** layout viewport height (window.innerHeight) */
  innerHeight: number;
  /** visual viewport height (visualViewport.height) */
  viewportHeight: number;
  /** visual viewport vertical offset (visualViewport.offsetTop) */
  offsetTop: number;
}

/**
 * Keyboard inset in CSS px, clamped to >= 0. Sub-pixel jitter (<= 1px) — which
 * iOS produces even with no keyboard — collapses to 0 so the element does not
 * twitch.
 */
export function visualViewportInset({
  innerHeight,
  viewportHeight,
  offsetTop,
}: VisualViewportMetrics): number {
  const inset = innerHeight - viewportHeight - offsetTop;
  return inset > 1 ? inset : 0;
}
