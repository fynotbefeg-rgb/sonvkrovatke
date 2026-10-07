import { AbsoluteFill, Img, Sequence, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { S, FORMULA_FRAMES } from "./FormulaReel";
const F = 30;
const C = { acc: "#E3C186", acc2: "#F8E7C2", gold: "#C9A266", green: "#024D2F", txt: "#FFFFFF", mut: "#DCE6DF" };
const font = `@font-face{font-family:G;src:url(${staticFile("fonts/golos-cyr.woff2")})}@font-face{font-family:G;src:url(${staticFile("fonts/golos-lat.woff2")});unicode-range:U+0000-00FF}`;
const ITEMS = ["Новые клиенты","Новые партнёрства","Выход на нужных людей","Личный бренд собственника","Доверие к вам и компании","Презентация продукта ЦА","Коллаборации между компаниями","Новые точки продаж и роста","Сильная позиция на рынке"];
const shadow = "0 4px 24px rgba(0,0,0,.55)";
const In: React.FC<{d?:number; children:React.ReactNode}> = ({d=0,children}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const s = spring({frame:f-d,fps,config:{damping:15,stiffness:150}});
  return <div style={{opacity:interpolate(f-d,[0,5],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),transform:`translateY(${(1-s)*50}px)`}}>{children}</div>;
};
const Clip: React.FC<{src:string; dur:number}> = ({src,dur}) => { const f=useCurrentFrame();
  const z = interpolate(f,[0,dur],[1.0,1.08]);
  return <AbsoluteFill style={{transform:`scale(${z})`}}><OffthreadVideo src={staticFile(`formula/${src}.mp4`)} muted style={{width:"100%",height:"100%",objectFit:"cover"}}/></AbsoluteFill>; };
const Shade: React.FC<{k?:number}> = ({k=.75}) => <AbsoluteFill style={{background:`linear-gradient(180deg, rgba(1,22,12,${k*.55}) 0%, rgba(1,22,12,${k*.15}) 35%, rgba(1,22,12,${k*.35}) 55%, rgba(1,22,12,${k}) 100%)`}}/>;
const H: React.CSSProperties = {fontFamily:"G",color:C.txt,fontWeight:800,textTransform:"uppercase",letterSpacing:-1,textAlign:"center",padding:"0 70px",textShadow:shadow};
const Brand: React.FC = () => <div style={{position:"absolute",top:165,left:0,right:0,display:"flex",justifyContent:"center",alignItems:"center",gap:34}}><div style={{width:160,height:3,background:C.gold}}/><span style={{fontFamily:"G",fontSize:34,letterSpacing:12,color:C.acc,fontWeight:500,textShadow:"0 2px 12px rgba(0,0,0,.6)"}}>ФОРМУЛА РОСТА</span><div style={{width:160,height:3,background:C.gold}}/></div>;
const Wave: React.FC<{src:string; dur:number; flip?:boolean}> = ({src,dur,flip}) => { const f=useCurrentFrame(); const z=interpolate(f,[0,dur],[1.0,1.1]); return <AbsoluteFill style={{transform:`scale(${z}) rotate(${interpolate(f,[0,dur],[0,1.5])}deg) scaleX(${flip?-1:1})`}}><Img src={staticFile(`formula/${src}.jpg`)} style={{width:"100%",height:"100%",objectFit:"cover"}}/></AbsoluteFill>; };
const Line: React.FC = () => <div style={{width:300,height:3,background:C.gold,margin:"44px auto"}}/>;
const Low: React.FC<{children:React.ReactNode; bottom?:number}> = ({children,bottom=360}) => <AbsoluteFill style={{justifyContent:"flex-end",paddingBottom:bottom}}>{children}</AbsoluteFill>;
const Acc: React.FC<{children:React.ReactNode}> = ({children}) => <span style={{background:`linear-gradient(90deg, ${C.acc2}, ${C.acc} 55%, ${C.gold})`,WebkitBackgroundClip:"text",color:"transparent",textShadow:"none",filter:"drop-shadow(0 4px 18px rgba(0,0,0,.6))"}}>{children}</span>;
export const FormulaReel3: React.FC = () => {
  const f = useCurrentFrame();
  const seg = (from:number,to:number,src:string,k=.75) => <Sequence from={Math.round(from)} durationInFrames={Math.round(to-from)}><Clip src={src} dur={to-from}/><Shade k={k}/></Sequence>;
  const lf=f-S.list; const ii=Math.max(0,Math.min(ITEMS.length-1,Math.floor(lf/S.item)));
  return <AbsoluteFill style={{background:"#000",fontFamily:"G"}}>
    <style>{font}</style>
    <Sequence durationInFrames={Math.round(S.contact)}><Wave src="wave1" dur={S.contact}/></Sequence>
    {seg(S.contact,S.list,"contact")}
    {ITEMS.map((_,k)=>seg(S.list+k*S.item,S.list+(k+1)*S.item,`i${k+1}`))}
    {seg(S.not,S.place,"not",.85)}
    {seg(S.place,S.cta,"place")}
    <Sequence from={Math.round(S.cta)}><Wave src="wave2" dur={FORMULA_FRAMES-S.cta} flip/><AbsoluteFill style={{background:"rgba(0,0,0,.25)"}}/></Sequence>
    <Brand/>
    <Sequence durationInFrames={Math.round(S.contact)}><AbsoluteFill style={{justifyContent:"center"}}>
      <In><div style={{...H,fontSize:96,lineHeight:1.02}}>Что получает<br/>партнёр</div></In>
      <In d={8}><div style={{...H,fontSize:108,lineHeight:1.02,marginTop:10}}><Acc>«Формулы<br/>роста»?</Acc></div></In>
      <In d={16}><Line/><div style={{...H,textTransform:"none",fontWeight:400,fontSize:54,lineHeight:1.2}}>9 причин стать<br/>партнёром форума</div></In>
    </AbsoluteFill></Sequence>
    <Sequence from={Math.round(S.contact)} durationInFrames={Math.round(S.list-S.contact)}><Low>
      <In><div style={{...H,fontSize:64,lineHeight:1.15}}>Прямой контакт<br/>с людьми, которые</div></In>
      <In d={10}><div style={{...H,fontSize:94,marginTop:16}}><Acc>принимают<br/>решения</Acc></div></In>
    </Low></Sequence>
    <Sequence from={Math.round(S.list)} durationInFrames={Math.round(S.not-S.list)}><Low bottom={330}>
      {(()=>{const loc=lf-ii*S.item; return <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{fontFamily:"G",fontSize:150,fontWeight:800,lineHeight:1,color:C.acc,textShadow:shadow,fontFamily:"G"}}>{String(ii+1).padStart(2,"0")}</div>
        <div key={ii} style={{...H,fontSize:76,lineHeight:1.1,marginTop:10,transform:`translateY(${interpolate(loc,[0,7],[40,0],{extrapolateRight:"clamp"})}px)`,opacity:interpolate(loc,[0,5],[0,1],{extrapolateRight:"clamp"})}}>{ITEMS[ii]}</div>
        <div style={{display:"flex",gap:12,marginTop:46}}>{ITEMS.map((_,k)=><div key={k} style={{width:k===ii?54:16,height:16,borderRadius:8,background:k<=ii?C.acc:"#ffffff55"}}/>)}</div></div>;})()}
    </Low></Sequence>
    <Sequence from={Math.round(S.not)} durationInFrames={Math.round(S.place-S.not)}><Low>
      <In><div style={{...H,fontSize:70,lineHeight:1.15}}>Партнёрство —<br/>это не просто</div></In>
      <In d={8}><div style={{...H,fontSize:70,lineHeight:1.2,color:C.mut}}><div style={{position:"relative",display:"inline-block"}}>присутствие<div style={{position:"absolute",left:-10,right:-10,top:"52%",height:9,background:C.acc,borderRadius:5,transformOrigin:"left",transform:`scaleX(${interpolate(f-S.not,[22,32],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})})`}}/></div><br/><div style={{position:"relative",display:"inline-block"}}>на мероприятии<div style={{position:"absolute",left:-10,right:-10,top:"52%",height:9,background:C.acc,borderRadius:5,transformOrigin:"left",transform:`scaleX(${interpolate(f-S.not,[30,40],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})})`}}/></div></div></In>
    </Low></Sequence>
    <Sequence from={Math.round(S.place)} durationInFrames={Math.round(S.cta-S.place)}><Low>
      <In><div style={{...H,fontSize:66,lineHeight:1.15}}>Это ваше место<br/>в сильном</div></In>
      <In d={8}><div style={{...H,fontSize:54,lineHeight:1.12,marginTop:12}}><Acc>предпринимательском<br/>окружении</Acc></div></In>
      <In d={18}><div style={{...H,fontSize:52,color:C.mut,marginTop:20}}>для роста бизнеса</div></In>
    </Low></Sequence>
    <Sequence from={Math.round(S.cta)}><Low bottom={640}>
      <In><div style={{...H,fontSize:60,lineHeight:1.15}}>Расскажите о вашей цели —</div></In>
      <In d={8}><div style={{...H,fontSize:76,lineHeight:1.08,marginTop:16}}><Acc>соберём формат<br/>партнёрства под вас</Acc></div></In>
      <In d={20}><div style={{margin:"56px auto 0",background:`linear-gradient(90deg, ${C.acc2}, ${C.acc})`,color:C.green,fontWeight:800,fontSize:48,padding:"28px 60px",borderRadius:100,width:"fit-content",boxShadow:"0 10px 40px rgba(227,193,134,.35)"}}>Написать в директ →</div></In>
    </Low></Sequence>
  </AbsoluteFill>;
};
