import type { Hex } from 'viem'

export interface StoredLink {
  /** The link's private key — the only copy besides the shared URL. */
  key: Hex
  /** Its address, which is the link's id in the escrow contract. */
  id: Hex
  /** Per-slot amount in the token's smallest units, as a decimal string; JSON has no bigint. */
  amount: string
  /** Token address; absent on links from before EURC, which were all native USDC. */
  token?: Hex
  /** How many people can claim; absent means 1. */
  slots?: number
  /** Note shown to the recipient. Part of the URL, so kept here to re-share the same link. */
  message?: string
  /** Unix seconds after which the sender can take it back. */
  expiry: number
  createdAt: number
  fundingTx?: Hex
  /**
   * Terminal state, cached once it is known. A claimed or refunded link can never change again, so
   * it is never looked up on chain a second time.
   */
  settled?: 'claimed' | 'refunded'
}

// The key here is what lets the sender re-share a link; the escrow contract, not this key, holds the
// money, so losing it means losing the ability to share — not the funds, which can still be refunded
// from the sender's wallet after expiry. Still, a failed write should abort the deposit — hence no try/catch.
const KEY = 'kashlink-arc-links'

export function loadLinks(): StoredLink[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  }
  catch {
    return []
  }
}

function write(list: StoredLink[]) {
  const json = JSON.stringify(list)
  localStorage.setItem(KEY, json)
  if (localStorage.getItem(KEY) !== json) throw new Error('Could not save the KashLink on this device.')
}

export function saveLink(link: StoredLink) {
  write([link, ...loadLinks().filter(l => l.id !== link.id)])
}

export function removeLink(id: Hex) {
  write(loadLinks().filter(l => l.id !== id))
}
