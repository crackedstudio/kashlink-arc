import type { Hex } from 'viem'
import { type Token, TOKENS } from './tokens'

/**
 * What the device remembers about its passkey wallet, kept apart from passkey.ts so reading it never
 * pulls in the Circle SDK. The address is fixed for a credential, so once known the wallet sheet can
 * show it — and fetch balances straight from the chain — without waiting for the SDK to download
 * and ask Circle for it again. Balances are the last ones seen, shown until fresh ones arrive.
 */

export const CREDENTIAL_KEY = 'kashlink-arc-passkey'
const WALLET_KEY = 'kashlink-arc-passkey-wallet'

interface CachedWallet {
  address: Hex
  /** Smallest units as decimal strings, by token symbol; JSON has no bigint. */
  balances?: Record<string, string>
}

export function hasSavedPasskey(): boolean {
  try {
    return !!localStorage.getItem(CREDENTIAL_KEY)
  }
  catch {
    return false
  }
}

function read(): CachedWallet | null {
  try {
    const cached = JSON.parse(localStorage.getItem(WALLET_KEY) ?? 'null') as CachedWallet | null
    return cached && /^0x[0-9a-fA-F]{40}$/.test(cached.address) ? cached : null
  }
  catch {
    return null
  }
}

function write(cached: CachedWallet) {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(cached))
  }
  catch {
    // private mode: the sheet just loads the slow way
  }
}

/** The saved wallet's address, if this device has a passkey wallet and has seen its address. */
export function cachedAddress(): Hex | null {
  return hasSavedPasskey() ? read()?.address ?? null : null
}

export function cachedBalances(address: Hex): Map<Token, bigint> {
  const cached = read()
  const out = new Map<Token, bigint>()
  if (cached?.address.toLowerCase() !== address.toLowerCase()) return out
  for (const t of TOKENS) {
    const value = cached.balances?.[t.symbol]
    if (value && /^\d+$/.test(value)) out.set(t, BigInt(value))
  }
  return out
}

export function rememberAddress(address: Hex) {
  if (read()?.address.toLowerCase() !== address.toLowerCase()) write({ address })
}

export function rememberBalances(address: Hex, balances: Map<Token, bigint>) {
  write({ address, balances: Object.fromEntries([...balances].map(([t, v]) => [t.symbol, v.toString()])) })
}

export function forgetCachedWallet() {
  try {
    localStorage.removeItem(WALLET_KEY)
  }
  catch {
    // nothing to forget
  }
}
