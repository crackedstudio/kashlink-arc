import { CRACKPAY_ORIGINS, getCrackPayProvider, isFramed, WALLET_INFO } from '@crackpay/miniapp-sdk'
import type { EIP1193Provider } from 'viem'
import { shallowRef } from 'vue'
import type { DiscoveredWallet } from './wallet'

/**
 * KashLink as a CrackPay Mini App. Inside CrackPay the user's CrackPay account is the wallet: it is
 * connected from the start, with nothing to choose, install or create. In an ordinary tab nothing
 * here does anything and KashLink works as it always has.
 *
 * The SDK trusts CrackPay's own hosts. VITE_CRACKPAY_ORIGINS adds more (comma-separated), and a dev
 * build also trusts a CrackPay running locally.
 */
const hostOrigins = [
  ...CRACKPAY_ORIGINS,
  ...(import.meta.env.VITE_CRACKPAY_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean),
  ...(import.meta.env.DEV ? ['http://localhost:3000'] : []),
]

/** `undefined` while finding out, `null` outside CrackPay. Only a framed page can be inside it. */
export const crackpayWallet = shallowRef<DiscoveredWallet | null | undefined>(isFramed() ? undefined : null)

/** Resolves with CrackPay's wallet inside CrackPay, and with null anywhere else. */
export const crackpay: Promise<DiscoveredWallet | null> = getCrackPayProvider({ hostOrigins })
  .then(provider => provider && {
    uuid: 'crackpay',
    name: WALLET_INFO.name,
    icon: WALLET_INFO.icon,
    provider: provider as unknown as EIP1193Provider,
  })
  .catch(() => null)
  .then((wallet) => {
    crackpayWallet.value = wallet
    return wallet
  })
