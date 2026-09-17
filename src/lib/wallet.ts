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

/** The short reason a person can act on, rather than viem's multi-paragraph dump. */
export function errorMessage(error: unknown): string {
  if (isUserRejection(error)) return 'Request cancelled.'
  const e = error as { shortMessage?: string, details?: string, message?: string }
  const text = e?.shortMessage || e?.details || e?.message || String(error)
  if (/insufficient funds/i.test(text)) return 'Not enough USDC in your wallet to cover the amount and the network fee.'
  return text.split('\n')[0]
}
