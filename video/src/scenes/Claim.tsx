import React from 'react'
import { AbsoluteFill, interpolate } from 'remotion'
import { Backdrop } from '../ui/Backdrop'
import { Reveal, Words, useClock, useEnter, SNAPPY, BOUNCY } from '../ui/motion'
import { Frame, Headline, Kicker } from '../ui/Story'
import { C, FONT, SITE } from '../theme'
import { Badge, Button, Ico, Muted, Phone, Screen } from '../ui/Phone'
import { Logo } from '../ui/Logo'
import { Callouts, Spinner, Tap } from '../ui/Callouts'
import { Voice, beats } from '../voiceover/timeline'

const B = beats('claim')
const T_OPEN = B[0] + 2.6        // link tapped in chat → claim screen
const T_TAP = B[1] + 2.4         // "Create a wallet & claim" tapped
const T_FACE = T_TAP + 0.4       // Face ID prompt
const T_CLAIMING = T_FACE + 1.6
const T_DONE = Math.max(T_CLAIMING + 1.4, B[2] - 0.3)

/** The recipient's chat: a message arrives with the link in it. */
const Chat: React.FC = () => {
  const { t } = useClock()
  const msg = useEnter(0.5, BOUNCY)
  return (
    <Screen style={{ padding: '0 14px 24px' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, padding: '4px 0 12px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, background: `radial-gradient(100% 100% at bottom right, ${C.blueDeep}, ${C.blue})`, margin: '0 auto 4px', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 }}>A</div>
        Amaka
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10 }}>
        <div style={{ alignSelf: 'flex-start', maxWidth: 270, background: '#e9e9eb', borderRadius: 18, padding: '10px 14px', fontSize: 16 }}>Team lunch is on me today 🙌</div>
        <div style={{ alignSelf: 'flex-start', maxWidth: 290, background: '#e9e9eb', borderRadius: 18, padding: '10px 14px', fontSize: 16, opacity: msg, transform: `scale(${0.8 + 0.2 * msg})`, transformOrigin: 'bottom left' }}>
          Lunch on me 🍕<br />
          <span style={{ color: C.blue, textDecoration: 'underline', wordBreak: 'break-all' }}>https://{SITE}/#3f9ae1c0…</span>
          <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', background: '#fff', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
              <Logo size={32} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>KashLink</div>
                <div style={{ fontSize: 12, color: C.muted }}>Send USDC to anyone as a link, no address needed.</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ alignSelf: 'flex-end', background: C.blue, color: '#fff', borderRadius: 18, padding: '10px 14px', fontSize: 16, opacity: t > 1.6 ? 1 : 0 }}>🙏🙏</div>
      </div>
      <Tap x={190} y={520} at={T_OPEN - 0.3} />
    </Screen>
  )
}

