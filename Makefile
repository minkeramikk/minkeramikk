# minkeramikk/web — dev shortcuts
# Uso: make run-e2e            (suite intera: desktop + mobile + evidence)
#      make run-e2e-config     (solo le spec del configuratore — gate PR che toccano la suite)
#      make run-e2e-grep G=f18 (una spec o pattern singolo)
# Il webServer di Playwright fa partire `npm run start -p 3199` (build PROD già fatta:
# qui si builda prima, sempre). `reuseExistingServer: true` → se hai già un server
# sulla 3199 riusa quello.

SHELL := /bin/bash

NODE_WANTED := $(shell cat .nvmrc)
NODE_ACTUAL := $(shell node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')

# Spec che attraversano la superficie del configuratore (step 1-3, nav, carrello,
# codici, teaser): il minimo da girare quando una PR tocca configurator-client/page.
CONFIG_SPECS := e2e/f01.spec.ts e2e/f02.spec.ts e2e/f03.spec.ts e2e/f04.spec.ts \
	e2e/f05.spec.ts e2e/f13.spec.ts e2e/f14.spec.ts e2e/f15.spec.ts \
	e2e/f16.spec.ts e2e/f18.spec.ts e2e/f19.spec.ts e2e/f21.spec.ts e2e/f22.spec.ts

.PHONY: check-node build run-e2e run-e2e-config run-e2e-grep

check-node:
	@if [ "$(NODE_ACTUAL)" != "$(NODE_WANTED)" ]; then \
		echo "✗ Node attivo: $(NODE_ACTUAL) — serve $(NODE_WANTED) (.nvmrc). Esegui: nvm use"; \
		exit 1; \
	fi
	@echo "✓ Node $(NODE_WANTED)"

build: check-node
	npm run build

run-e2e: build
	npx playwright test

run-e2e-config: build
	npx playwright test $(CONFIG_SPECS)

run-e2e-grep: build
	npx playwright test e2e/$(G).spec.ts
