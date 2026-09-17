import { describe, expect, it } from 'vitest'
import { keyFromHash, linkIdOf, linkUrl, MAX_MESSAGE, newLink, parseHash, quoteWith } from '../links'
import { EURC, USDC } from '../tokens'

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
  const params = { feeBps: 100n, feeMin: 0n, stipend: 10n ** 16n, batch: true }

  it('prices a single USDC link', () => {
    const q = quoteWith(params, USDC, 5n * 10n ** 18n, 1)
    expect(q.mode).toBe('single')
    expect([q.slots, q.links]).toEqual([1, 1])
    expect(q.total).toBe(5n * 10n ** 18n)
    expect(q.fee).toBe(5n * 10n ** 16n)
    expect(q.tokenTotal).toBe(505n * 10n ** 16n)
    expect(q.value).toBe(505n * 10n ** 16n + 10n ** 16n)
  })

  it('ignores the mode for one person', () => {
    expect(quoteWith(params, USDC, 10n ** 18n, 1, 'drop')).toEqual(quoteWith(params, USDC, 10n ** 18n, 1, 'separate'))
  })

  it('prices a USDC drop as one link with a stipend per slot', () => {
    const q = quoteWith(params, USDC, 10n ** 18n, 4, 'drop')
    expect(q.mode).toBe('drop')
    expect([q.slots, q.links]).toEqual([4, 1])
    expect(q.total).toBe(4n * 10n ** 18n)
    expect(q.fee).toBe(4n * 10n ** 16n)
    expect(q.value).toBe(404n * 10n ** 16n + 4n * 10n ** 16n)
  })

  it('prices separate links as that many single links, and defaults to them', () => {
    const q = quoteWith(params, USDC, 10n ** 18n, 4)
    expect(q.mode).toBe('separate')
    expect([q.slots, q.links, q.people]).toEqual([1, 4, 4])
    const one = quoteWith(params, USDC, 10n ** 18n, 1)
    expect(q.total).toBe(4n * one.total)
    expect(q.fee).toBe(4n * one.fee)
    expect(q.tokenTotal).toBe(4n * one.tokenTotal)
    expect(q.value).toBe(4n * one.value)
  })

  it('charges a fee floor per separate link, but once for a drop', () => {
    const floor = { ...params, feeMin: 10n ** 17n }
    expect(quoteWith(floor, USDC, 10n ** 18n, 3, 'separate').fee).toBe(3n * 10n ** 17n)
    expect(quoteWith(floor, USDC, 10n ** 18n, 3, 'drop').fee).toBe(10n ** 17n)
  })

  it('prices EURC in EURC, with only the stipends native', () => {
    const q = quoteWith(params, EURC, 10_000_000n, 3, 'drop')
    expect(q.total).toBe(30_000_000n)
    expect(q.fee).toBe(300_000n)
    expect(q.tokenTotal).toBe(30_300_000n)
    expect(q.value).toBe(3n * 10n ** 16n)
    expect(quoteWith(params, EURC, 10_000_000n, 3, 'separate').value).toBe(3n * 10n ** 16n)
  })

  it('applies the floor when one is set', () => {
    const q = quoteWith({ ...params, feeMin: 10n ** 17n }, USDC, 10n ** 18n, 1)
    expect(q.fee).toBe(10n ** 17n)
  })

  it('has no fee when fees are off', () => {
    expect(quoteWith({ ...params, feeBps: 0n, feeMin: 10n ** 17n }, USDC, 10n ** 18n, 5).fee).toBe(0n)
  })
})
