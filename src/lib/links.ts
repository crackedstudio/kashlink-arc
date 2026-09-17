import { createWalletClient, type Hex, http, type WalletClient } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { reactive } from 'vue'
import { CHAIN, ESCROW_ADDRESS, fees, rpc } from './arc'
import { ESCROW_ABI } from './escrow-abi'
import { loadLinks, saveLink, type StoredLink } from './storage'

/**
 * A KashLink on Arc.
 *
 * The link is a throwaway key pair. The private key rides in the URL fragment — never sent to any
 * server, browsers strip it before the request leaves — and its address is the link's id in the
 * escrow contract. The sender deposits against that id; whoever holds the key claims by sending a
 * transaction *from* that address, paid for by the stipend the contract dropped on it at creation.
 *
 * All amounts are native USDC wei (18 decimals). See arc.ts.
 */

/** The middle option is the default. */
export const EXPIRY_OPTIONS = [
  { label: '1 day', seconds: 86_400 },
  { label: '7 days', seconds: 7 * 86_400 },
  { label: '30 days', seconds: 30 * 86_400 },
] as const

const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || (typeof location !== 'undefined' ? location.origin : '')).replace(/\/+$/, '')

// ------------------------------------------------------------------ keys and URLs

export interface NewLink {
  key: Hex
  id: Hex
}

export function newLink(): NewLink {
  const key = generatePrivateKey()
  return { key, id: privateKeyToAccount(key).address }
}

export function linkIdOf(key: Hex): Hex {
  return privateKeyToAccount(key).address
}

export function linkUrl(key: Hex): string {
  return `${PUBLIC_URL}/#${key.slice(2)}`
}

