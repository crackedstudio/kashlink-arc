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
  /** Escrow that holds it; absent on links from before this was recorded, which are looked up. */
  escrow?: Hex
  /**
   * Set on links funded together as separate links for several people: the first link's id, this
   * link's position, and how many there are. Absent on single links and drops.
   */
  batch?: { id: Hex, index: number, size: number }
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
  saveLinks([link])
}

/** Saves several at once, newest first in the order given; replaces any with the same id. */
export function saveLinks(list: StoredLink[]) {
  const ids = new Set(list.map(l => l.id))
  write([...list, ...loadLinks().filter(l => !ids.has(l.id))])
}

export function removeLink(id: Hex) {
  removeLinks([id])
}

export function removeLinks(ids: Hex[]) {
  const gone = new Set(ids)
  write(loadLinks().filter(l => !gone.has(l.id)))
}

/** Every link funded together with `link`, in order; just `link` when it was not part of a batch. */
export function batchOf(link: StoredLink): StoredLink[] {
  if (!link.batch) return [link]
  const id = link.batch.id
  const found = loadLinks().filter(l => l.batch?.id === id).sort((a, b) => a.batch!.index - b.batch!.index)
  return found.length ? found : [link]
}
