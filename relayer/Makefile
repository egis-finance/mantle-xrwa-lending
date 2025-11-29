# Load environment from parent directory
-include ../.env
export

.PHONY: help build test lint clean run docker-build docker-up docker-down docker-logs integration-test

# Default target
help:
	@echo "Available targets:"
	@echo "  build           - Build the relayer binary"
	@echo "  test            - Run unit tests"
	@echo "  test-coverage   - Run tests with coverage"
	@echo "  integration     - Run integration tests with Anvil"
	@echo "  lint            - Run golangci-lint"
	@echo "  clean           - Remove build artifacts"
	@echo "  run             - Run the relayer locally"
	@echo "  docker-build    - Build Docker image"
	@echo "  docker-up       - Start Docker Compose stack"
	@echo "  docker-down     - Stop Docker Compose stack"
	@echo "  docker-logs     - Follow Docker logs"
	@echo "  fmt             - Format code with gofmt"
	@echo "  mod-tidy        - Tidy go modules"

# Build the relayer
build:
	@echo "Building relayer..."
	go build -o bin/relayer ./cmd/relayer

# Run unit tests
test:
	@echo "Running tests..."
	go test -v -race ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Run integration tests (requires Foundry Anvil)
integration:
	@echo "Running integration tests..."
	go test -v -tags=integration ./test/integration/...

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
