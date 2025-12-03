package observability

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

func TestInitTracing_Disabled(t *testing.T) {
	t.Parallel()

	cfg := TracingConfig{
		Enabled: false,
	}

	shutdown, err := InitTracing(cfg)
	require.NoError(t, err)
	require.NotNil(t, shutdown)

	// Shutdown should be a no-op
	ctx := context.Background()
	err = shutdown(ctx)
	require.NoError(t, err)
}

func TestInitTracing_EnabledWithInvalidEndpoint(t *testing.T) {
	// Cannot run in parallel due to global tracer provider manipulation

	cfg := TracingConfig{
		Enabled:     true,
		Endpoint:    "invalid-endpoint:9999",
		ServiceName: "test-service",
		Environment: "testing",
	}

	// This may or may not fail depending on the exporter implementation
	// The exporter often initializes asynchronously
	shutdown, err := InitTracing(cfg)

	if err == nil {
		// If initialization succeeds, shutdown should work
		require.NotNil(t, shutdown)
		ctx := context.Background()
		_ = shutdown(ctx)
	}
}

func TestStartSpan(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	tracerName := "test-tracer"
	spanName := "test-span"

	spanCtx, span := StartSpan(ctx, tracerName, spanName)
	require.NotNil(t, spanCtx)
	require.NotNil(t, span)

	// Verify span is in context
	extractedSpan := trace.SpanFromContext(spanCtx)
	require.Equal(t, span, extractedSpan)

	// End span
	span.End()
}

func TestStartSpan_ContextPropagation(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Create parent span
	parentCtx, parentSpan := StartSpan(ctx, "test-tracer", "parent-span")
	defer parentSpan.End()

	// Create child span from parent context
	childCtx, childSpan := StartSpan(parentCtx, "test-tracer", "child-span")
	defer childSpan.End()

	// Verify child span is in child context
	extractedChildSpan := trace.SpanFromContext(childCtx)
	require.Equal(t, childSpan, extractedChildSpan)

	// Parent span should still be in parent context
	extractedParentSpan := trace.SpanFromContext(parentCtx)
	require.Equal(t, parentSpan, extractedParentSpan)
}

func TestRecordError(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Create span
	spanCtx, span := StartSpan(ctx, "test-tracer", "error-span")
	defer span.End()

	// Record error
	testErr := errors.New("test error")
	RecordError(spanCtx, testErr)

	// Note: Cannot easily verify error was recorded without access to span internals
	// This test mainly ensures RecordError doesn't panic
}

func TestRecordError_NilError(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Create span
	spanCtx, span := StartSpan(ctx, "test-tracer", "no-error-span")
	defer span.End()

	// Record nil error (should be a no-op)
	RecordError(spanCtx, nil)
}

func TestRecordError_WithoutSpan(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Record error without span in context (should not panic)
	testErr := errors.New("test error")
	RecordError(ctx, testErr)
}

func TestTracingConfig_Defaults(t *testing.T) {
	t.Parallel()

	cfg := TracingConfig{
		Enabled:     false,
		Endpoint:    "",
		ServiceName: "",
		Environment: "",
	}

	require.False(t, cfg.Enabled)
	require.Empty(t, cfg.Endpoint)
	require.Empty(t, cfg.ServiceName)
	require.Empty(t, cfg.Environment)
}

func TestTracingConfig_CustomValues(t *testing.T) {
	t.Parallel()

	cfg := TracingConfig{
		Enabled:     true,
		Endpoint:    "jaeger:4317",
		ServiceName: "custom-service",
		Environment: "production",
	}

	require.True(t, cfg.Enabled)
	require.Equal(t, "jaeger:4317", cfg.Endpoint)
	require.Equal(t, "custom-service", cfg.ServiceName)
	require.Equal(t, "production", cfg.Environment)
}

func TestStartSpan_WithNoopTracer(t *testing.T) {
	t.Parallel()

	// When tracing is disabled, spans should still work (as no-ops)
	ctx := context.Background()

	spanCtx, span := StartSpan(ctx, "test-tracer", "noop-span")
	require.NotNil(t, spanCtx)
	require.NotNil(t, span)

	// Span should not be recording
	require.False(t, span.IsRecording())

	span.End()
}

func TestMultipleSpans(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Create multiple spans sequentially
	ctx1, span1 := StartSpan(ctx, "tracer1", "span1")
	require.NotNil(t, span1)
	span1.End()

	ctx2, span2 := StartSpan(ctx, "tracer2", "span2")
	require.NotNil(t, span2)
	span2.End()

	ctx3, span3 := StartSpan(ctx, "tracer3", "span3")
	require.NotNil(t, span3)
	span3.End()

	// Verify all contexts are valid (have spans)
	require.NotNil(t, trace.SpanFromContext(ctx1))
	require.NotNil(t, trace.SpanFromContext(ctx2))
	require.NotNil(t, trace.SpanFromContext(ctx3))
}

func TestNestedSpans(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Create nested span structure
	ctx1, span1 := StartSpan(ctx, "test-tracer", "level1")
	defer span1.End()

	ctx2, span2 := StartSpan(ctx1, "test-tracer", "level2")
	defer span2.End()

	ctx3, span3 := StartSpan(ctx2, "test-tracer", "level3")
	defer span3.End()

	// Verify each context has its own span
	require.Equal(t, span3, trace.SpanFromContext(ctx3))
	require.Equal(t, span2, trace.SpanFromContext(ctx2))
	require.Equal(t, span1, trace.SpanFromContext(ctx1))
}

func TestAddSpanAttributes(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Create span
	spanCtx, span := StartSpan(ctx, "test-tracer", "attribute-span")
	defer span.End()

	// AddSpanAttributes is currently a no-op in the implementation
	// but should not panic
	AddSpanAttributes(spanCtx)
}

func TestGlobalTracerProvider(t *testing.T) {
	// Cannot run in parallel due to global state manipulation

	// Get default tracer provider
	defaultProvider := otel.GetTracerProvider()
	require.NotNil(t, defaultProvider)

	// Create tracer from default provider
	tracer := defaultProvider.Tracer("test-tracer")
	require.NotNil(t, tracer)

	// Start span using global tracer
	ctx := context.Background()
	ctx, span := tracer.Start(ctx, "global-span")
	defer span.End()

	require.NotNil(t, ctx)
	require.NotNil(t, span)
}