/** The claim screen, through its states. */
const ClaimScreen: React.FC = () => {
  const { t } = useClock()
  const done = t >= T_DONE
  const claiming = t >= T_CLAIMING && !done
  const pressed = t > T_TAP && t < T_TAP + 0.35 ? 1 : 0
  const doneIn = useEnter(T_DONE, BOUNCY)
  const amountIn = useEnter(T_OPEN + 0.25, SNAPPY)
  return (
    <Screen>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 70 }}>
        <div style={{ position: 'relative', width: 84, height: 84 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: done ? 0 : 1 }}>
            <Badge size={84} color="blue"><Logo size={50} /></Badge>
          </div>
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${doneIn})`, opacity: doneIn }}>
            <Badge size={84} color="green">{Ico.check(40)}</Badge>
          </div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, marginTop: 8 }}>{done ? 'Received!' : claiming ? 'Claiming…' : "You've got"}</div>
        <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1.5, opacity: amountIn, transform: `translateY(${(1 - amountIn) * 12}px)` }}>
          $20.00 <span style={{ fontSize: 18, fontWeight: 600, color: C.muted }}>USDC</span>
        </div>
        <div style={{ fontStyle: 'italic', color: C.muted, fontSize: 17 }}>“Lunch on me 🍕”</div>
        {!done && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted }}>{Ico.drop(16, C.muted)} 3 of 5 left · first come, first served</div>
        )}
        {done && (
          <div style={{ fontSize: 14, color: C.muted, marginTop: 6, lineHeight: 1.4, padding: '0 8px' }}>
            $20.00 in USDC is in your new KashLink wallet, <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: C.navy }}>0x8c2f…4e1b</span>. Your passkey controls it.
          </div>
        )}
      </div>
      <div style={{ flex: 1 }} />
      {done ? (
        <>
          <div style={{ textAlign: 'center', fontSize: 14, color: C.blue, fontWeight: 700, marginBottom: 14 }}>View transaction ↗</div>
          <Button><span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{Ico.key(20)} Open my wallet</span></Button>
        </>
      ) : (
        <>
          <Muted style={{ textAlign: 'center', fontSize: 13, marginBottom: 12, lineHeight: 1.35 }}>Nothing to sign and no gas to pay — the link covers it. Your wallet only tells us where to send the USDC.</Muted>
          <Button pressed={pressed}>
            {claiming ? <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Spinner /> Claiming…</span> : t > T_FACE ? <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Spinner /> Setting up your passkey…</span> : <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{Ico.face(22, '#fff')} Create a wallet &amp; claim $20.00</span>}
          </Button>
          <div style={{ textAlign: 'center', fontSize: 12.5, color: C.muted, margin: '8px 0 10px' }}>Face ID, Touch ID or your device PIN. Nothing to install.</div>
          <div style={{ height: 52, borderRadius: 26, border: `1.5px solid ${C.border}`, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15, background: C.card }}>Claim to a browser wallet</div>
          <div style={{ textAlign: 'center', fontSize: 13, color: C.blue, fontWeight: 700, marginTop: 12 }}>Or paste an address</div>
        </>
      )}
      <Tap x={195} y={585} at={T_TAP} />
    </Screen>
  )
}

/** The system passkey sheet. */
const FaceId: React.FC = () => {
  const { t } = useClock()
  const p = useEnter(T_FACE, SNAPPY)
  const out = interpolate(t, [T_CLAIMING - 0.3, T_CLAIMING], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const ok = t > T_FACE + 0.9
  if (t < T_FACE || t > T_CLAIMING) return null
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p * out }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, background: '#fff', borderRadius: 30, padding: '26px 22px 22px', textAlign: 'center', transform: `translateY(${(1 - p) * 200}px)`, fontFamily: FONT }}>
        <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: 32, background: ok ? C.green : C.highlight, display: 'grid', placeItems: 'center', transition: 'none' }}>
          {ok ? Ico.check(34, '#fff') : Ico.face(40, C.navy)}
        </div>
        <div style={{ fontWeight: 800, fontSize: 19, marginTop: 14 }}>{ok ? 'Passkey created' : 'Create a passkey for KashLink?'}</div>
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.35 }}>{SITE} wants to save a passkey on this device. It becomes the key to your new wallet.</div>
        {!ok && <div style={{ marginTop: 18, height: 48, borderRadius: 14, background: C.blue, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>Continue with Face ID</div>}
      </div>
    </div>
  )
}

/** 15 s: the recipient's phone. Chat → claim → passkey → received. */
export const Claim: React.FC = () => {
  const { t } = useClock()
  const phoneIn = useEnter(0.1)
  const flip = interpolate(t, [T_OPEN - 0.1, T_OPEN + 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const pulse = interpolate(t, [T_DONE - 0.1, T_DONE + 0.5, T_DONE + 1.6], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <Backdrop glow="green">
      <Voice scene="claim" />
      <Frame>
        <Kicker n="04">Receive</Kicker>
        <Headline size={60} style={{ marginTop: 18 }}>
          <Words text="Whoever opens it keeps the money." at={0.3} accent={['keeps']} accentColor={C.green} />
        </Headline>
        <AbsoluteFill style={{ padding: '80px 120px', justifyContent: 'flex-end', alignItems: 'flex-start', flexDirection: 'row', gap: 100 }}>
          <div style={{ marginTop: 190, flex: 1 }}>
            <Callouts
              items={[
                { at: B[0] + 0.3, title: 'The link arrives like any message', text: <>No app to install, no account to create first. It opens in the browser.</> },
                { at: B[1] + 0.3, title: 'No wallet? Make one with a passkey', text: <>Face ID or Touch ID creates a Circle Modular Wallet on the spot. People who already have a wallet connect it or paste an address.</> },
                { at: B[2] + 0.3, title: 'Claimed, and final', text: <>The claim is one plain transaction signed by the key in the link, paid from the cent the sender left on it — about <span style={{ color: C.green, fontWeight: 700 }}>$0.0014</span>. Arc's instant finality means "received" a block later.</> },
              ]}
            />
          </div>
          <div style={{ marginTop: 138, opacity: phoneIn, transform: `translateY(${(1 - phoneIn) * 40}px)`, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: -14, borderRadius: 66, boxShadow: `0 0 ${60 * pulse}px ${18 * pulse}px rgba(33,188,165,0.55)`, opacity: pulse }} />
            <Phone scale={0.96}>
              <div style={{ position: 'absolute', inset: 0, opacity: 1 - flip }}><Chat /></div>
              <div style={{ position: 'absolute', inset: 0, opacity: flip, transform: `translateX(${(1 - flip) * 60}px)` }}>
                <ClaimScreen />
                <FaceId />
              </div>
            </Phone>
          </div>
        </AbsoluteFill>
      </Frame>
    </Backdrop>
  )
}
