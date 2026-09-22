/**
 * R5-POLISH-STEP23 T1 — two-tap delete for palette chips and tiles.
 * `armed` is the caller's local state (one per control). No timers: a
 * pending confirmation is dropped on blur/Escape (`disarm`), not by a clock.
 */
export type DeleteTap = { armed: boolean; fire: boolean };

export function deleteTap(armed: boolean): DeleteTap {
  return armed ? { armed: false, fire: true } : { armed: true, fire: false };
}

export function disarm(): DeleteTap {
  return { armed: false, fire: false };
}
