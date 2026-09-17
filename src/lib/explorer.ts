import { decodeEventLog, type Hex, toEventSelector } from 'viem'
import { ESCROW_ADDRESS, EXPLORER_URL, rpc } from './arc'
import { ESCROW_ABI } from './escrow-abi'

/**
 * The escrow's event history.
 *
 * Arc's public RPC caps `eth_getLogs` at a few thousand blocks — about an hour of Arc — so anything
 * that wants "every link ever" cannot scan from the deploy block over RPC. The explorer is
 * Blockscout, whose Etherscan-style `getLogs` is backed by an index and takes any range. That is
 * the primary source; the RPC covers the most recent window if the explorer is unreachable.
 */

const DEPLOY_BLOCK = BigInt(import.meta.env.VITE_ESCROW_DEPLOY_BLOCK || 0)
/** Under the RPC's range limit, with margin. */
const RPC_WINDOW = 5_000n
const PAGE = 1_000

type EscrowEvent = typeof ESCROW_ABI[number] & { type: 'event' }
export type EventName = EscrowEvent['name']

export interface EscrowLog<N extends EventName = EventName> {
  eventName: N
  args: Record<string, unknown>
  blockNumber: bigint
  transactionHash: Hex
  /** Unix seconds; only known from the explorer. */
  timestamp?: number
}

interface ExplorerLog {
  topics: (Hex | null)[]
  data: Hex
  blockNumber: Hex
  timeStamp: Hex
  transactionHash: Hex
}

function decode(log: { topics: Hex[], data: Hex }): { eventName: EventName, args: Record<string, unknown> } | null {
  try {
    const decoded = decodeEventLog({ abi: ESCROW_ABI, topics: log.topics as [Hex, ...Hex[]], data: log.data })
    return { eventName: decoded.eventName as EventName, args: decoded.args as unknown as Record<string, unknown> }
  }
  catch {
    return null
  }
}

async function fromExplorer(topic0: Hex, topic2?: Hex): Promise<EscrowLog[]> {
  const out: EscrowLog[] = []
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      module: 'logs',
      action: 'getLogs',
      address: ESCROW_ADDRESS,
      fromBlock: DEPLOY_BLOCK.toString(),
      toBlock: 'latest',
      topic0,
      page: String(page),
      offset: String(PAGE),
    })
    if (topic2) {
      params.set('topic2', topic2)
      params.set('topic0_2_opr', 'and')
    }
    const response = await fetch(`${EXPLORER_URL}/api?${params}`)
    if (!response.ok) throw new Error(`explorer ${response.status}`)
    const body = await response.json() as { status: string, message: string, result: ExplorerLog[] | string }
    if (!Array.isArray(body.result)) {
      if (/no records/i.test(body.message)) break
      throw new Error(body.message)
    }
    for (const log of body.result) {
      const decoded = decode({ topics: log.topics.filter((t): t is Hex => !!t), data: log.data })
      if (!decoded) continue
      out.push({ ...decoded, blockNumber: BigInt(log.blockNumber), transactionHash: log.transactionHash, timestamp: Number(log.timeStamp) })
    }
    if (body.result.length < PAGE) break
  }
  return out
}

async function fromRpc(eventName: EventName, args?: Record<string, unknown>): Promise<EscrowLog[]> {
  const head = await rpc.getBlockNumber()
  const fromBlock = head - RPC_WINDOW > DEPLOY_BLOCK ? head - RPC_WINDOW : DEPLOY_BLOCK
  const logs = await rpc.getContractEvents({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, eventName, args: args as never, fromBlock, toBlock: 'latest' })
  return logs.map(log => ({ eventName, args: log.args as Record<string, unknown>, blockNumber: log.blockNumber, transactionHash: log.transactionHash }))
}

/**
 * All logs of one escrow event, oldest first. `sender` filters `LinkCreated` by its second indexed
 * argument. Returns `partial: true` when only the RPC's recent window could be read.
 */
export async function escrowLogs(eventName: EventName, sender?: Hex): Promise<{ logs: EscrowLog[], partial: boolean }> {
  const event = ESCROW_ABI.find(e => e.type === 'event' && e.name === eventName) as EscrowEvent
  const topic0 = toEventSelector(event)
  const topic2 = sender ? `0x${sender.slice(2).toLowerCase().padStart(64, '0')}` as Hex : undefined
  try {
    const logs = await fromExplorer(topic0, topic2)
    return { logs: logs.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1)), partial: false }
  }
  catch {
    const logs = await fromRpc(eventName, sender ? { sender } : undefined)
    return { logs, partial: true }
  }
}

