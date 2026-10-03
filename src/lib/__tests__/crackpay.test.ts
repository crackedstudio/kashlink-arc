import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAIN } from '../arc'

/**
 * The CrackPay provider is the CrackPay page itself, reached over postMessage, so these tests stand
 * a fake in its place and check the two things that are easy to get wrong: that a transaction goes
 * out as one plain `eth_sendTransaction` with no gas fields and no estimate, and that CrackPay's
 * numeric error codes turn into something a person can act on.
 */

let provider: { request: (args: { method: string, params?: unknown }) => Promise<unknown> } | null = null
let framed = true
let sent: { method: string, params?: unknown }[] = []
let trusted: readonly string[] = []

vi.mock('@crackpay/miniapp-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@crackpay/miniapp-sdk')>()
  return {
    ...actual,
    isFramed: () => framed,
    getCrackPayProvider: async (options?: { hostOrigins?: readonly string[] }) => {
      trusted = options?.hostOrigins ?? []
      return provider
    },
  }
})

const ACCOUNT = '0x2e2729F897D4E5799ADe12B3D911b40BA0307Aa4'

/** A CrackPay that answers for `chainId` and records every request. */
function fake(chainId = CHAIN.id, hashes = ['0xaaa', '0xbbb']) {
  let nth = 0
  return {
    async request(args: { method: string, params?: unknown }) {
      sent.push(args)
      if (args.method === 'eth_chainId') return `0x${chainId.toString(16)}`
      if (args.method === 'eth_requestAccounts') return [ACCOUNT]
      if (args.method === 'eth_sendTransaction') return hashes[nth++] ?? '0xccc'
      throw new Error(`unexpected ${args.method}`)
    },
  }
}

/** A fresh copy of the module, since it remembers its answer for the life of the page. */
async function load() {
  vi.resetModules()
  return import('../crackpay')
}

beforeEach(() => {
  provider = null
  framed = true
  sent = []
  trusted = []
  vi.unstubAllEnvs()
})

describe('detecting CrackPay', () => {
  it('is absent in an ordinary tab', async () => {
    const { detectCrackPay } = await load()
    await expect(detectCrackPay()).resolves.toEqual({ status: 'absent' })
  })

  it('connects with the account CrackPay reports', async () => {
    provider = fake()
    const { detectCrackPay } = await load()
    const found = await detectCrackPay()
    expect(found.status).toBe('connected')
    expect(found.status === 'connected' && found.wallet).toMatchObject({ kind: 'crackpay', name: 'CrackPay', address: ACCOUNT })
  })

  it('refuses a CrackPay on another network rather than failing at the first transaction', async () => {
    provider = fake(1)
    const { detectCrackPay } = await load()
    expect(await detectCrackPay()).toEqual({ status: 'wrong-network', chainId: 1 })
    expect(sent.map(r => r.method)).not.toContain('eth_requestAccounts')
  })

  it('treats a broken handshake as absent', async () => {
    provider = { request: async () => { throw new Error('postMessage went nowhere') } }
    const { detectCrackPay } = await load()
    expect(await detectCrackPay()).toEqual({ status: 'absent' })
  })

  it('trusts the real CrackPay, and a local one while developing the two together', async () => {
    const { detectCrackPay } = await load()
    await detectCrackPay()
    expect(trusted).toEqual(['https://crackpay.vercel.app', 'http://localhost:3000'])
  })

  it('trusts the real CrackPay and nothing else in a built app', async () => {
    // The localhost entry is a convenience for `npm run dev`; whatever is on this list is trusted
    // as the wallet, so a deployed KashLink must carry nothing but CrackPay's own origin.
    vi.stubEnv('DEV', false)
    const { detectCrackPay } = await load()
    await detectCrackPay()
    expect(trusted).toEqual(['https://crackpay.vercel.app'])
  })

  it('asks only once per page load', async () => {
    provider = fake()
    const { detectCrackPay } = await load()
    const [a, b] = await Promise.all([detectCrackPay(), detectCrackPay()])
    expect(a).toBe(b)
    expect(sent.filter(r => r.method === 'eth_chainId')).toHaveLength(1)
  })
})

