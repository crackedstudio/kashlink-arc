import type { Hex } from 'viem'
import { ESCROW_ADDRESS, rpc } from './arc'
import { ESCROW_ABI } from './escrow-abi'
import { NATIVE, type Token, tokenByAddress, TOKENS } from './tokens'

/**
 * What the escrow has done, straight from its own storage. The contract keeps lifetime counters,
 * per-token totals and a deploy timestamp precisely so this needs nothing but an RPC — no indexer,
 * no backend, no analytics table. Recent activity comes from the RPC's log window, which Arc caps
 * at a few thousand blocks (roughly the last hour).
 */

const escrow = { address: ESCROW_ADDRESS, abi: ESCROW_ABI } as const
const RECENT_BLOCKS = 4_000n
const RECENT_LIMIT = 12

interface TokenStats {
  token: Token
  sent: bigint
  claimed: bigint
  refunded: bigint
}

interface RecentEvent {
  kind: 'created' | 'claimed' | 'refunded'
  token: Token
  amount: bigint
  slots?: number
  linkId: Hex
  tx: Hex
  timestamp: number
}

export interface Stats {
  links: number
  drops: number
  claims: number
  refunds: number
  byToken: TokenStats[]
  /** Unix seconds. */
  since: number
  recent: RecentEvent[]
}

export async function loadStats(): Promise<Stats> {
  const [[links, drops, claims, refunds], since, ...totals] = await Promise.all([
    rpc.readContract({ ...escrow, functionName: 'counters' }),
    rpc.readContract({ ...escrow, functionName: 'DEPLOYED_AT' }),
    ...TOKENS.map(t => rpc.readContract({ ...escrow, functionName: 'totals', args: [t.address] })),
  ])
  const byToken = TOKENS.map((token, i) => {
    const [sent, claimed, refunded] = totals[i]!
    return { token, sent, claimed, refunded }
  }).filter(t => t.sent > 0n)

  return {
    links: Number(links),
    drops: Number(drops),
    claims: Number(claims),
    refunds: Number(refunds),
    byToken,
    since: Number(since),
    recent: await recentActivity().catch(() => []),
  }
}

async function recentActivity(): Promise<RecentEvent[]> {
  const head = await rpc.getBlockNumber()
  const fromBlock = head > RECENT_BLOCKS ? head - RECENT_BLOCKS : 0n
  const [created, claimed, refunded] = await Promise.all([
    rpc.getContractEvents({ ...escrow, eventName: 'LinkCreated', fromBlock, toBlock: 'latest' }),
    rpc.getContractEvents({ ...escrow, eventName: 'LinkClaimed', fromBlock, toBlock: 'latest' }),
    rpc.getContractEvents({ ...escrow, eventName: 'LinkRefunded', fromBlock, toBlock: 'latest' }),
  ])

  // A claim's token is on its link, which may have been created before the window.
  const tokenOf = new Map<string, Token>()
  for (const log of created) tokenOf.set(log.args.linkId!.toLowerCase(), tokenByAddress(log.args.token ?? NATIVE))
  const unknown = [...new Set([...claimed, ...refunded].map(l => l.args.linkId!.toLowerCase()))].filter(id => !tokenOf.has(id))
  await Promise.all(unknown.map(async (id) => {
    const [,, token] = await rpc.readContract({ ...escrow, functionName: 'links', args: [id as Hex] })
    tokenOf.set(id, tokenByAddress(token))
  }))

  type Pending = Omit<RecentEvent, 'timestamp'> & { block: bigint }
  const events: Pending[] = [
    ...created.map<Pending>(l => ({ kind: 'created', token: tokenOf.get(l.args.linkId!.toLowerCase())!, amount: l.args.amountEach! * BigInt(l.args.slots!), slots: l.args.slots, linkId: l.args.linkId!, tx: l.transactionHash, block: l.blockNumber })),
    ...claimed.map<Pending>(l => ({ kind: 'claimed', token: tokenOf.get(l.args.linkId!.toLowerCase())!, amount: l.args.amount!, linkId: l.args.linkId!, tx: l.transactionHash, block: l.blockNumber })),
    ...refunded.map<Pending>(l => ({ kind: 'refunded', token: tokenOf.get(l.args.linkId!.toLowerCase())!, amount: l.args.amount!, linkId: l.args.linkId!, tx: l.transactionHash, block: l.blockNumber })),
  ].sort((a, b) => (a.block > b.block ? -1 : a.block < b.block ? 1 : 0)).slice(0, RECENT_LIMIT)

  const stamps = new Map<bigint, number>()
  await Promise.all([...new Set(events.map(e => e.block))].map(async (block) => {
    stamps.set(block, Number((await rpc.getBlock({ blockNumber: block })).timestamp))
  }))
  return events.map(({ block, ...e }) => ({ ...e, timestamp: stamps.get(block) ?? 0 }))
}
