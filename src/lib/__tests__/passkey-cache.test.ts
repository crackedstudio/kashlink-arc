import { beforeEach, describe, expect, it } from 'vitest'
import { cachedAddress, cachedBalances, CREDENTIAL_KEY, forgetCachedWallet, rememberAddress, rememberBalances } from '../passkey-cache'
import { EURC, USDC } from '../tokens'

// vitest runs in node; a Map is all localStorage needs to be here.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const A = '0x00000000000000000000000000000000000000aa'
const B = '0x00000000000000000000000000000000000000bb'

describe('passkey wallet cache', () => {
  beforeEach(() => {
    store.clear()
    store.set(CREDENTIAL_KEY, '{"id":"x","publicKey":"0x04"}')
  })

  it('knows no address until one is remembered', () => {
    expect(cachedAddress()).toBeNull()
    rememberAddress(A)
    expect(cachedAddress()).toBe(A)
  })

  it('ignores the address when the passkey itself is gone', () => {
    rememberAddress(A)
    store.delete(CREDENTIAL_KEY)
    expect(cachedAddress()).toBeNull()
  })

  it('round-trips balances as bigints, only for the same address', () => {
    rememberBalances(A, new Map([[USDC, 10n ** 17n], [EURC, 0n]]))
    expect(cachedBalances(A)).toEqual(new Map([[USDC, 10n ** 17n], [EURC, 0n]]))
    expect(cachedBalances(A.toUpperCase().replace('0X', '0x') as `0x${string}`).get(USDC)).toBe(10n ** 17n)
    expect(cachedBalances(B).size).toBe(0)
  })

  it('keeps balances when the same address is remembered again, drops them for a new one', () => {
    rememberBalances(A, new Map([[USDC, 5n]]))
    rememberAddress(A)
    expect(cachedBalances(A).get(USDC)).toBe(5n)
    rememberAddress(B)
    expect(cachedAddress()).toBe(B)
    expect(cachedBalances(B).size).toBe(0)
  })

  it('tolerates garbage and forgets cleanly', () => {
    store.set('kashlink-arc-passkey-wallet', '{not json')
    expect(cachedAddress()).toBeNull()
    store.set('kashlink-arc-passkey-wallet', '{"address":"nope"}')
    expect(cachedAddress()).toBeNull()
    rememberBalances(A, new Map([[USDC, 1n]]))
    forgetCachedWallet()
    expect(cachedAddress()).toBeNull()
    expect(cachedBalances(A).size).toBe(0)
  })
})
