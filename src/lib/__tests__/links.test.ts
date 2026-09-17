import { describe, expect, it } from 'vitest'
import { keyFromHash, linkIdOf, linkUrl, MAX_MESSAGE, maxAmountEach, newLink, parseHash, quoteWith, shortfall } from '../links'
import { EURC, parseAmount, USDC } from '../tokens'

describe('link keys', () => {
  it('generates a key whose address is the link id', () => {
    const { key, id } = newLink()
    expect(key).toMatch(/^0x[0-9a-f]{64}$/)
    expect(linkIdOf(key)).toBe(id)
  })

  it('round-trips through the URL fragment', () => {
    const { key } = newLink()
    const url = new URL(linkUrl(key))
    expect(url.hash.startsWith('#')).toBe(true)
    expect(url.hash).not.toContain('0x')
    expect(keyFromHash(url.hash)).toBe(key)
  })

  it('accepts the key with or without # and 0x, and normalises case', () => {
    const { key } = newLink()
    const bare = key.slice(2)
    expect(keyFromHash(bare)).toBe(key)
    expect(keyFromHash(`#${bare}`)).toBe(key)
    expect(keyFromHash(`#0x${bare}`)).toBe(key)
    expect(keyFromHash(`#${bare.toUpperCase()}`)).toBe(key)
    expect(keyFromHash(`#${encodeURIComponent(bare)}`)).toBe(key)
  })

  it('rejects anything that is not a 32-byte hex key', () => {
    expect(keyFromHash('')).toBeNull()
    expect(keyFromHash('#')).toBeNull()
    expect(keyFromHash('#abc')).toBeNull()
    expect(keyFromHash(`#${'g'.repeat(64)}`)).toBeNull()
    expect(keyFromHash(`#${'a'.repeat(63)}`)).toBeNull()
    expect(keyFromHash(`#${'a'.repeat(65)}`)).toBeNull()
  })
})

describe('message on the link', () => {
  it('travels in the fragment and comes back intact', () => {
    const { key } = newLink()
    const url = new URL(linkUrl(key, 'Happy birthday 🎂 & enjoy'))
    expect(url.search).toBe('')
    expect(parseHash(url.hash)).toEqual({ key, message: 'Happy birthday 🎂 & enjoy' })
  })

  it('is optional and trimmed', () => {
    const { key } = newLink()
    expect(linkUrl(key, '   ')).toBe(linkUrl(key))
    expect(parseHash(`#${key.slice(2)}`)).toEqual({ key, message: '' })
  })

  it('is capped', () => {
    const { key } = newLink()
    const parsed = parseHash(new URL(linkUrl(key, 'x'.repeat(500))).hash)
    expect(parsed?.message.length).toBe(MAX_MESSAGE)
  })

  it('ignores unknown fragment parts and bad encoding', () => {
    const { key } = newLink()
    expect(parseHash(`#${key.slice(2)}&foo=bar`)).toEqual({ key, message: '' })
    expect(parseHash(`#${key.slice(2)}&m=%E0%A4%A`)).toEqual({ key, message: '' })
  })
})

describe('quotes', () => {
  const params = { feeBps: 100n, feeMin: 0n, stipend: 10n ** 16n }

  it('prices a single USDC link', () => {
    const q = quoteWith(params, USDC, 5n * 10n ** 18n, 1)
    expect(q.total).toBe(5n * 10n ** 18n)
    expect(q.fee).toBe(5n * 10n ** 16n)
    expect(q.tokenTotal).toBe(505n * 10n ** 16n)
    expect(q.value).toBe(505n * 10n ** 16n + 10n ** 16n)
  })

  it('prices a USDC drop with one stipend per slot', () => {
    const q = quoteWith(params, USDC, 10n ** 18n, 4)
    expect(q.total).toBe(4n * 10n ** 18n)
    expect(q.fee).toBe(4n * 10n ** 16n)
    expect(q.value).toBe(404n * 10n ** 16n + 4n * 10n ** 16n)
  })

  it('prices a EURC link in EURC, with only the stipends native', () => {
    const q = quoteWith(params, EURC, 10_000_000n, 3)
    expect(q.total).toBe(30_000_000n)
    expect(q.fee).toBe(300_000n)
    expect(q.tokenTotal).toBe(30_300_000n)
    expect(q.value).toBe(3n * 10n ** 16n)
  })

  it('applies the floor when one is set', () => {
    const q = quoteWith({ ...params, feeMin: 10n ** 17n }, USDC, 10n ** 18n, 1)
    expect(q.fee).toBe(10n ** 17n)
  })
})

