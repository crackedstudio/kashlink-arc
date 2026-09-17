import { describe, expect, it } from 'vitest'
import { addressFromQr } from '../qr'

const addr = '0x70B22b00B1a579bc005dDB0c8770E11EdC20C178'

describe('addressFromQr', () => {
  it('reads a bare address', () => {
    expect(addressFromQr(addr)).toBe(addr)
    expect(addressFromQr(`  ${addr.toLowerCase()}\n`)).toBe(addr)
  })

  it('reads EIP-681 payment URIs', () => {
    expect(addressFromQr(`ethereum:${addr}`)).toBe(addr)
    expect(addressFromQr(`ethereum:${addr}@5042?value=1e18`)).toBe(addr)
    expect(addressFromQr(`ethereum:pay-${addr}@5042002`)).toBe(addr)
  })

  it('rejects anything without an address', () => {
    expect(addressFromQr('https://kashlink.example/#abcdef')).toBeNull()
    expect(addressFromQr('0x1234')).toBeNull()
    expect(addressFromQr('')).toBeNull()
  })
})
