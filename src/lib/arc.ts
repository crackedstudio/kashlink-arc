import { type Chain, createPublicClient, http, parseGwei, type Hex } from 'viem'
import { arc, arcTestnet } from 'viem/chains'

/**
 * Everything about the chain in one place.
 *
 * Arc's native token is USDC, so every amount in this app — link values, balances, fees, gas — is
 * the same asset in the same unit: native 18-decimal wei, exactly what `msg.value` and
 * `eth_getBalance` speak. Arc also exposes a 6-decimal ERC-20 view of that balance at
 * 0x3600…0000; nothing here touches it, so the two can never be mixed up.
 */

/** Native USDC has 18 decimals on Arc (the ERC-20 view has 6 — unused here). */
export const USDC_DECIMALS = 18

/** `npm run dev` targets testnet; production builds target mainnet, unless overridden. */
const NETWORK: 'mainnet' | 'testnet' = (import.meta.env.VITE_ARC_NETWORK
  || (import.meta.env.DEV ? 'testnet' : 'mainnet')) as 'mainnet' | 'testnet'
export const IS_MAINNET = NETWORK === 'mainnet'

// viem's testnet entry predates the launch and still points at arc.network / arcscan; the current
// endpoints are the ones in docs.arc.io.
const testnet: Chain = {
  ...arcTestnet,
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' } },
}

export const CHAIN: Chain = IS_MAINNET ? arc : testnet
export const EXPLORER_URL = CHAIN.blockExplorers!.default.url

export const rpc = createPublicClient({
  chain: CHAIN,
  transport: http(import.meta.env.VITE_ARC_RPC_URL || undefined),
})

/** Deployed KashLinkEscrow. Absent in an unconfigured build; the app then refuses to create links. */
export const ESCROW_ADDRESS = (import.meta.env.VITE_ESCROW_ADDRESS ?? '') as Hex
export const ESCROW_CONFIGURED = /^0x[0-9a-fA-F]{40}$/.test(ESCROW_ADDRESS)

/**
 * Arc's mempool silently drops anything with `maxFeePerGas` under 20 gwei — no error, no receipt,
 * the transaction just never lands. Every write goes through here so that floor is never missed.
 */
const MIN_MAX_FEE = parseGwei('20')
const PRIORITY_FEE = parseGwei('1')

export async function fees(): Promise<{ maxFeePerGas: bigint, maxPriorityFeePerGas: bigint }> {
  let maxFeePerGas = MIN_MAX_FEE
  try {
    const estimate = await rpc.estimateFeesPerGas()
    if (estimate.maxFeePerGas > maxFeePerGas) maxFeePerGas = estimate.maxFeePerGas
  }
  catch {
    // the floor alone is fine under normal load
  }
  return { maxFeePerGas, maxPriorityFeePerGas: PRIORITY_FEE }
}

export function txUrl(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`
}

export function addressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`
}

/** Parameters for `wallet_addEthereumChain`, so a wallet that has never seen Arc can add it. */
export function addChainParams() {
  return {
    chainId: `0x${CHAIN.id.toString(16)}`,
    chainName: CHAIN.name,
    nativeCurrency: CHAIN.nativeCurrency,
    rpcUrls: [...CHAIN.rpcUrls.default.http],
    blockExplorerUrls: [EXPLORER_URL],
  }
}
