# Makefile for mantle-xrwa-lending
# Run 'make help' for available targets

.PHONY: help build test lint clean

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
	@echo "    make web-build          - Production build"
	@echo "    make web-typecheck      - TypeScript type checking"
	@echo "    make web-lint           - ESLint"
	@echo "    make web-test           - Run web tests"
	@echo ""
	@echo "  Go Relayer:"
	@echo "    make relayer-build      - Build relayer binary"
	@echo "    make relayer-test       - Run relayer tests"
	@echo "    make relayer-lint       - Lint Go code"
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
	cd web && pnpm run build

web-typecheck:
	cd web && pnpm exec tsc --noEmit

web-lint:
	cd web && pnpm run lint

web-test:
	cd web && pnpm test

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
# Combined Targets
# ============================================================================

all: build web-typecheck web-lint lint-sol relayer-lint

test-all: test web-test relayer-test

clean:
	rm -rf out cache
	rm -rf web/.next web/out
	rm -rf relayer/bin
