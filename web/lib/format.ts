// Formats a numeric string value as currency with appropriate suffix (M, K)
export function formatTvl(value: string | null): string {
  if (!value) return '--'
  const num = parseFloat(value)
  if (isNaN(num)) return '--'
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}