describe('sending through CrackPay', () => {
  async function connected() {
    provider = fake()
    const { detectCrackPay } = await load()
    const found = await detectCrackPay()
    if (found.status !== 'connected') throw new Error('not connected')
    return found.wallet
  }

  it('sends one plain transaction per call, in order, and returns the last hash', async () => {
    const wallet = await connected()
    const prompts: number[] = []
    const hash = await wallet.send([
      { to: '0x3600000000000000000000000000000000000000', data: '0x095ea7b3', failure: 'approve failed' },
      { to: '0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62', data: '0xdeadbeef', value: 10n ** 16n, failure: 'deposit failed' },
    ], i => prompts.push(i))

    expect(hash).toBe('0xbbb')
    expect(prompts).toEqual([0, 1])
    const writes = sent.filter(r => r.method === 'eth_sendTransaction')
    expect(writes).toHaveLength(2)
    expect((writes[0]!.params as Record<string, string>[])[0]).toEqual({
      from: ACCOUNT, to: '0x3600000000000000000000000000000000000000', data: '0x095ea7b3', value: '0x0',
    })
    expect((writes[1]!.params as Record<string, string>[])[0]).toEqual({
      from: ACCOUNT, to: '0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62', data: '0xdeadbeef', value: '0x2386f26fc10000',
    })
  })

  it('never estimates gas, fetches a nonce or sets a fee: CrackPay ignores all of it and sponsors the gas', async () => {
    const wallet = await connected()
    await wallet.send([{ to: '0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62', data: '0x', failure: 'failed' }])
    expect(sent.map(r => r.method)).not.toContain('eth_estimateGas')
    expect(sent.map(r => r.method)).not.toContain('eth_getTransactionCount')
    const tx = (sent.at(-1)!.params as Record<string, unknown>[])[0]!
    for (const field of ['gas', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'nonce']) {
      expect(tx).not.toHaveProperty(field)
    }
  })

  it('stops at the first call the user turns down', async () => {
    provider = {
      async request(args: { method: string, params?: unknown }) {
        sent.push(args)
        if (args.method === 'eth_chainId') return `0x${CHAIN.id.toString(16)}`
        if (args.method === 'eth_requestAccounts') return [ACCOUNT]
        throw Object.assign(new Error('The user rejected the request'), { code: 4001 })
      },
    }
    const { detectCrackPay } = await load()
    const found = await detectCrackPay()
    if (found.status !== 'connected') throw new Error('not connected')
    await expect(found.wallet.send([
      { to: '0x1111111111111111111111111111111111111111', data: '0x', failure: 'one' },
      { to: '0x2222222222222222222222222222222222222222', data: '0x', failure: 'two' },
    ])).rejects.toMatchObject({ code: 4001 })
    expect(sent.filter(r => r.method === 'eth_sendTransaction')).toHaveLength(1)
  })
})

describe('what the screens are told', () => {
  it('hands over the account once connected', async () => {
    provider = fake()
    const { context, detectCrackPay } = await load()
    const found = await detectCrackPay()
    expect(context(found, false)).toEqual({ framed: true, detecting: false, account: ACCOUNT, notice: null })
  })

  it('explains a network mismatch instead of offering a wallet that cannot work', async () => {
    provider = fake(1)
    const { context, detectCrackPay } = await load()
    const found = await detectCrackPay()
    const seen = context(found, false)
    expect(seen.account).toBeNull()
    expect(seen.notice).toContain('Arc Testnet')
    expect(seen.notice).toContain(CHAIN.name)
  })

  it('says nothing at all in an ordinary tab', async () => {
    framed = false
    const { context, detectCrackPay } = await load()
    expect(context(await detectCrackPay(), false)).toEqual({ framed: false, detecting: false, account: null, notice: null })
  })
})

describe('CrackPay errors', () => {
  it('names a call outside the app listing, through viem\'s wrapping too', async () => {
    const { crackpayErrorMessage } = await load()
    expect(crackpayErrorMessage({ code: 4100 })).toMatch(/listing/)
    expect(crackpayErrorMessage({ cause: { code: 4100 } })).toMatch(/listing/)
  })

  it('warns that an unconfirmed operation may still have happened', async () => {
    const { crackpayErrorMessage } = await load()
    const message = crackpayErrorMessage({ code: -32603, message: 'Operation 0x1 was submitted but never confirmed' })
    expect(message).toMatch(/Check your balance/)
  })

  it('leaves a plain revert, a cancellation and a non-CrackPay error to the usual reader', async () => {
    const { crackpayErrorMessage } = await load()
    expect(crackpayErrorMessage({ code: -32603, message: 'Transaction 0x1 reverted' })).toBeNull()
    expect(crackpayErrorMessage({ code: 4001 })).toBeNull()
    expect(crackpayErrorMessage(new Error('insufficient funds'))).toBeNull()
  })

  it('is what errorMessage says for a CrackPay failure', async () => {
    const { errorMessage } = await import('../wallet')
    expect(errorMessage({ code: 4100 })).toMatch(/listing/)
    expect(errorMessage({ code: 4001 })).toBe('Request cancelled.')
  })
})
