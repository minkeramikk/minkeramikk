# minkeramikk.no — web

App Next.js 15 (App Router, TypeScript, Tailwind v4, shadcn/ui).

## Avvio

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build di produzione
npm run lint     # eslint
```

## Struttura

```
src/
├── app/
│   ├── layout.tsx              # root layout (font, lang=no, metadata)
│   ├── (public)/               # sito pubblico — header/footer condivisi
│   │   ├── layout.tsx
│   │   ├── page.tsx            # home
│   │   ├── produkter/          # catalogo prodotti
│   │   └── bygg-din-design/    # configuratore 3 step
│   ├── admin/                  # back-office (protetto da Supabase Auth, TODO middleware)
│   │   ├── layout.tsx
│   │   ├── page.tsx            # ordini
│   │   └── login/
│   └── api/
│       └── orders/route.ts     # POST ordine (TODO: zod + Turnstile + Supabase + Resend)
├── components/
│   ├── site/                   # componenti del sito (header, footer, …)
│   └── ui/                     # shadcn/ui (generati, modificabili)
└── lib/
    └── utils.ts                # cn() helper
```

## Convenzioni

- **Route pubbliche in norvegese** (`/produkter`, `/bygg-din-design`), come il sito attuale.
- **Server components di default**; `"use client"` solo dove serve interattività (configuratore, form).
- **Letture** dal DB direttamente nei server components; **scritture** sempre via API routes.
- Componenti shadcn aggiunti con `npx shadcn@latest add <nome>`.

## Tema

Estratto dal sito Squarespace attuale (`docs/stack-tecnologico.md` per contesto):

| Token | Valore | Uso |
|---|---|---|
| `background` | `#fcf0f0` | crema rosata |
| `foreground` / `primary` | `#531a4a` | prugna (testo, bottoni) |
| `accent` | `#ae9def` | lavanda |
| `secondary` | `#d1c8f4` | lavanda chiara |
| `destructive` | `#9b2929` | mattone |

Font (self-hosted via `next/font`): **Shrikhand** per i titoli (`font-heading`), **Bitter** per il testo (`font-sans`). Utility `rounded-mk` = raggio asimmetrico 45px/0 dei bottoni del sito attuale.

## Prossimi step

1. ~~Tema (colori/font del sito attuale) in `globals.css`~~ ✓
2. Setup Supabase (client, schema, migrazioni)
3. Middleware auth per `/admin`
4. Configuratore (layer PNG + mix-blend-mode)
