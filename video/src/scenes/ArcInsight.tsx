import React from 'react'
import { Easing, interpolate } from 'remotion'
import { Backdrop } from '../ui/Backdrop'
import { Reveal, Words, useClock, useEnter, SNAPPY, BOUNCY } from '../ui/motion'
import { Accent, Frame, Headline, Kicker, Narration } from '../ui/Story'
import { C, FONT } from '../theme'
import { Logo } from '../ui/Logo'
import { Ico } from '../ui/Phone'
import { Voice, beats } from '../voiceover/timeline'

const B = beats('arc')

type P = { x: number; y: number }
const SENDER: P = { x: 200, y: 300 }
const ESCROW: P = { x: 840, y: 150 }
const LINK: P = { x: 840, y: 450 }
const RECIP: P = { x: 1480, y: 300 }

const Node: React.FC<{ p: P; at: number; label: string; sub?: string; children: React.ReactNode; ring?: string }> = ({ p, at, label, sub, children, ring = C.whiteFaint }) => {
  const s = useEnter(at, BOUNCY)
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%,-50%) scale(${s})`, opacity: s, textAlign: 'center', fontFamily: FONT }}>
      <div style={{ width: 132, height: 132, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: `2px solid ${ring}`, display: 'grid', placeItems: 'center', margin: '0 auto', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
        {children}
      </div>
      <div style={{ marginTop: 14, fontSize: 26, fontWeight: 800, whiteSpace: 'nowrap' }}>{label}</div>
      {sub && <div style={{ fontSize: 19, color: C.whiteMuted, whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}

/** A labelled packet that travels from a to b during [at, at+dur]. The trail line draws with it. */
const Packet: React.FC<{ a: P; b: P; at: number; dur?: number; label: string; color: string; big?: boolean; side?: 'top' | 'right' }> = ({ a, b, at, dur = 1.1, label, color, big, side = 'top' }) => {
  const { t } = useClock()
  const p = interpolate(t, [at, at + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
  // the packet and its label fade out once it has arrived; the trail stays faintly
  const fade = interpolate(t, [at + dur + 0.5, at + dur + 0.9], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const trail = interpolate(t, [at + dur + 0.5, at + dur + 0.9], [0.8, 0.25], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  if (t < at) return null
  // shorten so the line starts/ends at the circle edge (radius 66)
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy)
  const ux = dx / len, uy = dy / len
  const sx = a.x + ux * 74, sy = a.y + uy * 74
  const ex = b.x - ux * 74, ey = b.y - uy * 74
  const cx = sx + (ex - sx) * p, cy = sy + (ey - sy) * p
  const size = big ? 26 : 18
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg width={1680} height={600} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={sx} y1={sy} x2={cx} y2={cy} stroke={color} strokeWidth={4} strokeLinecap="round" opacity={trail} />
        <circle cx={cx} cy={cy} r={size / 2 + 8} fill={color} opacity={0.25 * fade} />
        <circle cx={cx} cy={cy} r={size / 2} fill={color} opacity={fade} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: side === 'top' ? cx : cx + 30,
          top: side === 'top' ? cy - 24 - (big ? 6 : 0) : cy,
          transform: side === 'top' ? 'translate(-50%,-100%)' : 'translate(0,-50%)',
          opacity: fade,
          padding: '8px 16px',
          borderRadius: 12,
          background: 'rgba(11,13,26,0.85)',
          border: `1.5px solid ${color}`,
          color,
          fontWeight: 800,
          fontSize: big ? 26 : 22,
          whiteSpace: 'nowrap',
          fontFamily: FONT,
        }}
      >
        {label}
      </div>
    </div>
  )
}

/** 13 s: why it only works on Arc. */
export const ArcInsight: React.FC = () => {
  const glowLink = useEnter(B[2] + 1.4, SNAPPY)
  const receipt = useEnter(B[4] - 0.2, SNAPPY)

  return (
    <Backdrop glow="gold">
      <Voice scene="arc" />
      <Frame>
        <Kicker n="02">Why Arc</Kicker>
        <Headline size={72} style={{ marginTop: 24 }}>
          <Words text="On Arc, USDC is the gas." at={B[0]} accent={['is', 'gas']} accentColor={C.gold} />
        </Headline>

        <div style={{ position: 'relative', width: 1680, height: 600, marginTop: 10 }}>
          {/* static faint edges */}
          <Reveal at={B[1] - 0.4} from="none" style={{ position: 'absolute', inset: 0 }}>
            <svg width={1680} height={600}>
              {[[SENDER, ESCROW], [ESCROW, LINK], [ESCROW, RECIP]].map(([a, b], i) => (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.10)" strokeWidth={2} strokeDasharray="6 10" />
              ))}
            </svg>
          </Reveal>

          <Node p={SENDER} at={B[1] - 1.1} label="Sender" sub="any EVM wallet">
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="13" rx="3" /><path d="M16 12.5h4M2 10h20" /></svg>
          </Node>
          <Node p={ESCROW} at={B[1] - 0.9} label="KashLinkEscrow" sub="immutable contract on Arc" ring={C.gold}>
            <Logo size={70} />
          </Node>
          <Node p={LINK} at={B[1] - 0.7} label="The link" sub="a fresh key in the URL" ring={glowLink > 0.5 ? C.gold : C.whiteFaint}>
            <div style={{ position: 'relative' }}>
              {Ico.link(54, '#fff')}
              <div style={{ position: 'absolute', right: -26, bottom: -18, transform: `scale(${glowLink})`, width: 44, height: 44, borderRadius: '50%', background: `radial-gradient(circle at 35% 35%, #ffe07a, ${C.orange})`, display: 'grid', placeItems: 'center', color: C.navy, fontWeight: 800, fontSize: 18, boxShadow: `0 0 24px ${C.gold}` }}>1¢</div>
            </div>
          </Node>
          <Node p={RECIP} at={B[1] - 0.5} label="Recipient" sub="no wallet needed">
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
          </Node>

          <Packet a={SENDER} b={ESCROW} at={B[1] + 0.4} label="$20 + 1% fee + 1¢" color={C.green} big />
          <Packet a={ESCROW} b={LINK} at={B[2] + 0.3} dur={0.9} label="1¢ of USDC — the stipend" color={C.gold} side="right" />
          <Packet a={LINK} b={ESCROW} at={B[3] + 0.3} dur={1.0} label="claim(to) · signed by the link key · gas: that cent" color={C.gold} side="right" />
          <Packet a={ESCROW} b={RECIP} at={B[3] + 2.6} label="$20.00" color={C.green} big />

          {/* receipt */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 420,
              opacity: receipt,
              transform: `translateY(${(1 - receipt) * 24}px)`,
              display: 'flex',
              gap: 18,
            }}
          >
            {[
              ['Claim gas', '≈ $0.0014', 'paid by the link'],
              ['Recipient signs', 'one plain tx', 'no meta-tx, no relayer'],
              ['Finality', '1 block', '"received" a moment later'],
            ].map(([k, v, s]) => (
              <div key={k} style={{ padding: '16px 22px', borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: `1.5px solid ${C.whiteFaint}`, minWidth: 220 }}>
                <div style={{ fontSize: 18, color: C.whiteMuted, fontWeight: 600 }}>{k}</div>
                <div style={{ fontSize: 34, fontWeight: 800, color: C.gold, letterSpacing: -0.5 }}>{v}</div>
                <div style={{ fontSize: 17, color: C.whiteMuted }}>{s}</div>
              </div>
            ))}
          </div>
        </div>

        <Narration
          lines={[
            { at: B[1], text: <>The sender funds the link in <Accent>one transaction</Accent>: the amount, a flat 1% fee, and one cent per slot.</> },
            { at: B[2], text: <>The contract drops that <Accent>cent</Accent> on the link's own address. That cent <Accent>is the gas</Accent> for the claim.</> },
            { at: B[3], text: <>The recipient signs one ordinary transaction with the key in the link. The chain just accepts it.</> },
            { at: B[4], text: <>No relayer. No second token. No "install a wallet first". One <Accent>call&#123;value&#125;</Accent> replaced all of it.</> },
          ]}
        />
      </Frame>
    </Backdrop>
  )
}
