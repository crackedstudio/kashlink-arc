import { formatAmount, parseAmount, USDC } from './tokens'

/** Native USDC wei → "$5.00". */
export function formatUsdc(wei: bigint): string {
  return formatAmount(wei, USDC)
}

/** "5", "5.5", "0.10" → native wei. Throws on anything that is not a plain decimal. */
export function parseUsdc(input: string): bigint {
  return parseAmount(input, USDC)
}

/** "0x1234…abcd" */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** "Sep 11, 2026 at 19:13" */
export function formatDate(ms: number): string {
  const date = new Date(ms)
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} at ${time}`
}

/** "in 6 days", "in 3 hours", "expired" */
export function formatCountdown(untilSeconds: number): string {
  const left = untilSeconds * 1000 - Date.now()
  if (left <= 0) return 'expired'
  const hours = Math.round(left / 3_600_000)
  if (hours < 1) return 'in under an hour'
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}
