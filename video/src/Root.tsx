import { Composition } from "remotion";
import { SleepReel, noFootage, type SleepReelProps } from "./Composition";

// Видеофоны: стоковые кадры с людьми для первых сцен, ИИ-фон без лиц для последних
const withFootage: SleepReelProps = {
  footage: {
    hook: "stock-mom-rocking.mp4",
    timeline: "stock-mom-night-phone.mp4",
    insight: "ai-nursery-night.mp4",
    cta: "ai-crib-lamp.mp4",
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
