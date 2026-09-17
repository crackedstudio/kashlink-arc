import { describe, expect, it } from 'vitest'
import { formatCountdown, formatUsdc, parseUsdc, shortAddress } from '../format'
import { EURC, formatAmount, parseAmount } from '../tokens'

describe('usdc amounts', () => {
  it('formats native wei as dollars', () => {
    expect(formatUsdc(5n * 10n ** 18n)).toBe('$5.00')
    expect(formatUsdc(1_234_560_000_000_000_000_000n)).toBe('$1,234.56')
    expect(formatUsdc(10n ** 17n)).toBe('$0.10')
    expect(formatUsdc(10n ** 16n)).toBe('$0.01')
    expect(formatUsdc(14n * 10n ** 14n)).toBe('$0.0014')
    expect(formatUsdc(0n)).toBe('$0.00')
  })

  it('parses decimal input to 18-decimal wei', () => {
    expect(parseUsdc('5')).toBe(5n * 10n ** 18n)
    expect(parseUsdc('0.10')).toBe(10n ** 17n)
    expect(parseUsdc('12.345678')).toBe(12_345_678n * 10n ** 12n)
  })

  it('refuses anything that is not a plain decimal', () => {
    for (const bad of ['', '.', '5.', 'abc', '-1', '1e3', ' 5']) expect(() => parseUsdc(bad)).toThrow()
  })

  it('round-trips', () => {
    expect(formatUsdc(parseUsdc('42.42'))).toBe('$42.42')
  })
})

describe('eurc amounts', () => {
  it('uses 6 decimals and the euro sign', () => {
    expect(formatAmount(5_000_000n, EURC)).toBe('€5.00')
    expect(parseAmount('12.5', EURC)).toBe(12_500_000n)
    expect(formatAmount(parseAmount('0.07', EURC), EURC)).toBe('€0.07')
  })
})

describe('helpers', () => {
  it('shortens addresses', () => {
    expect(shortAddress('0x1a250562953F1124F745ed347Eec8832bbf07241')).toBe('0x1a25…7241')
  })

  it('counts down', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatCountdown(now - 10)).toBe('expired')
    expect(formatCountdown(now + 600)).toBe('in under an hour')
    expect(formatCountdown(now + 3 * 3600)).toBe('in 3 hours')
    expect(formatCountdown(now + 6 * 86_400)).toBe('in 6 days')
  })
})
