package observability

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Metrics holds all Prometheus metrics for the relayer
type Metrics struct {
	// Lock processing metrics
	LocksProcessed prometheus.Counter
	LocksFailed    prometheus.Counter
	LocksDuplicate prometheus.Counter

	// Processing duration histogram
	ProcessingDuration prometheus.Histogram

	// Signature generation duration
	SignatureDuration prometheus.Histogram

	// RPC call metrics
	RPCCallsTotal  *prometheus.CounterVec
	RPCErrorsTotal *prometheus.CounterVec
	RPCDuration    *prometheus.HistogramVec

	// Gas metrics
	GasUsed *prometheus.HistogramVec

	// Retry metrics
	RetriesTotal *prometheus.CounterVec

	// Health metrics
	HealthCheckStatus *prometheus.GaugeVec
}

// NewMetrics creates and registers all Prometheus metrics
func NewMetrics() *Metrics {
	return &Metrics{
		LocksProcessed: promauto.NewCounter(prometheus.CounterOpts{
			Name: "relayer_locks_processed_total",
			Help: "Total number of lock events processed successfully",
		}),
		LocksFailed: promauto.NewCounter(prometheus.CounterOpts{
			Name: "relayer_locks_failed_total",
			Help: "Total number of lock events that failed processing",
		}),
		LocksDuplicate: promauto.NewCounter(prometheus.CounterOpts{
			Name: "relayer_locks_duplicate_total",
			Help: "Total number of duplicate lock events skipped",
		}),
		ProcessingDuration: promauto.NewHistogram(prometheus.HistogramOpts{
			Name: "relayer_processing_duration_seconds",
			Help: "Time taken to process a lock event end-to-end",
			Buckets: []float64{.1, .25, .5, 1, 2.5, 5, 10, 30},
		}),
		SignatureDuration: promauto.NewHistogram(prometheus.HistogramOpts{
			Name: "relayer_signature_duration_seconds",
			Help: "Time taken to generate EIP-712 signature",
			Buckets: []float64{.001, .005, .01, .025, .05, .1, .25, .5},
		}),
		RPCCallsTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "relayer_rpc_calls_total",
				Help: "Total number of RPC calls by chain and method",
			},
			[]string{"chain", "method"},
		),
		RPCErrorsTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "relayer_rpc_errors_total",
				Help: "Total number of RPC errors by chain and method",
			},
			[]string{"chain", "method"},
		),
		RPCDuration: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Name: "relayer_rpc_duration_seconds",
				Help: "Duration of RPC calls by chain and method",
				Buckets: []float64{.01, .025, .05, .1, .25, .5, 1, 2.5, 5},
			},
			[]string{"chain", "method"},
		),
		GasUsed: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Name: "relayer_gas_used",
				Help: "Gas used for transactions by type",
				Buckets: prometheus.ExponentialBuckets(50000, 2, 10),
			},
			[]string{"tx_type"},
		),
		RetriesTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "relayer_retries_total",
				Help: "Total number of retry attempts by operation",
			},
			[]string{"operation"},
		),
		HealthCheckStatus: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "relayer_health_check_status",
				Help: "Health check status by chain (1=healthy, 0=unhealthy)",
			},
			[]string{"chain"},
		),
	}
}
