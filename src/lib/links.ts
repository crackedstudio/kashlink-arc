import { createWalletClient, type Hex, http, type WalletClient } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { reactive } from 'vue'
import { CHAIN, ESCROW_ADDRESS, fees, rpc } from './arc'
import { ESCROW_ABI } from './escrow-abi'
import { escrowLogs } from './explorer'
import { loadLinks, saveLink, type StoredLink } from './storage'
import { ERC20_ABI, isNative, NATIVE, type Token, tokenByAddress } from './tokens'

/**
 * A KashLink on Arc.
 *
 * The link is a throwaway key pair. The private key rides in the URL fragment — never sent to any
 * server, browsers strip it before the request leaves — and its address is the link's id in the
 * escrow contract. The sender deposits against that id; whoever holds the key claims by sending a
 * transaction *from* that address, paid for by the stipend the contract dropped on it at creation.
 *
 * A link has `slots`: one for ordinary cash, more for a drop that the first N people to open it
 * share. It carries USDC (native) or EURC (ERC-20); see tokens.ts.
 */

/** The middle option is the default. */
export const EXPIRY_OPTIONS = [
  { label: '1 day', seconds: 86_400 },
  { label: '7 days', seconds: 7 * 86_400 },
  { label: '30 days', seconds: 30 * 86_400 },
] as const

export const MAX_SLOTS = 100
export const MAX_MESSAGE = 140

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

/**
 * `https://host/#<key>` or, with a note, `https://host/#<key>&m=<text>`. The note lives in the
 * fragment with the key, so it reaches the recipient and nobody else.
 */
export function linkUrl(key: Hex, message = ''): string {
  const note = message.trim().slice(0, MAX_MESSAGE)
  return `${PUBLIC_URL}/#${key.slice(2)}${note ? `&m=${encodeURIComponent(note)}` : ''}`
}

export interface ParsedHash {
  key: Hex
  message: string
}

/** The key (and note) from a URL fragment, with or without the leading `#`/`0x`, or null. */
export function parseHash(hash: string): ParsedHash | null {
  const raw = hash.replace(/^#/, '')
  const [keyPart, ...rest] = raw.split('&')
  let key = keyPart ?? ''
  try {
    key = decodeURIComponent(key)
  }
  catch {
    // leave as is
  }
  key = key.trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]{64}$/.test(key)) return null
  let message = ''
  for (const part of rest) {
    if (!part.startsWith('m=')) continue
    try {
      message = decodeURIComponent(part.slice(2)).slice(0, MAX_MESSAGE)
    }
    catch {
      message = ''
    }
  }
  return { key: `0x${key.toLowerCase()}` as Hex, message }
}

export function keyFromHash(hash: string): Hex | null {
  return parseHash(hash)?.key ?? null
}

// ------------------------------------------------------------------ reads

export type LinkStatus = 'unknown' | 'pending' | 'claimed' | 'refunded'
const STATUS: LinkStatus[] = ['unknown', 'pending', 'claimed', 'refunded']

export interface OnChainLink {
  sender: Hex
  token: Token
  amountEach: bigint
  slots: number
  claimed: number
  /** Unix seconds. */
  expiry: number
  status: LinkStatus
}

const escrow = { address: ESCROW_ADDRESS, abi: ESCROW_ABI } as const

export async function readLink(id: Hex): Promise<OnChainLink> {
  const [sender, amountEach, token, expiry, slots, claimed, status] = await rpc.readContract({ ...escrow, functionName: 'links', args: [id] })
  return { sender, token: tokenByAddress(token), amountEach, slots, claimed, expiry: Number(expiry), status: STATUS[status] ?? 'unknown' }
}

/** Whether `to` already took a slot of this link. Only meaningful for drops. */
export function hasClaimed(id: Hex, to: Hex): Promise<boolean> {
  return rpc.readContract({ ...escrow, functionName: 'claimedBy', args: [id, to] })
}

