import { cn } from "@/lib/utils";

export interface Step {
  label: string;
}

/**
 * R5-POLISH-STEP23 (TL, 22/9: «voglio tutte le pagine con header uguale»):
 * the one recipe for the step bar's wrapper, shared by the step 1-2 cluster
 * (configurator-client.tsx) and the step 3 one (ceramics-step.tsx) so the two
 * cannot drift — before this, step 3 also carried a Back pill, which pushed
 * the stepper to the right and made the bar jump between steps.
 *
 * From `md` the bar PINS (`top-0`) and everything scrolls under it. The band
 * is 12px + the bar + 12px; `-mt-3`/`mb-1` hand those paddings back to the
 * flow, so the resting layout is exactly what it was before the bar pinned,
 * and the padding only buys air above the bar once it is stuck to the
 * viewport edge. `-mx-3/px-3` for the same reason the step-3 heading block
 * has it: the cards underneath carry `--shadow-card`, which bleeds ~5px past
 * the columns, and a band that stops AT the column leaves a ribbon of that
 * shadow showing beside it. `z-40`, not 30: step 2's preview column is itself a
 * `sticky z-30` that comes LATER in the DOM, so at 30 the bar tied with it
 * and the preview painted over the stepper. 40 stays below the 50 of
 * dialogs and sheets, and above the step-3 heading block's `z-20`, which
 * pins UNDER this one (see its own `top-[…]`).
 */
export const STEP_NAV_STICKY =
  "mb-4 md:sticky md:top-0 md:z-40 md:-mx-3 md:-mt-3 md:mb-1 md:bg-background md:px-3 md:pt-3 md:pb-3";

/**
 * Configurator stepper (DESIGN-SYSTEM §3.8): dots joined by a line, active step
 * enlarged and filled with the accent.
 *
 * F18: when `onStepSelect` is given each step is a real button — all three are
 * always reachable (a default design is selected), so no disabling. `aria-current`
 * marks the active step; native buttons give keyboard support; ≥44px tap target.
 */
export function Stepper({
  steps,
  current,
  ariaLabel,
  onStepSelect,
  className,
}: {
  steps: Step[];
  current: number; // zero-based
  ariaLabel: string;
  onStepSelect?: (index: number) => void;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("mb-7 mt-1 flex", className)}>
      {steps.map((step, i) => {
        const active = i === current;
        const last = i === steps.length - 1;
        const base = cn(
          "relative flex-1 pt-6 text-center text-[11px] uppercase tracking-[0.06em]",
          active ? "font-semibold text-foreground" : "text-muted-foreground"
        );
        const inner = (
          <>
            <span
              aria-hidden
              className={cn(
                "absolute left-1/2 top-0 box-border -translate-x-1/2 rounded-full transition-all",
                active
                  ? "-mt-0.5 size-4 bg-primary"
                  : "size-3 border-2 border-border bg-card"
              )}
            />
            {!last && (
              <span
                aria-hidden
                className="absolute left-[calc(50%+12px)] top-[5px] h-0.5 w-[calc(100%-24px)] bg-border"
              />
            )}
            {step.label}
          </>
        );

        if (onStepSelect) {
          return (
            <button
              key={step.label}
              type="button"
              data-testid={`step-${i + 1}`}
              aria-current={active ? "step" : undefined}
              onClick={() => onStepSelect(i)}
              className={cn(
                base,
                "min-h-11 cursor-pointer transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              )}
            >
              {inner}
            </button>
          );
        }

        return (
          <div
            key={step.label}
            aria-current={active ? "step" : undefined}
            className={base}
          >
            {inner}
          </div>
        );
      })}
    </nav>
  );
}
