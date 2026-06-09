import { cn } from "@/lib/utils";

export interface Step {
  label: string;
}

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
}: {
  steps: Step[];
  current: number; // zero-based
  ariaLabel: string;
  onStepSelect?: (index: number) => void;
}) {
  return (
    <nav aria-label={ariaLabel} className="mb-7 mt-1 flex">
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
