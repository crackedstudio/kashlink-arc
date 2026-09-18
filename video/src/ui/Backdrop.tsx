import React from 'react'
import { AbsoluteFill } from 'remotion'
import { C } from '../theme'
import { useClock } from './motion'

/** Navy gradient with a slow-drifting gold and blue glow. Used behind every scene. */
export const Backdrop: React.FC<{ children?: React.ReactNode; glow?: 'gold' | 'blue' | 'green' }> = ({ children, glow = 'gold' }) => {
  const { t } = useClock()
  const gx = 62 + Math.sin(t * 0.35) * 8
  const gy = 30 + Math.cos(t * 0.28) * 8
  const color = glow === 'gold' ? '233,178,19' : glow === 'blue' ? '5,130,202' : '33,188,165'
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyDark} 100%)`, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(700px 700px at ${gx}% ${gy}%, rgba(${color},0.22), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 600px at ${100 - gx}% ${110 - gy}%, rgba(5,130,202,0.18), transparent 70%)`,
        }}
      />
      {/* faint hex grid, echoing the logo */}
      <AbsoluteFill style={{ opacity: 0.05 }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="hex" width="56" height="97" patternUnits="userSpaceOnUse" patternTransform="scale(1.4)">
              <path d="M28 0l28 16v32L28 64 0 48V16z" fill="none" stroke="#fff" strokeWidth={1} />
              <path d="M28 64l28 16v32L28 128 0 112V80z" fill="none" stroke="#fff" strokeWidth={1} transform="translate(-28,-16)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex)" />
        </svg>
      </AbsoluteFill>
      {children}
    </AbsoluteFill>
  )
}