/** The key from a URL fragment, with or without the leading `#`/`0x`, or null if it is not one. */
export function keyFromHash(hash: string): Hex | null {
  let raw = hash.replace(/^#/, '')
  try {
    raw = decodeURIComponent(raw)
  }
  catch {
    // leave as is
  }
  raw = raw.trim().replace(/^0x/i, '')
  return /^[0-9a-fA-F]{64}$/.test(raw) ? `0x${raw.toLowerCase()}` as Hex : null
}

// ------------------------------------------------------------------ reads

export type LinkStatus = 'unknown' | 'pending' | 'claimed' | 'refunded'
const STATUS: LinkStatus[] = ['unknown', 'pending', 'claimed', 'refunded']

export interface OnChainLink {
  sender: Hex
  amount: bigint
  /** Unix seconds. */
  expiry: number
  status: LinkStatus
}

const escrow = { address: ESCROW_ADDRESS, abi: ESCROW_ABI } as const

export async function readLink(id: Hex): Promise<OnChainLink> {
  const [sender, amount, expiry, status] = await rpc.readContract({ ...escrow, functionName: 'links', args: [id] })
  return { sender, amount, expiry: Number(expiry), status: STATUS[status] ?? 'unknown' }
}

export interface Quote {
  amount: bigint
  fee: bigint
  stipend: bigint
  total: bigint
}

export interface FeeParams {
  feeBps: bigint
  feeMin: bigint
  stipend: bigint
}

let feeParamsPromise: Promise<FeeParams> | null = null

/** The contract's fee settings, read once per session. */
export function feeParams(): Promise<FeeParams> {
  feeParamsPromise ??= Promise.all([
    rpc.readContract({ ...escrow, functionName: 'feeBps' }),
    rpc.readContract({ ...escrow, functionName: 'feeMin' }),
    rpc.readContract({ ...escrow, functionName: 'STIPEND' }),
  ]).then(([feeBps, feeMin, stipend]) => ({ feeBps: BigInt(feeBps), feeMin, stipend })).catch((error) => {
    feeParamsPromise = null
    throw error
  })
  return feeParamsPromise
}

/** Same maths as `KashLinkEscrow.feeFor`, so a screen can quote without a round trip per keypress. */
export function quoteWith(params: FeeParams, amount: bigint): Quote {
  let fee = 0n
  if (params.feeBps > 0n) {
    fee = (amount * params.feeBps) / 10_000n
    if (fee < params.feeMin) fee = params.feeMin
  }
  return { amount, fee, stipend: params.stipend, total: amount + fee + params.stipend }
}

/** What a link of `amount` costs, straight from the contract so the numbers can never disagree. */
async function quote(amount: bigint): Promise<Quote> {
  const [fee, stipend] = await Promise.all([
    rpc.readContract({ ...escrow, functionName: 'feeFor', args: [amount] }),
    rpc.readContract({ ...escrow, functionName: 'STIPEND' }),
  ])
  return { amount, fee, stipend, total: amount + fee + stipend }
}

/** Native balance of the link address: the stipend, or what is left of it. */
export function linkGasBalance(id: Hex): Promise<bigint> {
  return rpc.getBalance({ address: id })
}

// ------------------------------------------------------------------ writes

/** Funds a link from the sender's wallet. Resolves once the deposit is final (one block on Arc). */
export async function createLink(client: WalletClient, link: NewLink, amount: bigint, expirySeconds: number): Promise<Hex> {
  const { total } = await quote(amount)
  const expiry = BigInt(Math.floor(Date.now() / 1000) + expirySeconds)
  const hash = await client.writeContract({
    ...escrow,
    account: client.account!,
    chain: CHAIN,
    functionName: 'create',
    args: [link.id, amount, expiry],
    value: total,
    ...(await fees()),
  })
  await rpc.waitForTransactionReceipt({ hash })
  return hash
}

/**
 * Claims with the link's own key. No wallet involved: the key is in the link and the gas is the
 * stipend already sitting on its address.
 */
export async function claimLink(key: Hex, to: Hex): Promise<Hex> {
  const account = privateKeyToAccount(key)
  const client = createWalletClient({ account, chain: CHAIN, transport: http(rpc.transport.url) })
  const hash = await client.writeContract({ ...escrow, functionName: 'claim', args: [to], ...(await fees()) })
  const receipt = await rpc.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The claim transaction failed.')
  return hash
}

/** Takes an expired, unclaimed link back to the sender's wallet. */
export async function refundLink(client: WalletClient, id: Hex): Promise<Hex> {
  const hash = await client.writeContract({
    ...escrow,
    account: client.account!,
    chain: CHAIN,
    functionName: 'refund',
    args: [id],
    ...(await fees()),
  })
  const receipt = await rpc.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The refund transaction failed.')
  return hash
}

// ------------------------------------------------------------------ the sender's links

/** Live on-chain state per link id, shared by every screen that shows it. */
export const chainState = reactive<Record<string, OnChainLink>>({})

export function isExpired(link: Pick<OnChainLink, 'expiry' | 'status'>): boolean {
  return link.status === 'pending' && link.expiry * 1000 <= Date.now()
}

/** How many lookups run at once — the public RPC is shared. */
const CONCURRENCY = 4

/**
 * Fills `chainState` for these links. Settled links are remembered in storage and never re-read:
 * a claimed or refunded link cannot change again. Individual failures leave a link unknown.
 */
export async function refreshStatuses(links: StoredLink[] = loadLinks()): Promise<void> {
  const queue = links.filter((link) => {
    if (!link.settled) return true
    chainState[link.id] ??= { sender: '0x', amount: BigInt(link.amount), expiry: link.expiry, status: link.settled }
    return false
  })
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let link = queue.shift(); link; link = queue.shift()) {
      try {
        const state = await readLink(link.id)
        chainState[link.id] = state
        if (state.status === 'claimed' || state.status === 'refunded') saveLink({ ...link, settled: state.status })
      }
      catch {
        delete chainState[link.id]
      }
    }
  })
  await Promise.all(workers)
}

export interface ChainLink {
  id: Hex
  amount: bigint
  expiry: number
  createdBlock: bigint
}

/**
 * Every link this address ever funded, from the contract's own events. Lets a sender see and refund
 * their links on a device that has no keys — it cannot re-share them, since the key is not on chain.
 */
export async function linksFundedBy(sender: Hex): Promise<ChainLink[]> {
  const fromBlock = BigInt(import.meta.env.VITE_ESCROW_DEPLOY_BLOCK || 0)
  const logs = await rpc.getContractEvents({ ...escrow, eventName: 'LinkCreated', args: { sender }, fromBlock, toBlock: 'latest' })
  return logs.map(log => ({
    id: log.args.linkId!,
    amount: log.args.amount!,
    expiry: Number(log.args.expiry!),
    createdBlock: log.blockNumber,
  }))
}
