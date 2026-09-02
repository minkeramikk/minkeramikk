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

export type PillSize = "lg" | "sm";

/**
 * R4-BTN-SCALE — la taglia è l'UNICO asse nuovo (mockup vincolante
 * `docs/revision4/mockup-pill-scale.html`, §3). Forma, varianti, colori,
 * freccetta e regole di contrasto non cambiano.
 *
 * `lg` è la stringa vuota di proposito: non aggiunge e non sostituisce nulla,
 * quindi la pillola di default resta quella di oggi BIT PER BIT — è ciò che
 * tiene fermi i tre call-site fuori scope (step 1, barra sticky, drawer).
 *
 * `sm` sta tutta sul <button> anche per le parti che il bottone non rende:
 * il cerchietto icona lo passa il CHIAMANTE come prop `icon`, quindi lo si
 * raggiunge per attributo. Il selettore discendente vale (0,2,0) contro
 * (0,1,0) di `size-11`/`text-[15px]`/`size-9`: vince senza dipendere
 * dall'ordine nel foglio di stile. Padding e gap invece collidono con le
 * classi base del bottone e li risolve `cn` (tailwind-merge), che tiene
 * l'ultimo — ecco perché `SIZE[size]` passa DOPO le classi base.
 */
const SIZE: Record<PillSize, string> = {
  lg: "",
  sm:
    "gap-3 p-2 [&_[data-pill-icon]]:size-8 [&_[data-pill-icon]_svg]:size-4 " +
    "[&_[data-pill-label]]:text-[14px] [&_[data-pill-caption]]:text-[10px] " +
    "[&_[data-pill-arrow]]:size-7 [&_[data-pill-arrow]]:text-[15px]",
};

/**
 * Gemello di `SIZE.sm` prefissato `max-md:`, per lo step 2: lì la pillola è
 * `sm` sotto md e quella di oggi sopra (AC5 + AC6), e una prop non ha
 * breakpoint. Passarlo in `className` invece che come `size` tiene AC6
 * letterale: sopra md non si aggiunge NESSUNA classe nuova.
 *
 * Scritto a mano e non derivato da `SIZE.sm`: Tailwind scansiona il sorgente,
 * una classe costruita a runtime non esisterebbe nella CSS. L'allineamento tra
 * le due stringhe è coperto da `next-step-pill.test.ts`, non dalla disciplina.
 */
export const PILL_SM_UNDER_MD =
  "max-md:gap-3 max-md:p-2 max-md:[&_[data-pill-icon]]:size-8 " +
  "max-md:[&_[data-pill-icon]_svg]:size-4 max-md:[&_[data-pill-label]]:text-[14px] " +
  "max-md:[&_[data-pill-caption]]:text-[10px] max-md:[&_[data-pill-arrow]]:size-7 " +
  "max-md:[&_[data-pill-arrow]]:text-[15px]";

/** Anello del cerchietto icona — segue la stessa scala di peso della superficie. */
const ICON_RING: Record<PillVariant, string> = {
  primary: "border-2 border-primary",
  secondary: "border-[1.5px] border-primary/60",
  tertiary: "border border-border",
};

