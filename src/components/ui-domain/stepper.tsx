import { cn } from "@/lib/utils";

export interface Step {
  label: string;
}

/**
 * Configurator stepper (DESIGN-SYSTEM §3.8): dots joined by a line,
 * active step enlarged and filled with the accent.
 */
export function Stepper({
  steps,
  current,
  ariaLabel,
}: {
  steps: Step[];
  current: number; // zero-based
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="mb-7 mt-1 flex">
      {steps.map((step, i) => {
        const active = i === current;
        const last = i === steps.length - 1;
        return (
          <div
            key={step.label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "relative flex-1 pt-6 text-center text-[11px] uppercase tracking-[0.06em]",
              active ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-1/2 top-0 box-border -translate-x-1/2 rounded-full",
                active
                  ? "-mt-0.5 size-4 bg-primary"
                  : "size-3 border-2 border-border bg-card",
              )}
            />
            {!last && (
              <span
                aria-hidden
                className="absolute left-[calc(50%+12px)] top-[5px] h-0.5 w-[calc(100%-24px)] bg-border"
              />
            )}
            {step.label}
          </div>
        );
      })}
    </nav>
  );
}
