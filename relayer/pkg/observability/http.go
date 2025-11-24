package observability

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// HealthChecker defines the interface for health checking
type HealthChecker interface {
	// IsHealthy returns true if the relayer is healthy
	IsHealthy(ctx context.Context) bool
	// IsReady returns true if the relayer is ready to process events
	IsReady(ctx context.Context) bool
	// GetStats returns relayer statistics for health endpoint
	GetStats() map[string]interface{}
}

// Server handles HTTP endpoints for metrics and health checks
type Server struct {
	port          int
	portMu        sync.RWMutex
	healthChecker HealthChecker
	server        *http.Server
}

// NewServer creates a new HTTP server for observability endpoints
func NewServer(port int, healthChecker HealthChecker) *Server {
	return &Server{
		port:          port,
		healthChecker: healthChecker,
	}
}

// Port returns the current port (thread-safe for dynamic port assignment)
func (s *Server) Port() int {
	s.portMu.RLock()
	defer s.portMu.RUnlock()
	return s.port
}

// Start starts the HTTP server
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Metrics endpoint for Prometheus
	mux.Handle("/metrics", promhttp.Handler())

	// Liveness probe - checks if the process is running
	mux.HandleFunc("/health/live", s.handleLiveness)

	// Readiness probe - checks if the relayer is ready to process events
	mux.HandleFunc("/health/ready", s.handleReadiness)

	// General health endpoint with detailed stats
	mux.HandleFunc("/health", s.handleHealth)

	// Create listener first to get actual port (supports port 0 for auto-assignment)
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", s.port))
	if err != nil {
		return fmt.Errorf("failed to create listener: %w", err)
	}

	// Update port with actual assigned port (important for port 0 case)
	s.portMu.Lock()
	s.port = listener.Addr().(*net.TCPAddr).Port
	s.portMu.Unlock()

	s.server = &http.Server{
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	return s.server.Serve(listener)
}

// Stop gracefully shuts down the HTTP server
func (s *Server) Stop(ctx context.Context) error {
	if s.server != nil {
		return s.server.Shutdown(ctx)
	}
	return nil
}

// handleLiveness handles liveness probe requests
func (s *Server) handleLiveness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Liveness check: process is running
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if s.healthChecker.IsHealthy(ctx) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	} else {
		http.Error(w, "Unhealthy", http.StatusServiceUnavailable)
	}
}

// handleReadiness handles readiness probe requests
func (s *Server) handleReadiness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Readiness check: RPC connections are healthy
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if s.healthChecker.IsReady(ctx) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Ready"))
	} else {
		http.Error(w, "Not ready", http.StatusServiceUnavailable)
	}
}

// handleHealth handles detailed health status requests
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	healthy := s.healthChecker.IsHealthy(ctx)
	ready := s.healthChecker.IsReady(ctx)

	status := map[string]interface{}{
		"healthy": healthy,
		"ready":   ready,
		"stats":   s.healthChecker.GetStats(),
	}

	w.Header().Set("Content-Type", "application/json")
	if !healthy || !ready {
		w.WriteHeader(http.StatusServiceUnavailable)
	} else {
		w.WriteHeader(http.StatusOK)
	}

	_ = json.NewEncoder(w).Encode(status)
}
