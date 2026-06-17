# ADR 0008 — Theming: 3 token semantici gestiti dal back-office

**Stato**: Accepted · 2026-06-05 · Implementato in F11a (2026-06-09)

## Contesto

Il gestore vuole cambiare l'aspetto del sito senza sviluppatore. Un theming completo
(decine di variabili) è ingestibile per un non designer: serve equilibrio tra libertà e
robustezza.

## Decisione

- **3 token semantici** dal back-office: `color_light` (sfondi), `color_dark` (testi),
  `color_accent` (CTA/evidenze). Persistiti in `settings` (riga singola), iniettati come
  CSS variables; sfumature (bordi, hover, badge) **derivate via `color-mix()`**.
- **Gate di contrasto WCAG AA bloccante** prima del salvataggio, **ri-verificato
  server-side** nella server action (defense-in-depth; mutazione `authenticated`, zod,
  `revalidatePath("/", "layout")`).
- Scartato: import di temi arbitrari e palette estese liberamente modificabili (superficie d'errore).

## Conseguenze

- (+) Il gestore cambia l'aspetto in sicurezza, con anteprima live; leggibilità non rompibile.
- (−) Personalizzazioni oltre i 3 colori richiedono uno sviluppatore (by design).

## Contratto del gate AA (F11a)

Tre coppie controllate in `theme-contrast.ts`, che **replica le derivazioni di
`globals.css`** — le percentuali devono restare allineate o il gate controlla un colore
fantasma:

1. **text** — `dark` su `light`.
2. **accent** — `primary-foreground` su `accent` (`primary-foreground = color-mix(in oklab, accent, white 92%)`).
3. **muted** — `muted-foreground` su **background** (`muted-foreground = color-mix(in oklab, dark, light 38%)`).

La coppia (3) guarda il background, non `muted`: su `muted` il default shipped dà **4.06**,
quindi un gate a 4.5 lì rifiuterebbe il tema attuale. Quel 4.06 sopravvive solo in punti
marginali (hover badge-link) → **consapevolmente non gated**. Se comparirà testo di
contenuto su `muted`, aggiungere la quarta coppia e ritarare il default.
