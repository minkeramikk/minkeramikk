/**
 * R4-POLISH voce 4 — the ONE ✕ disc, shared by the step-3 product sheet and by
 * `PhotoLightbox` (which serves both the step-2 filmstrip and the sheet's own
 * lightbox). The card's acceptance is «le due X, identiche», so the class lives
 * in one place instead of being copied and left to drift.
 *
 * ponytail: a class string, not a component — a new component would need a
 * DESIGN-SYSTEM entry first (AGENTS.md), and there is no behaviour to share.
 *
 * 36px disc on the ink pair (`--ink` / `--ink-foreground`, the tokens the zoom
 * pill already uses — no hardcoded colour); `after:-inset-1` grows the touch
 * target to 44px (36 + 2×4) without changing the visual (§5).
 */
export const CLOSE_DISC =
  "flex size-9 items-center justify-center rounded-full bg-ink text-base text-ink-foreground outline-none after:absolute after:-inset-1 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50";
