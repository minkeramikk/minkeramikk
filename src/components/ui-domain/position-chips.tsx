"use client";

import { cn } from "@/lib/utils";
import type { TextPosition } from "@/lib/configurator/text-position";

/**
 * R5-TEXT-POSITION — DS §3.33. Radiogroup of the positions THIS design
 * offers (`allowedPositions`, already resolved by the caller: only what the
 * design actually offers is ever shown, never a disabled chip). Roving
 * tabindex + arrow navigation, same pattern as `onRadioKeyDown` (Swatch) and
 * the colour-notes toggle above in `configurator-client.tsx`.
 */
export function PositionChips({
  positions,
  value,
  onChange,
  label,
}: {
  positions: readonly TextPosition[];
  value: TextPosition;
  onChange: (pos: TextPosition) => void;
  label: (pos: TextPosition) => string;
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const chips = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')
    );
    if (chips.length === 0) return;
    const curr = chips.indexOf(document.activeElement as HTMLElement);
    let next = curr < 0 ? 0 : curr;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (curr + 1) % chips.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (curr - 1 + chips.length) % chips.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = chips.length - 1;
    chips[next]?.focus();
    const pos = positions[next];
    if (pos) onChange(pos);
  }

  return (
    <div
      role="radiogroup"
      data-testid="position-chips"
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-2"
    >
      {positions.map((pos) => {
        const selected = pos === value;
        return (
          <button
            key={pos}
            type="button"
            role="radio"
            aria-checked={selected}
            data-pos={pos}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(pos)}
            className={cn(
              "h-11 rounded-full border border-input bg-card px-3 text-[12.5px] transition-colors md:h-9 md:text-[13px]",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              selected
                ? "border-transparent bg-primary font-medium text-primary-foreground"
                : "hover:border-ring"
            )}
          >
            {label(pos)}
          </button>
        );
      })}
    </div>
  );
}
