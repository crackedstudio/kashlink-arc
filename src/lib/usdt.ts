import { encodeFunctionData, hexToBigInt, type Hex, slice } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

/**
 * USDT KashLinks on Polygon.
 *
 * Polygon only ever accepts POL for gas, and a freshly made link address has none — so a plain
 * transfer out of it is impossible. Polygon's child tokens instead expose `executeMetaTransaction`:
 * the holder signs an EIP-712 message off-chain (no gas), and anyone can submit it and pay the gas.
 * That is what the relayer does, at both ends, so neither sender nor recipient ever needs POL.
 *
 * The EIP-712 domain below is non-standard — the chain id lives in `salt` and there is no `chainId`
 * field. It was verified against the contract's own DOMAIN_SEPARATOR; changing any part of it makes
 * every signature silently invalid.
 */

export const POLYGON_CHAIN_ID = 137
export const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as const
export const USDT_DECIMALS = 6

/** The contract's own `name()`; part of the EIP-712 domain, so it must match exactly. */
export const USDT_DOMAIN_NAME = 'USDT0'

/**
 * Service fee, charged in USDT so nobody ever needs POL.
 *
 * It is added on top at funding, so the recipient always gets the round number the sender chose, and
 * it is taken when the link is resolved, whether claimed or reverted (see `payoutFromLink` in usdt-links.ts).
 * The floor exists because 1% of a small link is less than the gas it costs to move.
 */
export const FEE_BPS = 100n // 1%
export const FEE_MIN = 100_000n // 0.10 USDT
export const TREASURY_ADDRESS = (import.meta.env?.VITE_TREASURY_ADDRESS ?? '') as Hex
export const FEES_ENABLED = /^0x[0-9a-fA-F]{40}$/.test(TREASURY_ADDRESS)

export function feeFor(amount: bigint): bigint {
  if (!FEES_ENABLED) return 0n
  const percent = (amount * FEE_BPS) / 10_000n
  return percent > FEE_MIN ? percent : FEE_MIN
}

export const USDT_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getNonce', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  {
    name: 'executeMetaTransaction',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'userAddress', type: 'address' },
      { name: 'functionSignature', type: 'bytes' },
      { name: 'sigR', type: 'bytes32' },
      { name: 'sigS', type: 'bytes32' },
      { name: 'sigV', type: 'uint8' },
    ],
    outputs: [{ type: 'bytes' }],
  },
] as const

const META_TX_TYPES = {
  MetaTransaction: [
    { name: 'nonce', type: 'uint256' },
    { name: 'from', type: 'address' },
    { name: 'functionSignature', type: 'bytes' },
  ],
} as const

function domain() {
  return {
    name: USDT_DOMAIN_NAME,
    version: '1',
    verifyingContract: USDT_ADDRESS,
    salt: `0x${POLYGON_CHAIN_ID.toString(16).padStart(64, '0')}` as Hex,
  }
}

/** The EIP-712 payload a holder signs to let someone else move their USDT. */
export function transferTypedData(from: Hex, to: Hex, amount: bigint, nonce: bigint) {
  const functionSignature = encodeFunctionData({
    abi: USDT_ABI,
    functionName: 'transfer',
    args: [to, amount],
  })
  return {
    domain: domain(),
    types: META_TX_TYPES,
    primaryType: 'MetaTransaction' as const,
    message: { nonce, from, functionSignature },
    functionSignature,
  }
}

/** executeMetaTransaction takes r/s/v separately rather than a 65-byte signature. */
export function splitSignature(signature: Hex) {
  return {
    r: slice(signature, 0, 32),
    s: slice(signature, 32, 64),
    v: Number(hexToBigInt(slice(signature, 64, 65))),
  }
}

export interface UsdtLink {
  /** 32-byte secp256k1 key, base64url, carried in the link fragment. */
  secret: string
  address: Hex
  /** Smallest units (6 decimals). */
  value: bigint
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  base64 += '='.repeat((4 - (base64.length % 4)) % 4)
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

/** key[32] | amount uint64 big-endian — same shape as a NIM link, on a different curve. */
export function encodeUsdtLink(privateKey: Hex, value: bigint): string {
  const bytes = new Uint8Array(40)
  bytes.set(Uint8Array.from(privateKey.slice(2).match(/../g)!.map(h => parseInt(h, 16))), 0)
  new DataView(bytes.buffer).setBigUint64(32, value)
  return toBase64Url(bytes)
}

export function createUsdtLink(value: bigint): UsdtLink {
  const privateKey = generatePrivateKey()
  return {
    secret: encodeUsdtLink(privateKey, value),
    address: privateKeyToAccount(privateKey).address,
    value,
  }
}

export function parseUsdtLink(secret: string): UsdtLink | null {
  try {
    const bytes = fromBase64Url(secret)
    if (bytes.length < 40) return null
    const privateKey = `0x${[...bytes.slice(0, 32)].map(b => b.toString(16).padStart(2, '0')).join('')}` as Hex
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { secret, address: privateKeyToAccount(privateKey).address, value: view.getBigUint64(32) }
  }
  catch {
    return null
  }
}

export function linkAccount(secret: string) {
  const bytes = fromBase64Url(secret)
  const privateKey = `0x${[...bytes.slice(0, 32)].map(b => b.toString(16).padStart(2, '0')).join('')}` as Hex
  return privateKeyToAccount(privateKey)
}

export function formatUsdt(units: bigint): string {
  const whole = units / 1_000_000n
  const frac = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

export function parseUsdtAmount(input: string): bigint {
  const [whole = '0', frac = ''] = input.split('.')
  return BigInt(whole || '0') * 1_000_000n + BigInt((frac + '000000').slice(0, 6))
}
