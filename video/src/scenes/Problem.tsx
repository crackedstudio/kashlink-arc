import React from 'react'
import { interpolate } from 'remotion'
import { Backdrop } from '../ui/Backdrop'
import { Reveal, Words, useClock, useEnter, SNAPPY } from '../ui/motion'
import { Accent, Frame, Headline, Kicker, Narration } from '../ui/Story'
import { C, FONT } from '../theme'
import { Ico } from '../ui/Phone'
import { Voice, beats } from '../voiceover/timeline'

const B = beats('problem')
const STUCK = B[1] + 1.2

/** 12 s: the problem every cash-link product has, and the usual workaround. */
export const Problem: React.FC = () => {
  const { t } = useClock()
  const stuck = useEnter(STUCK, SNAPPY)
  const shake = t > STUCK && t < STUCK + 0.6 ? Math.sin((t - STUCK) * 60) * 6 * (1 - (t - STUCK) / 0.6) : 0

  const fixes = [
    { at: B[2] + 0.4, label: 'A relayer', sub: 'someone else pays the gas' },
    { at: B[2] + 1.2, label: 'A funded hot wallet', sub: 'to run, to secure, to top up' },
    { at: B[2] + 2.1, label: 'Meta-transactions', sub: 'an EIP-712 scheme to sign' },
    { at: B[2] + 3.0, label: 'An API to keep up', sub: 'an edge function in front of it all' },
  ]
  const strike = useEnter(B[3] + 0.3, SNAPPY)

  return (
    <Backdrop glow="blue">
      <Voice scene="problem" />
      <Frame>
        <Kicker n="01">The problem</Kicker>
        <Headline size={60} style={{ marginTop: 28 }}>
          <Words text="Every cash-link product has the same problem." at={B[0]} accent={['same', 'problem']} accentColor={C.gold} />
        </Headline>

        <div style={{ display: 'flex', gap: 80, marginTop: 70, alignItems: 'flex-start' }}>
          {/* the fresh address with money but no gas */}
          <Reveal at={B[1] - 0.3} from="up" style={{ width: 620 }}>
            <div
              style={{
                borderRadius: 28,
                background: 'rgba(255,255,255,0.06)',
                border: `1.5px solid ${C.whiteFaint}`,
                padding: 36,
                transform: `translateX(${shake}px)`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: C.whiteMuted, fontSize: 22, fontWeight: 600 }}>
                {Ico.link(26, C.whiteMuted)} a fresh address · the link
              </div>
              <div style={{ marginTop: 26, display: 'flex', gap: 40 }}>
                <div>
                  <div style={{ fontSize: 22, color: C.whiteMuted }}>holds</div>
                  <div style={{ fontSize: 64, fontWeight: 800, color: C.green, letterSpacing: -1 }}>$20.00</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, color: C.whiteMuted }}>gas to move it</div>
                  <div style={{ fontSize: 64, fontWeight: 800, color: C.red, letterSpacing: -1 }}>0</div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 24,
                  opacity: stuck,
                  transform: `scale(${0.9 + 0.1 * stuck})`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 20px',
                  borderRadius: 14,
                  background: 'rgba(217,68,50,0.18)',
                  color: '#ff8a7a',
                  fontWeight: 700,
                  fontSize: 24,
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff8a7a" strokeWidth={2.4} strokeLinecap="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                The recipient can't take it out.
              </div>
            </div>
          </Reveal>

          {/* the usual fix */}
          <div style={{ flex: 1 }}>
            <Reveal at={B[2] - 0.2} from="left">
              <div style={{ fontSize: 26, fontWeight: 700, color: C.whiteMuted, marginBottom: 18, letterSpacing: 1, textTransform: 'uppercase' }}>The usual fix</div>
            </Reveal>
            {fixes.map((f, i) => {
              const p = useEnter(f.at, SNAPPY)
              const s = interpolate(strike, [0, 1], [0, 1])
              return (
                <div
                  key={f.label}
                  style={{
                    opacity: p * (1 - s * 0.55),
                    transform: `translateX(${(1 - p) * 40}px)`,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 16,
                    padding: '14px 0',
                    borderBottom: `1px solid ${C.whiteFaint}`,
                    position: 'relative',
                    fontFamily: FONT,
                  }}
                >
                  <span style={{ fontSize: 30, fontWeight: 800, width: 36, color: C.gold, opacity: 0.7 }}>{i + 1}</span>
                  <span style={{ fontSize: 32, fontWeight: 700 }}>{f.label}</span>
                  <span style={{ fontSize: 22, color: C.whiteMuted }}>{f.sub}</span>
                  <div style={{ position: 'absolute', left: 50, top: '50%', height: 3, background: C.red, width: `${s * 92}%`, borderRadius: 2 }} />
                </div>
              )
            })}
            <Reveal at={B[2] + 4.6} from="up" style={{ marginTop: 22, fontSize: 24, color: C.whiteMuted }}>
              …or tell the recipient to go buy the gas token first. Which defeats the point.
            </Reveal>
          </div>
        </div>

        <Narration
          lines={[
            { at: B[1], text: <>The link is a throwaway key. Its address has the money — <Accent color="#ff8a7a">and no gas</Accent>.</> },
            { at: B[2], text: <>So you bolt on infrastructure. Our previous version, on Polygon, needed <Accent>all four</Accent>.</> },
            { at: B[3], text: <>Arc makes every one of them <Accent color={C.green}>unnecessary</Accent>.</> },
          ]}
        />
      </Frame>
    </Backdrop>
  )
}
