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
 *   That is why `request` is optional: `basketOpen({ current, typing })` with
 *   no request means «re-decide what is already true», which is exactly what
 *   the provider's effect needs when `typing` flips. Because the answer is
 *   computed from the CURRENT state and never from a remembered request,
 *   re-deciding on the way back down (`typing: false`) returns `current`
 *   unchanged: the keyboard closing can never open a basket by itself.
 */
export function basketOpen({
  current,
  request = null,
  typing,
}: {
  /** What the basket's open state is right now. */
  current: boolean;
  /** What a surface asked for, or `null` when nothing was asked. */
  request?: boolean | null;
  /** Step 2's Text field has focus, i.e. the on-screen keyboard is up. */
  typing: boolean;
}): boolean {
  // The keyboard wins over every request, including one made in the same
  // tick: with the field focused the visual viewport is ~300px and a modal
  // sheet over it is a trap, not a basket.
  if (typing) return false;
  return request ?? current;
}
