import { beforeEach, describe, expect, it } from 'vitest'
import { loadLinks, removeLink, saveLink, type StoredLink } from '../storage'

// vitest runs in node; a Map is all localStorage needs to be here.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const link = (n: number): StoredLink => ({
  key: `0x${n.toString(16).padStart(64, '0')}`,
  id: `0x${n.toString(16).padStart(40, '0')}`,
  amount: (n * 10 ** 18).toString(),
  expiry: 1_800_000_000,
  createdAt: n,
})

describe('stored links', () => {
  beforeEach(() => store.clear())

  it('starts empty and tolerates garbage', () => {
    expect(loadLinks()).toEqual([])
    store.set('kashlink-arc-links', '{not json')
    expect(loadLinks()).toEqual([])
    store.set('kashlink-arc-links', '{"a":1}')
    expect(loadLinks()).toEqual([])
  })

  it('saves newest first and replaces by id', () => {
    saveLink(link(1))
    saveLink(link(2))
    expect(loadLinks().map(l => l.createdAt)).toEqual([2, 1])
    saveLink({ ...link(1), settled: 'claimed' })
    expect(loadLinks().map(l => [l.createdAt, l.settled])).toEqual([[1, 'claimed'], [2, undefined]])
  })

  it('removes by id', () => {
    saveLink(link(1))
    saveLink(link(2))
    removeLink(link(1).id)
    expect(loadLinks().map(l => l.createdAt)).toEqual([2])
  })
})
