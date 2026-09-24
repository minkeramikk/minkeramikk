/**
 * The `MK-...` code alphabet and prefix (ADR 0011), alone in their own
 * module that imports nothing. The alphabet is shared by the grammar
 * (`config-code.ts`) and by the segment codec (`text-segment.ts`), and a
 * cycle between those two crashed at module init once (R5-TEXT-IDENTITY
 * task 2 review) — keeping the shared constants leaf-level, with no
 * dependency of their own, makes that cycle impossible to reintroduce by
 * construction, not just unlikely.
 */

/** Safe alphabet (ADR 0011): A–Z minus O,I,L, plus 2–9. 31 symbols. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_PREFIX = "MK";
