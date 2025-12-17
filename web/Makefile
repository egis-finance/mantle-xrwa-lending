# Load environment from parent directory
-include ../.env
export

.PHONY: install dev build start serve prod lint test clean clean-cache clean-all

# Install dependencies
install:
	npm install

# Hot-reloading dev server - changes reflect instantly in browser
dev:
	npm run dev

# Build optimized production bundle (run before 'serve')
build:
	npm run build

# Serve static export from out/ directory (requires 'build' first)
serve:
	npx serve out

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

# Clear webpack cache only - run when builds slow down or after major dep updates
# Preserves node_modules and build output, just removes cached compilation artifacts
clean-cache:
	rm -rf .next/cache

# Full reset - removes all build artifacts, cache, and static export
# Run before fresh install or when troubleshooting build issues
clean:
	rm -rf .next out

# Nuclear option - removes everything including node_modules
# Requires 'make install' before next build
clean-all: clean
	rm -rf node_modules
