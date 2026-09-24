/**
 * R5-NEW-PALETTE — the four pure decisions `<PaletteCard>` makes, kept out
 * of the component so a unit test can reach them (same precedent as
 * `basket-host.ts`: no React test infra in this repo). Presentation only:
 * nothing here reads or writes the palette store.
 */
import type { ConfigSnapshot } from "@/lib/cart/cart";
import type { TextPosition } from "@/lib/configurator/text-position";
import { sortLaneNewestFirst, type Palette } from "@/lib/palettes/palettes";

/** DS §3.31: past 6 chips the «Switch to» zone is capped behind «Show all». */
export const SWITCH_CAP = 6;

/** Hexes for the `Dots` — same filter as palette-sheet.tsx. */
export function paletteHexes(snapshot: Pick<ConfigSnapshot, "selections">): string[] {
  return snapshot.selections.map((s) => s.hex).filter((h): h is string => Boolean(h));
}

/** NowBlock second line, NEVER empty (LOG 22/9): dedication if non-blank, else the design.
 *  DS §3.33: `position` rides along with the dedication only — the design fallback carries
 *  no position, there is no text to place. */
export function nowSecondLine(
  dedication: string | undefined,
  designName: string,
  position?: TextPosition
): { kind: "dedication"; text: string; position?: TextPosition } | { kind: "design"; text: string } {
  const text = dedication?.trim();
  return text ? { kind: "dedication", text, position } : { kind: "design", text: designName };
}

/** Switch targets: every saved palette but the active one, in sortLaneNewestFirst order. */
export function switchLane(palettes: Palette[], activeCode: string | null, currentSlug: string): Palette[] {
  return sortLaneNewestFirst(palettes, currentSlug).filter((p) => p.code !== activeCode);
}

/** Cap at SWITCH_CAP until showAll. Generic: the card applies it to ReactNodes. */
export function capLane<T>(items: T[], showAll: boolean): { visible: T[]; hidden: number } {
  const visible = showAll ? items : items.slice(0, SWITCH_CAP);
  return { visible, hidden: items.length - visible.length };
}
