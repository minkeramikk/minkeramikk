# ADR 0026 — Testi pubblici editabili: i file JSON restano la base, il DB porta le deviazioni

**Stato**: Accepted · 2026-09-02

## Contesto

I testi del sito pubblico vivono in `src/i18n/messages/{no,en}.json` (242 chiavi NO, 243 EN) e
si cambiano solo con un commit e un deploy nostro. Il cliente (Alessio, Iselin) vuole
correggerli da sé — R4-I18N, richiesta del 2026-08-25.

Due forze in tensione. Da una parte la parità NO↔EN, oggi garantita da un unit sui file
(`src/i18n/messages.test.ts`) ed è ciò che impedisce a una pagina di renderizzare una chiave
mancante. Dall'altra il fatto che il pubblico non può dipendere da una scrittura del back
office: se il DB tace, il sito deve restare in piedi.

Esiste già in casa il pattern «impostazione nel DB con cache + revalidate»: i tre token del
tema (ADR 0008, tabella `settings`, `src/lib/theme.server.ts`). Questo ne è il gemello per i
testi.

## Decisione

I **file JSON restano la base** e la fonte del test di parità. Una tabella additiva
`i18n_overrides (locale, key, value, updated_at)` porta le **sole deviazioni**.

1. **Un solo punto di composizione**: `src/i18n/request.ts`. I messaggi che next-intl riceve
   sono `file + override`, sempre, per tutti.
2. **Il file vince quando il DB non c'è**: override assente, tabella non ancora applicata, query
   in errore, `unstable_cache` chiamata fuori dal contesto di richiesta → si servono i file. Il
   sito pubblico non ha modo di rompersi per un pannello admin.
3. **L'editor non può creare chiavi.** Si applica un override solo se la chiave esiste già nei
   file, come stringa. La parità NO↔EN resta garantita dai file e dal loro test; il DB non la
   può aggirare. Il salvataggio scrive NO ed EN in un solo upsert: non esiste «salvo solo il
   norvegese».
4. **Whitelist di namespace**: si espongono i namespace di contenuto; le chiavi tecniche
   (`_review`, marcatore EN-only della bozza di traduzione) restano fuori.
5. **Validazione bloccante dei segnaposto ICU**: l'override deve avere gli stessi segnaposto
   dell'originale — stesso nome e stesso tipo (`{name}`, `{count, plural, …}`, `<link>`).
   Si confrontano parsando con lo **stesso parser ICU** che next-intl usa a runtime, non con
   una regex sulle graffe.
6. **Cache `unstable_cache` con tag `i18n`**, invalidata dalla server action al salvataggio,
   come il tema.

**Alternative scartate.** (i) *Editare i file JSON da un'interfaccia* (commit + redeploy da
GitHub API): rende il cliente dipendente dalla nostra pipeline e mette una scrittura di
repository dietro una sessione admin. (ii) *Spostare TUTTI i testi nel DB*: si perde il test di
parità, si perde la revisione in code review, e i testi diventano invisibili in `git log`.
(iii) *Una tabella per lingua o una colonna per lingua* (`value_no`, `value_en`): il merge
diventa asimmetrico e il giorno che si aggiunge una terza lingua è una migration; `(locale, key)`
no.

## Conseguenze

- (+) Iselin corregge un testo e il sito lo mostra al refresh. Nessun deploy.
- (+) Il pubblico degrada ai file in ogni scenario di errore, incluso «migration non ancora
  applicata».
- (+) La parità NO/EN resta difesa dove è sempre stata: sui file, da un unit.
- (−) I testi vivono in due posti: il file e, per le chiavi toccate, il DB. Chi legge il JSON
  non vede più necessariamente ciò che il sito mostra. Mitigazione: l'editor marca le chiavi
  con override, e la ricompattazione nei file resta un lavoro di manutenzione previsto.
- (−) Le mail (`email-html.ts`, `status-email.ts`) e il PDF cliente
  (`customer-pdf-content.ts`) **restano fuori**: rendono fuori da un contesto di richiesta e
  hanno le loro tabelle `COPY`. Portarli dentro è una decisione separata (R4-I18N, DECISIONE D1).
- (?) Nessun versioning degli override: il reset per chiave torna al file, non a un valore
  precedente. Se servisse uno storico, è un ADR nuovo.
