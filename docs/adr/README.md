# Architecture Decision Records

Decisioni tecniche del progetto, una per file, immutabili una volta accettate
(si supera con un nuovo ADR che marca il vecchio `Superseded`).

Formato: MADR semplificato (Stato / Contesto / Decisione / Conseguenze).
Nuova decisione architetturale = nuovo ADR numerato + riga qui sotto + eventuale
aggiornamento delle regole in `../../AGENTS.md`.

> Pass di consolidamento (2026-06-17, prodotto chiuso): testi snelliti e stati allineati
> alla realtà. Le **decisioni** non sono cambiate; da qui in avanti vale di nuovo
> l'immutabilità (un cambio di rotta = nuovo ADR).

| # | Titolo | Stato |
|---|---|---|
| [0001](0001-bilingue-no-en.md) | Sito bilingue NO/EN dal giorno 1 | Accepted |
| [0002](0002-riuso-logica-legacy-niente-scraping.md) | Riuso logica configuratore legacy, data layer riscritto | Accepted |
| [0003](0003-single-tenant.md) | Single-tenant, schema predisposto al multi-tenant | Accepted |
| [0004](0004-modello-catalogo-unificato.md) | Catalogo unificato: categorie `image\|color`, niente tabella palettes | Accepted |
| [0005](0005-money-value-object.md) | Prezzi: Money VO, minor units + currency | Accepted |
| [0006](0006-suppliers-anagrafica-operativa.md) | Suppliers come anagrafica operativa, non tenant | Accepted · parz. superato da 0007 |
| [0007](0007-catalogo-multi-fornitore.md) | Catalogo multi-fornitore: il design aggancia il fornitore | Accepted |
| [0008](0008-theming-tre-token.md) | Theming: 3 token semantici dal back-office | Accepted |
| [0009](0009-supplier-name-pubblico.md) | Il nome del fornitore è pubblico, i contatti no | Accepted |
| [0010](0010-layer-asset-espliciti.md) | Asset di compositing espliciti (`options.layer_image`) | Accepted |
| [0011](0011-grammatica-config-code.md) | Grammatica del codice di configurazione (`MK-D-s1-s2…`) | Accepted |
| [0012](0012-opzioni-colore-immagine-swatch.md) | Opzioni colore con immagine swatch reale (CHECK rilassato) | Accepted |
| [0013](0013-deploy-email-antibot-fail-closed.md) | Deploy: email/anti-bot fail-closed in produzione (reminder go-live) | Accepted |
| [0014](0014-hosting-vps-supabase-cloud-cloudflare.md) | Hosting: VPS + Supabase Cloud + Cloudflare | Deferred (Vercel free per ora, 2026-06-09) |
| [0015](0015-prezzi-multi-zona-e-spedizione.md) | Prezzi multi-zona e spedizione a soglia (change-order F20) | Proposed · parcheggiato (solo NOK, 2026-06-16) |
| [0016](0016-featured-configs-curation.md) | Featured configs: curation by config code, thumb pre-composta | Accepted |
| [0017](0017-design-product-whitelist.md) | Supporti per design: whitelist design→prodotti (estende 0007) | Accepted |
| [0018](0018-supplier-colour-palette.md) | Palette glasse per fornitore: opzioni colore normalizzate su `supplier_colors` (revisiona in parte 0012) | Accepted |
| [0019](0019-design-photos-gallery.md) | Galleria foto lifestyle per design: tabella `design_images` + Storage `design-photos/` (F36) | Accepted |

Diagramma del modello dati e indici: [schema-er.md](schema-er.md) (deriva da ADR 0004–0008).
