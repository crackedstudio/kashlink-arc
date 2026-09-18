import { loadFont } from '@remotion/google-fonts/Mulish'

// Same palette as src/style.css in the app, so the phones in the video look like the real thing.
export const C = {
  navy: '#1f2348',
  navyDark: '#151833',
  blue: '#0582ca',
  blueDeep: '#265dd7',
  green: '#21bca5',
  gold: '#e9b213',
  orange: '#ec991c',
  red: '#d94432',
  bg: '#f8f8f8',
  card: '#ffffff',
  muted: 'rgba(31, 35, 72, 0.6)',
  muted2: 'rgba(31, 35, 72, 0.4)',
  border: 'rgba(31, 35, 72, 0.1)',
  highlight: 'rgba(31, 35, 72, 0.06)',
  white: '#ffffff',
  whiteMuted: 'rgba(255,255,255,0.64)',
  whiteFaint: 'rgba(255,255,255,0.10)',
}

const mulish = loadFont('normal', { weights: ['400', '600', '700', '800'], subsets: ['latin'] })
export const FONT = mulish.fontFamily

export const SITE = 'arc.kashlink.live'
export const REPO = 'github.com/crackedstudio/kashlink-arc'
export const ESCROW = '0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62'
export const ESCROW_SHORT = '0x4d6c05Fe…9159C62'
