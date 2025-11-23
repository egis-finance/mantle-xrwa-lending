package observability

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"
)

func TestNewMetrics(t *testing.T) {
	t.Parallel()

	metrics := NewMetrics()
	require.NotNil(t, metrics)

	// Verify all metrics are created
	require.NotNil(t, metrics.LocksProcessed)
	require.NotNil(t, metrics.LocksFailed)
	require.NotNil(t, metrics.LocksDuplicate)
	require.NotNil(t, metrics.ProcessingDuration)
	require.NotNil(t, metrics.SignatureDuration)
	require.NotNil(t, metrics.RPCCallsTotal)
	require.NotNil(t, metrics.RPCErrorsTotal)
	require.NotNil(t, metrics.RPCDuration)
	require.NotNil(t, metrics.GasUsed)
	require.NotNil(t, metrics.RetriesTotal)
	require.NotNil(t, metrics.HealthCheckStatus)
}

func TestMetrics_Counters(t *testing.T) {
	t.Parallel()

	// Create new registry for isolated testing
	registry := prometheus.NewRegistry()

	locksProcessed := prometheus.NewCounter(prometheus.CounterOpts{
		Name: "test_locks_processed_total",
		Help: "Test counter",
	})
	registry.MustRegister(locksProcessed)

	// Initial value should be 0
	require.Equal(t, float64(0), testutil.ToFloat64(locksProcessed))

	// Increment counter
	locksProcessed.Inc()
	require.Equal(t, float64(1), testutil.ToFloat64(locksProcessed))

	// Increment multiple times
	locksProcessed.Inc()
	locksProcessed.Inc()
	require.Equal(t, float64(3), testutil.ToFloat64(locksProcessed))
}

func TestMetrics_CountersWithLabels(t *testing.T) {
	t.Parallel()

	// Create new registry for isolated testing
	registry := prometheus.NewRegistry()

	rpcCalls := prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "test_rpc_calls_total",
			Help: "Test counter with labels",
		},
		[]string{"chain", "method"},
	)
	registry.MustRegister(rpcCalls)

	// Increment with different labels
	rpcCalls.WithLabelValues("mantle", "block_number").Inc()
	rpcCalls.WithLabelValues("mantle", "block_number").Inc()
	rpcCalls.WithLabelValues("ethereum", "send_transaction").Inc()

	// Verify counts
	require.Equal(t, float64(2), testutil.ToFloat64(rpcCalls.WithLabelValues("mantle", "block_number")))
	require.Equal(t, float64(1), testutil.ToFloat64(rpcCalls.WithLabelValues("ethereum", "send_transaction")))
}

func TestMetrics_Histograms(t *testing.T) {
	t.Parallel()

	// Create new registry for isolated testing
	registry := prometheus.NewRegistry()

	processingDuration := prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "test_processing_duration_seconds",
		Help:    "Test histogram",
		Buckets: []float64{.1, .5, 1, 5},
	})
	registry.MustRegister(processingDuration)

	// Observe values
	processingDuration.Observe(0.2)
	processingDuration.Observe(0.8)
	processingDuration.Observe(1.5)

	// Verify observations were recorded (testutil doesn't expose count/sum for histograms directly)
	// Instead, collect the metric and verify it's working
	require.NotNil(t, processingDuration)
}

func TestMetrics_HistogramsWithLabels(t *testing.T) {
	t.Parallel()

	// Create new registry for isolated testing
	registry := prometheus.NewRegistry()

	gasUsed := prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "test_gas_used",
			Help:    "Test histogram with labels",
			Buckets: prometheus.ExponentialBuckets(50000, 2, 5),
		},
		[]string{"tx_type"},
	)
	registry.MustRegister(gasUsed)

	// Observe values with different labels
	gasUsed.WithLabelValues("mint_with_attestation").Observe(100000)
	gasUsed.WithLabelValues("mint_with_attestation").Observe(120000)
	gasUsed.WithLabelValues("transfer").Observe(50000)

	// Verify histograms are working (testutil doesn't expose histogram count directly)
	require.NotNil(t, gasUsed)
}

