/**
 * R5-BASKET-HOST task 8 — the ONE answer to «may the basket be open right
 * now», card §3: «con la tastiera aperta (campo Text allo step 2) il drawer
 * non è montato».
 *
 * Pure, and deliberately not a condition inlined in the provider: below `lg`
 * the drawer is the only basket there is, so two surfaces ask to open it (the
 * header icon, which is a Radix `SheetTrigger` and calls `onOpenChange`
 * itself, and step 3's sticky bar, which calls `openCart()`). Both go through
 * the provider's `setOpen`, and `setOpen` asks this function — the rule is
 * written once and the call sites carry none of it.
 *
 * Two things it has to get right at the same time:
 *
 * - a request to open while the keyboard is up is DROPPED, not queued. The
 *   stored state stays `false`, so a tap on the cart icon mid-typing does
 *   nothing at all and nothing pops open when the field is blurred;
 * - a basket that is somehow already open when the keyboard comes up closes.
 *   That is why `request` is optional: `basketOpen({ current, keyboardIsUp })` with
 *   no request means «re-decide what is already true», which is exactly what
 *   the provider's effect needs when the keyboard flips. Because the answer is
 *   computed from the CURRENT state and never from a remembered request,
 *   re-deciding on the way back down (`keyboardIsUp: false`) returns `current`
 *   unchanged: the keyboard closing can never open a basket by itself.
 */
export function basketOpen({
  current,
  request = null,
  keyboardIsUp,
}: {
  /** What the basket's open state is right now. */
  current: boolean;
  /** What a surface asked for, or `null` when nothing was asked. */
  request?: boolean | null;
  /**
   * An on-screen keyboard is up — the COMPOSED truth, not the gesture. Named
   * for what it means rather than for what raises it (PR 2 re-review): a
   * caller reading `typing: boolean` could plausibly hand this the raw step-2
   * focus flag and silently bring back the guard firing on a mouse device.
   * Composed by the publisher, not here:
   * `keyboardUp({ step, typing })` for the gesture, `hoverCapable()` for
   * whether this device even HAS such a keyboard (PR 2 review finding 6).
   * Both of those questions are about the world; this function only decides
   * what the basket does about the answer, which is what keeps it pure.
   */
  keyboardIsUp: boolean;
}): boolean {
  // The keyboard wins over every request, including one made in the same
  // tick: with it up the visual viewport is ~300px and a modal sheet over it
  // is a trap, not a basket.
  if (keyboardIsUp) return false;
  return request ?? current;
}

/**
 * What step 2 may publish as «the on-screen keyboard is up». The Text field
 * only exists at step 2, so the step is half the answer — and it has to be,
 * because `typing` can LATCH:
 *
 * «Tilbake» at step 2 carries `onMouseDown={keepFocusWhileTyping}`, whose
 * whole job is `preventDefault()` so the field KEEPS focus while the tap
 * lands (R4-STEP2-KEYBOARD ③). No blur fires; the step-1 render then unmounts
 * the focused input, which fires no blur either. So `typing` stays `true`
 * with no keyboard anywhere — and a `true` that never comes back down turns
 * `basketOpen` into «never»: on step 1 the drawer is the ONLY basket, so the
 * header cart icon would go dead, silently, for the rest of the session.
 *
 * Hence: never publish a step-1 truth. This is the same expression
 * `configurator-client.tsx` already writes twice for its own `data-typing`
 * attributes — the keyboard guard was simply reading one scope too high.
 * Do not "simplify" it back to a bare `typing`.
 */
export function keyboardUp({ step, typing }: { step: number; typing: boolean }): boolean {
  return step === 2 && typing;
}
