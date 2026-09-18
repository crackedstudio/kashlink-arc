import React from 'react'
import { AbsoluteFill, interpolate } from 'remotion'
import { Backdrop } from '../ui/Backdrop'
import { Reveal, Words, useClock, useEnter, useTyped, SNAPPY } from '../ui/motion'
import { Frame, Headline, Kicker } from '../ui/Story'
import { C, SITE } from '../theme'
import { Back, Badge, Button, Card, Ico, Muted, Phone, Qr, Row, Screen, Segments, Title } from '../ui/Phone'
import { Callouts, ScreenSwitch, Spinner, Tap } from '../ui/Callouts'
import { Voice, beats } from '../voiceover/timeline'

const B = beats('demo')
const T_REVIEW = B[1] - 0.3
const T_READY = B[2] - 0.3

/* ---------- Amount ---------- */
const AmountScreen: React.FC = () => {
  const { t } = useClock()
  const amount = useTyped('20', 1.2, 6)
  const people = t < 2.6 ? 1 : t < 2.95 ? 2 : t < 3.3 ? 3 : t < 3.65 ? 4 : 5
  const several = people > 1
  const drop = t >= 4.4
  const modeIn = useEnter(2.7, SNAPPY)
  const pressed = t > T_REVIEW - 0.7 && t < T_REVIEW ? 1 : 0
  return (
    <Screen>
      <Back />
      <Title>Amount</Title>
      <Segments items={['USDC', 'EURC']} on={0} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 14 }}>
        <Muted>Available: <strong style={{ color: C.navy }}>245.00 USDC</strong></Muted>
        <span style={{ padding: '4px 10px', borderRadius: 8, background: C.highlight, fontWeight: 700, fontSize: 13 }}>Max</span>
      </div>

      <div style={{ textAlign: 'center', margin: '26px 0 14px' }}>
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
          <span style={{ color: C.muted2, fontSize: 40, verticalAlign: 'top', marginRight: 4 }}>$</span>
          {amount || <span style={{ color: C.muted2 }}>0</span>}
          <span style={{ display: 'inline-block', width: 3, height: 52, background: C.blue, marginLeft: 3, opacity: Math.floor(t * 2) % 2 === 0 ? 1 : 0, verticalAlign: 'top' }} />
        </div>
        <div style={{ fontWeight: 700, marginTop: 6 }}>USDC on Arc{several ? ' · each' : ''}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}><Muted>{amount ? `+ $${(0.2 * people).toFixed(2)} fee + $${(0.01 * people).toFixed(2)} claim gas` : ' '}</Muted></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
          <span style={{ fontWeight: 600 }}>Send to</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, background: C.highlight, display: 'grid', placeItems: 'center', fontWeight: 700 }}>−</span>
            <span style={{ minWidth: 76, textAlign: 'center', fontWeight: 700 }}>{people} {people === 1 ? 'person' : 'people'}</span>
            <span style={{ width: 30, height: 30, borderRadius: 15, background: C.highlight, display: 'grid', placeItems: 'center', fontWeight: 700 }}>+</span>
          </div>
        </Card>
        <div style={{ opacity: modeIn, transform: `translateY(${(1 - modeIn) * 10}px)` }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['A link each', Ico.link], ['Open drop', Ico.drop]].map(([label, icon], i) => {
              const on = drop ? i === 1 : i === 0
              return (
                <div key={label as string} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 14, background: on ? C.blue : C.card, color: on ? '#fff' : C.navy, boxShadow: on ? '0 6px 16px rgba(5,130,202,0.3)' : '0 2px 8px rgba(31,35,72,0.05)' }}>
                  {(icon as (s: number, c: string) => React.ReactNode)(16, on ? '#fff' : C.navy)} {label as string}
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 8, display: 'flex', gap: 6, color: drop ? C.orange : C.muted, lineHeight: 1.3 }}>
            {drop ? <>{Ico.alert(14)}<span>One link, first come, first served. Whoever holds it can claim every slot.</span></> : <span>{people} separate links, one per person. Nobody can take someone else's share.</span>}
          </div>
        </div>
        <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Returnable after</span>
          <Segments items={['1 day', '7 days', '30 days']} on={1} style={{ width: 196, padding: 3 }} />
        </Card>
      </div>
      <div style={{ flex: 1 }} />
      <Button pressed={pressed}>Continue</Button>
      <Tap x={195} y={735} at={T_REVIEW - 0.7} />
      <Tap x={300} y={438} at={4.35} />
      {[2.55, 2.9, 3.25, 3.6].map((at) => <Tap key={at} x={318} y={330} at={at} />)}
    </Screen>
  )
}

