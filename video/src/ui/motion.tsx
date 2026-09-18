import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

/** Seconds → frames, plus the current local time, for writing timings in seconds. */
export function useClock() {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  return { frame, fps, t: frame / fps, duration: durationInFrames / fps }
}

type SpringCfg = { damping?: number; stiffness?: number; mass?: number }
export const SMOOTH: SpringCfg = { damping: 200 }
export const SNAPPY: SpringCfg = { damping: 20, stiffness: 200 }
export const BOUNCY: SpringCfg = { damping: 12, stiffness: 150 }

/** 0→1 spring that starts at `at` seconds. */
export function useEnter(at: number, config: SpringCfg = SMOOTH, durationSec?: number) {
  const { frame, fps } = useClock()
  return spring({
    frame,
    fps,
    delay: at * fps,
    config,
    durationInFrames: durationSec ? durationSec * fps : undefined,
  })
}

/** Linear 0→1 over [from, to] seconds, clamped. */
export function useRamp(from: number, to: number, easing?: (n: number) => number) {
  const { t } = useClock()
  return interpolate(t, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing })
}

type RevealProps = {
  at: number
  children: React.ReactNode
  from?: 'up' | 'down' | 'left' | 'right' | 'scale' | 'none'
  distance?: number
  config?: SpringCfg
  style?: React.CSSProperties
  /** Fade out starting at this second (local). */
  until?: number
}

/** Wraps children and springs them in at `at` seconds; optionally fades them out at `until`. */
export const Reveal: React.FC<RevealProps> = ({ at, children, from = 'up', distance = 28, config = SMOOTH, style, until }) => {
  const { t } = useClock()
  const p = useEnter(at, config)
  const out = until === undefined ? 1 : interpolate(t, [until, until + 0.35], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const off = (1 - p) * distance
  const transform =
    from === 'up' ? `translateY(${off}px)`
    : from === 'down' ? `translateY(${-off}px)`
    : from === 'left' ? `translateX(${-off}px)`
    : from === 'right' ? `translateX(${off}px)`
    : from === 'scale' ? `scale(${0.85 + 0.15 * p})`
    : 'none'
  return (
    <div style={{ opacity: p * out, transform, ...style }}>
      {children}
    </div>
  )
}

/** Reveals a sentence word by word. */
export const Words: React.FC<{ text: string; at: number; per?: number; style?: React.CSSProperties; accent?: string[]; accentColor?: string }> = ({
  text, at, per = 0.08, style, accent = [], accentColor,
}) => {
  const { frame, fps } = useClock()
  const words = text.split(' ')
  return (
    <span style={style}>
      {words.map((w, i) => {
        const p = spring({ frame, fps, delay: (at + i * per) * fps, config: SNAPPY })
        const clean = w.replace(/[.,!?]/g, '')
        const isAccent = accent.includes(clean)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * 18}px)`,
              marginRight: '0.28em',
              color: isAccent ? accentColor : undefined,
            }}
          >
            {w}
          </span>
        )
      })}
    </span>
  )
}

/** Typewriter: characters typed from `at` at `cps` characters per second. */
export function useTyped(text: string, at: number, cps = 14) {
  const { t } = useClock()
  const n = Math.max(0, Math.floor((t - at) * cps))
  return text.slice(0, Math.min(text.length, n))
}

/** Counts a number up from 0. */
export function useCount(target: number, at: number, durSec = 1.2) {
  const p = useRamp(at, at + durSec, (x) => 1 - Math.pow(1 - x, 3))
  return target * p
}
