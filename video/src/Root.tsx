import { Composition } from "remotion";
import { SleepReel } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SleepReel"
      component={SleepReel}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
