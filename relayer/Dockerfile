# Multi-stage Dockerfile for xRWA DVN Relayer
# Uses distroless base for minimal attack surface

# Build stage
FROM golang:1.23-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./

# Use local toolchain (ignore go.mod's go directive if higher than installed)
ENV GOTOOLCHAIN=local

# Download dependencies (cached layer)
RUN go mod download && go mod verify

# Copy source code
COPY . .

# Build the relayer binary
# CGO_ENABLED=0 for static binary compatible with distroless
# -ldflags for smaller binary size
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o /relayer \
    ./cmd/relayer

# Create empty data directory for persistence
RUN mkdir -p /app/data

# Runtime stage with distroless
FROM gcr.io/distroless/static-debian12:nonroot

# Copy timezone data and CA certificates from builder
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy compiled binary
COPY --from=builder /relayer /relayer

# Create data directory for persistence
USER nonroot:nonroot
WORKDIR /app

# Expose HTTP port for metrics and health checks
EXPOSE 8080

# Set environment defaults
ENV LOG_LEVEL=info \
    LOG_FORMAT=json \
    HTTP_PORT=8080 \
    ENVIRONMENT=production

# Health check (requires base-debian12 variant for wget)
# Using base variant for health check support
FROM gcr.io/distroless/base-debian12:nonroot AS final

COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /relayer /relayer

# Create data directory with correct ownership (nonroot user has uid 65532)
COPY --from=builder --chown=65532:65532 /app/data /app/data

USER nonroot:nonroot
WORKDIR /app

EXPOSE 8080

ENV LOG_LEVEL=info \
    LOG_FORMAT=json \
    HTTP_PORT=8080 \
    ENVIRONMENT=production

# Run the relayer
ENTRYPOINT ["/relayer"]
