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
