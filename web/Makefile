# Load environment from parent directory
-include ../.env
export

.PHONY: install dev build start lint test clean

# Install dependencies (legacy-peer-deps required for Safe SDK)
install:
	npm install --legacy-peer-deps

# Run development server
dev:
	npm run dev

# Build for production
build:
	npm run build

# Start production server
start:
	npm run start

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