/* ---------- Review ---------- */
const ReviewScreen: React.FC = () => {
  const { t } = useClock()
  const lt = t - T_REVIEW
  const note = useTyped('Lunch on me 🍕', T_REVIEW + 1.4, 12)
  const sending = lt > 5.6
  const pressed = lt > 5.3 && lt < 5.7 ? 1 : 0
  return (
    <Screen>
      <Back />
      <Title>Review</Title>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Badge size={56}>{Ico.drop(28)}</Badge>
        <Muted style={{ marginTop: 8 }}>An open drop for 5 people</Muted>
        <strong style={{ fontSize: 20 }}>KashLink</strong>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>$20.00 <span style={{ fontSize: 18, fontWeight: 600, color: C.muted }}>each</span></div>
        <Muted style={{ fontSize: 13 }}>0x9f3a…c41e ↗</Muted>
      </div>
      <div style={{ marginTop: 14, fontSize: 12.5, display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(236,153,28,0.10)', color: C.orange, lineHeight: 1.3 }}>
        {Ico.alert(16)}<span>First come, first served. Anyone holding this link can claim every slot.</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Add a note <Muted style={{ fontWeight: 400 }}>(optional)</Muted></div>
        <div style={{ height: 46, borderRadius: 12, background: C.card, border: `1.5px solid ${lt > 1.2 && lt < 3.2 ? C.blue : C.border}`, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 16 }}>
          {note || <span style={{ color: C.muted2 }}>Happy birthday!</span>}
          {lt > 1.2 && lt < 3.2 && <span style={{ width: 2, height: 20, background: C.blue, marginLeft: 2, opacity: Math.floor(t * 2) % 2 === 0 ? 1 : 0 }} />}
        </div>
      </div>
      <Card style={{ marginTop: 14 }}>
        <Row label="5 people receive" value="$100.00" />
        <Row label="Service fee" value="$1.00" />
        <Row label="Claim gas, prepaid · 5 ×" value="$0.05" />
        <Row label="Returnable if unclaimed" value="after 7 days" />
        <Row label="Total" value="$101.05" total />
      </Card>
      <div style={{ flex: 1 }} />
      <Button pressed={pressed}>{sending ? <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Spinner /> Confirm in your wallet…</span> : 'Send $101.05'}</Button>
      <Tap x={195} y={735} at={T_REVIEW + 5.3} />
      <Tap x={195} y={392} at={T_REVIEW + 1.1} />
    </Screen>
  )
}

/* ---------- Ready sheet ---------- */
const ReadyScreen: React.FC = () => {
  const { t } = useClock()
  const lt = t - T_READY
  const sheet = useEnter(T_READY + 0.05, SNAPPY)
  const qr = useEnter(T_READY + 2.2, SNAPPY)
  const copied = lt > 4.6
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* dimmed review behind the sheet */}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(31,35,72,${0.35 * sheet})` }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          transform: `translateY(${(1 - sheet) * 400}px)`,
          background: C.bg,
          borderRadius: '24px 24px 0 0',
          padding: '10px 20px 30px',
          boxShadow: '0 -10px 40px rgba(31,35,72,0.2)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: C.muted2, margin: '0 auto 14px' }} />
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Badge size={56}>{Ico.drop(26)}</Badge>
          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>Your open drop is live!</div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>$20.00 <span style={{ fontSize: 16, fontWeight: 600, color: C.muted }}>each · 5 people</span></div>
          <div style={{ fontStyle: 'italic', color: C.muted }}>“Lunch on me 🍕”</div>
          <Muted style={{ fontSize: 13 }}>17 Sep 2026 · 0 of 5 claimed · returnable in 7 days</Muted>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>Share your KashLink</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.card, borderRadius: 12, padding: '8px 8px 8px 14px', boxShadow: '0 2px 8px rgba(31,35,72,0.05)' }}>
          <span style={{ flex: 1, fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: C.muted }}>{SITE}/#3f9ae1…&m=Lunch</span>
          {[<svg key="q" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth={2.2}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM19 19h2v2h-2zM17 17h2" /></svg>,
            <svg key="w" width="18" height="18" viewBox="0 0 24 24" fill="#25d366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.2-2.8c-.2-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.1 5 5 0 0 0 1.1 2.7 11.4 11.4 0 0 0 4.4 3.9c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2c.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>,
            copied ? Ico.check(18, C.green) : Ico.copy(18)].map((ic, i) => (
            <span key={i} style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: i === 0 && qr > 0.5 ? C.highlight : 'transparent' }}>{ic}</span>
          ))}
        </div>
        <div style={{ display: 'grid', placeItems: 'center', height: 176 * qr, overflow: 'hidden', opacity: qr, marginTop: 10 * qr }}>
          <Qr size={160} />
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 12.5, color: C.muted, margin: '12px 0', lineHeight: 1.3 }}>{Ico.alert(16, C.muted)}<span>Open drop: first come, first served. Anyone with this link can claim every slot.</span></div>
        <Button><span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{Ico.share(20)} Share link</span></Button>
        <Tap x={314} y={262} at={T_READY + 2.1} />
        <Tap x={352} y={262} at={T_READY + 4.5} />
      </div>
    </div>
  )
}

/** 20 s: the sender's phone, amount → review → ready. */
export const Demo: React.FC = () => {
  const { t } = useClock()
  const phoneIn = useEnter(0.1)
  // once the tx is "sent", a short green pulse around the phone
  const pulse = interpolate(t, [T_READY - 0.2, T_READY + 0.6, T_READY + 1.6], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <Backdrop glow="blue">
      <Voice scene="demo" />
      <Frame>
        <Kicker n="03">Send</Kicker>
        <Headline size={60} style={{ marginTop: 18 }}>
          <Words text="Fund it once. Share it like cash." at={0.3} accent={['once.']} accentColor={C.gold} />
        </Headline>
        <AbsoluteFill style={{ padding: '80px 120px', justifyContent: 'flex-end', alignItems: 'flex-start', flexDirection: 'row', gap: 100 }}>
          <div style={{ marginTop: 138, opacity: phoneIn, transform: `translateY(${(1 - phoneIn) * 40}px)`, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: -14, borderRadius: 66, boxShadow: `0 0 ${60 * pulse}px ${18 * pulse}px rgba(33,188,165,0.5)`, opacity: pulse }} />
            <Phone scale={0.96}>
              <ScreenSwitch
                screens={[
                  { from: 0, node: <AmountScreen /> },
                  { from: T_REVIEW, node: <ReviewScreen /> },
                  { from: T_READY, node: <><ReviewScreen /><ReadyScreen /></> },
                ]}
              />
            </Phone>
          </div>
          <div style={{ marginTop: 190, flex: 1 }}>
            <Callouts
              items={[
                { at: B[0] + 0.3, title: 'Choose what and who', text: <>USDC or EURC. One person, a link each for several, or an open drop the first five to open it share. Pick when the unclaimed rest comes back.</> },
                { at: B[1] + 0.3, title: 'One transaction funds everything', text: <>$100 for five people, a flat 1% fee enforced by the contract, and <span style={{ color: C.gold, fontWeight: 700 }}>one cent per person of claim gas</span> — dropped on the link's own address.</> },
                { at: B[2] + 0.3, title: 'The link is the money', text: <>The key rides in the URL fragment and never reaches a server. Send it by chat, WhatsApp, or hold up the QR code.</> },
              ]}
            />
          </div>
        </AbsoluteFill>
      </Frame>
    </Backdrop>
  )
}
