import { formatUnits, parseUnits, type Hex } from 'viem'
import { IS_MAINNET, rpc } from './arc'

/**
 * The stablecoins a link can carry. USDC is Arc's native token (18-decimal `msg.value`, and the
 * only thing that pays for gas); EURC is Circle's euro stablecoin, a plain ERC-20 with 6 decimals
 * deployed at genesis. The escrow tells them apart by `address(0)` versus the ERC-20 address.
 */
export interface Token {
  symbol: 'USDC' | 'EURC'
  name: string
  /** `0x000…0` for the native token. */
  address: Hex
  decimals: number
  /** ISO currency the token is pegged to, for display. */
  currency: 'USD' | 'EUR'
}

export const NATIVE = '0x0000000000000000000000000000000000000000' as const

export const USDC: Token = { symbol: 'USDC', name: 'USD Coin', address: NATIVE, decimals: 18, currency: 'USD' }
export const EURC: Token = {
  symbol: 'EURC',
  name: 'Euro Coin',
  address: IS_MAINNET ? '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1' : '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  decimals: 6,
  currency: 'EUR',
}

export const TOKENS: readonly Token[] = [USDC, EURC]

export function tokenByAddress(address: string): Token {
  return TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase()) ?? USDC
}

export function isNative(token: Token): boolean {
  return token.address === NATIVE
}

/** Smallest units → "$5.00" / "€5.00". Sub-cent amounts keep the digits that make them non-zero. */
export function formatAmount(units: bigint, token: Token = USDC): string {
  const n = Number(formatUnits(units, token.decimals))
  const digits = n > 0 && n < 0.01 ? 4 : 2
  return n.toLocaleString('en-US', { style: 'currency', currency: token.currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** "5", "5.5", "0.10" → smallest units. Throws on anything that is not a plain decimal. */
export function parseAmount(input: string, token: Token = USDC): bigint {
  if (!/^\d+(\.\d+)?$/.test(input)) throw new Error(`Not an amount: ${input}`)
  return parseUnits(input, token.decimals)
}

export const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

/** Balance of `token` for `address`, in its smallest units. */
export function getTokenBalance(token: Token, address: Hex): Promise<bigint> {
  if (isNative(token)) return rpc.getBalance({ address })
  return rpc.readContract({ address: token.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
}
