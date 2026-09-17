import type { Hex } from 'viem'
import { escrowLogs } from './explorer'
import { NATIVE, type Token, tokenByAddress, TOKENS } from './tokens'

/**
 * Everything the escrow has ever done, summed from its own events. No backend, no analytics table:
 * the page reads the same logs anyone can read on the explorer.
 */

export interface TokenStats {
  token: Token
  /** Sum of `amountEach × slots` over created links. */
  sent: bigint
  claimed: bigint
  refunded: bigint
  /** Per-link totals, for the median. */
  linkTotals: bigint[]
}

export interface Stats {
  links: number
  drops: number
  /** Total slots across all links. */
  slots: number
  claims: number
  /** Distinct addresses paid. */
  people: number
  refunds: number
  /** Links whose every slot was claimed, plus single links claimed. */
  fullyClaimed: number
  byToken: TokenStats[]
  /** First and last activity, unix seconds; only known from the explorer. */
  since?: number
  latest?: number
  /** True when only the recent RPC window could be read. */
  partial: boolean
  /** Most recent events, newest first. */
  recent: RecentEvent[]
}

export interface RecentEvent {
  kind: 'created' | 'claimed' | 'refunded'
  token: Token
  amount: bigint
  slots?: number
  linkId: Hex
  tx: Hex
  timestamp?: number
}

export async function loadStats(): Promise<Stats> {
  const [created, claimed, refunded] = await Promise.all([
    escrowLogs('LinkCreated'),
    escrowLogs('LinkClaimed'),
    escrowLogs('LinkRefunded'),
  ])
  const partial = created.partial || claimed.partial || refunded.partial

  const byToken = new Map<Token, TokenStats>(TOKENS.map(t => [t, { token: t, sent: 0n, claimed: 0n, refunded: 0n, linkTotals: [] }]))
  const tokenOf = new Map<string, Token>()
  const slotsOf = new Map<string, number>()
  const claimsOf = new Map<string, number>()
  let slots = 0
  let drops = 0

  for (const log of created.logs) {
    const id = (log.args.linkId as Hex).toLowerCase()
    const token = tokenByAddress((log.args.token as Hex) ?? NATIVE)
    const n = Number(log.args.slots)
    const total = (log.args.amountEach as bigint) * BigInt(n)
    tokenOf.set(id, token)
    slotsOf.set(id, n)
    slots += n
    if (n > 1) drops++
    const t = byToken.get(token)!
    t.sent += total
    t.linkTotals.push(total)
  }

  const people = new Set<string>()
  for (const log of claimed.logs) {
    const id = (log.args.linkId as Hex).toLowerCase()
    const token = tokenOf.get(id)
    if (token) byToken.get(token)!.claimed += log.args.amount as bigint
    people.add((log.args.to as Hex).toLowerCase())
    claimsOf.set(id, (claimsOf.get(id) ?? 0) + 1)
  }
  for (const log of refunded.logs) {
    const token = tokenOf.get((log.args.linkId as Hex).toLowerCase())
    if (token) byToken.get(token)!.refunded += log.args.amount as bigint
  }

  let fullyClaimed = 0
  for (const [id, n] of slotsOf) if ((claimsOf.get(id) ?? 0) >= n) fullyClaimed++

  const recent: RecentEvent[] = [
    ...created.logs.map<RecentEvent>(l => ({
      kind: 'created',
      token: tokenByAddress((l.args.token as Hex) ?? NATIVE),
      amount: (l.args.amountEach as bigint) * BigInt(Number(l.args.slots)),
      slots: Number(l.args.slots),
      linkId: l.args.linkId as Hex,
      tx: l.transactionHash,
      timestamp: l.timestamp,
    })),
    ...claimed.logs.map<RecentEvent>(l => ({
      kind: 'claimed',
      token: tokenOf.get((l.args.linkId as Hex).toLowerCase()) ?? TOKENS[0],
      amount: l.args.amount as bigint,
      linkId: l.args.linkId as Hex,
      tx: l.transactionHash,
      timestamp: l.timestamp,
    })),
    ...refunded.logs.map<RecentEvent>(l => ({
      kind: 'refunded',
      token: tokenOf.get((l.args.linkId as Hex).toLowerCase()) ?? TOKENS[0],
      amount: l.args.amount as bigint,
      linkId: l.args.linkId as Hex,
      tx: l.transactionHash,
      timestamp: l.timestamp,
    })),
  ].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, 12)

  const stamps = [...created.logs, ...claimed.logs, ...refunded.logs].map(l => l.timestamp).filter((t): t is number => !!t)

  return {
    links: created.logs.length,
    drops,
    slots,
    claims: claimed.logs.length,
    people: people.size,
    refunds: refunded.logs.length,
    fullyClaimed,
    byToken: [...byToken.values()].filter(t => t.linkTotals.length > 0),
    since: stamps.length ? Math.min(...stamps) : undefined,
    latest: stamps.length ? Math.max(...stamps) : undefined,
    partial,
    recent,
  }
}

export function median(values: bigint[]): bigint {
  if (!values.length) return 0n
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2n
}
