# minkeramikk/web — dev shortcuts
#
# Politica test e2e (decisa 2026-06-12, fase di iterazione UI):
#   make run-e2e-core   → OGNI PR (bloccante): flussi di dominio completi.
#   make run-e2e        → suite intera (core + UI/layout). La lancia Daniele,
#                         OBBLIGATORIA VERDE prima di aggiornare il branch
#                         `preview` (è ciò che vede il cliente) e al go-live.
#   Rossi noti della suite intera: vedi ../docs/pm/E2E-QUARANTINE.md.
#
# Il webServer di Playwright avvia `npm run start -p 3199` (serve la build PROD:
# qui si builda prima, sempre). `reuseExistingServer: true` → un server già
# attivo sulla 3199 viene riusato.

SHELL := /bin/bash

NODE_WANTED := $(shell cat .nvmrc)
NODE_ACTUAL := $(shell node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')

# CORE = dominio e flussi completi: carrello/step3 (f03), config code (f04),
# invio ordine (f05), login/guard admin (f06), gestione ordini (f07),
# persistenza carrello/drawer (f16). Niente spec di puro layout qui.
CORE_SPECS := e2e/f03.spec.ts e2e/f04.spec.ts e2e/f05.spec.ts \
	e2e/f06.spec.ts e2e/f07.spec.ts e2e/f16.spec.ts

.PHONY: check-node build run-e2e run-e2e-core run-e2e-grep

check-node:
	@if [ "$(NODE_ACTUAL)" != "$(NODE_WANTED)" ]; then \
		echo "✗ Node attivo: $(NODE_ACTUAL) — serve $(NODE_WANTED) (.nvmrc). Esegui: nvm use"; \
		exit 1; \
	fi
	@echo "✓ Node $(NODE_WANTED)"

build: check-node
	npm run build

# gate per ogni PR
run-e2e-core: build
	npx playwright test $(CORE_SPECS)

# suite intera — gate manuale prima di push su `preview` / go-live
run-e2e: build
	npx playwright test

# una spec singola: make run-e2e-grep G=f18
run-e2e-grep: build
	npx playwright test e2e/$(G).spec.ts
