import React from 'react'
import { AbsoluteFill, interpolate, staticFile } from 'remotion'
import { Audio } from '@remotion/media'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { Hook } from './scenes/Hook'
import { Problem } from './scenes/Problem'
import { ArcInsight } from './scenes/ArcInsight'
import { Demo } from './scenes/Demo'
import { Claim } from './scenes/Claim'
import { Features } from './scenes/Features'
import { Contract } from './scenes/Contract'
import { Outro } from './scenes/Outro'
import { TIMELINE, type SceneId } from './voiceover/timeline'

export const FPS = 30
export const XFADE = 15

/** Scene order. Lengths come from the voice-over timeline (src/voiceover/timeline.tsx). */
export const SCENES: { id: SceneId; C: React.FC }[] = [
  { id: 'hook', C: Hook },
  { id: 'problem', C: Problem },
  { id: 'arc', C: ArcInsight },
  { id: 'demo', C: Demo },
  { id: 'claim', C: Claim },
  { id: 'features', C: Features },
  { id: 'contract', C: Contract },
  { id: 'outro', C: Outro },
]

export const sceneFrames = (id: SceneId) => Math.round(TIMELINE[id].duration * FPS)
export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + sceneFrames(s.id), 0) - XFADE * (SCENES.length - 1)

/** Global frame ranges in which someone is speaking, for ducking the music. */
const SPEECH: [number, number][] = (() => {
  const out: [number, number][] = []
  let offset = 0
  for (const s of SCENES) {
    for (const b of TIMELINE[s.id].beats) out.push([offset + b.at * FPS, offset + b.end * FPS])
    offset += sceneFrames(s.id) - XFADE
  }
  return out
})()

const MUSIC = 0.18
const MUSIC_DUCKED = 0.07
const RAMP = 0.35 * FPS

const musicVolume = (f: number) => {
  // how deep into (or near) a speech interval this frame is, 0..1
  let duck = 0
  for (const [a, b] of SPEECH) {
    if (f >= a - RAMP && f <= b + RAMP) {
      const inRamp = f < a ? (f - (a - RAMP)) / RAMP : f > b ? (b + RAMP - f) / RAMP : 1
      duck = Math.max(duck, inRamp)
    }
  }
  const base = MUSIC - (MUSIC - MUSIC_DUCKED) * duck
  const fadeIn = interpolate(f, [0, FPS], [0, 1], { extrapolateRight: 'clamp' })
  const fadeOut = interpolate(f, [TOTAL_FRAMES - 3 * FPS, TOTAL_FRAMES - 5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return base * fadeIn * fadeOut
}

export const Video: React.FC = () => (
  <AbsoluteFill>
    <Audio src={staticFile('music/bed.mp3')} volume={musicVolume} trimAfter={TOTAL_FRAMES} />
    <TransitionSeries>
      {SCENES.map((s, i) => (
        <React.Fragment key={s.id}>
          {i > 0 && <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: XFADE })} />}
          <TransitionSeries.Sequence durationInFrames={sceneFrames(s.id)}>
            <s.C />
          </TransitionSeries.Sequence>
        </React.Fragment>
      ))}
    </TransitionSeries>
  </AbsoluteFill>
)
