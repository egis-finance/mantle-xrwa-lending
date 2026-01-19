# Makefile for mantle-xrwa-lending
# Run 'make help' for available targets

.PHONY: help build test lint clean vercel-status vercel-latest vercel-logs vercel-errors vercel-open

# Default target
help:
	@echo "Available targets:"
	@echo ""
	@echo "  Solidity (Foundry):"
	@echo "    make build              - Build all contracts"
	@echo "    make test               - Run all Foundry tests"
	@echo "    make test-unit          - Run unit tests only"
	@echo "    make test-fuzz          - Run fuzz tests (requires MANTLE_RPC_VTE)"
	@echo "    make test-integration   - Run integration tests (requires ETHEREUM_RPC_VTE)"
	@echo "    make lint-sol           - Lint Solidity contracts"
	@echo ""
	@echo "  Web Frontend:"
	@echo "    make web-install        - Install web dependencies"
	@echo "    make web-dev            - Start development server"
	@echo "    make web-build          - Production build (for Vercel)"
	@echo "    make web-build-static   - Static export build (creates out/)"
	@echo "    make web-typecheck      - TypeScript type checking"
	@echo "    make web-lint           - ESLint"
	@echo "    make web-test           - Run web tests"
	@echo "    make web-serve          - Serve static export (requires out/)"
	@echo "    make web-start          - Build static + serve (fresh build)"
	@echo "    make web-prod           - Alias for web-start"
	@echo ""
	@echo "  Go Relayer:"
	@echo "    make relayer-build      - Build relayer binary"
	@echo "    make relayer-test       - Run relayer tests"
	@echo "    make relayer-lint       - Lint Go code"
	@echo ""
	@echo "  Vercel Deployment:"
	@echo "    make vercel-status      - Show recent deployments"
	@echo "    make vercel-latest      - Inspect latest ready deployment"
	@echo "    make vercel-logs        - Stream runtime logs (latest deployment)"
	@echo "    make vercel-errors      - List all failed deployments"
	@echo "    make vercel-open        - Open Vercel dashboard in browser"
	@echo ""
	@echo "  Combined:"
	@echo "    make all                - Build and lint everything"
	@echo "    make test-all           - Run all tests"
	@echo "    make clean              - Remove build artifacts"

# ============================================================================
# Solidity (Foundry)
# ============================================================================

build:
	forge build

test:
	forge test -vv

test-unit:
	forge test --match-path 'test/unit/*.sol' -vv

test-fuzz:
	forge test --match-path 'test/fuzz/*.sol' -vv

test-integration:
	forge test --match-path 'test/integration/*.sol' -vv

lint-sol:
	forge lint

# ============================================================================
# Web Frontend
# ============================================================================

web-install:
	cd web && pnpm install

web-dev:
	cd web && pnpm run dev

web-build:
	cd web && pnpm run clean && pnpm run build

web-build-static:
	cd web && pnpm run clean && NEXT_OUTPUT=export pnpm run build

web-typecheck:
	cd web && pnpm exec tsc --noEmit

web-lint:
	cd web && pnpm run lint

web-test:
	cd web && pnpm test

web-serve:
	cd web && pnpm exec serve out

web-start: web-build-static web-serve

web-prod: web-start

# ============================================================================
# Go Relayer
# ============================================================================

relayer-build:
	cd relayer && go build -o bin/relayer ./cmd/relayer

relayer-test:
	cd relayer && go test ./... -v -race

relayer-lint:
	cd relayer && golangci-lint run

# ============================================================================
# Vercel Deployment
# ============================================================================

# Extract scope from "Fetching deployments in <scope>" line
VERCEL_SCOPE := $(shell cd web && vercel list 2>&1 | grep 'Fetching deployments in' | sed 's/.*in //')

vercel-status: ## Show recent deployments and their status
	@cd web && vercel list 2>&1 | head -20

vercel-latest: ## Show details of the latest deployment
	@cd web && SCOPE=$$(vercel list 2>&1 | grep 'Fetching deployments in' | sed 's/.*in //') && \
	URL=$$(vercel list 2>&1 | grep 'Ready' | head -1 | awk '{print $$2}') && \
	vercel inspect "$$URL" --scope "$$SCOPE"

vercel-logs: ## Stream runtime logs from the latest ready deployment
	@cd web && SCOPE=$$(vercel list 2>&1 | grep 'Fetching deployments in' | sed 's/.*in //') && \
	URL=$$(vercel list 2>&1 | grep 'Ready' | head -1 | awk '{print $$2}') && \
	echo "Streaming logs for $$URL (Ctrl+C to stop)..." && \
	vercel logs "$$URL" --scope "$$SCOPE"

vercel-errors: ## Show all failed deployments with details
	@cd web && SCOPE=$$(vercel list 2>&1 | grep 'Fetching deployments in' | sed 's/.*in //') && \
	echo "=== Failed Deployments ===" && \
	vercel list 2>&1 | grep 'Error' | while read -r line; do \
		URL=$$(echo "$$line" | awk '{print $$2}'); \
		AGE=$$(echo "$$line" | awk '{print $$1}'); \
		echo "\n--- $$AGE ago: $$URL ---"; \
		vercel inspect "$$URL" --scope "$$SCOPE" 2>&1 | grep -E '(status|created|url|Error)' || true; \
	done

vercel-open: ## Open Vercel dashboard in browser
	@cd web && SCOPE=$$(vercel list 2>&1 | grep 'Fetching deployments in' | sed 's/.*in //') && \
	open "https://vercel.com/$$SCOPE/mantle-xrwa-lending/deployments"

# ============================================================================
# Combined Targets
# ============================================================================

all: build web-typecheck web-lint lint-sol relayer-lint

test-all: test web-test relayer-test

clean:
	rm -rf out cache
	rm -rf web/.next web/out
	rm -rf relayer/bin
