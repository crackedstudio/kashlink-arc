import React from 'react'
import { interpolate } from 'remotion'
import { Backdrop } from '../ui/Backdrop'
import { Reveal, Words, useClock, useCount, useEnter, SNAPPY } from '../ui/motion'
import { Accent, Frame, Headline, Kicker, Narration, Pill } from '../ui/Story'
import { C, ESCROW, FONT } from '../theme'
import { Ico } from '../ui/Phone'
import { Voice, beats } from '../voiceover/timeline'

const B = beats('contract')

const fns = [
  ['quote', '(token, amountEach, slots)', 'what the sender pays'],
  ['create', '(id, token, amountEach, slots, expiry)', 'escrow · fee → treasury · 1¢ per slot → id'],
  ['claim', '(to)', 'msg.sender must be the link · one slot per address'],
  ['refund', '(id)', 'sender only, after expiry'],
  ['linksOf', '(sender) · counters() · totals(token)', 'the contract is its own index'],
]

const facts: { at: number; k: string; v: string; s: string }[] = [
  { at: B[0] + 2.0, k: 'Size', v: '~260 lines', s: 'zero dependencies, no proxy' },
  { at: B[0] + 2.5, k: 'Tests', v: '39 Foundry', s: 'reentrancy, ERC-20 failures, fee fuzzing' },
  { at: B[0] + 3.0, k: 'Owner can', v: 'set fee ≤ 5%', s: 'cannot touch escrow, pause, or upgrade' },
  { at: B[0] + 3.5, k: 'Fee', v: '1% flat', s: 'enforced on chain, charged at creation' },
  { at: B[0] + 4.0, k: 'Claim gas', v: '≈ $0.0014', s: 'from the 1¢ stipend on the link' },
  { at: B[0] + 4.5, k: 'Index', v: 'on chain', s: 'linksOf · counters · totals → /stats' },
]

/** 11 s: technical credibility. */
export const Contract: React.FC = () => {
  const { t } = useClock()
  const tests = useCount(39, B[0] + 2.6, 0.9)
  const addr = useEnter(B[2] + 0.3, SNAPPY)
  const stats = useEnter(B[2] + 1.0, SNAPPY)
  return (
    <Backdrop glow="blue">
      <Voice scene="contract" />
      <Frame>
        <Kicker n="06">Under the hood</Kicker>
        <Headline size={60} style={{ marginTop: 18 }}>
          <Words text="Small, tested, immutable. On mainnet." at={0.3} accent={['immutable.', 'mainnet.']} accentColor={C.gold} />
        </Headline>

        <div style={{ display: 'flex', gap: 60, marginTop: 44 }}>
          {/* code card */}
          <Reveal at={B[0] + 0.6} from="up" style={{ width: 880 }}>
            <div style={{ borderRadius: 22, background: 'rgba(11,13,26,0.7)', border: `1.5px solid ${C.whiteFaint}`, overflow: 'hidden', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${C.whiteFaint}`, fontSize: 18, color: C.whiteMuted, fontFamily: FONT }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: '#ff5f57' }} /><span style={{ width: 12, height: 12, borderRadius: 6, background: '#febc2e' }} /><span style={{ width: 12, height: 12, borderRadius: 6, background: '#28c840' }} />
                <span style={{ marginLeft: 10 }}>contracts/src/KashLinkEscrow.sol</span>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {fns.map(([name, sig, note], i) => {
                  const p = useEnter(B[0] + 0.9 + i * 0.25, SNAPPY)
                  return (
                    <div key={name} style={{ opacity: p, transform: `translateX(${(1 - p) * 20}px)`, fontSize: 22, lineHeight: 1.3 }}>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18 }}>// {note}</div>
                      <div style={{ display: 'flex', gap: 12, whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#c792ea' }}>function</span>
                        <span style={{ color: C.gold, fontWeight: 700 }}>{name}</span>
                        <span style={{ color: C.whiteMuted }}>{sig}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Reveal>

          {/* facts */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignContent: 'start' }}>
            {facts.map((f, i) => {
              const p = useEnter(f.at, SNAPPY)
              const v = i === 1 ? `${Math.round(tests)} Foundry` : f.v
              return (
                <div key={f.k} style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px)`, borderRadius: 20, padding: '20px 22px', background: 'rgba(255,255,255,0.06)', border: `1.5px solid ${C.whiteFaint}` }}>
                  <div style={{ fontSize: 17, color: C.whiteMuted, fontWeight: 600 }}>{f.k}</div>
                  <div style={{ fontSize: 34, fontWeight: 800, color: C.gold, letterSpacing: -0.5, marginTop: 2 }}>{v}</div>
                  <div style={{ fontSize: 17, color: C.whiteMuted, marginTop: 4, lineHeight: 1.3 }}>{f.s}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* mainnet address + stats strip */}
        <div style={{ position: 'absolute', left: 120, right: 120, bottom: 215, display: 'flex', gap: 28, alignItems: 'center' }}>
          <div style={{ opacity: addr, transform: `translateY(${(1 - addr) * 20}px)`, display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', borderRadius: 18, background: 'rgba(33,188,165,0.12)', border: `1.5px solid ${C.green}` }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: C.green, boxShadow: `0 0 12px ${C.green}` }} />
            <span style={{ fontWeight: 800, fontSize: 22, color: C.green }}>Arc mainnet</span>
            <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 21, color: C.white }}>{ESCROW}</span>
            <span style={{ color: C.whiteMuted, fontSize: 19 }}>block 21,366,046</span>
          </div>
          <div style={{ opacity: stats, transform: `translateY(${(1 - stats) * 20}px)`, fontSize: 19, color: C.whiteMuted, maxWidth: 520, lineHeight: 1.35 }}>
            Same address and byte-for-byte the same bytecode as the source-verified testnet deployment. No proxy: what you read is what runs.
          </div>
        </div>

        <Narration
          lines={[
            { at: B[0] + 0.3, text: <>~260 lines, 39 tests, no proxy, no pause. <Accent>The app never holds the money.</Accent></> },
            { at: B[1], text: <>Only two ways out of escrow: <Accent>claim</Accent> with the link key, or <Accent>refund</Accent> to the sender after expiry.</> },
            { at: B[2], text: <>Live on <Accent color={C.green}>Arc mainnet</Accent>. It keeps its own totals, so <Accent>/stats</Accent> needs no backend and no indexer.</> },
          ]}
        />
      </Frame>
    </Backdrop>
  )
}
