# Load environment from parent directory
-include ../.env
export

.PHONY: install dev build start serve prod lint test clean

# Install dependencies (legacy-peer-deps required for Safe SDK)
install:
	npm install --legacy-peer-deps

# Hot-reloading dev server - changes reflect instantly in browser
dev:
	npm run dev

# Build optimized production bundle (run before 'serve')
build:
	npm run build

# Serve pre-built production bundle (requires 'build' first)
serve:
	npm run start

# Build and serve production bundle in one step
prod: build serve

# Alias for 'serve' (legacy compatibility)
start: serve

# Run linting
lint:
	npm run lint

# Run unit tests
test:
	npm test

# Clean build artifacts
clean:
	rm -rf .next
	rm -rf node_modules
