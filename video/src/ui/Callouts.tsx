import React from 'react'
import { interpolate } from 'remotion'
import { C, FONT } from '../theme'
import { useClock, useEnter, SNAPPY } from './motion'

export type Callout = { at: number; title: string; text: React.ReactNode }

/** A vertical stack of callouts next to a phone: the current one is bright, earlier ones dim. */
export const Callouts: React.FC<{ items: Callout[]; style?: React.CSSProperties }> = ({ items, style }) => {
  const { t } = useClock()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, fontFamily: FONT, ...style }}>
      {items.map((c, i) => {
        const p = useEnter(c.at, SNAPPY)
        const next = items[i + 1]?.at ?? 1e6
        const dim = interpolate(t, [next, next + 0.4], [1, 0.38], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const active = t >= c.at && t < next
        return (
          <div
            key={i}
            style={{
              opacity: p * dim,
              transform: `translateX(${(1 - p) * 40}px)`,
              display: 'flex',
              gap: 22,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 46,
                height: 46,
                borderRadius: 23,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 22,
                color: active ? C.navy : C.gold,
                background: active ? C.gold : 'transparent',
                border: `2px solid ${C.gold}`,
                boxShadow: active ? `0 0 24px rgba(233,178,19,0.45)` : undefined,
                marginTop: 4,
              }}
            >
              {i + 1}
            </div>
            <div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15 }}>{c.title}</div>
              <div style={{ fontSize: 24, color: C.whiteMuted, marginTop: 8, lineHeight: 1.4, maxWidth: 640 }}>{c.text}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Crossfades between phone screens at the given boundaries (seconds). */
export const ScreenSwitch: React.FC<{ screens: { from: number; node: React.ReactNode }[] }> = ({ screens }) => {
  const { t } = useClock()
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens.map((s, i) => {
        const end = screens[i + 1]?.from ?? 1e6
        const inP = interpolate(t, [s.from, s.from + 0.35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const outP = interpolate(t, [end, end + 0.35], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        if (t < s.from || t > end + 0.4) return null
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: inP * outP,
              transform: `translateX(${(1 - inP) * 50 - (1 - outP) * 50}px)`,
            }}
          >
            {s.node}
          </div>
        )
      })}
    </div>
  )
}

/** A translucent finger tap ripple, centred at (x, y) in phone coordinates, at second `at`. */
export const Tap: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const { t } = useClock()
  if (t < at || t > at + 0.6) return null
  const p = (t - at) / 0.6
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 44 + p * 40,
        height: 44 + p * 40,
        borderRadius: '50%',
        background: 'rgba(5,130,202,0.35)',
        border: `2px solid ${C.blue}`,
        transform: 'translate(-50%,-50%)',
        opacity: 1 - p,
        zIndex: 20,
      }}
    />
  )
}

export const Spinner: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = '#fff' }) => {
  const { t } = useClock()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2.5px solid ${color}`,
        borderTopColor: 'transparent',
        transform: `rotate(${(t * 360) % 360}deg)`,
        opacity: 0.9,
      }}
    />
  )
}
