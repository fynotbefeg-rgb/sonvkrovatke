import { Composition } from "remotion";
import { Reel, reelDuration } from "./Reel";
import { reels } from "./reels";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {Object.entries(reels).map(([id, scenes]) => (
        <Composition
          key={id}
          id={id}
          component={Reel}
          durationInFrames={reelDuration(scenes)}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ scenes }}
        />
      ))}
    </>
  );
};
