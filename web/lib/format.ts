// Formats a numeric string value as currency with appropriate suffix (T, B, M, K)
export function formatTvl(value: string | null): string {
  if (!value) return '--'
  const num = parseFloat(value)
  if (isNaN(num)) return '--'
  if (num >= 1_000_000_000_000) return `$${(num / 1_000_000_000_000).toFixed(2)}T`
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}

// Formats a number as a dollar value with commas (integers show no decimals, fractional values show 2)
export function formatDollarValue(value: number | null): string {
  if (value === null || value === undefined) return '$0'
  if (value === 0) return '$0'
  // Use integer formatting for whole numbers, show 2 decimals for fractional values
  const formatted = Number.isInteger(value)
    ? Math.round(value).toLocaleString('en-US')
    : value.toFixed(2)
  return `$${formatted}`
}

// Formats LTV as a percentage with 1 decimal place
export function formatLtv(ltv: number | null): string {
  if (ltv === null || ltv === undefined) return '0.0%'
  return `${ltv.toFixed(1)}%`
}

// Formats health factor with 2 decimal places, or ∞ for infinity
// Uses epsilon correction to handle floating-point precision issues (e.g., 1.575 → "1.58" not "1.57")
export function formatHealthFactor(hf: number | null): string {
  if (hf === null || hf === undefined) return '--'
  if (!Number.isFinite(hf)) return '∞'
  // Add epsilon before rounding to correct for IEEE 754 representation
  const rounded = Math.round((hf + Number.EPSILON) * 100) / 100
  return rounded.toFixed(2)
}

// Formats liquidation price with 4 decimal places
export function formatLiquidationPrice(price: number | null): string {
  if (price === null || price === undefined || price === 0) return '$0.0000'
  return `$${price.toFixed(4)}`
}
