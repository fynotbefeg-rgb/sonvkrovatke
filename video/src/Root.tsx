import { Composition } from "remotion";
import { SleepReel, noFootage, type SleepReelProps } from "./Composition";

// Видеофоны: стоковые кадры Pexels (id в FOOTAGE.md); сцена «Он не перерастёт сам» на ночном фоне
const withFootage: SleepReelProps = {
  footage: {
    hook: "stock-mom-shoulder.mp4",
    timeline: "stock-mom-rocking-crib.mp4",
    insight: null,
    cta: "stock-crib-lights.mp4",
  },
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SleepReel"
        component={SleepReel}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={noFootage}
      />
      <Composition
        id="SleepReelFootage"
        component={SleepReel}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={withFootage}
      />
    </>
  );
};
