import {
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from '@circle-fin/modular-wallets-core'
import { createPublicClient, encodeFunctionData, type Hex } from 'viem'
import { createBundlerClient, type P256Credential, type SmartAccount, toWebAuthnAccount } from 'viem/account-abstraction'
import { CHAIN, IS_MAINNET, PASSKEY_GAS_SPONSORED as SPONSORED } from './arc'
import { CREDENTIAL_KEY, forgetCachedWallet, rememberAddress } from './passkey-cache'
import { ERC20_ABI, formatAmount, isNative, type Token, USDC } from './tokens'
import type { Call, Connected } from './wallet'

/**
 * A wallet for people who have none: a Circle Modular Wallet owned by a passkey.
 *
 * On the claim screen, "create a wallet" registers a passkey (Face ID / Touch ID / the browser's
 * own prompt), derives the smart account's address, and the link is claimed to it. The account is
 * deployed lazily by its first outgoing transaction.
 *
 * Gas: an unsponsored user operation must hold a prefund for its whole gas limit before it runs —
 * about 0.16 USDC for the first one, which also deploys the account — so a wallet holding a few
 * cents can't send any of it. Circle's Gas Station pays instead (`SPONSORED`): on by default on
 * testnet, and on mainnet once a paymaster policy exists in the Console and
 * `VITE_CIRCLE_SPONSOR_GAS=true` is set.
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

/**
 * Fees come from Circle's own quote. viem's default (the chain's base fee plus a margin) can sit
 * below what Circle's bundler accepts, and its paymaster then refuses the operation outright.
 */
function bundlerClient() {
  const { modular } = transports()
  const client = createPublicClient({ chain: CHAIN, transport: modular })
  return createBundlerClient({
    chain: CHAIN,
    transport: modular,
    userOperation: {
      async estimateFeesPerGas() {
        const { medium } = await client.request<{ Method: 'circle_getUserOperationGasPrice', Parameters: [], ReturnType: { medium: { maxFeePerGas: string, maxPriorityFeePerGas: string } } }>({ method: 'circle_getUserOperationGasPrice', params: [] })
        return { maxFeePerGas: BigInt(medium.maxFeePerGas), maxPriorityFeePerGas: BigInt(medium.maxPriorityFeePerGas) }
      },
    },
  })
}

/**
 * viem reports a bundler's refusal as "Missing or invalid parameters"; the real reason is further
 * down the cause chain. The one people hit is not holding enough USDC for the gas prefund.
 */
function readable(error: unknown): unknown {
  for (let e = error as { cause?: unknown, details?: string, message?: string } | undefined; e; e = e.cause as typeof e) {
    const text = `${e.details ?? ''} ${e.message ?? ''}`
    const prefund = /must be at least (\d+)/.exec(text)
    if (prefund) return new Error(`Not enough USDC for gas. Keep at least ${formatAmount(BigInt(prefund[1]), USDC)} in the wallet on top of what you send.`)
    if (/AA21|didn't pay prefund/i.test(text)) return new Error('Not enough USDC in the wallet to pay for gas.')
    if (/paymaster|sponsor|policy|155509/i.test(text) && SPONSORED) return new Error('Gas sponsorship was refused. Check the Gas Station policy in the Circle Console.')
  }
  return error
}

async function accountFor(credential: P256Credential): Promise<PasskeyWallet> {
  const { modular } = transports()
  const client = createPublicClient({ chain: CHAIN, transport: modular })
  const account = await toCircleSmartAccount({ client, owner: toWebAuthnAccount({ credential }) })
  rememberAddress(account.address)
  return { address: account.address, account }
}

function remember(credential: P256Credential) {
  try {
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential))
  }
  catch {
    // private mode: the wallet works for this session only
  }
}

/** The credential saved on this device, if any. */
export function savedCredential(): P256Credential | null {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY)
    return raw ? JSON.parse(raw) as P256Credential : null
  }
  catch {
    return null
  }
}

export function forgetPasskey() {
  forgetCachedWallet()
  try {
    localStorage.removeItem(CREDENTIAL_KEY)
  }
  catch {
    // nothing to forget
  }
}

/**
 * Registers a new passkey and returns the wallet it owns. Shows the platform's passkey prompt.
 * Circle only accepts 5–50 characters of `[A-Za-z0-9_@.:+-]` (no spaces); the suffix tells several
 * KashLink passkeys apart in the device's passkey list.
 */
export async function createPasskeyWallet(
  username = `kashlink-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}`,
): Promise<PasskeyWallet> {
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
 * The passkey wallet as a sender, so it can fund and refund links like a browser wallet. All calls
 * go into one user operation, so a EURC approval and deposit are a single passkey prompt. The
 * account pays its own gas in USDC, and its first operation also deploys it.
 */
export function asSender(wallet: PasskeyWallet): Connected {
  return {
    name: 'KashLink wallet',
    address: wallet.address,
    passkey: true,
    async send(calls: Call[]) {
      const bundler = bundlerClient()
      let hash: Hex
      try {
        hash = await bundler.sendUserOperation({
          account: wallet.account,
          calls: calls.map(({ to, data, value }) => ({ to, data, value })),
          ...(SPONSORED ? { paymaster: true } : {}),
        })
      }
      catch (error) {
        throw readable(error)
      }
      const { receipt } = await bundler.waitForUserOperationReceipt({ hash })
      if (receipt.status !== 'success') throw new Error(calls.at(-1)!.failure)
      return receipt.transactionHash
    },
  }
}

/** Sends `amount` of `token` out of the passkey wallet. A wallet that only holds EURC needs a little USDC for gas first. */
export function sendFromPasskey(wallet: PasskeyWallet, token: Token, to: Hex, amount: bigint): Promise<Hex> {
  const call: Call = isNative(token)
    ? { to, data: '0x', value: amount, failure: 'The transfer failed.' }
    : { to: token.address, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [to, amount] }), failure: 'The transfer failed.' }
  return asSender(wallet).send([call])
}
