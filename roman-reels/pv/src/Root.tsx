import { Composition } from "remotion";
import { FaceReel, VERSIONS, reelFrames } from "./FaceReel";
import { AiReel, AI_VERSIONS, aiFrames } from "./AiReel";
import { RomanReel, R_VERSIONS, rFrames } from "./RomanReel";

// только рилсы Романа
export const RemotionRoot: React.FC = () => (
  <>
    {Object.entries(VERSIONS).map(([k, v]) => (
      <Composition key={k} id={`Reel-${k}`} component={FaceReel} durationInFrames={reelFrames(v)} fps={30} width={1080} height={1920} defaultProps={v} />
    ))}
    {Object.entries(R_VERSIONS).map(([k, v]) => (
      <Composition key={k} id={`R-${k}`} component={RomanReel} durationInFrames={rFrames(v)} fps={25} width={1080} height={1920} defaultProps={v} />
    ))}
    {Object.entries(AI_VERSIONS).map(([k, v]) => (
      <Composition key={k} id={`Ai-${k}`} component={AiReel} durationInFrames={aiFrames(v)} fps={30} width={1080} height={1920} defaultProps={v} />
    ))}
  </>
);
