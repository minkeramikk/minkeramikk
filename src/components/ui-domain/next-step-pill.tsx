"use client";

import { cn } from "@/lib/utils";

/**
 * R-EXTRA — CTA "a pillola" del configuratore (DESIGN-SYSTEM §3.16).
 * Cerchietto icona · caption+label · freccetta cerchiata SOLO quando l'azione
 * fa avanzare l'utente nel funnel. Usata negli step 1, 2 e nello stack azioni
 * del carrello (step 3); sostituisce il bottone pieno classico e il teaser CA-6.
 *
 * Non è un wrapper di `Button` (shadcn): quello ha altezze fisse (`h-9` su
 * size="lg") e `rounded-lg`, incompatibili con la forma pill a due righe. Stesso
 * approccio del teaser che questa card rimuove: `<button>` nudo con classi proprie.
 */
export type PillVariant = "primary" | "secondary" | "tertiary";

/** Cerchietto che ospita l'icona. Da solo vale il touch target ≥44px (size-11). */
export function PillIcon({
  children,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  variant?: PillVariant;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border-2",
        variant === "tertiary" ? "border-border" : "border-primary",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Superficie per variante — la gerarchia è riempimento vs outline, non dimensione. */
const SURFACE: Record<PillVariant, string> = {
  primary: "border-2 border-primary bg-primary/10 hover:bg-primary/20",
  secondary: "border-2 border-primary bg-card hover:bg-primary/5",
  tertiary: "border border-border bg-card hover:border-ring",
};

export function NextStepPill({
  icon,
  label,
  caption,
  arrow = false,
  variant = "primary",
  onClick,
  className,
  ...rest
}: {
  icon: React.ReactNode;
  label: string;
  caption?: string;
  arrow?: boolean;
  variant?: PillVariant;
  onClick: () => void;
  className?: string;
  // Niente `aria-label`: il nome accessibile DEVE restare caption + label
  // visibili (WCAG 2.5.3, chi usa il comando vocale pronuncia ciò che legge).
  // La prop non è dichiarata apposta — così riaggiungerla costa un errore di
  // TypeScript invece di una regressione silenziosa.
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3.5 rounded-full p-3 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
        SURFACE[variant],
        className
      )}
      {...rest}
    >
      {icon}
      <span className="min-w-0 flex-1">
        {caption && (
          <span className="block text-[11px] uppercase tracking-[0.08em] text-foreground/75">
            {caption}
          </span>
        )}
        <span
          className={cn(
            "block truncate text-[15px] font-semibold",
            variant === "tertiary" && "text-muted-foreground"
          )}
        >
          {label}
        </span>
      </span>
      {arrow && (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-lg leading-none text-primary-foreground"
        >
          ›
        </span>
      )}
    </button>
  );
}