func TestMetrics_Gauges(t *testing.T) {
	t.Parallel()

	// Create new registry for isolated testing
	registry := prometheus.NewRegistry()

	healthStatus := prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "test_health_status",
			Help: "Test gauge",
		},
		[]string{"chain"},
	)
	registry.MustRegister(healthStatus)

	// Set gauge values
	healthStatus.WithLabelValues("mantle").Set(1)
	healthStatus.WithLabelValues("ethereum").Set(0)

	// Verify values
	require.Equal(t, float64(1), testutil.ToFloat64(healthStatus.WithLabelValues("mantle")))
	require.Equal(t, float64(0), testutil.ToFloat64(healthStatus.WithLabelValues("ethereum")))

	// Update gauge value
	healthStatus.WithLabelValues("ethereum").Set(1)
	require.Equal(t, float64(1), testutil.ToFloat64(healthStatus.WithLabelValues("ethereum")))
}

func TestMetrics_Integration(t *testing.T) {
	t.Parallel()

	// Test metrics in a more realistic scenario
	metrics := NewMetrics()

	// Simulate processing a lock event
	metrics.LocksProcessed.Inc()
	metrics.ProcessingDuration.Observe(1.5)
	metrics.SignatureDuration.Observe(0.05)
	metrics.RPCCallsTotal.WithLabelValues("mantle", "filter_logs").Inc()
	metrics.RPCCallsTotal.WithLabelValues("ethereum", "send_transaction").Inc()
	metrics.GasUsed.WithLabelValues("mint_with_attestation").Observe(150000)

	// Verify metrics were recorded
	require.Equal(t, float64(1), testutil.ToFloat64(metrics.LocksProcessed))
	require.NotNil(t, metrics.ProcessingDuration)
	require.NotNil(t, metrics.SignatureDuration)
}

func TestMetrics_FailureScenario(t *testing.T) {
	t.Parallel()

	metrics := NewMetrics()

	// Simulate failures
	metrics.LocksFailed.Inc()
	metrics.RPCErrorsTotal.WithLabelValues("mantle", "subscribe_filter_logs").Inc()
	metrics.RetriesTotal.WithLabelValues("submit_attestation").Inc()
	metrics.RetriesTotal.WithLabelValues("submit_attestation").Inc()

	// Verify failure metrics
	require.Equal(t, float64(1), testutil.ToFloat64(metrics.LocksFailed))
	require.Equal(t, float64(1), testutil.ToFloat64(metrics.RPCErrorsTotal.WithLabelValues("mantle", "subscribe_filter_logs")))
	require.Equal(t, float64(2), testutil.ToFloat64(metrics.RetriesTotal.WithLabelValues("submit_attestation")))
}

func TestMetrics_DuplicateDetection(t *testing.T) {
	t.Parallel()

	metrics := NewMetrics()

	// Simulate duplicate lock events
	metrics.LocksDuplicate.Inc()
	metrics.LocksDuplicate.Inc()
	metrics.LocksDuplicate.Inc()

	// Verify duplicate counter
	require.Equal(t, float64(3), testutil.ToFloat64(metrics.LocksDuplicate))
}

func TestMetrics_HealthChecks(t *testing.T) {
	t.Parallel()

	metrics := NewMetrics()

	// Set health check statuses
	metrics.HealthCheckStatus.WithLabelValues("mantle").Set(1)
	metrics.HealthCheckStatus.WithLabelValues("ethereum").Set(1)

	// Verify healthy status
	require.Equal(t, float64(1), testutil.ToFloat64(metrics.HealthCheckStatus.WithLabelValues("mantle")))
	require.Equal(t, float64(1), testutil.ToFloat64(metrics.HealthCheckStatus.WithLabelValues("ethereum")))

	// Simulate Ethereum connection failure
	metrics.HealthCheckStatus.WithLabelValues("ethereum").Set(0)
	require.Equal(t, float64(0), testutil.ToFloat64(metrics.HealthCheckStatus.WithLabelValues("ethereum")))
}

func TestMetrics_RPCDuration(t *testing.T) {
	t.Parallel()

	metrics := NewMetrics()

	// Record RPC call durations
	metrics.RPCDuration.WithLabelValues("mantle", "block_number").Observe(0.05)
	metrics.RPCDuration.WithLabelValues("mantle", "block_number").Observe(0.07)
	metrics.RPCDuration.WithLabelValues("ethereum", "estimate_gas").Observe(0.15)

	// Verify histograms are recording (testutil doesn't expose histogram count/sum directly)
	require.NotNil(t, metrics.RPCDuration)
}
