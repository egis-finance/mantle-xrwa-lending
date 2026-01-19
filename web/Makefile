# Load environment from parent directory
-include ../.env
export

.PHONY: install dev build build-static start serve prod lint test clean clean-cache clean-all

# Install dependencies
install:
	pnpm install

# Hot-reloading dev server - changes reflect instantly in browser
dev:
	pnpm run dev

# Build for Vercel deployment (creates .next/)
build:
	pnpm run clean && pnpm run build

# Build static export (creates out/) - required for 'serve'
build-static:
	pnpm run clean && NEXT_OUTPUT=export pnpm run build

# Serve static export from out/ directory
serve: build-static
	pnpm exec serve out

# Alias for serve (build-static + serve)
prod: serve

# Alias for 'serve' - builds static export and serves it
start: serve

# Run linting
lint:
	pnpm run lint

# Run unit tests
test:
	pnpm test

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
	rm -rf node_modules pnpm-lock.yaml
