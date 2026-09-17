import { createWalletClient, encodeFunctionData, type Hex, http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { reactive } from 'vue'
import { CHAIN, ESCROW_ADDRESS, fees, LEGACY_ESCROWS, rpc } from './arc'
import { ESCROW_ABI } from './escrow-abi'
import { loadLinks, saveLink, type StoredLink } from './storage'
import { ERC20_ABI, isNative, NATIVE, type Token, tokenByAddress } from './tokens'
import type { Call, Connected } from './wallet'

/**
 * A KashLink on Arc.
 *
 * The link is a throwaway key pair. The private key rides in the URL fragment — never sent to any
 * server, browsers strip it before the request leaves — and its address is the link's id in the
 * escrow contract. The sender deposits against that id; whoever holds the key claims by sending a
 * transaction *from* that address, paid for by the stipend the contract dropped on it at creation.
 *
 * A link has `slots`: one for ordinary cash, more for a drop that the first N people to open it
 * share. A drop cannot tell people apart — whoever holds it can claim every slot to fresh addresses —
 * so paying several specific people is done with separate single-slot links instead, funded together
 * by `createMany`. It carries USDC (native) or EURC (ERC-20); see tokens.ts.
 */

/** The middle option is the default. */
export const EXPIRY_OPTIONS = [
  { label: '1 day', seconds: 86_400 },
  { label: '7 days', seconds: 7 * 86_400 },
  { label: '30 days', seconds: 30 * 86_400 },
] as const

export const MAX_SLOTS = 100

/** For more than one person: a link each (`separate`), or one first-come-first-served link (`drop`). */
export type LinkMode = 'separate' | 'drop'
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
/** Old escrows answer the same `links` / `claim` / `refund` / `claimedBy` / `linksOf` calls. */
const at = (address: Hex) => ({ address, abi: ESCROW_ABI }) as const

/** Which escrow holds each link id, once found. */
const escrowOfId = new Map<string, Hex>()

async function readAt(address: Hex, id: Hex): Promise<OnChainLink> {
  const [sender, amountEach, token, expiry, slots, claimed, status] = await rpc.readContract({ ...at(address), functionName: 'links', args: [id] })
  return { sender, token: tokenByAddress(token), amountEach, slots, claimed, expiry: Number(expiry), status: STATUS[status] ?? 'unknown' }
}

/**
 * Reads a link from whichever escrow holds it: the current one first, then older ones. A link on
 * none of them reads as `unknown` from the current escrow, which is where a new deposit will land.
 */
export async function readLink(id: Hex, known?: Hex): Promise<OnChainLink> {
  const cached = known ?? escrowOfId.get(id.toLowerCase())
  if (cached) return readAt(cached, id)
  const current = await readAt(ESCROW_ADDRESS, id)
  if (current.status !== 'unknown' || !LEGACY_ESCROWS.length) {
    if (current.status !== 'unknown') escrowOfId.set(id.toLowerCase(), ESCROW_ADDRESS)
    return current
  }
  for (const legacy of LEGACY_ESCROWS) {
    const old = await readAt(legacy, id)
    if (old.status !== 'unknown') {
      escrowOfId.set(id.toLowerCase(), legacy)
      return old
    }
  }
  return current
}

async function escrowOf(id: Hex, known?: Hex): Promise<Hex> {
  if (known) return known
  const cached = escrowOfId.get(id.toLowerCase())
  if (cached) return cached
  await readLink(id)
  return escrowOfId.get(id.toLowerCase()) ?? ESCROW_ADDRESS
}

/** Whether `to` already took a slot of this link. Only meaningful for drops. */
export async function hasClaimed(id: Hex, to: Hex): Promise<boolean> {
  return rpc.readContract({ ...at(await escrowOf(id)), functionName: 'claimedBy', args: [id, to] })
}

export interface Quote {
  token: Token
  amountEach: bigint
  /** How many people get `amountEach`. */
  people: number
  /** `single` for one person; otherwise how the `people` are paid. */
  mode: 'single' | LinkMode
  /** Slots per link: `people` for a drop, else 1. */
  slots: number
  /** Links funded: `people` for separate links, else 1. */
  links: number
  /** `amountEach × people`, what recipients get in total. */
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
  /** Whether the escrow has `createMany` / `refundMany`; older deployments do not. */
  batch: boolean
}

let feeParamsPromise: Promise<FeeParams> | null = null

/** The contract's fee settings, read once per session. */
export function feeParams(): Promise<FeeParams> {
  feeParamsPromise ??= Promise.all([
    rpc.readContract({ ...escrow, functionName: 'feeBps' }),
    rpc.readContract({ ...escrow, functionName: 'feeMin' }),
    rpc.readContract({ ...escrow, functionName: 'STIPEND' }),
    rpc.readContract({ ...escrow, functionName: 'MAX_BATCH' }).then(() => true, () => false),
  ]).then(([feeBps, feeMin, stipend, batch]) => ({ feeBps: BigInt(feeBps), feeMin, stipend, batch })).catch((error) => {
    feeParamsPromise = null
    throw error
  })
  return feeParamsPromise
}

function feeFor(params: FeeParams, total: bigint): bigint {
  if (params.feeBps === 0n) return 0n
  const fee = (total * params.feeBps) / 10_000n
  return fee < params.feeMin ? params.feeMin : fee
}

/**
 * Same maths as `KashLinkEscrow.quote` (a single link or a drop) and `quoteMany` (separate links,
 * priced as that many single links, so a fee floor applies to each), without a round trip per keypress.
 */
export function quoteWith(params: FeeParams, token: Token, amountEach: bigint, people: number, mode: LinkMode = 'separate'): Quote {
  const kind = people === 1 ? 'single' : mode
  const links = kind === 'separate' ? people : 1
  const slots = kind === 'drop' ? people : 1
  const total = amountEach * BigInt(people)
  const fee = feeFor(params, amountEach * BigInt(slots)) * BigInt(links)
  const tokenTotal = total + fee
  const stipends = params.stipend * BigInt(people)
  return { token, amountEach, people, mode: kind, slots, links, total, fee, tokenTotal, stipend: params.stipend, value: isNative(token) ? tokenTotal + stipends : stipends }
}

/** Native balance of the link address: the stipends, or what is left of them. */
export function linkGasBalance(id: Hex): Promise<bigint> {
  return rpc.getBalance({ address: id })
}

// ------------------------------------------------------------------ writes

/**
 * Funds links from the sender's wallet: one link (single or drop), or one link per person for separate
 * links. EURC needs an `approve` first when the escrow's allowance is short — a second prompt in a
 * browser wallet, the same one in a passkey wallet. Resolves once the deposit is final.
 */
export async function createLinks(wallet: Connected, links: NewLink[], quote: Quote, expirySeconds: number, onApprove?: () => void): Promise<Hex> {
  if (links.length !== quote.links) throw new Error('Link count does not match the quote.')
  const { token } = quote
  const batch = quote.links > 1 && (await feeParams()).batch
  // Ask the contract for the exact amounts at send time, so the numbers can never disagree.
  const [tokenTotal,, value] = await rpc.readContract(quote.links > 1
    ? { ...escrow, functionName: 'quoteMany', args: [token.address, quote.amountEach, BigInt(quote.links)] }
    : { ...escrow, functionName: 'quote', args: [token.address, quote.amountEach, quote.slots] })
    .catch(() => [quote.tokenTotal, quote.fee, quote.value] as const) // escrows without quoteMany

  const calls: Call[] = []
  if (!isNative(token)) {
    const allowance = await rpc.readContract({ address: token.address, abi: ERC20_ABI, functionName: 'allowance', args: [wallet.address, ESCROW_ADDRESS] })
    if (allowance < tokenTotal) {
      calls.push({
        to: token.address,
        data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [ESCROW_ADDRESS, tokenTotal] }),
        failure: `The ${token.symbol} approval failed.`,
      })
    }
  }

  const expiry = Math.floor(Date.now() / 1000) + expirySeconds // uint40 → a plain number in viem
  if (batch) {
    calls.push({
      to: ESCROW_ADDRESS,
      data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'createMany', args: [links.map(l => l.id), token.address, quote.amountEach, expiry] }),
      value,
      failure: 'The deposit transaction failed.',
    })
  }
  else {
    // One `create` per link: a single link or drop, or separate links on an escrow without createMany.
    const each = value / BigInt(links.length)
    for (const link of links) {
      calls.push({
        to: ESCROW_ADDRESS,
        data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'create', args: [link.id, token.address, quote.amountEach, quote.slots, expiry] }),
        value: each,
        failure: 'The deposit transaction failed.',
      })
    }
  }
  const approving = calls.length > 1 && !isNative(token) && calls[0]!.to === token.address
  return wallet.send(calls, i => i === 0 && approving && onApprove?.())
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
  const holder = at(await escrowOf(account.address))
  const client = createWalletClient({ account, chain: CHAIN, transport: http(rpc.transport.url) })
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const nonce = await rpc.getTransactionCount({ address: account.address, blockTag: 'pending' })
      const hash = await client.writeContract({ ...holder, functionName: 'claim', args: [to], nonce, ...(await fees()) })
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
export function refundLink(wallet: Connected, id: Hex): Promise<Hex> {
  return refundLinks(wallet, [id])
}