export interface Quote {
  token: Token
  amountEach: bigint
  slots: number
  /** `amountEach × slots`, what recipients get in total. */
  total: bigint
  fee: bigint
  /** `total + fee` in the link's token; what an ERC-20 sender must approve. */
  tokenTotal: bigint
  /** Native USDC per slot, so each claim can pay its own gas. */
  stipend: bigint
  /** Native USDC `create` requires: all the stipends, plus `tokenTotal` for a USDC link. */
  value: bigint
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

/** Same maths as `KashLinkEscrow.quote`, so a screen can quote without a round trip per keypress. */
export function quoteWith(params: FeeParams, token: Token, amountEach: bigint, slots: number): Quote {
  const total = amountEach * BigInt(slots)
  let fee = 0n
  if (params.feeBps > 0n) {
    fee = (total * params.feeBps) / 10_000n
    if (fee < params.feeMin) fee = params.feeMin
  }
  const tokenTotal = total + fee
  const stipends = params.stipend * BigInt(slots)
  return { token, amountEach, slots, total, fee, tokenTotal, stipend: params.stipend, value: isNative(token) ? tokenTotal + stipends : stipends }
}

/** Native balance of the link address: the stipends, or what is left of them. */
export function linkGasBalance(id: Hex): Promise<bigint> {
  return rpc.getBalance({ address: id })
}

// ------------------------------------------------------------------ writes

/**
 * Funds a link from the sender's wallet. A USDC link is one transaction. A EURC link is two when
 * the escrow's allowance is short: `approve`, then `create`. Resolves once the deposit is final.
 */
export async function createLink(client: WalletClient, link: NewLink, quote: Quote, expirySeconds: number, onApprove?: () => void): Promise<Hex> {
  const account = client.account!
  const { token } = quote
  // Ask the contract for the exact value at send time, so the numbers can never disagree.
  const [tokenTotal,, value] = await rpc.readContract({ ...escrow, functionName: 'quote', args: [token.address, quote.amountEach, quote.slots] })

  if (!isNative(token)) {
    const allowance = await rpc.readContract({ address: token.address, abi: ERC20_ABI, functionName: 'allowance', args: [account.address, ESCROW_ADDRESS] })
    if (allowance < tokenTotal) {
      onApprove?.()
      const approval = await client.writeContract({
        address: token.address,
        abi: ERC20_ABI,
        account,
        chain: CHAIN,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, tokenTotal],
        ...(await fees()),
      })
      const receipt = await rpc.waitForTransactionReceipt({ hash: approval })
      if (receipt.status !== 'success') throw new Error(`The ${token.symbol} approval failed.`)
    }
  }

  const expiry = Math.floor(Date.now() / 1000) + expirySeconds // uint40 → a plain number in viem
  const hash = await client.writeContract({
    ...escrow,
    account,
    chain: CHAIN,
    functionName: 'create',
    args: [link.id, token.address, quote.amountEach, quote.slots, expiry],
    value,
    ...(await fees()),
  })
  const receipt = await rpc.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The deposit transaction failed.')
  return hash
}

/**
 * Claims with the link's own key. No wallet involved: the key is in the link and the gas is the
 * stipend already sitting on its address.
 *
 * Several people can open a drop at once, and every claim is sent from the same link address, so
 * two claims can pick the same nonce. Finality is instant, so a retry with a fresh nonce lands.
 */
export async function claimLink(key: Hex, to: Hex): Promise<Hex> {
  const account = privateKeyToAccount(key)
  const client = createWalletClient({ account, chain: CHAIN, transport: http(rpc.transport.url) })
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const nonce = await rpc.getTransactionCount({ address: account.address, blockTag: 'pending' })
      const hash = await client.writeContract({ ...escrow, functionName: 'claim', args: [to], nonce, ...(await fees()) })
      const receipt = await rpc.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('The claim transaction failed.')
      return hash
    }
    catch (error) {
      lastError = error
      if (!/nonce|replacement|already known|underpriced/i.test(String((error as Error).message))) throw error
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
  throw lastError
}

/** Takes whatever is unclaimed in an expired link back to the sender's wallet. */
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

/** What a refund would return right now. */
export function unclaimedAmount(link: Pick<OnChainLink, 'amountEach' | 'slots' | 'claimed'>): bigint {
  return link.amountEach * BigInt(link.slots - link.claimed)
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
    chainState[link.id] ??= {
      sender: '0x',
      token: tokenByAddress(link.token ?? NATIVE),
      amountEach: BigInt(link.amount),
      slots: link.slots ?? 1,
      claimed: link.settled === 'claimed' ? link.slots ?? 1 : 0,
      expiry: link.expiry,
      status: link.settled,
    }
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
  token: Token
  amountEach: bigint
  slots: number
  expiry: number
  createdBlock: bigint
}

/**
 * Every link this address ever funded, from the contract's own events. Lets a sender see and refund
 * their links on a device that has no keys — it cannot re-share them, since the key is not on chain.
 */
export async function linksFundedBy(sender: Hex): Promise<ChainLink[]> {
  const { logs } = await escrowLogs('LinkCreated', sender)
  return logs.map(log => ({
    id: log.args.linkId as Hex,
    token: tokenByAddress((log.args.token as Hex) ?? NATIVE),
    amountEach: log.args.amountEach as bigint,
    slots: Number(log.args.slots),
    expiry: Number(log.args.expiry),
    createdBlock: log.blockNumber,
  }))
}
