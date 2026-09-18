import React from "react";
import { Composition, registerRoot } from "remotion";
import { MainVideo } from "./MainVideo";
import { FPS, W, H, TOTAL_FRAMES } from "./constants";

export const RemotionRoot: React.FC = () => (
  <Composition id="Main" component={MainVideo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
);

registerRoot(RemotionRoot);