/**
 * Takes several expired links back at once. Links on the current escrow go in one `refundMany`;
 * links on an old escrow, or on one without `refundMany`, get a `refund` each. A browser wallet
 * prompts per call, a passkey wallet once. All or nothing on chain, so pass only links just read as
 * pending.
 */
export async function refundLinks(wallet: Connected, ids: Hex[]): Promise<Hex> {
  const byEscrow = new Map<Hex, Hex[]>()
  for (const id of ids) {
    const holder = await escrowOf(id)
    byEscrow.set(holder, [...(byEscrow.get(holder) ?? []), id])
  }
  const { batch } = await feeParams()
  const calls: Call[] = []
  for (const [holder, group] of byEscrow) {
    if (holder === ESCROW_ADDRESS && batch && group.length > 1) {
      for (let i = 0; i < group.length; i += MAX_SLOTS) {
        calls.push({
          to: holder,
          data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'refundMany', args: [group.slice(i, i + MAX_SLOTS)] }),
          failure: 'The refund transaction failed.',
        })
      }
    }
    else {
      for (const id of group) {
        calls.push({ to: holder, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'refund', args: [id] }), failure: 'The refund transaction failed.' })
      }
    }
  }
  return wallet.send(calls)
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
        const state = await readLink(link.id, link.escrow)
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
  escrow: Hex
  token: Token
  amountEach: bigint
  slots: number
  expiry: number
}

/**
 * Every link this address ever funded, from the contract's own per-sender list. Lets a sender see
 * and refund their links on a device that has no keys — it cannot re-share them, since the key is
 * not on chain. Reads are batched a few at a time; the public RPC is shared.
 */
export async function linksFundedBy(sender: Hex): Promise<ChainLink[]> {
  const out: ChainLink[] = []
  for (const holder of [ESCROW_ADDRESS, ...LEGACY_ESCROWS]) {
    const ids = await rpc.readContract({ ...at(holder), functionName: 'linksOf', args: [sender] }).catch(() => [] as readonly Hex[])
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = await Promise.all(ids.slice(i, i + CONCURRENCY).map(async (id) => {
        escrowOfId.set(id.toLowerCase(), holder)
        const link = await readAt(holder, id)
        chainState[id] = link
        return { id, escrow: holder, token: link.token, amountEach: link.amountEach, slots: link.slots, expiry: link.expiry }
      }))
      out.push(...batch)
    }
  }
  return out
}
