# minkeramikk/web — dev shortcuts
#
# Suite e2e snella (riscritta 2026-06-17). 8 journey ↔ docs/release/ACCEPTANCE.md.
#   make run-e2e-core   → OGNI PR (bloccante): i 6 journey core (desktop+mobile).
#   make run-e2e        → suite intera (core + supplier-pdf + share-set). La lancia
#                         Daniele, VERDE prima di aggiornare `preview` e al go-live.
#   make test-email     → OPT-IN: un solo ordine che invia email REALI alla casella
#                         dedicata (default dangeli88.daniele+mke2e@gmail.com).
#   make run-e2e-grep G=cart → una spec singola.
#
# Email: la suite core/full gira con RESEND disattivata (transport no-op → ZERO
# invii). L'ordine viene comunque creato e la conferma testata.
#
# Turnstile: la build e2e usa NEXT_PUBLIC_TURNSTILE_SITE_KEY VUOTA, così il widget
# emette il token di test always-pass (il server, senza TURNSTILE_SECRET_KEY, usa
# il secret always-pass). Senza questo, una site key invalida romperebbe l'invio.

SHELL := /bin/bash

NODE_WANTED := $(shell cat .nvmrc)
NODE_ACTUAL := $(shell node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')

# Casella dedicata per il test invio reale (override: make test-email E2E_EMAIL_TO=...).
E2E_EMAIL_TO ?= dangeli88.daniele+mke2e@gmail.com

# CORE = i 6 journey critici (per-PR). supplier-pdf e share-set stanno nella full.
CORE_SPECS := e2e/configurator.spec.ts e2e/config-code.spec.ts e2e/cart.spec.ts \
	e2e/order.spec.ts e2e/admin-auth.spec.ts e2e/admin-orders.spec.ts

.PHONY: check-node build run-e2e run-e2e-core run-e2e-grep test-email

check-node:
	@if [ "$(NODE_ACTUAL)" != "$(NODE_WANTED)" ]; then \
		echo "✗ Node attivo: $(NODE_ACTUAL) — serve $(NODE_WANTED) (.nvmrc). Esegui: nvm use"; \
		exit 1; \
	fi
	@echo "✓ Node $(NODE_WANTED)"

# La build e2e azzera la site key Turnstile (vedi testata). Override del client a
# build-time: una var d'ambiente vince sui file .env*.
build: check-node
	NEXT_PUBLIC_TURNSTILE_SITE_KEY= npm run build

# gate per ogni PR — desktop + mobile dei 6 journey core
run-e2e-core: build
	npx playwright test $(CORE_SPECS) --project=desktop --project=mobile

# suite intera (no email, no evidence) — gate manuale prima di `preview` / go-live
run-e2e: build
	npx playwright test --project=desktop --project=mobile

# OPT-IN: un solo ordine invia email reali alla casella dedicata
test-email: build
	MK_E2E_REAL_EMAIL=1 E2E_EMAIL_TO=$(E2E_EMAIL_TO) \
		npx playwright test --project=email

# una spec singola: make run-e2e-grep G=cart
run-e2e-grep: build
	npx playwright test e2e/$(G).spec.ts

# ── DB a due ambienti (2026-07-16) ─────────────────────────────────────────
# STAGING = progetto Supabase VECCHIO (rqhsb…, quello di .env.local: app locale,
#           suite RLS, e2e). Qui si testano le migration di una card.
# PROD    = progetto NUOVO org tech (lfphy…, Vercel). Push SOLO al merge.
# Credenziali in .env.migration (gitignorato, dal giorno dell'handover).
# Ogni DB traccia le proprie migration applicate → il CLI applica solo le mancanti.
# Si bypassa `supabase link` (--db-url esplicito): il ref linkato è irrilevante.
# NB: se una password contiene caratteri speciali va URL-encodata nella stringa.

.PHONY: db-push-staging db-push-prod db-status

db-push-staging:
	@set -a && . ./.env.migration && set +a && \
	echo ">> push migration su STAGING ($$OLD_PROJECT_REF — DB vecchio)" && \
	supabase db push --db-url "postgresql://$$OLD_DB_USER:$$OLD_DB_PASSWORD@$$OLD_DB_HOST:$$OLD_DB_PORT/postgres"

db-push-prod:
	@set -a && . ./.env.migration && set +a && \
	echo "!! Stai per pushare su PRODUZIONE ($$NEW_PROJECT_REF). Scrivi 'si' per confermare:" && \
	read conferma && [ "$$conferma" = "si" ] && \
	supabase db push --db-url "postgresql://$$NEW_DB_USER:$$NEW_DB_PASSWORD@$$NEW_DB_HOST:$$NEW_DB_PORT/postgres" || \
	{ echo "annullato."; exit 1; }

# stato migration su entrambi gli ambienti (Local = file nel repo)
db-status:
	@set -a && . ./.env.migration && set +a && \
	echo "── STAGING ($$OLD_PROJECT_REF) ──" && \
	supabase migration list --db-url "postgresql://$$OLD_DB_USER:$$OLD_DB_PASSWORD@$$OLD_DB_HOST:$$OLD_DB_PORT/postgres" ; \
	echo "── PROD ($$NEW_PROJECT_REF) ──" && \
	supabase migration list --db-url "postgresql://$$NEW_DB_USER:$$NEW_DB_PASSWORD@$$NEW_DB_HOST:$$NEW_DB_PORT/postgres"
