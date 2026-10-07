import { Composition } from "remotion";
import { Promo, GradeDemo, SHOT, END, type PromoProps } from "./Portfolio";
import { AdCreative, ApartmentTour } from "./Portfolio2";
import { VizReel } from "./Portfolio3";
import { IntroSeries, INTRO, LESSONS } from "./Intro";
import { FaceReel, VERSIONS, reelFrames } from "./FaceReel";
import { StoryReel, STORY_FRAMES } from "./StoryReel";
import { AppBanner, BANNER_FRAMES } from "./AppBanner";
import { CatStory, CATS_FRAMES } from "./CatStory";
import { MemeCats, MEME_FRAMES } from "./MemeCats";
import { KitStory, KIT_FRAMES } from "./KitStory";
import { RM_V1, RM_V2, RM_DUR } from "./IntroRM";
import { RM2_A, RM2_B, RM2_DUR } from "./IntroRM2";
import { FormulaReel, FORMULA_FRAMES } from "./FormulaReel";
import { FormulaReel3 } from "./FormulaReel3";
import { LudiVideo, LUDI_FRAMES } from "./LudiVideo";
import { PartnerReel, PARTNER_FRAMES } from "./PartnerReel";
import { FormulaVO, FVO_FRAMES } from "./FormulaVO";
import { FormulaReel2 } from "./FormulaReel2";

const coffee: PromoProps = {
  brand: "ЗЕРНО", line: "кофейня · ул. Лесная, 5", cta: "Заказать с собой", endBg: "#2a1c13",
  st: { font: "Golos Text", weight: 900, upper: true, accent: "#ffb45e", grade: "saturate(1.15) contrast(1.08) sepia(.12)", titleSize: 118 },
  shots: [
    { src: "cf2.mp4", from: 1, kicker: "обжарка", title: "Свежее зерно каждую неделю" },
    { src: "cf3.mp4", from: 2, kicker: "эспрессо", title: "Идеальная экстракция" },
    { src: "cf1.mp4", from: 1, kicker: "латте-арт", title: "Каждая чашка — вручную" },
    { src: "cf4.mp4", from: 1, kicker: "атмосфера", title: "Место, куда хочется вернуться" },
  ],
};
const hotel: PromoProps = {
  brand: "Лазурь", line: "бутик-отель у моря", cta: "Забронировать", endBg: "#0f3b44",
  st: { font: "Literata", weight: 600, upper: false, accent: "#9ce7e0", grade: "saturate(1.12) contrast(1.05)", titleSize: 124 },
  shots: [
    { src: "ht1.mp4", from: 2, kicker: "первая линия", title: "Море в двух шагах" },
    { src: "ht2.mp4", from: 1, kicker: "бассейн", title: "Вода с видом на горизонт" },
    { src: "ht3.mp4", from: 0.5, kicker: "номера", title: "Просыпайтесь под шум волн" },
    { src: "ht4.mp4", from: 1, kicker: "завтраки", title: "Утро на террасе" },
  ],
};
const dur = (p: PromoProps) => p.shots.length * SHOT + END;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="PromoCoffee" component={Promo} durationInFrames={dur(coffee)} fps={30} width={1080} height={1920} defaultProps={coffee} />
    <Composition id="PromoHotel" component={Promo} durationInFrames={dur(hotel)} fps={30} width={1080} height={1920} defaultProps={hotel} />
    <Composition id="GradeDemo" component={GradeDemo} durationInFrames={240} fps={30} width={1080} height={1920} defaultProps={{ src: "gr1.mp4", from: 1 }} />
    <Composition id="AdCreative" component={AdCreative} durationInFrames={300} fps={30} width={1080} height={1920} />
    <Composition id="ApartmentTour" component={ApartmentTour} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="VizReel" component={VizReel} durationInFrames={396} fps={30} width={1920} height={1080} />
    <Composition id="StoryReel" component={StoryReel} durationInFrames={STORY_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="AppBanner" component={AppBanner} durationInFrames={BANNER_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="CatStory" component={CatStory} durationInFrames={CATS_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="MemeCats" component={MemeCats} durationInFrames={MEME_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="KitStory" component={KitStory} durationInFrames={KIT_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="FormulaReel" component={FormulaReel} durationInFrames={FORMULA_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="FormulaReel2" component={FormulaReel2} durationInFrames={FORMULA_FRAMES} fps={30} width={1080} height={1920} />
<Composition id="FormulaVO" component={FormulaVO} durationInFrames={FVO_FRAMES} fps={30} width={1080} height={1920} />
<Composition id="PartnerReel" component={PartnerReel} durationInFrames={PARTNER_FRAMES} fps={30} width={1080} height={1920} />
<Composition id="LudiVideo" component={LudiVideo} durationInFrames={LUDI_FRAMES} fps={30} width={1080} height={1350} />
<Composition id="FormulaReel3" component={FormulaReel3} durationInFrames={FORMULA_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="RMv1" component={RM_V1} durationInFrames={RM_DUR*4} fps={30} width={1920} height={1080} />
    <Composition id="RM2A" component={RM2_A} durationInFrames={RM2_DUR} fps={25} width={1920} height={1080} />
    <Composition id="RM2B" component={RM2_B} durationInFrames={RM2_DUR} fps={25} width={1920} height={1080} />
    <Composition id="RMv2" component={RM_V2} durationInFrames={RM_DUR*4} fps={30} width={1920} height={1080} />
    <Composition id="IntroSeries" component={IntroSeries} durationInFrames={INTRO * LESSONS.length} fps={30} width={1920} height={1080} />
    {Object.entries(VERSIONS).map(([k, v]) => (
      <Composition key={k} id={`Reel-${k}`} component={FaceReel} durationInFrames={reelFrames(v)} fps={30} width={1080} height={1920} defaultProps={v} />
    ))}
  </>
);
