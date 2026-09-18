import React from 'react'
import { AbsoluteFill } from 'remotion'
import { C, FONT } from '../theme'
import { Reveal, useClock } from './motion'
import { interpolate } from 'remotion'

/** Standard content frame: 1920×1080 with 120px side gutters. */
export const Frame: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ fontFamily: FONT, color: C.white, padding: '80px 120px', ...style }}>{children}</AbsoluteFill>
)

export const Headline: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 72, style }) => (
  <div style={{ fontSize: size, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.08, ...style }}>{children}</div>
)

export const Sub: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 34, style }) => (
  <div style={{ fontSize: size, fontWeight: 400, color: C.whiteMuted, lineHeight: 1.35, ...style }}>{children}</div>
)

export const Pill: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.gold, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 20px',
      borderRadius: 999,
      border: `1.5px solid ${color}`,
      color,
      fontWeight: 700,
      fontSize: 22,
      letterSpacing: 0.3,
      ...style,
    }}
  >
    {children}
  </div>
)

/** Section label at the top-left, like a chapter marker. */
export const Kicker: React.FC<{ n: string; children: React.ReactNode; at?: number }> = ({ n, children, at = 0 }) => (
  <Reveal at={at} from="left">
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: C.gold, fontWeight: 800, fontSize: 22, letterSpacing: 3, textTransform: 'uppercase' }}>
      <span style={{ opacity: 0.6 }}>{n}</span>
      <span style={{ width: 36, height: 2, background: C.gold, opacity: 0.6 }} />
      {children}
    </div>
  </Reveal>
)

type Line = { at: number; text: React.ReactNode }

/** Narration line at the bottom of the frame; each line replaces the previous one. */
export const Narration: React.FC<{ lines: Line[]; bottom?: number }> = ({ lines, bottom = 88 }) => {
  const { t } = useClock()
  return (
    <div style={{ position: 'absolute', left: 120, right: 120, bottom, textAlign: 'center', fontFamily: FONT }}>
      {lines.map((l, i) => {
        const next = lines[i + 1]?.at ?? 1e6
        const inP = interpolate(t, [l.at, l.at + 0.35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const outP = interpolate(t, [next - 0.3, next], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const o = inP * outP
        if (o <= 0) return null
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              opacity: o,
              transform: `translateY(${(1 - inP) * 14}px)`,
              fontSize: 32,
              fontWeight: 600,
              color: C.white,
              lineHeight: 1.35,
            }}
          >
            {l.text}
          </div>
        )
      })}
    </div>
  )
}

export const Accent: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.gold }) => (
  <span style={{ color, fontWeight: 800 }}>{children}</span>
)
