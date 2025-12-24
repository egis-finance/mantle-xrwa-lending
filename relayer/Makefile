# Load environment from parent directory
-include ../.env
export

.PHONY: help build test test-race lint clean run docker-build docker-up docker-down docker-logs docker-locks docker-sync-local docker-set-cursor

# Default target
help:
	@echo "Available targets:"
	@echo "  build           - Build the relayer binary"
	@echo "  test            - Run unit tests"
	@echo "  test-race       - Run tests with race detector"
	@echo "  test-coverage   - Run tests with coverage"
	@echo "  lint            - Run golangci-lint"
	@echo "  clean           - Remove build artifacts"
	@echo "  run             - Run the relayer locally"
	@echo "  docker-build    - Build Docker image"
	@echo "  docker-up       - Start Docker Compose stack"
	@echo "  docker-down     - Stop Docker Compose stack"
	@echo "  docker-logs     - Follow Docker logs"
	@echo "  docker-locks    - View processed locks in Docker volume"
	@echo "  docker-sync-local - Copy Docker state to local data/"
	@echo "  docker-set-cursor BLOCK=N - Set backfill cursor to block N"
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
	docker-compose build --no-cache relayer

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

# Docker volume management
DOCKER_VOLUME := relayer_relayer-data

docker-locks:
	@docker run --rm -v $(DOCKER_VOLUME):/data alpine cat /data/processed_locks.json 2>/dev/null | python3 -m json.tool || echo "No processed locks found"

docker-sync-local:
	@echo "Copying Docker volume state to local data/..."
	@mkdir -p data
	@docker run --rm -v $(DOCKER_VOLUME):/data -v $(PWD)/data:/local alpine cp /data/processed_locks.json /local/processed_locks.json 2>/dev/null || echo "No state to copy"
	@echo "Done. Check data/processed_locks.json"

docker-set-cursor:
ifndef BLOCK
	$(error BLOCK is required. Usage: make docker-set-cursor BLOCK=87008000)
endif
	@echo "Setting cursor to block $(BLOCK)..."
	@docker run --rm -v $(DOCKER_VOLUME):/data alpine sh -c 'echo "{\"lastProcessedBlock\": $(BLOCK), \"locks\": []}" > /data/processed_locks.json'
	@echo "Cursor set. Restart relayer to backfill from block $(BLOCK)"

# Development workflow
dev: fmt mod-tidy lint test build
	@echo "Development checks passed!"

# CI workflow
ci: mod-tidy lint test-coverage
	@echo "CI checks completed!"
