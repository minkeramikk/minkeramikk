# ADR 0008 — Theming: 3 token semantici gestiti dal back-office

**Stato**: Accepted · 2026-06-05

## Contesto

Il gestore vuole poter cambiare l'aspetto del sito senza sviluppatore. Il template
visivo di partenza è realizzato dal fornitore (Daniele) con strumenti di design e
tradotto in tema. Serve un equilibrio tra libertà e robustezza: un theming completo
(decine di variabili) è ingestibile per un non designer.

## Decisione

- **3 token semantici** modificabili dal back-office: `color_light` (sfondi e superfici),
  `color_dark` (testi e superfici scure), `color_accent` (CTA, selezioni, evidenze).
- Persistiti nella tabella `settings` (riga singola); iniettati come CSS variables nel
  layout; le sfumature intermedie (bordi, hover, badge) sono **derivate** via
  `color-mix()` — non si gestiscono a mano.
- **Check di contrasto automatico** (WCAG AA) nel back-office prima del salvataggio:
  se accent su light o dark su light non è leggibile, avviso bloccante con suggerimento.
- Il template iniziale (Claude design, a cura del fornitore) viene tradotto in tema
  Tailwind + token: il design system del sito È il template, i 3 colori lo pilotano.
- Scartato: import di temi come file arbitrari (motore di theming fuori scala per un
  sito singolo) e palette estese liberamente modificabili (superficie di errore).

## Conseguenze

- (+) Il gestore cambia l'aspetto in sicurezza; impossibile rompere la leggibilità.
- (+) Anteprima live nel back-office prima di pubblicare (gratis: sono CSS variables).
- (−) Personalizzazioni oltre i 3 colori richiedono uno sviluppatore (accettato, by design).

## Note di implementazione (F11a, 2026-06-09)

L'editor `/admin/theme` e il gate AA bloccante sono stati implementati in F11a. Dettagli che
fissano il **contratto** del gate (prima impliciti, qui resi espliciti):

- **Tre coppie controllate** (in `theme-contrast.ts`, replica delle derivazioni di `globals.css`):
  1. **text** — `dark` su `light` (testo/sfondo).
  2. **accent** — `primary-foreground` su `accent`, dove
     `primary-foreground = color-mix(in oklab, accent, white 92%)`.
  3. **muted** — `muted-foreground` su `light` (**background**), dove
     `muted-foreground = color-mix(in oklab, dark, light 38%)`.
  Le percentuali (92%, 38%) **devono restare allineate a `globals.css`**: se lì cambia una
  derivazione, va aggiornata anche qui o il gate controlla un colore fantasma.
- **Decisione sulla coppia (3)** — il gate guarda `muted-foreground` **su background**, non su
  `muted`. Motivo: il testo muted/secondario vive sul background del sito, ed è lì che la
  leggibilità conta. Letteralmente `muted-foreground` **su `muted`** dà **4.06** sul tema
  shipped di default: un gate bloccante a 4.5 su quella coppia **rifiuterebbe il tema attuale**.
  Quel 4.06 sopravvive solo in punti transitori/marginali (hover dei badge-link; l'hint
  dell'editor è stato portato a `text-foreground`) → **consapevolmente non gated**. Se in futuro
  comparisse testo di contenuto su superficie `muted`, va aggiunta la quarta coppia **e** ritarata
  la derivazione del default.
- **Gate ri-verificato server-side** nella server action (defense-in-depth): il client blocca il
  Save, ma anche il salvataggio rifiuta un tema sub-AA. Salvataggio = mutazione `authenticated`
  (RLS `settings`, 0002), zod, service-role mai nel client; `revalidatePath("/", "layout")`
  ri-tematizza il pubblico.
- **`getThemeTokens`** (era uno stub) ora legge `settings`: senza questo il pubblico non
  rifletteva il tema salvato.
