package observability

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// mockHealthChecker implements HealthChecker interface for testing
type mockHealthChecker struct {
	healthy bool
	ready   bool
	stats   map[string]interface{}
}

func (m *mockHealthChecker) IsHealthy(ctx context.Context) bool {
	return m.healthy
}

func (m *mockHealthChecker) IsReady(ctx context.Context) bool {
	return m.ready
}

func (m *mockHealthChecker) GetStats() map[string]interface{} {
	return m.stats
}

func TestNewServer(t *testing.T) {
	t.Parallel()

	checker := &mockHealthChecker{
		healthy: true,
		ready:   true,
		stats:   map[string]interface{}{"test": "value"},
	}

	server := NewServer(8080, checker)
	require.NotNil(t, server)
	require.Equal(t, 8080, server.Port())
	require.Equal(t, checker, server.healthChecker)
}

func TestServer_LivenessEndpoint_Healthy(t *testing.T) {
	checker := &mockHealthChecker{healthy: true}
	server := NewServer(0, checker) // Port 0 for automatic assignment

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Make request to liveness endpoint
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health/live", server.Port()))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, "OK", string(body))
}

func TestServer_LivenessEndpoint_Unhealthy(t *testing.T) {
	checker := &mockHealthChecker{healthy: false}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Make request to liveness endpoint
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health/live", server.Port()))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestServer_ReadinessEndpoint_Ready(t *testing.T) {
	checker := &mockHealthChecker{ready: true}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Make request to readiness endpoint
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health/ready", server.Port()))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, "Ready", string(body))
}

func TestServer_ReadinessEndpoint_NotReady(t *testing.T) {
	checker := &mockHealthChecker{ready: false}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Make request to readiness endpoint
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health/ready", server.Port()))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestServer_HealthEndpoint_Healthy(t *testing.T) {
	stats := map[string]interface{}{
		"event_count":     42,
		"mantle_healthy":  true,
		"ethereum_healthy": true,
	}

	checker := &mockHealthChecker{
		healthy: true,
		ready:   true,
		stats:   stats,
	}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Make request to health endpoint
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health", server.Port()))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, "application/json", resp.Header.Get("Content-Type"))

	// Parse JSON response
	var response map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)

	require.Equal(t, true, response["healthy"])
	require.Equal(t, true, response["ready"])

	statsResponse := response["stats"].(map[string]interface{})
	require.Equal(t, float64(42), statsResponse["event_count"])
	require.Equal(t, true, statsResponse["mantle_healthy"])
	require.Equal(t, true, statsResponse["ethereum_healthy"])
}

func TestServer_HealthEndpoint_Unhealthy(t *testing.T) {
	stats := map[string]interface{}{
		"event_count":     10,
		"mantle_healthy":  false,
		"ethereum_healthy": true,
	}

	checker := &mockHealthChecker{
		healthy: false,
		ready:   false,
		stats:   stats,
	}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Make request to health endpoint
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health", server.Port()))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	// Parse JSON response
	var response map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)

	require.Equal(t, false, response["healthy"])
	require.Equal(t, false, response["ready"])
}

func TestServer_MetricsEndpoint(t *testing.T) {
	checker := &mockHealthChecker{healthy: true, ready: true}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Make request to metrics endpoint
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/metrics", server.Port()))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Verify response is Prometheus format
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	// Should contain Prometheus metrics
	bodyStr := string(body)
	require.Contains(t, bodyStr, "# HELP")
	require.Contains(t, bodyStr, "# TYPE")
}

func TestServer_MethodNotAllowed(t *testing.T) {
	checker := &mockHealthChecker{healthy: true, ready: true}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Make POST request to liveness endpoint (should only accept GET)
	resp, err := http.Post(fmt.Sprintf("http://localhost:%d/health/live", server.Port()), "text/plain", nil)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusMethodNotAllowed, resp.StatusCode)
}

func TestServer_GracefulShutdown(t *testing.T) {
	checker := &mockHealthChecker{healthy: true, ready: true}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Verify server is responding
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health/live", server.Port()))
	require.NoError(t, err)
	_ = resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Gracefully shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err = server.Stop(ctx)
	require.NoError(t, err)

	// Server should no longer respond
	time.Sleep(100 * time.Millisecond)
	_, err = http.Get(fmt.Sprintf("http://localhost:%d/health/live", server.Port()))
	require.Error(t, err)
}

func TestServer_StopWithoutStart(t *testing.T) {
	checker := &mockHealthChecker{healthy: true, ready: true}
	server := NewServer(8080, checker)

	// Stop without starting should not error
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	err := server.Stop(ctx)
	require.NoError(t, err)
}

func TestServer_MultipleEndpoints(t *testing.T) {
	stats := map[string]interface{}{
		"total_processed": 100,
		"last_event":      "2024-01-01T00:00:00Z",
	}

	checker := &mockHealthChecker{
		healthy: true,
		ready:   true,
		stats:   stats,
	}
	server := NewServer(0, checker)

	// Start server
	go func() {
		_ = server.Start()
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = server.Stop(ctx)
	}()

	// Wait for server to start
	time.Sleep(100 * time.Millisecond)

	// Test multiple endpoints
	endpoints := []string{"/health/live", "/health/ready", "/health", "/metrics"}

	for _, endpoint := range endpoints {
		resp, err := http.Get(fmt.Sprintf("http://localhost:%d%s", server.Port(), endpoint))
		require.NoError(t, err, "endpoint: %s", endpoint)
		_ = resp.Body.Close()
		require.Equal(t, http.StatusOK, resp.StatusCode, "endpoint: %s", endpoint)
	}
}
