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
