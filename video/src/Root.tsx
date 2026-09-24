import { Composition } from "remotion";
import { SleepReel, noFootage, type SleepReelProps } from "./Composition";

// Видеофоны: стоковые кадры Pexels (id в FOOTAGE.md) и ИИ-кадр Pixabay для сцены «Он не перерастёт сам»
const withFootage: SleepReelProps = {
  footage: {
    hook: "stock-mom-shoulder.mp4",
    timeline: "stock-mom-rocking-crib.mp4",
    insight: "ai-bedroom-night.mp4",
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
