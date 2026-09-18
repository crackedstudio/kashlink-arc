import React from 'react'
import { AbsoluteFill, interpolate } from 'remotion'
import { Backdrop } from '../ui/Backdrop'
import { Logo } from '../ui/Logo'
import { Reveal, Words, useClock, useEnter, BOUNCY } from '../ui/motion'
import { Frame, Headline, Pill } from '../ui/Story'
import { C } from '../theme'
import { Voice } from '../voiceover/timeline'

/** 0–6 s: logo, name, the one-line pitch. */
export const Hook: React.FC = () => {
  const { t } = useClock()
  const logoIn = useEnter(0.1, BOUNCY)
  // logo starts centered and large, then settles up-left next to the wordmark
  const settle = useEnter(1.0)
  const logoSize = interpolate(settle, [0, 1], [220, 96])
  const logoY = interpolate(settle, [0, 1], [0, -190])
  const nameIn = useEnter(1.2)

  return (
    <Backdrop>
      <Voice scene="hook" />
      <Frame>
        <AbsoluteFill style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'relative', width: 1200, height: 560 }}>
            {/* logo + wordmark */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(-50%, calc(-50% + ${logoY}px)) scale(${logoIn})`,
                display: 'flex',
                alignItems: 'center',
                gap: 26 * nameIn,
              }}
            >
              <Logo size={logoSize} />
              <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, opacity: nameIn, width: nameIn * 372, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                KashLink
              </div>
            </div>

            {/* the pitch */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 260, textAlign: 'center' }}>
              <Headline size={88}>
                <Words text="Send USDC as a link." at={1.9} per={0.1} />
              </Headline>
              <div style={{ marginTop: 34, display: 'flex', justifyContent: 'center', gap: 22 }}>
                {['No address.', 'No account.', 'No gas.'].map((s, i) => (
                  <Reveal key={s} at={3.0 + i * 0.35} from="scale" config={BOUNCY}>
                    <Pill color={i === 2 ? C.gold : 'rgba(255,255,255,0.7)'} style={{ fontSize: 30, padding: '12px 28px' }}>{s}</Pill>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </AbsoluteFill>

        <Reveal at={4.6} from="up" style={{ position: 'absolute', bottom: 80, left: 0, right: 0, textAlign: 'center' }}>
          <div style={{ color: C.whiteMuted, fontSize: 26, fontWeight: 600, letterSpacing: 1 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: C.green, marginRight: 12, boxShadow: `0 0 ${8 + Math.sin(t * 6) * 4}px ${C.green}` }} />
            Live on Arc mainnet
          </div>
        </Reveal>
      </Frame>
    </Backdrop>
  )
}
