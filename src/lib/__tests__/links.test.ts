import { describe, expect, it } from 'vitest'
import { keyFromHash, linkIdOf, linkUrl, newLink } from '../links'

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
