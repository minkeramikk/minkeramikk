# ADR 0017 — Supporti per design: whitelist design→prodotti

**Stato**: Accepted · 2026-07-16

## Contesto

La catena del catalogo è **design → fornitore → TUTTI i prodotti del fornitore**
(ADR 0007): allo step 3 il configuratore filtra i prodotti solo per `supplier_id` +
`visible`. Non esiste una relazione diretta design↔prodotto.

Caso reale (feedback Alessio, 2026-07-11): il design *Alici Circle* si produce **solo**
sul supporto *Cappello di prete*, ma il configuratore offre tutte le ceramiche del
fornitore. Serve poter dire: **"questo design esiste solo su questo sottoinsieme di
supporti (anche uno solo)"**. È un change-order (F34), prezzato prima del merge.

## Decisione

Tabella ponte **`design_products`** (`design_id`, `product_id`, PK composta) come
**whitelist opzionale** per design.

- **Semantica retro-compatibile:** design **senza righe** → tutti i prodotti visibili del
  fornitore (comportamento attuale, zero backfill sui 6 design esistenti); design **con
  righe** → solo quei prodotti, sempre **∩ visibili** e ordinati per `sort_order` (un
  prodotto in whitelist ma `visible=false` resta nascosto).
- **Granularità = design↔prodotto.** Il livello opzione/colore↔prodotto è fuori scope.
- **Si edita dal lato design** ("questo design va solo su questi supporti"). Il lato
  prodotto è additivo e fuori scope.
- **Ceramiche nuove:** design su "tutte" → un prodotto nuovo del fornitore è incluso
  automaticamente; design su "solo selezionati" → resta escluso finché non viene spuntato.
- **Vincolo stesso fornitore** (design e prodotto condividono `supplier_id`): validato
  sia **applicativamente** nella server action (messaggio friendly) sia da un **trigger**
  `BEFORE INSERT OR UPDATE` sul DB (defense in depth).
- **Salvataggio atomico** via RPC `replace_design_products` (delete + insert in una
  transazione, come `replace_product_attributes`): niente stato intermedio vuoto.
- **RLS:** SELECT pubblico (serve al configuratore anon), scrittura solo `authenticated`
  (pattern del catalogo, `0002_rls.sql`). ON DELETE CASCADE su entrambi i lati.

**Alternativa scartata — "alias fornitore"** (duplicare i prodotti sotto un fornitore
finto per il design ristretto). Rompe:
1. il badge fornitore pubblico (ADR 0009),
2. lo split PDF/email per fornitore (ADR 0007),
3. l'integrità dello storico ordini,
4. e duplica i dati del catalogo.

Questo ADR **estende ADR 0007 senza sostituirlo**: il fornitore resta l'aggancio; la
whitelist restringe DENTRO il suo catalogo.

## Conseguenze

- (+) Un design può vivere su un solo supporto senza duplicare prodotti né rompere
  badge, PDF o storico ordini.
- (+) Zero backfill: i design esistenti restano identici (no-rows = tutti).
- (+) Il vincolo same-supplier è garantito a due livelli (app + DB).
- (−) Il filtro pubblico è **UX, non sicurezza**: `create_order` NON rivalida la coppia
  design/prodotto (finto e-commerce, snapshot fidati — coerente con F05). Una riga di
  carrello salvata prima della restrizione può essere riordinata. Limite accettato.
- (?) Se emergerà la necessità di whitelist a livello opzione/colore↔prodotto, sarà un
  ADR successivo.