describe('maxAmountEach', () => {
  const params = { feeBps: 100n, feeMin: 0n, stipend: 10n ** 16n } // 1 %, one cent per slot
  const usd = (n: string) => parseAmount(n, USDC)
  const eur = (n: string) => parseAmount(n, EURC)
  const gas = usd('0.006')

  it('is the largest whole-cent amount whose full cost fits the USDC balance', () => {
    const balance = usd('10')
    const each = maxAmountEach(params, USDC, 1, balance, balance, gas)
    expect(each % usd('0.01')).toBe(0n)
    expect(quoteWith(params, USDC, each, 1).value + gas).toBeLessThanOrEqual(balance)
    expect(quoteWith(params, USDC, each + usd('0.01'), 1).value + gas).toBeGreaterThan(balance)
    // $10 − 1 cent stipend − gas, then / 1.01 ≈ 9.88
    expect(each).toBe(usd('9.88'))
  })

  it('shares the balance across the slots of a drop, stipends included', () => {
    const balance = usd('5')
    const each = maxAmountEach(params, USDC, 10, balance, balance, gas)
    const q = quoteWith(params, USDC, each, 10)
    expect(q.value + gas).toBeLessThanOrEqual(balance)
    expect(quoteWith(params, USDC, each + usd('0.01'), 10).value + gas).toBeGreaterThan(balance)
  })

  it('honours the fee floor', () => {
    const floored = { ...params, feeMin: usd('0.50') }
    const balance = usd('1')
    const each = maxAmountEach(floored, USDC, 1, balance, balance, gas)
    expect(quoteWith(floored, USDC, each, 1).value + gas).toBeLessThanOrEqual(balance)
    expect(each).toBe(usd('0.48'))
  })

  it('is zero when even a cent cannot be funded', () => {
    expect(maxAmountEach(params, USDC, 1, usd('0.01'), usd('0.01'), gas)).toBe(0n)
    expect(maxAmountEach(params, USDC, 1, 0n, 0n, gas)).toBe(0n)
  })

  it('spends the whole EURC balance and only needs USDC for stipends and gas', () => {
    const each = maxAmountEach(params, EURC, 2, eur('20'), usd('0.05'), gas)
    const q = quoteWith(params, EURC, each, 2)
    expect(q.tokenTotal).toBeLessThanOrEqual(eur('20'))
    expect(quoteWith(params, EURC, each + eur('0.01'), 2).tokenTotal).toBeGreaterThan(eur('20'))
    expect(each % eur('0.01')).toBe(0n)
  })

  it('is zero for EURC when the USDC cannot cover the stipends and gas', () => {
    expect(maxAmountEach(params, EURC, 2, eur('20'), usd('0.02'), gas)).toBe(0n)
  })
})

describe('shortfall', () => {
  const params = { feeBps: 100n, feeMin: 0n, stipend: 10n ** 16n }
  const usd = (n: string) => parseAmount(n, USDC)
  const eur = (n: string) => parseAmount(n, EURC)
  const gas = usd('0.006')

  it('is null when the wallet can pay', () => {
    const q = quoteWith(params, USDC, usd('1'), 1)
    expect(shortfall(q, usd('2'), usd('2'), gas)).toBeNull()
  })

  it('counts the gas reserve for a USDC link', () => {
    const q = quoteWith(params, USDC, usd('1'), 1)
    // Exactly the quote, nothing left for the sender's own fee.
    const short = shortfall(q, q.value, q.value, gas)
    expect(short?.reason).toBe('amount')
    expect(short?.need).toBe(q.value + gas)
  })

  it('tells EURC shortage apart from USDC-for-gas shortage', () => {
    const q = quoteWith(params, EURC, eur('5'), 1)
    expect(shortfall(q, eur('1'), usd('1'), gas)).toMatchObject({ token: EURC, reason: 'amount' })
    expect(shortfall(q, eur('10'), usd('0.001'), gas)).toMatchObject({ token: USDC, reason: 'gas' })
  })
})
