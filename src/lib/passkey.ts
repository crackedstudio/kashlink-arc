import {
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from '@circle-fin/modular-wallets-core'
import { createPublicClient, encodeFunctionData, type Hex } from 'viem'
import { createBundlerClient, type P256Credential, type SmartAccount, toWebAuthnAccount } from 'viem/account-abstraction'
import { CHAIN, IS_MAINNET } from './arc'
import { isNative, type Token } from './tokens'

/**
 * A wallet for people who have none: a Circle Modular Wallet owned by a passkey.
 *
 * On the claim screen, "create a wallet" registers a passkey (Face ID / Touch ID / the browser's
 * own prompt), derives the smart account's address, and the link is claimed to it. The account is
 * deployed lazily by its first outgoing transaction, which on Arc it can pay for with the USDC it
 * just received — no paymaster and no sponsorship needed, the same property the links rely on.
 *
 * Passkeys are bound to the domain in the Circle Console, and the client key ships in the bundle
 * by design (it is a client key). Both come from `VITE_CIRCLE_CLIENT_KEY`; without it, none of this
 * is offered. The credential is kept in localStorage so the wallet can be reopened on this device.
 * Circle recommends an httpOnly cookie for that, which a static app cannot set; the credential is
 * a public key plus an id, not a secret, and the passkey itself never leaves the authenticator.
 */

const CLIENT_KEY = import.meta.env.VITE_CIRCLE_CLIENT_KEY ?? ''
const CLIENT_URL = import.meta.env.VITE_CIRCLE_CLIENT_URL || 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
export const PASSKEYS_ENABLED = !!CLIENT_KEY

const STORAGE_KEY = 'kashlink-arc-passkey'

export interface PasskeyWallet {
  address: Hex
  account: SmartAccount
}

function transports() {
  return {
    passkey: toPasskeyTransport(CLIENT_URL, CLIENT_KEY),
    modular: toModularTransport(`${CLIENT_URL}/${IS_MAINNET ? 'arc' : 'arcTestnet'}`, CLIENT_KEY),
  }
}

async function accountFor(credential: P256Credential): Promise<PasskeyWallet> {
  const { modular } = transports()
  const client = createPublicClient({ chain: CHAIN, transport: modular })
  const account = await toCircleSmartAccount({ client, owner: toWebAuthnAccount({ credential }) })
  return { address: account.address, account }
}

function remember(credential: P256Credential) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credential))
  }
  catch {
    // private mode: the wallet works for this session only
  }
}

/** The credential saved on this device, if any. */
export function savedCredential(): P256Credential | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as P256Credential : null
  }
  catch {
    return null
  }
}

export function forgetPasskey() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  }
  catch {
    // nothing to forget
  }
}

/** Registers a new passkey and returns the wallet it owns. Shows the platform's passkey prompt. */
export async function createPasskeyWallet(username = 'KashLink wallet'): Promise<PasskeyWallet> {
  const { passkey } = transports()
  const credential = await toWebAuthnCredential({ transport: passkey, mode: WebAuthnMode.Register, username })
  remember(credential)
  return accountFor(credential)
}

/** Reopens a wallet: the saved credential if there is one, else the platform's passkey picker. */
export async function openPasskeyWallet(): Promise<PasskeyWallet> {
  const saved = savedCredential()
  if (saved) return accountFor(saved)
  const { passkey } = transports()
  const credential = await toWebAuthnCredential({ transport: passkey, mode: WebAuthnMode.Login })
  remember(credential)
  return accountFor(credential)
}

/**
 * Sends `amount` of `token` out of the passkey wallet. The account pays its own gas in USDC — the
 * first send also deploys it — so a wallet that only ever received EURC needs a little USDC first.
 */
export async function sendFromPasskey(wallet: PasskeyWallet, token: Token, to: Hex, amount: bigint): Promise<Hex> {
  const { modular } = transports()
  const bundler = createBundlerClient({ chain: CHAIN, transport: modular })
  const call = isNative(token)
    ? { to, value: amount }
    : { to: token.address, data: encodeFunctionData({ abi: [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const, functionName: 'transfer', args: [to, amount] }) }
  const hash = await bundler.sendUserOperation({ account: wallet.account, calls: [call] })
  const { receipt } = await bundler.waitForUserOperationReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The transfer failed.')
  return receipt.transactionHash
}

