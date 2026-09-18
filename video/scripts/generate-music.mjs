// Synthesises a royalty-free music bed (no samples, no third-party audio) → public/music/bed.mp3.
// Bright and friendly: Rhodes-style chord stabs, a pentatonic pluck arpeggio with a dotted-eighth
// delay, soft bass, shaker + snap percussion, light reverb. C major, 100 BPM.
//   node scripts/generate-music.mjs [seconds]
import { execFileSync } from 'node:child_process'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SR = 44100
const SECONDS = Number(process.argv[2] ?? 160)
const BPM = 100
const BEAT = 60 / BPM
const N = Math.floor(SECONDS * SR)

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12)
// Deterministic noise so renders are reproducible.
let seed = 12345
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1 }

// C major, I – V – vi – IV, one bar (4 beats) per chord. Voicings sit above middle C with 7ths/9ths.
const CHORDS = [
  { root: 36, notes: [60, 64, 67, 71, 74], arp: [72, 76, 79, 83, 86, 83, 79, 76] }, // Cmaj9
  { root: 43, notes: [59, 62, 67, 71, 74], arp: [71, 74, 79, 83, 86, 83, 79, 74] }, // G add9
  { root: 45, notes: [60, 64, 67, 69, 76], arp: [69, 72, 76, 79, 84, 79, 76, 72] }, // Am7
  { root: 41, notes: [60, 65, 69, 72, 76], arp: [69, 72, 77, 81, 84, 81, 77, 72] }, // Fmaj7
]
const CHORD_BEATS = 4
const LOOP_BEATS = CHORD_BEATS * CHORDS.length

// Buses: keys/pluck get delay + reverb, bass/drums stay dry.
const wetL = new Float32Array(N), wetR = new Float32Array(N)
const dryL = new Float32Array(N), dryR = new Float32Array(N)

const add = (bufL, bufR, start, len, pan, fn) => {
  for (let i = 0; i < len && start + i < N; i++) {
    const v = fn(i / SR, i)
    bufL[start + i] += v * (1 - pan) * 1.6
    bufR[start + i] += v * pan * 1.6
  }
}

const totalBeats = Math.ceil(SECONDS / BEAT)
for (let b = 0; b < totalBeats; b++) {
  const chord = CHORDS[Math.floor((b % LOOP_BEATS) / CHORD_BEATS)]
  const beatInBar = b % 4
  const start = Math.floor(b * BEAT * SR)
  const half = Math.floor((BEAT / 2) * SR)

  // Rhodes-ish chord: on beat 1, plus a lighter push on the "and" of 2. Bell-like partials, 1.6 s decay.
  const stab = (at, vol) => {
    for (const m of chord.notes) {
      const f = midi(m)
      const pan = 0.5 + ((m % 5) - 2) * 0.06
      add(wetL, wetR, at, Math.floor(1.8 * SR), pan, (t) => {
        const env = Math.min(1, t / 0.006) * Math.exp(-t * 2.1)
        const trem = 1 + 0.06 * Math.sin(2 * Math.PI * 4.5 * t)
        const w = 2 * Math.PI * f * t
        return (Math.sin(w) + 0.18 * Math.sin(2 * w) * Math.exp(-t * 4) + 0.05 * Math.sin(4 * w) * Math.exp(-t * 9)) * env * trem * vol
      })
    }
  }
  if (beatInBar === 0) stab(start, 0.12)
  if (beatInBar === 1) stab(start + half, 0.07)

  // Pluck arpeggio: 8th notes through a pentatonic-ish pattern. Bright, short, panned alternately.
  for (let e = 0; e < 2; e++) {
    const idx = (beatInBar * 2 + e) % chord.arp.length
    const f = midi(chord.arp[idx])
    const pan = e === 0 ? 0.38 : 0.62
    add(wetL, wetR, start + e * half, Math.floor(0.5 * SR), pan, (t) => {
      const env = Math.min(1, t / 0.003) * Math.exp(-t * 6.5)
      const w = 2 * Math.PI * f * t
      return (Math.sin(w) + 0.3 * Math.sin(2 * w) + 0.12 * Math.sin(3 * w) * Math.exp(-t * 12)) * env * 0.085
    })
  }

  // Bass: root on 1, fifth on 3, short and soft. Fundamental + a little 2nd harmonic for definition.
  if (beatInBar === 0 || beatInBar === 2) {
    const f = midi(chord.root + (beatInBar === 2 ? 7 : 0))
    add(dryL, dryR, start, Math.floor(0.9 * SR), 0.5, (t) => {
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 3.2)
      const w = 2 * Math.PI * f * t
      return (Math.sin(w) + 0.2 * Math.sin(2 * w)) * env * 0.15
    })
  }

  // Shaker on every 8th, accented off-beats; a soft snap on 2 and 4; a very soft kick on 1 and 3.
  for (let e = 0; e < 2; e++) {
    const vol = e === 1 ? 0.009 : 0.005
    let prev = 0
    add(dryL, dryR, start + e * half, Math.floor(0.09 * SR), e === 0 ? 0.45 : 0.55, (t) => {
      const n = rnd()
      const hp = (n - prev) * 0.5
      prev = n
      return hp * Math.min(1, t / 0.008) * Math.exp(-t * 40) * vol
    })
  }
  if (beatInBar === 1 || beatInBar === 3) {
    let p1 = 0, p2 = 0
    add(dryL, dryR, start, Math.floor(0.14 * SR), 0.5, (t) => {
      const n = rnd()
      // band-passed noise ≈ finger snap
      p1 += (n - p1) * 0.35
      p2 += (p1 - p2) * 0.35
      const bp = p1 - p2
      return bp * Math.min(1, t / 0.002) * Math.exp(-t * 26) * 0.06
    })
  }
  if (beatInBar === 0 || beatInBar === 2) {
    let ph = 0
    add(dryL, dryR, start, Math.floor(0.16 * SR), 0.5, (t) => {
      const f = 55 + 60 * Math.exp(-t * 40)
      ph += (2 * Math.PI * f) / SR
      return Math.sin(ph) * Math.exp(-t * 18) * 0.11
    })
  }
}

