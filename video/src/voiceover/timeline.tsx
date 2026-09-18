import React from 'react'
import { Sequence, staticFile, useVideoConfig } from 'remotion'
import { Audio } from '@remotion/media'
import script from './script.json'
import manifest from '../../public/voiceover/manifest.json'

export type SceneId = keyof typeof script

/** Designed scene lengths in seconds; a scene grows if its narration needs more. */
export const BASE_SECONDS: Record<SceneId, number> = {
  hook: 7,
  problem: 17,
  arc: 26,
  demo: 23,
  claim: 19,
  features: 10,
  contract: 21,
  outro: 7,
}

const GAP = 0.3     // minimum silence between two beats
const TAIL = 0.9    // hold after the last word before the scene ends

type Beat = { at: number; end: number; file: string; duration: number }
type Timeline = { beats: Beat[]; duration: number }

const durations = manifest as Record<string, { duration: number }>

function build(id: SceneId): Timeline {
  let prevEnd = 0
  const beats = (script[id] as { at: number; text: string }[]).map((b, i) => {
    const key = `${id}-${i}`
    const duration = durations[key]?.duration ?? 0
    const at = Math.max(b.at, prevEnd + (i === 0 ? 0 : GAP))
    prevEnd = at + duration
    return { at, end: prevEnd, file: `voiceover/${key}.mp3`, duration }
  })
  const duration = Math.max(BASE_SECONDS[id], prevEnd + TAIL)
  return { beats, duration }
}

export const TIMELINE: Record<SceneId, Timeline> = Object.fromEntries(
  (Object.keys(script) as SceneId[]).map((id) => [id, build(id)]),
) as Record<SceneId, Timeline>

/** Start times (seconds, scene-local) of a scene's narration beats. */
export const beats = (id: SceneId) => TIMELINE[id].beats.map((b) => b.at)

/** Renders the scene's narration clips at their beat times. */
export const Voice: React.FC<{ scene: SceneId }> = ({ scene }) => {
  const { fps } = useVideoConfig()
  return (
    <>
      {TIMELINE[scene].beats.map((b, i) =>
        b.duration > 0 ? (
          <Sequence key={i} from={Math.round(b.at * fps)} layout="none">
            <Audio src={staticFile(b.file)} volume={1} />
          </Sequence>
        ) : null,
      )}
    </>
  )
}
