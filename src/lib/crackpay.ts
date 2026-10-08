import { CRACKPAY_ORIGINS, ErrorCode, errorCode, getCrackPayProvider, isFramed, type MiniAppProvider } from '@crackpay/miniapp-sdk'
import { type Hex, isAddress, numberToHex } from 'viem'
import { CHAIN } from './arc'
import type { Connected } from './wallet'

/**
 * KashLink as a CrackPay Mini App.
 *
 * CrackPay (https://www.crackpay.xyz) is a stablecoin wallet on Arc that opens Mini Apps in a
 * frame and lends them the user's account. It is a third kind of sender alongside a browser wallet
 * and the passkey wallet (wallet.ts, passkey.ts), and the thinnest of the three: the account is
 * already connected when the page loads, CrackPay sponsors the gas, and it shows the confirmation
 * and signs with the user's passkey in its own page — this app never sees a key or a prompt.
 *
 * What that costs us, and why the screens ask `inCrackPay`:
 *
 * - **No connect button.** The provider arrives after a postMessage handshake, so detection is
 *   asynchronous; sign-in UI must wait for it rather than offer a wallet that is already there.
 * - **No signing, no batching, no gas fields.** `eth_sendTransaction` is the only write, one call
 *   at a time, and `gas`/`maxFeePerGas`/`nonce` are ignored — so the requests go straight to the
 *   provider instead of through viem, which would estimate gas and fetch a nonce for nothing.
 * - **One network per CrackPay.** Each CrackPay runs on one Arc network (www.crackpay.xyz is
 *   mainnet) and refuses every other chain, so this build only works inside a CrackPay on the same
 *   network; `wrong-network` says so in plain words instead of failing at the first transaction.
 *   See docs/crackpay.md.
 * - **Inside a frame** there are no passkeys and no camera, and storage is partitioned away from
 *   the same app in an ordinary tab. The passkey wallet and the QR scanner are therefore not
 *   offered here; claiming into the CrackPay account is.
 */

export const CRACKPAY_URL = 'https://www.crackpay.xyz'

/**
 * Which CrackPay to trust. The SDK's own list is the real one; `VITE_CRACKPAY_ORIGINS` adds to it,
 * comma-separated, for working against a CrackPay served from somewhere else. A dev build also
 * trusts a CrackPay on `http://localhost:3000`, so the two can be developed together without any
 * configuration. Whatever is on this list is trusted as the wallet, so nothing belongs on it that
 * is not yours — which is why the localhost entry is dev-only and never reaches a deployed app.
 */
const HOST_ORIGINS: readonly string[] = [
  ...CRACKPAY_ORIGINS,
  ...(import.meta.env.VITE_CRACKPAY_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean),
  ...(import.meta.env.DEV ? ['http://localhost:3000'] : []),
]

/**
 * What a screen needs to know about CrackPay, derived once from `CrackPay` in App.vue. `framed` is
 * the part that matters even when CrackPay never answers: in a frame there are no passkeys, no
 * browser extension and no camera, so those are never offered there.
 */
export interface CrackPayContext {
  framed: boolean
  /** True while the handshake is outstanding: offer nothing yet. */
  detecting: boolean
  /** The CrackPay account, once connected on the network this build uses. */
  account: Hex | null
  /** Why CrackPay cannot be used here, when it cannot. */
  notice: string | null
}

export type CrackPay =
  /** An ordinary browser tab: nothing here, and nothing waited for. */
  | { status: 'absent' }
  /** Inside CrackPay, but this build points at a network CrackPay does not offer. */
  | { status: 'wrong-network', chainId: number }
  /** Inside CrackPay, with the user's account. */
  | { status: 'connected', wallet: Connected }

/**
 * Whether the page *might* be inside CrackPay, answered synchronously. False means certainly not,
 * so the sign-in screen can show its buttons immediately instead of waiting on the handshake.
 */
export function maybeFramed(): boolean {
  return isFramed()
}

/** `found` as the screens read it. `detecting` is true until `detectCrackPay()` has resolved. */
export function context(found: CrackPay, detecting: boolean): CrackPayContext {
  return {
    framed: maybeFramed(),
    detecting,
    account: found.status === 'connected' ? found.wallet.address : null,
    notice: found.status === 'wrong-network'
      ? `This KashLink is on ${CHAIN.name}, and this CrackPay is on another network — so it cannot send from in here. Open KashLink in a browser tab instead.`
      : null,
  }
}

let detecting: Promise<CrackPay> | null = null

/** Looks for CrackPay once per page load; later callers get the same answer. */
export function detectCrackPay(): Promise<CrackPay> {
  detecting ??= detect().catch(() => ({ status: 'absent' as const }))
  return detecting
}

async function detect(): Promise<CrackPay> {
  const provider = await getCrackPayProvider({ hostOrigins: HOST_ORIGINS })
  if (!provider) return { status: 'absent' }
  const chainId = Number(BigInt(await provider.request({ method: 'eth_chainId' }) as Hex))
  if (chainId !== CHAIN.id) return { status: 'wrong-network', chainId }
  const [address] = await provider.request({ method: 'eth_requestAccounts' }) as Hex[]
  if (!address || !isAddress(address)) throw new Error('CrackPay returned no account.')
  return { status: 'connected', wallet: sender(provider, address) }
}

/**
 * The CrackPay account as a sender. Each call is one `eth_sendTransaction`, which CrackPay checks
 * against this app's listing, shows to the user, sponsors and resolves only once the transaction is
 * final — so there is nothing to wait for afterwards, and a revert rejects rather than returning a
 * hash. A EURC `approve` followed by `create` is therefore two confirmations, as in a browser wallet.
 */
function sender(provider: MiniAppProvider, address: Hex): Connected {
  return {
    name: 'CrackPay',
    address,
    kind: 'crackpay',
    async send(calls, onPrompt) {
      let hash: Hex = '0x'
      for (const [i, call] of calls.entries()) {
        onPrompt?.(i)
        hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{ from: address, to: call.to, data: call.data, value: numberToHex(call.value ?? 0n) }],
        }) as Hex
      }
      return hash
    },
  }
}

/**
 * The plain-words reason a CrackPay request failed, or null when the error is not one of CrackPay's
 * and `errorMessage` should read it as usual.
 */
export function crackpayErrorMessage(error: unknown): string | null {
  switch (errorCode(error)) {
    case ErrorCode.Unauthorized:
      // The call is outside this app's CrackPay listing — a deployment mismatch, not the user's doing.
      return 'CrackPay would not allow this transaction. This version of KashLink may be using a contract that is not in its CrackPay listing.'
    case ErrorCode.UnsupportedMethod:
      return 'CrackPay does not support this request.'
    case ErrorCode.UnrecognizedChain:
      return `CrackPay only works on Arc Testnet, and this KashLink is on ${CHAIN.name}.`
    case ErrorCode.Internal:
      // CrackPay says this exactly when it does not know whether the operation landed.
      return /never confirmed/i.test(String((error as Error)?.message))
        ? 'CrackPay sent the transaction but never saw it confirm. Check your balance before trying again.'
        : null
    default:
      return null
  }
}
