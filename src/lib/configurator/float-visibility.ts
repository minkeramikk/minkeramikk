/**
 * F31 — visibility hysteresis for the mobile floating preview bubble.
 * Pure, no React, no DOM: the component feeds it IntersectionObserver ratios
 * and timestamps, it answers "is the bubble visible?".
 *
 * Lesson QA-fix #3 (the v1 collapse-to-thumbnail died here): a single
 * `threshold: 0` flip-flopped with the mobile URL-bar resize. Two defences,
 * both encoded HERE so they are unit-testable:
 *
 *  1. ASYMMETRIC thresholds — show only when the preview is almost gone
 *     (< SHOW_BELOW), hide only when it is clearly back (> HIDE_ABOVE).
 *     Everything in between is a dead zone: no state change, ever.
 *  2. STABILITY WINDOW on show — the ratio must stay below SHOW_BELOW for
 *     SHOW_DELAY_MS before the bubble appears, absorbing the ratio spikes
 *     the URL-bar churn produces. Hide is immediate: scrolling back up is
 *     an intentional gesture and the high threshold filters the churn.
 *
 * And the bubble lives in a fixed OVERLAY: even a wrong flip would pulse an
 * opacity, never move the layout.
 */

export interface FloatVisibilityOptions {
  /** show when the preview's visible ratio drops below this… */
  showBelow: number;
  /** …hide when it rises above this (dead zone in between) */
  hideAbove: number;
  /** the ratio must sit below showBelow this long before showing */
  showDelayMs: number;
}

export const FLOAT_DEFAULTS: FloatVisibilityOptions = {
  showBelow: 0.1,
  hideAbove: 0.5,
  showDelayMs: 150,
};

export interface FloatState {
  visible: boolean;
  /**
   * timestamp (ms) of when the ratio first dropped below showBelow while
   * hidden — the candidate-show clock; null when no show is pending.
   */
  pendingShowSince: number | null;
}

export const FLOAT_INITIAL: FloatState = {
  visible: false,
  pendingShowSince: null,
};

/**
 * Advance the state machine. Call on every observer tick AND once more when
 * the stability window elapses (same ratio, later `now`).
 */
export function nextFloatState(
  state: FloatState,
  ratio: number,
  now: number,
  opts: FloatVisibilityOptions = FLOAT_DEFAULTS
): FloatState {
  if (state.visible) {
    // hide only on a CLEAR return of the preview; churn never gets this high
    return ratio > opts.hideAbove
      ? { visible: false, pendingShowSince: null }
      : state;
  }

  // hidden: only a ratio below the show threshold makes progress
  if (ratio >= opts.showBelow) {
    // back out of the candidate zone → reset the clock (a churn spike that
    // briefly leaves the zone must restart the stability window)
    return state.pendingShowSince === null
      ? state
      : { visible: false, pendingShowSince: null };
  }

  if (state.pendingShowSince === null) {
    return { visible: false, pendingShowSince: now };
  }
  if (now - state.pendingShowSince >= opts.showDelayMs) {
    return { visible: true, pendingShowSince: null };
  }
  return state;
}
