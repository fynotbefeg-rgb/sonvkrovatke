import { Composition } from "remotion";
import { Reel, reelDuration } from "./Reel";
import { reels } from "./reels";
import { Carousel } from "./Carousel";
import { carousels } from "./carousels";
import { Avatar, HighlightCover, OgImage, highlights, ogCount } from "./Brand";
import { StoryFrame, memoStories } from "./Stories";

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
      {Object.entries(carousels).map(([id, slides]) => (
        <Composition
          key={id}
          id={id}
          component={Carousel}
          durationInFrames={slides.length}
          fps={1}
          width={1080}
          height={1350}
          defaultProps={{ slides }}
        />
      ))}
      <Composition id="Avatar" component={Avatar} durationInFrames={1} fps={1} width={1080} height={1080} />
      <Composition id="OgImage" component={OgImage} durationInFrames={ogCount} fps={1} width={1200} height={630} />
      <Composition
        id="StoriesMemo"
        component={StoryFrame}
        durationInFrames={memoStories.length}
        fps={1}
        width={1080}
        height={1920}
        defaultProps={{ stories: memoStories }}
      />
      <Composition
        id="Highlights"
        component={HighlightCover}
        durationInFrames={highlights.length}
        fps={1}
        width={1080}
        height={1920}
      />
    </>
  );
};
