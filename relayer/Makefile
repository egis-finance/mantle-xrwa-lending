# Load environment from parent directory
-include ../.env
export

.PHONY: help build build-price-updater test test-race test-integration lint clean run run-price-updater run-price-updater-dry docker-build docker-build-price-updater docker-up docker-down docker-logs

# Default target
help:
	@echo "Available targets:"
	@echo ""
	@echo "DVN Relayer:"
	@echo "  build                    - Build the relayer binary"
	@echo "  run                      - Run the relayer locally"
	@echo "  docker-build             - Build relayer Docker image"
	@echo ""
	@echo "Price Updater:"
	@echo "  build-price-updater      - Build the price-updater binary"
	@echo "  run-price-updater        - Run price update (submits tx)"
	@echo "  run-price-updater-dry    - Run price update in dry run mode"
	@echo "  docker-build-price-updater - Build price-updater Docker image"
	@echo ""
	@echo "Testing:"
	@echo "  test                     - Run unit tests"
	@echo "  test-race                - Run tests with race detector"
	@echo "  test-integration         - Run integration tests (requires VTE)"
	@echo "  test-coverage            - Run tests with coverage"
	@echo ""
	@echo "Development:"
	@echo "  lint                     - Run golangci-lint"
	@echo "  fmt                      - Format code with gofmt"
	@echo "  mod-tidy                 - Tidy go modules"
	@echo "  clean                    - Remove build artifacts"
	@echo ""
	@echo "Docker Compose:"
	@echo "  docker-up                - Start Docker Compose stack"
	@echo "  docker-down              - Stop Docker Compose stack"
	@echo "  docker-logs              - Follow Docker logs"

# Build the relayer
build:
	@echo "Building relayer..."
	go build -o bin/relayer ./cmd/relayer

# Build the price-updater
build-price-updater:
	@echo "Building price-updater..."
	go build -o bin/price-updater ./cmd/price-updater

# Run unit tests
test:
	@echo "Running tests..."
	go test -v -race ./...

# Run tests with race detector (explicit target for CI visibility)
test-race:
	@echo "Running tests with race detector..."
	go test -v -race -count=1 ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Run integration tests (requires VTE RPC URLs)
test-integration:
	@echo "Running integration tests..."
	go test -tags=integration -v ./pkg/priceupdater/...

# Run linter
lint:
	@echo "Running linter..."
	golangci-lint run

# Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf bin/
	rm -f coverage.out coverage.html
	rm -rf data/*.json
	rm -f relayer.log

# Run the relayer locally
run: build
	@echo "Starting relayer..."
	./bin/relayer

# Run the price-updater (submits real transaction)
run-price-updater: build-price-updater
	@echo "Running price update..."
	./bin/price-updater

# Run the price-updater in dry run mode
run-price-updater-dry: build-price-updater
	@echo "Running price update (dry run)..."
	PRICE_UPDATER_DRY_RUN=true ./bin/price-updater

# Format code
fmt:
	@echo "Formatting code..."
	gofmt -s -w .

# Tidy go modules
mod-tidy:
	@echo "Tidying go modules..."
	go mod tidy

# Docker targets
docker-build:
	@echo "Building Docker image..."
	docker build -t xrwa-dvn-relayer:latest .

docker-build-price-updater:
	@echo "Building price-updater Docker image..."
	docker build -f Dockerfile.price-updater -t xrwa-price-updater:latest .

docker-up:
	@echo "Starting Docker Compose stack..."
	docker-compose up

docker-up-d:
	@echo "Starting Docker Compose stack..."
	docker-compose up -d

docker-down:
	@echo "Stopping Docker Compose stack..."
	docker-compose down

docker-logs:
	@echo "Following Docker logs..."
	docker-compose logs -f relayer

# Development workflow
dev: fmt mod-tidy lint test build
	@echo "Development checks passed!"

# CI workflow
ci: mod-tidy lint test-coverage
	@echo "CI checks completed!"
