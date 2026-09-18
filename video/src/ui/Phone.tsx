import React from 'react'
import { C, FONT } from '../theme'

export const PHONE_W = 390
export const PHONE_H = 844

/** An iPhone-ish frame. Children are laid out in a 390×844 box, then scaled. */
export const Phone: React.FC<{ scale?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ scale = 1, children, style }) => (
  <div style={{ width: PHONE_W * scale, height: PHONE_H * scale, position: 'relative', ...style }}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        width: PHONE_W,
        height: PHONE_H,
        borderRadius: 54,
        background: '#0b0d1a',
        padding: 12,
        boxShadow: '0 40px 80px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 44,
          overflow: 'hidden',
          background: C.bg,
          color: C.navy,
          fontFamily: FONT,
          fontSize: 16,
          lineHeight: 1.35,
          position: 'relative',
        }}
      >
        {/* dynamic island */}
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 120, height: 34, borderRadius: 20, background: '#0b0d1a', zIndex: 5 }} />
        {/* status bar */}
        <div style={{ position: 'absolute', top: 18, left: 30, fontWeight: 700, fontSize: 15, zIndex: 4 }}>9:41</div>
        <div style={{ position: 'absolute', top: 20, right: 28, display: 'flex', gap: 6, alignItems: 'center', zIndex: 4 }}>
          <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill={C.navy}/><rect x="5" y="5" width="3" height="7" rx="1" fill={C.navy}/><rect x="10" y="2" width="3" height="10" rx="1" fill={C.navy}/><rect x="15" y="0" width="3" height="12" rx="1" fill={C.navy}/></svg>
          <svg width="26" height="12" viewBox="0 0 26 12"><rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke={C.navy} fill="none"/><rect x="2" y="2" width="19" height="8" rx="2" fill={C.navy}/><rect x="23.5" y="4" width="2" height="4" rx="1" fill={C.navy}/></svg>
        </div>
        <div style={{ position: 'absolute', inset: 0, paddingTop: 62 }}>{children}</div>
        {/* home indicator */}
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 134, height: 5, borderRadius: 3, background: C.navy, opacity: 0.9, zIndex: 5 }} />
      </div>
    </div>
  </div>
)

/* ---- App primitives, matching the app's CSS ---- */

export const Screen: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 20px 28px', ...style }}>{children}</div>
)

export const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h1 style={{ margin: '8px 0 14px', fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>{children}</h1>
)

export const Back: React.FC = () => (
  <div style={{ width: 40, height: 40, marginLeft: -8, display: 'grid', placeItems: 'center' }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
)

export const Muted: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ color: C.muted, ...style }}>{children}</span>
)

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: C.card, borderRadius: 12, boxShadow: '0 2px 8px rgba(31,35,72,0.05), 0 0 1px rgba(31,35,72,0.08)', padding: '4px 16px', ...style }}>{children}</div>
)

export const Row: React.FC<{ label: React.ReactNode; value: React.ReactNode; total?: boolean }> = ({ label, value, total }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '11px 0',
      borderTop: total ? `1px solid ${C.border}` : undefined,
      fontSize: total ? 17 : 15,
    }}
  >
    <span style={{ color: total ? C.navy : C.muted, fontWeight: total ? 700 : 400 }}>{label}</span>
    <strong style={{ fontWeight: 700 }}>{value}</strong>
  </div>
)

export const Button: React.FC<{ children: React.ReactNode; kind?: 'primary' | 'green' | 'gold' | 'ghost'; pressed?: number; style?: React.CSSProperties }> = ({ children, kind = 'primary', pressed = 0, style }) => {
  const bg =
    kind === 'primary' ? `radial-gradient(100% 100% at bottom right, ${C.blueDeep}, ${C.blue})`
    : kind === 'green' ? `radial-gradient(100% 100% at bottom right, #41a38e, ${C.green})`
    : kind === 'gold' ? `radial-gradient(100% 100% at bottom right, ${C.orange}, ${C.gold})`
    : C.highlight
  const color = kind === 'ghost' ? C.navy : '#fff'
  return (
    <div
      style={{
        height: 56,
        borderRadius: 28,
        background: bg,
        color,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: 17,
        boxShadow: kind === 'primary' ? '0 6px 16px rgba(5,130,202,0.3)' : undefined,
        transform: `scale(${1 - pressed * 0.04})`,
        filter: `brightness(${1 - pressed * 0.12})`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export const Badge: React.FC<{ children: React.ReactNode; color?: 'blue' | 'green' | 'gold'; size?: number }> = ({ children, color = 'blue', size = 64 }) => {
  const bg =
    color === 'blue' ? `radial-gradient(100% 100% at bottom right, ${C.blueDeep}, ${C.blue})`
    : color === 'green' ? `radial-gradient(100% 100% at bottom right, #41a38e, ${C.green})`
    : `radial-gradient(100% 100% at bottom right, ${C.orange}, ${C.gold})`
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 8px 20px rgba(31,35,72,0.18)' }}>
      {children}
    </div>
  )
}

/** Segmented control, like the token toggle and the "who" chooser in the app. */
export const Segments: React.FC<{ items: string[]; on: number; style?: React.CSSProperties }> = ({ items, on, style }) => (
  <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: C.highlight, ...style }}>
    {items.map((it, i) => (
      <div
        key={it}
        style={{
          flex: 1,
          textAlign: 'center',
          padding: '9px 0',
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 14,
          background: i === on ? C.card : 'transparent',
          color: i === on ? C.navy : C.muted,
          boxShadow: i === on ? '0 2px 8px rgba(31,35,72,0.08)' : undefined,
        }}
      >
        {it}
      </div>
    ))}
  </div>
)

/* Icons used on the phone screens (stroke icons in the app's style). */
export const Ico = {
  link: (s = 24, c = '#fff') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  ),
  drop: (s = 24, c = '#fff') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
    </svg>
  ),
  check: (s = 24, c = '#fff') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  copy: (s = 18, c = C.navy) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  ),
  share: (s = 18, c = '#fff') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  ),
  key: (s = 18, c = '#fff') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l2 2M14 9l2 2" />
    </svg>
  ),
  alert: (s = 16, c = C.orange) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" />
    </svg>
  ),
  face: (s = 44, c = C.navy) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9 9.5v1M15 9.5v1M12 9.5v4h-1M9 15.5c1.5 1.3 4.5 1.3 6 0" />
    </svg>
  ),
}

/** Deterministic fake QR code (a real one is just a pattern to the viewer). */
export const Qr: React.FC<{ size?: number; seed?: number }> = ({ size = 160, seed = 7 }) => {
  const n = 25
  const cell = size / n
  const cells: React.ReactNode[] = []
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (finder(x, y)) {
      const fx = x < 7 ? x : x - (n - 7), fy = y < 7 ? y : y - (n - 7)
      const on = fx === 0 || fy === 0 || fx === 6 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4)
      if (on) cells.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={C.navy} />)
    } else if (rnd() > 0.55) {
      cells.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={C.navy} />)
    }
  }
  return <svg width={size} height={size} style={{ background: '#fff', borderRadius: 8, padding: 0 }}>{cells}</svg>
}
