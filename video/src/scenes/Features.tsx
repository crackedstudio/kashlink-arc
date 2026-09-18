import React from 'react'
import { Backdrop } from '../ui/Backdrop'
import { Words, useEnter, SNAPPY } from '../ui/motion'
import { Frame, Headline, Kicker, Sub } from '../ui/Story'
import { C, FONT } from '../theme'
import { Ico } from '../ui/Phone'
import { Voice, beats } from '../voiceover/timeline'

const B = beats('features')

const items: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: Ico.link(34, C.gold), title: 'Cash links', text: 'One link, one person, any amount of USDC or EURC.' },
  { icon: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2 20c0-3.3 2.7-6 6-6M22 20c0-3.3-2.7-6-6-6M8 14c2.2 0 4 1.3 4 4M16 14c-2.2 0-4 1.3-4 4" /></svg>, title: 'A link each', text: 'Up to 100 people funded in one transaction. Nobody can take another’s share.' },
  { icon: Ico.drop(34, C.gold), title: 'Open drops', text: 'One link, up to 100 slots, first come first served. Fifty claims from one address — a fair race on Arc.' },
  { icon: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth={2}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM19 19h2v2h-2zM17 17h2" /></svg>, title: 'Notes and QR', text: 'A message rides in the link, never on a server. A QR code for in-person handoff.' },
  { icon: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></svg>, title: 'Returns', text: 'Anything unclaimed comes back to the sender after 1, 7 or 30 days — from any device.' },
  { icon: Ico.face(34, C.gold), title: 'Passkey wallets', text: 'A recipient with no wallet creates one with Face ID and claims into it (Circle Modular Wallets).' },
  { icon: <div style={{ fontSize: 30, fontWeight: 800, color: C.gold }}>€</div>, title: 'EURC too', text: 'Euro links use Arc’s second genesis stablecoin — the claim gas is still USDC from the stipend.' },
  { icon: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth={2} strokeLinecap="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></svg>, title: 'Live stats', text: '/stats reads totals the contract keeps itself. No backend, no indexer.' },
]

/** 9 s: everything a cash link should do. */
export const Features: React.FC = () => (
  <Backdrop glow="gold">
    <Voice scene="features" />
    <Frame>
      <Kicker n="05">What ships</Kicker>
      <Headline size={60} style={{ marginTop: 18 }}>
        <Words text="Everything a cash link should do." at={0.3} accent={['Everything']} accentColor={C.gold} />
      </Headline>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22, marginTop: 56 }}>
        {items.map((it, i) => {
          const p = useEnter(B[0] + 0.8 + i * 1.0, SNAPPY)
          return (
            <div
              key={it.title}
              style={{
                opacity: p,
                transform: `translateY(${(1 - p) * 30}px) scale(${0.94 + 0.06 * p})`,
                borderRadius: 24,
                padding: '34px 30px',
                background: 'rgba(255,255,255,0.06)',
                border: `1.5px solid ${C.whiteFaint}`,
                minHeight: 330,
                fontFamily: FONT,
              }}
            >
              <div style={{ height: 40, display: 'flex', alignItems: 'center' }}>{it.icon}</div>
              <div style={{ fontSize: 31, fontWeight: 800, marginTop: 26, letterSpacing: -0.5 }}>{it.title}</div>
              <Sub size={22} style={{ marginTop: 12 }}>{it.text}</Sub>
            </div>
          )
        })}
      </div>
    </Frame>
  </Backdrop>
)
