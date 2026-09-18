import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { S1, S2, S3, S4, S5, S6 } from "./scenes";
import { Subtitles } from "./Subtitles";
import {
  AUDIO_DURATIONS,
  AUDIO_FILES,
  COLORS,
  CROSSFADE,
  FPS,
  SCENE_DURATIONS,
} from "./constants";

const SceneAudio: React.FC<{ src: string; audioDuration: number }> = ({ src, audioDuration }) => (
  <Audio
    src={staticFile(src)}
    volume={(f) => {
      const fadeIn = interpolate(f, [0, Math.round(FPS * 0.3)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const fadeOut = interpolate(f, [audioDuration - FPS, audioDuration], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return Math.min(fadeIn, fadeOut);
    }}
  />
);

const scenes = [
  { id: "s1" as const, C: S1 },
  { id: "s2" as const, C: S2 },
  { id: "s3" as const, C: S3 },
  { id: "s4" as const, C: S4 },
  { id: "s5" as const, C: S5 },
  { id: "s6" as const, C: S6 },
];

export const MainVideo: React.FC = () => {
  const timing = linearTiming({ durationInFrames: CROSSFADE });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <TransitionSeries>
        {scenes.flatMap((s, i) => {
          const els = [
            <TransitionSeries.Sequence key={s.id} durationInFrames={SCENE_DURATIONS[s.id]}>
              <s.C />
              <SceneAudio src={AUDIO_FILES[s.id]} audioDuration={AUDIO_DURATIONS[s.id]} />
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            els.push(
              <TransitionSeries.Transition key={`t-${s.id}`} presentation={fade()} timing={timing} />
            );
          }
          return els;
        })}
      </TransitionSeries>
      <Subtitles />
    </AbsoluteFill>
  );
};
