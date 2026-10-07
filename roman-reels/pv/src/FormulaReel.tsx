import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from "remotion";
const F = 30;
const C = { bg: "#0E1525", bg2: "#17223A", acc: "#E8B64C", txt: "#F4F1EA", mut: "#8E9AB3" };
const font = `@font-face{font-family:G;src:url(${staticFile("fonts/golos-cyr.woff2")})}@font-face{font-family:G;src:url(${staticFile("fonts/golos-lat.woff2")});unicode-range:U+0000-00FF}`;
const ITEMS = ["Новые клиенты","Новые партнёрства","Выход на нужных людей","Личный бренд собственника","Доверие к вам и компании","Презентация продукта ЦА","Коллаборации между компаниями","Новые точки продаж и роста","Сильная позиция на рынке"];
export const S = { hook: 0, contact: 3.2*F, list: 6.6*F, item: 1.15*F, not: 0, place: 0, cta: 0 };
S.not = S.list + ITEMS.length*S.item + 0.4*F; S.place = S.not + 2.6*F; S.cta = S.place + 3.2*F;
export const FORMULA_FRAMES = Math.round(S.cta + 4.6*F);
const In: React.FC<{d?:number; children:React.ReactNode; y?:number}> = ({d=0,children,y=60}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const s = spring({frame:f-d,fps,config:{damping:16,stiffness:140}});
  return <div style={{opacity:interpolate(f-d,[0,6],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),transform:`translateY(${(1-s)*y}px)`}}>{children}</div>;
};
const Bg: React.FC = () => { const f=useCurrentFrame(); return <AbsoluteFill style={{background:`radial-gradient(120% 80% at ${30+Math.sin(f/90)*10}% ${20+Math.cos(f/120)*8}%, ${C.bg2}, ${C.bg} 70%)`}}>
  <div style={{position:"absolute",left:-200,top:1250+Math.sin(f/50)*20,width:1500,height:1500,borderRadius:"50%",border:`2px solid ${C.acc}22`}}/>
  <div style={{position:"absolute",right:-300,top:-300+Math.cos(f/60)*20,width:900,height:900,borderRadius:"50%",border:`2px solid ${C.acc}18`}}/></AbsoluteFill>; };
const Brand: React.FC = () => <div style={{position:"absolute",top:150,left:0,right:0,textAlign:"center",fontSize:30,letterSpacing:8,color:C.mut,fontWeight:700}}>ФОРУМ · ФОРМУЛА РОСТА</div>;
const H: React.CSSProperties = {fontFamily:"G",color:C.txt,fontWeight:800,textAlign:"center",padding:"0 80px"};
export const FormulaReel: React.FC = () => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{fontFamily:"G"}}>
    <style>{font}</style><Bg/><Brand/>
    <Sequence durationInFrames={S.contact}><AbsoluteFill style={{justifyContent:"center"}}>
      <In><div style={{...H,fontSize:84,lineHeight:1.08}}>Что получает<br/>партнёр</div></In>
      <In d={8}><div style={{...H,fontSize:110,color:C.acc,marginTop:20}}>«Формулы<br/>роста»?</div></In>
    </AbsoluteFill></Sequence>
    <Sequence from={S.contact} durationInFrames={S.list-S.contact}><AbsoluteFill style={{justifyContent:"center"}}>
      <In><div style={{...H,fontSize:64,lineHeight:1.15}}>Прямой контакт<br/>с людьми, которые</div></In>
      <In d={10}><div style={{...H,fontSize:92,color:C.acc,marginTop:24}}>принимают<br/>решения</div></In>
    </AbsoluteFill></Sequence>
    <Sequence from={S.list} durationInFrames={S.not-S.list}><AbsoluteFill style={{justifyContent:"center",alignItems:"center"}}>
      {(()=>{const lf=f-S.list; const i=Math.min(ITEMS.length-1,Math.floor(lf/S.item)); const loc=lf-i*S.item;
        return <><div style={{position:"absolute",top:560,fontSize:200,fontWeight:800,color:`${C.acc}`,opacity:.9}}>{String(i+1).padStart(2,"0")}</div>
        <div key={i} style={{...H,fontSize:78,lineHeight:1.12,transform:`translateY(${interpolate(loc,[0,7],[50,0],{extrapolateRight:"clamp"})}px)`,opacity:interpolate(loc,[0,5,S.item-4,S.item],[0,1,1,0.2],{extrapolateRight:"clamp"})}}>{ITEMS[i]}</div>
        <div style={{position:"absolute",bottom:430,display:"flex",gap:14}}>{ITEMS.map((_,k)=><div key={k} style={{width:k===i?56:18,height:18,borderRadius:9,background:k<=i?C.acc:"#ffffff33"}}/>)}</div></>;})()}
    </AbsoluteFill></Sequence>
    <Sequence from={S.not} durationInFrames={S.place-S.not}><AbsoluteFill style={{justifyContent:"center"}}>
      <In><div style={{...H,fontSize:70,lineHeight:1.15,color:C.mut}}>Партнёрство —<br/>это не просто<br/><s style={{textDecorationColor:C.acc,textDecorationThickness:8}}>присутствие<br/>на мероприятии</s></div></In>
    </AbsoluteFill></Sequence>
    <Sequence from={S.place} durationInFrames={S.cta-S.place}><AbsoluteFill style={{justifyContent:"center"}}>
      <In><div style={{...H,fontSize:66,lineHeight:1.15}}>Это ваше место<br/>в сильном</div></In>
      <In d={8}><div style={{...H,fontSize:84,color:C.acc,lineHeight:1.08,marginTop:16}}>предпринимательском<br/>окружении</div></In>
      <In d={18}><div style={{...H,fontSize:52,color:C.mut,marginTop:30}}>для роста бизнеса</div></In>
    </AbsoluteFill></Sequence>
    <Sequence from={S.cta}><AbsoluteFill style={{justifyContent:"center"}}>
      <In><div style={{...H,fontSize:62,lineHeight:1.15}}>Расскажите о вашей цели —</div></In>
      <In d={8}><div style={{...H,fontSize:74,color:C.acc,lineHeight:1.1,marginTop:20}}>соберём формат<br/>партнёрства под вас</div></In>
      <In d={20}><div style={{margin:"70px auto 0",background:C.acc,color:C.bg,fontWeight:800,fontSize:50,padding:"30px 64px",borderRadius:100,width:"fit-content"}}>Написать в директ →</div></In>
    </AbsoluteFill></Sequence>
  </AbsoluteFill>;
};
