import React from 'react'
import { Composition, Folder } from 'remotion'
import { FPS, SCENES, TOTAL_FRAMES, Video, sceneFrames } from './Video'

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="KashLinkDemo" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition key={s.id} id={`scene-${s.id}`} component={s.C} durationInFrames={sceneFrames(s.id)} fps={FPS} width={1920} height={1080} />
      ))}
    </Folder>
  </>
)