/**
 * Cerchietto che ospita l'icona. `size-11` è la taglia `lg`; a `sm` scende a
 * `size-8` per mano del bottone (`data-pill-icon`). Il touch target NON è
 * questo disco ma tutto il <button>: 71-72px a `lg`, 50-52px a `sm`, sempre
 * sopra i 44px WCAG.
 */
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
      // `data-pill-icon`: come `data-pill-label` e `data-pill-caption`, è
      // l'aggancio con cui il bottone ridimensiona un nodo che gli arriva
      // dall'esterno come prop. Un attributo, mai una classe Tailwind usata
      // come selettore.
      data-pill-icon
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full",
        ICON_RING[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Superficie per variante — la gerarchia è riempimento vs outline, non dimensione.
 *
 * R-EXTRA (card R-EXTRA-step3-gerarchia-bottoni): `secondary` = ruolo
 * "navigazione secondaria" (Back, "Bygg et nytt design"). Outline ALLEGGERITO:
 * a bordo pieno 2px competeva col primario che gli sta accanto/sopra. I valori
 * del mockup (#C9B8D4 bordo, #A08BB0 cerchietto, #7A6689 testo) sono resi come
 * opacità di `primary` + `--nav-secondary`, non come hex: il viola è editabile
 * dal back-office (ADR 0008) e deve restare agganciato.
 */
const SURFACE: Record<PillVariant, string> = {
  primary: "border-2 border-primary bg-primary/10 hover:bg-primary/20",
  // Stesso fill del terziario (`--card`, il crema di "Del settet"): secondario
  // e terziario si distinguono SOLO per intensità di bordo e testo, così il
  // bottone è identico su qualunque sfondo. Trasparente no: prendeva il colore
  // della superficie e cambiava faccia tra step 2 (rosa) e step 3 (card).
  secondary: "border-[1.5px] border-primary/40 bg-card hover:bg-primary/5",
  tertiary: "border border-border bg-card hover:border-ring",
};

export function NextStepPill({
  icon,
  label,
  caption,
  arrow = false,
  variant = "primary",
  size = "lg",
  type = "button",
  onClick,
  disabled,
  className,
  ...rest
}: {
  icon: React.ReactNode;
  label: string;
  caption?: string;
  /** R4-FIX Ⓕ: a node here rides INSIDE the same circle instead of the chevron
   *  — the order form swaps it for a spinner while the order is leaving. */
  arrow?: boolean | React.ReactNode;
  variant?: PillVariant;
  /** R4-BTN-SCALE: `lg` (default) = la pillola di sempre. `sm` = i tier bassi. */
  size?: PillSize;
  /** R4-FIX Ⓕ: the order form submits with the pill, so it needs to BE the
   *  submit — a `<button type="button">` inside a form does nothing. Default
   *  unchanged, so every existing call-site keeps today's behaviour. */
  type?: "button" | "submit";
  /** Optional for the same reason: a submit pill waits for the Turnstile token
   *  and for the send to finish. */
  onClick?: () => void;
  disabled?: boolean;
  /** R4-STEP2-KEYBOARD ③: la riga nav dello step 2 si sposta al blur, e il blur
   *  arriva PRIMA del click — chi tocca «Neste» col campo a fuoco colpirebbe il
   *  vuoto. Il call-site previene il default del mousedown, che è ciò che
   *  toglie il focus; passa di qui perché il bottone è questo. */
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  "aria-busy"?: boolean;
  // Niente `aria-label`: il nome accessibile DEVE restare caption + label
  // visibili (WCAG 2.5.3, chi usa il comando vocale pronuncia ciò che legge).
  // La prop non è dichiarata apposta — così riaggiungerla costa un errore di
  // TypeScript invece di una regressione silenziosa.
  "data-testid"?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // `min-w-0`: da flex item il bottone avrebbe `min-width: auto` e non
        // scenderebbe sotto il proprio contenuto — la riga Tilbake+pillola dello
        // step 2 misurava 466px di min-content e sforava il viewport a 360/390/412
        // e anche a 768. Il `min-w-0` dello span interno non serve a niente finché
        // il bottone stesso non può restringersi.
        "flex min-w-0 items-center gap-3.5 rounded-full p-3 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
        "disabled:opacity-50",
        SIZE[size],
        SURFACE[variant],
        className
      )}
      {...rest}
    >
      {icon}
      <span className="min-w-0 flex-1">
        {caption && (
          // `data-pill-caption`: hook for the callers that need to drop the
          // caption in a specific layout (R4-STEP2 hides it under md in the
          // step-2 editor row) — an attribute, never a Tailwind class as a
          // selector. Nothing else changes here.
          <span
            data-pill-caption
            className="block text-[11px] uppercase tracking-[0.08em] text-foreground/75"
          >
            {caption}
          </span>
        )}
        <span
          // `data-pill-label`: twin of `data-pill-caption` above — R4-STEP2
          // hides THIS one under md on the step-2 pill, where the mockup's
          // button is the short caption alone («Neste steg ›»).
          data-pill-label
          className={cn(
            "block truncate text-[15px] font-semibold",
            // font-weight 500, NON bold: correzione card 2026-07-21 — il
            // secondario alleggerito non deve pesare quanto il primario.
            variant === "secondary" && "font-medium text-nav-secondary",
            variant === "tertiary" && "text-muted-foreground"
          )}
        >
          {label}
        </span>
      </span>
      {arrow && (
        <span
          aria-hidden
          // `data-pill-arrow`: aggancio di taglia, come per icona/label/caption.
          data-pill-arrow
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-lg leading-none text-primary-foreground"
        >
          {arrow === true ? "›" : arrow}
        </span>
      )}
    </button>
  );
}
