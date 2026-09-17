import { getAddress, type Hex, isAddress } from 'viem'

/**
 * The address inside a scanned QR code. Wallets print addresses in a few shapes: bare (`0x…`),
 * as an EIP-681 URI (`ethereum:0x…@5042?value=…`, sometimes with a `pay-` prefix), or wrapped in
 * some app's own scheme. Any of them carries exactly one 40-hex-digit address, so that is what is
 * looked for; the first one wins. Checksummed on the way out.
 */
export function addressFromQr(text: string): Hex | null {
  const match = /0x[0-9a-fA-F]{40}/.exec(text)
  if (!match) return null
  const found = match[0]
  return isAddress(found) ? getAddress(found) : null
}
