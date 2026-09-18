import React from 'react'

/** The KashLink mark: gold hexagon with a K. Same artwork as public/logo.svg in the app. */
export const Logo: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 64, style }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
    <defs>
      <linearGradient id="kl-gold" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#EC991C" />
        <stop offset="1" stopColor="#E9B213" />
      </linearGradient>
    </defs>
    <path d="M50 3l41 23.5v47L50 97 9 73.5v-47z" fill="url(#kl-gold)" />
    <path d="M50 19l27 15.5v31L50 81 23 65.5v-31z" fill="none" stroke="#fff" strokeWidth={6} strokeLinejoin="round" />
    <path d="M41 35v30M60 35L44 51.5M47 48.5L61 65" fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