// Dotted-eighth stereo delay on the wet bus (ping-pong, 28% feedback).
{
  const d = Math.floor(BEAT * 0.75 * SR)
  for (let i = d; i < N; i++) {
    wetL[i] += wetR[i - d] * 0.28
    wetR[i] += wetL[i - d] * 0.28
  }
}

// Small Schroeder reverb on the wet bus: 4 combs + 2 allpasses, ~1.4 s tail, 18% mix.
function reverb(x) {
  const combs = [1557, 1617, 1491, 1422].map((len) => ({ buf: new Float32Array(len), i: 0, fb: 0.78 }))
  const aps = [225, 556].map((len) => ({ buf: new Float32Array(len), i: 0 }))
  const y = new Float32Array(N)
  for (let n = 0; n < N; n++) {
    const inp = x[n]
    let s = 0
    for (const c of combs) {
      const out = c.buf[c.i]
      c.buf[c.i] = inp + out * c.fb
      c.i = (c.i + 1) % c.buf.length
      s += out
    }
    s *= 0.25
    for (const a of aps) {
      const bufOut = a.buf[a.i]
      const v = s + bufOut * -0.5
      a.buf[a.i] = v
      a.i = (a.i + 1) % a.buf.length
      s = bufOut + v * 0.5
    }
    y[n] = s
  }
  return y
}
const rvL = reverb(wetL), rvR = reverb(wetR)

// Mix, gentle soft-clip, normalise, fade in/out.
const L = new Float32Array(N), R = new Float32Array(N)
let peak = 0
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh((dryL[i] + wetL[i] + rvL[i] * 0.18) * 1.3)
  R[i] = Math.tanh((dryR[i] + wetR[i] + rvR[i] * 0.18) * 1.3)
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const gain = 0.8 / peak
const out = Buffer.alloc(N * 4)
for (let i = 0; i < N; i++) {
  const t = i / SR
  const fade = Math.min(1, t / 0.8, (SECONDS - t) / 3.0)
  out.writeInt16LE(Math.round(L[i] * gain * fade * 32767), i * 4)
  out.writeInt16LE(Math.round(R[i] * gain * fade * 32767), i * 4 + 2)
}
const header = Buffer.alloc(44)
header.write('RIFF', 0); header.writeUInt32LE(36 + out.length, 4); header.write('WAVE', 8)
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22)
header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34)
header.write('data', 36); header.writeUInt32LE(out.length, 40)

const dir = join(root, 'public/music')
mkdirSync(dir, { recursive: true })
const wav = join(dir, 'bed.wav')
writeFileSync(wav, Buffer.concat([header, out]))
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '160k', join(dir, 'bed.mp3')])
unlinkSync(wav)
console.log(`wrote public/music/bed.mp3 (${SECONDS} s)`)
