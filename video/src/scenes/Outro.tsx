import React from 'react'
import { AbsoluteFill } from 'remotion'
import { Backdrop } from '../ui/Backdrop'
import { Logo } from '../ui/Logo'
import { Reveal, Words, useEnter, BOUNCY } from '../ui/motion'
import { Frame, Headline, Pill } from '../ui/Story'
import { C, REPO, SITE } from '../theme'
import { Voice, beats } from '../voiceover/timeline'

const B = beats('outro')

/** 7 s: where to find it. */
export const Outro: React.FC = () => {
  const logo = useEnter(0.1, BOUNCY)
  return (
    <Backdrop glow="gold">
      <Voice scene="outro" />
      <Frame>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, transform: `scale(${logo})`, opacity: logo }}>
            <Logo size={110} />
            <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -2.5 }}>KashLink</div>
          </div>
          <Headline size={58} style={{ textAlign: 'center' }}>
            <Words text="Send USDC as a link. Share it like cash." at={B[0]} accent={['cash.']} accentColor={C.gold} />
          </Headline>
          <div style={{ display: 'flex', gap: 20, marginTop: 30 }}>
            <Reveal at={2.0} from="scale"><Pill color={C.gold} style={{ fontSize: 30, padding: '16px 32px' }}>{SITE}</Pill></Reveal>
            <Reveal at={2.3} from="scale"><Pill color="rgba(255,255,255,0.75)" style={{ fontSize: 30, padding: '16px 32px' }}>{REPO}</Pill></Reveal>
          </div>
          <Reveal at={3.0} from="up" style={{ marginTop: 30, color: C.whiteMuted, fontSize: 26, fontWeight: 600, textAlign: 'center' }}>
            Built on Arc for <span style={{ color: C.white }}>Arc Microgrants</span> · live on mainnet · MIT
          </Reveal>
        </AbsoluteFill>
      </Frame>
    </Backdrop>
  )
}
