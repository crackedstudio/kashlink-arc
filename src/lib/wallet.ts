import { createWalletClient, custom, type EIP1193Provider, type Hex } from 'viem'
import { addChainParams, CHAIN, fees, rpc } from './arc'

/**
 * The sender's wallet: whichever EVM wallet is installed in the browser — MetaMask, Rabby, Coinbase
 * Wallet, and so on — discovered through EIP-6963, with `window.ethereum` as the fallback for
 * wallets that predate it. A passkey wallet (passkey.ts) can stand in for one; both are `Connected`.
 *
 * Claiming never comes through here. A KashLink is claimed with its own key, so a recipient needs
 * an address to receive at and nothing more; connecting a wallet on the claim screen is only a
 * convenience to fill that address in.
 */

export interface DiscoveredWallet {
  uuid: string
  name: string
  icon: string
  provider: EIP1193Provider
}

interface AnnounceEvent extends Event {
  detail: { info: { uuid: string, name: string, icon: string, rdns: string }, provider: EIP1193Provider }
}

const found = new Map<string, DiscoveredWallet>()

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event) => {
    const { info, provider } = (event as AnnounceEvent).detail
    found.set(info.uuid, { uuid: info.uuid, name: info.name, icon: info.icon, provider })
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

/** Wallets present in this browser. Re-dispatches the request, since some inject late. */
export function discoverWallets(): DiscoveredWallet[] {
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  if (!found.size) {
    const legacy = (window as { ethereum?: EIP1193Provider }).ethereum
    if (legacy) return [{ uuid: 'legacy', name: 'Browser wallet', icon: '', provider: legacy }]
  }
  return [...found.values()]
}

/** One contract call, and what to tell the user if it lands but reverts. */
export interface Call {
  to: Hex
  data: Hex
  value?: bigint
  failure: string
}

export interface Connected {
  name: string
  address: Hex
  /** The wallet's own icon (EIP-6963), for a browser wallet that announced one. */
  icon?: string
  /** True for the passkey wallet, which has no extension to disconnect or switch. */
  passkey: boolean
  /**
   * Sends `calls` in order and resolves with the last transaction's hash once every call is final.
   * A browser wallet prompts once per call (`onPrompt` fires before each); a passkey wallet batches
   * them into a single operation and a single prompt.
   */
  send: (calls: Call[], onPrompt?: (index: number) => void) => Promise<Hex>
}

let current: Connected | null = null

export function connected(): Connected | null {
  return current
}

/** Forgets the browser wallet. The extension keeps its own permission; the app just stops using it. */
export function disconnect() {
  current = null
}

/**
 * Asks the wallet for an account and moves it onto Arc, adding the network first if the wallet has
 * never seen it. Both prompts are the wallet's own; nothing is signed.
 */
export async function connect(wallet: DiscoveredWallet): Promise<Connected> {
  const [address] = await wallet.provider.request({ method: 'eth_requestAccounts' }) as Hex[]
  if (!address) throw new Error('The wallet returned no account.')
  await switchToArc(wallet.provider)
  current = browserWallet(wallet, address)
  wallet.provider.on('accountsChanged', (accounts) => {
    const next = (accounts as Hex[])[0]
    current = next && current ? browserWallet(wallet, next) : null
  })
  return current
}

function browserWallet(wallet: DiscoveredWallet, address: Hex): Connected {
  const client = createWalletClient({ account: address, chain: CHAIN, transport: custom(wallet.provider) })
  return {
    name: wallet.name,
    address,
    icon: wallet.icon || undefined,
    passkey: false,
    async send(calls, onPrompt) {
      let hash: Hex = '0x'
      for (const [i, call] of calls.entries()) {
        onPrompt?.(i)
        hash = await client.sendTransaction({ account: address, chain: CHAIN, to: call.to, data: call.data, value: call.value, ...(await fees()) })
        const receipt = await rpc.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error(call.failure)
      }
      return hash
    },
  }
}

async function switchToArc(provider: EIP1193Provider) {
  const chainId = `0x${CHAIN.id.toString(16)}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  }
  catch (error) {
    // 4902: the wallet has no such chain. Add it, which also switches.
    const code = (error as { code?: number }).code
    if (code !== 4902 && !/unrecognized|not added|4902/i.test(String((error as Error).message))) throw error
    await provider.request({ method: 'wallet_addEthereumChain', params: [addChainParams()] })
  }
}

export function isUserRejection(error: unknown): boolean {
  const { code, name = '', message = '' } = (error ?? {}) as { code?: number, name?: string, message?: string }
  return code === 4001 || /denied|reject|cancel|declin/i.test(`${name} ${message}`)
}

/** Everything an error has to say, in one string the patterns below can search. */
function errorText(error: unknown): string {
  const e = error as { name?: string, shortMessage?: string, details?: string, message?: string, cause?: unknown }
  const parts = [e?.name, e?.shortMessage, e?.details, e?.message]
  // viem wraps the RPC's error a few levels deep; the useful part is often only in the cause.
  for (let cause = e?.cause, depth = 0; cause && depth < 4; cause = (cause as { cause?: unknown }).cause, depth++) {
    const c = cause as { name?: string, shortMessage?: string, details?: string, message?: string }
    parts.push(c.name, c.shortMessage, c.details, c.message)
  }
  return parts.filter(Boolean).join(' ') || String(error)
}

/** True when the failure is that the wallet cannot cover the amount or the gas. */
export function isInsufficientFunds(error: unknown): boolean {
  return /insufficient funds|insufficient balance|exceeds balance|InsufficientBalance|didn't pay prefund|AA21|AA13|out of gas|gas required exceeds/i.test(errorText(error))
}

/**
 * The short reason a person can act on, rather than viem's multi-paragraph dump. `token` is the
 * asset being sent, so a balance failure can name it.
 */
export function errorMessage(error: unknown, token = 'USDC'): string {
  if (isUserRejection(error)) return 'Request cancelled.'
  const text = errorText(error)
  // ERC-4337 codes: AA21 is the account failing to prefund its gas, AA13 the deployment failing —
  // for a fresh passkey wallet that is the same thing, no USDC to pay with.
  if (/didn't pay prefund|AA21|AA13/i.test(text)) return 'Not enough USDC in your wallet to pay the network fee. Add a little USDC and try again.'
  if (/exceeds balance|InsufficientBalance|insufficient balance/i.test(text) && token !== 'USDC') return `Not enough ${token} in your wallet for this amount.`
  if (/insufficient funds|insufficient balance|exceeds balance|out of gas|gas required exceeds/i.test(text)) {
    return token === 'USDC'
      ? 'Not enough USDC in your wallet to cover the amount and the network fee.'
      : `Not enough USDC in your wallet to pay the network fee for sending ${token}.`
  }
  if (/chain mismatch|does not match the chain|current chain of the wallet|wrong network|unsupported chain/i.test(text)) return 'Your wallet is on another network. Switch it to Arc and try again.'
  if (/nonce too low|already known|replacement transaction/i.test(text)) return 'A previous transaction is still landing. Wait a moment and try again.'
  if (/timed out|timeout|took too long/i.test(text)) return 'The network is slow right now. The transaction may still land — check your wallet before sending again.'
  if (/failed to fetch|network ?error|NetworkError|ECONNREFUSED|Load failed|HTTP request failed|502|503|504|rate limit|429/i.test(text)) return 'Could not reach the Arc network. Check your connection and try again.'
  if (/NotAllowedError|NotAllowed|abort/i.test(text)) return 'Passkey request was cancelled.'
  if (/entity config|SecurityError|domain|not set up/i.test(text)) return 'Passkey wallets are not set up for this site yet.'
  if (/invalid credentials|unauthori[sz]ed|\b40[13]\b/i.test(text)) return 'The wallet service did not accept this passkey. Try again; if it keeps happening, forget the wallet on this device and set it up afresh.'
  const e = error as { shortMessage?: string, details?: string, message?: string }
  // viem's "unknown RPC error" says nothing; the RPC's own line under it usually does.
  const generic = /unknown RPC error/i.test(e?.shortMessage ?? '')
  const first = ((generic && e?.details) || e?.shortMessage || e?.details || e?.message || String(error)).split('\n')[0]
  // Anything else is shown as is, without viem's "Version: viem@…" trailer or a raw JSON blob.
  return first.replace(/\s*Version: viem@.*$/, '').slice(0, 200) || 'Something went wrong. Please try again.'
}
