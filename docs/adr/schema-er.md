# Schema ER — minkeramikk.no

Diagramma del modello dati deciso in [ADR 0004](0004-modello-catalogo-unificato.md)
(catalogo unificato), [ADR 0005](0005-money-value-object.md) (Money) e
[ADR 0006](0006-suppliers-anagrafica-operativa.md) (suppliers).
Naming DB: **inglese**, snake_case (vedi convenzioni in `../../AGENTS.md`).
Questo file è la rappresentazione visiva: la fonte normativa restano gli ADR.

```mermaid
erDiagram
    suppliers ||--o{ designs : "owns"
    designs ||--o{ option_categories : "has"
    option_categories ||--o{ options : "contains"
    suppliers ||--o{ products : "supplies"
    suppliers ||--o{ order_items : "fulfills"
    orders ||--|{ order_items : "contains"
    products o|--o{ order_items : "referenced by"

    designs {
        uuid id PK
        uuid supplier_id FK "NOT NULL (ADR 0007)"
        text slug UK
        text name "nome proprio, non tradotto"
        text description_no
        text description_en
        text preview_image
        int sort_order
        bool active
    }

    option_categories {
        uuid id PK
        uuid design_id FK
        text slug
        text label_no
        text label_en
        text kind "image | color (CHECK)"
        text layer_slot "base|mid|top|extra|detail|animal"
        text sync_group "nullable - lock colori (ADR 0004)"
        int sort_order
    }

    options {
        uuid id PK
        uuid category_id FK
        text name
        text image "valorizzata se kind=image (CHECK)"
        text hex "valorizzato se kind=color (CHECK)"
        int sort_order
        bool active
    }

    suppliers {
        uuid id PK
        text name
        text email
        text phone
        text notes
        bool active
        int sort_order
    }

    settings {
        int id PK "riga singola (CHECK id=1)"
        text color_light "tema, ADR 0008"
        text color_dark
        text color_accent
        timestamptz updated_at
    }

    products {
        uuid id PK
        text slug UK
        uuid supplier_id FK "NOT NULL (ADR 0007)"
        text name_no
        text name_en
        text description_no
        text description_en
        int price_cents "minor units (ADR 0005)"
        char_3 currency "ISO 4217, default NOK"
        text image
        bool visible
        int sort_order
    }

    orders {
        uuid id PK
        text code UK "es. MK-2606"
        text customer_name
        text email
        text phone
        text message
        text locale "no | en - lingua email cliente"
        order_status status "enum"
        text internal_notes
        timestamptz created_at
        timestamptz updated_at
    }

    order_items {
        uuid id PK
        uuid order_id FK
        uuid supplier_id FK "NOT NULL, RESTRICT - fatto storico della riga (ADR 0007)"
        text supplier_name_snapshot
        uuid product_id FK "nullable, ON DELETE SET NULL"
        text product_name_snapshot
        int price_cents_snapshot
        char_3 currency_snapshot
        text config_code "formato nuovo (ADR 0002), ricaricabile"
        jsonb config_snapshot "riassunto leggibile della configurazione"
        int quantity
    }
```

Enum `order_status`: `new → contacted → confirmed → in_production → delivered` (+ `cancelled`).

## Indici

| Indice | Motivo |
|---|---|
| `orders.code` UNIQUE | già implicito nel vincolo |
| `orders (status, created_at DESC)` | la query del back-office: "nuove, più recenti prima" |
| `order_items.order_id` | join ordine → righe |
| `order_items.config_code` | ricerca ordine da codice incollato (telefono col cliente) |
| `options.category_id` | join categoria → varianti |
| `option_categories.design_id` | join design → categorie |
| `products.supplier_id` | filtro step 3 del configuratore + back-office (ADR 0007) |
| `designs.supplier_id` | catalogo per fornitore (ADR 0007) |
| `order_items.supplier_id` | split PDF/email per laboratorio e filtro ordini per fornitore (ADR 0007) |
| `orders.email` | storico ordini dello stesso cliente nel back-office |

Vincoli aggiuntivi: `UNIQUE(design_id, slug)` su option_categories (slug di categoria
unici dentro il design, non globali).

Niente GIN su `config_snapshot`: nessuna query dentro il jsonb prevista.

## Semantica ON DELETE (esplicita, per la migration)

| FK | Regola | Razionale |
|---|---|---|
| `designs.supplier_id`, `products.supplier_id` | **RESTRICT** | NOT NULL: un fornitore con catalogo non si cancella — si disattiva (`suppliers.active=false`) |
| `order_items.product_id` | SET NULL (FK nullable) | gli ordini sono storia: sopravvivono al prodotto grazie agli snapshot |
| `order_items.order_id`, `options.category_id`, `option_categories.design_id` | CASCADE | i figli non hanno senso senza il padre |

## Note di lettura

- La configurazione di un item non ha FK verso designs/options: vive in `config_code`
  (ricaricabile nel configuratore) e `config_snapshot` (leggibile per sempre, anche se
  il catalogo cambia). Scelta deliberata: gli ordini sono storia immutabile, il catalogo no.
- `suppliers` non è mai esposto al pubblico: solo back-office (ADR 0006). La scelta del
  design aggancia il fornitore per l'articolo; carrello misto consentito; PDF d'ordine
  per laboratorio generato uno per fornitore (ADR 0007).
- `settings`: riga singola coi 3 token tema, lettura pubblica, scrittura authenticated (ADR 0008).
- RLS: catalogo in lettura pubblica (`active`/`visible`), scrittura authenticated;
  orders/order_items insert pubblico, lettura/modifica solo authenticated;
  suppliers solo authenticated.
