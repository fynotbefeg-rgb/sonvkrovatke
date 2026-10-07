import { AbsoluteFill, Sequence, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { S, FORMULA_FRAMES } from "./FormulaReel";
const F = 30;
const C = { acc: "#5BF2C4", acc2: "#3D7BFF", txt: "#FFFFFF", mut: "#D5DDEA" };
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
const Shade: React.FC<{k?:number}> = ({k=.75}) => <AbsoluteFill style={{background:`linear-gradient(180deg, rgba(5,10,30,${k*.55}) 0%, rgba(5,10,30,${k*.15}) 35%, rgba(5,10,30,${k*.35}) 55%, rgba(5,10,30,${k}) 100%)`}}/>;
const H: React.CSSProperties = {fontFamily:"G",color:C.txt,fontWeight:800,textAlign:"center",padding:"0 70px",textShadow:shadow};
const Brand: React.FC = () => <div style={{position:"absolute",top:140,left:0,right:0,textAlign:"center"}}><span style={{fontFamily:"G",fontSize:30,letterSpacing:7,color:"#fff",fontWeight:800,background:"rgba(10,20,50,.55)",padding:"12px 26px",borderRadius:40,border:`2px solid ${C.acc}66`}}>ФОРУМ · ФОРМУЛА РОСТА</span></div>;
const Low: React.FC<{children:React.ReactNode; bottom?:number}> = ({children,bottom=360}) => <AbsoluteFill style={{justifyContent:"flex-end",paddingBottom:bottom}}>{children}</AbsoluteFill>;
const Acc: React.FC<{children:React.ReactNode}> = ({children}) => <span style={{background:`linear-gradient(90deg, ${C.acc}, #8FD3FF)`,WebkitBackgroundClip:"text",color:"transparent",textShadow:"none",filter:"drop-shadow(0 4px 18px rgba(0,0,0,.6))"}}>{children}</span>;
export const FormulaReel2: React.FC = () => {
  const f = useCurrentFrame();
  const seg = (from:number,to:number,src:string,k=.75) => <Sequence from={Math.round(from)} durationInFrames={Math.round(to-from)}><Clip src={src} dur={to-from}/><Shade k={k}/></Sequence>;
  const lf=f-S.list; const ii=Math.max(0,Math.min(ITEMS.length-1,Math.floor(lf/S.item)));
  return <AbsoluteFill style={{background:"#000",fontFamily:"G"}}>
    <style>{font}</style>
    {seg(0,S.contact,"hook",.8)}
    {seg(S.contact,S.list,"contact")}
    {ITEMS.map((_,k)=>seg(S.list+k*S.item,S.list+(k+1)*S.item,`i${k+1}`))}
    {seg(S.not,S.place,"not",.85)}
    {seg(S.place,S.cta,"place")}
    {seg(S.cta,FORMULA_FRAMES,"cta",.9)}
    <Brand/>
    <Sequence durationInFrames={Math.round(S.contact)}><Low bottom={420}>
      <In><div style={{...H,fontSize:88,lineHeight:1.05}}>Что получает<br/>партнёр</div></In>
      <In d={8}><div style={{...H,fontSize:112,marginTop:14}}><Acc>«Формулы роста»?</Acc></div></In>
    </Low></Sequence>
    <Sequence from={Math.round(S.contact)} durationInFrames={Math.round(S.list-S.contact)}><Low>
      <In><div style={{...H,fontSize:64,lineHeight:1.15}}>Прямой контакт<br/>с людьми, которые</div></In>
      <In d={10}><div style={{...H,fontSize:94,marginTop:16}}><Acc>принимают<br/>решения</Acc></div></In>
    </Low></Sequence>
    <Sequence from={Math.round(S.list)} durationInFrames={Math.round(S.not-S.list)}><Low bottom={330}>
      {(()=>{const loc=lf-ii*S.item; return <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{fontFamily:"G",fontSize:150,fontWeight:800,lineHeight:1,color:C.acc,textShadow:shadow}}>{String(ii+1).padStart(2,"0")}</div>
        <div key={ii} style={{...H,fontSize:76,lineHeight:1.1,marginTop:10,transform:`translateY(${interpolate(loc,[0,7],[40,0],{extrapolateRight:"clamp"})}px)`,opacity:interpolate(loc,[0,5],[0,1],{extrapolateRight:"clamp"})}}>{ITEMS[ii]}</div>
        <div style={{display:"flex",gap:12,marginTop:46}}>{ITEMS.map((_,k)=><div key={k} style={{width:k===ii?54:16,height:16,borderRadius:8,background:k<=ii?C.acc:"#ffffff55"}}/>)}</div></div>;})()}
    </Low></Sequence>
    <Sequence from={Math.round(S.not)} durationInFrames={Math.round(S.place-S.not)}><Low>
      <In><div style={{...H,fontSize:70,lineHeight:1.15}}>Партнёрство —<br/>это не просто</div></In>
      <In d={8}><div style={{...H,fontSize:70,lineHeight:1.15,color:C.mut,position:"relative",display:"inline-block",width:"100%"}}>присутствие<br/>на мероприятии
        <div style={{position:"absolute",left:"18%",right:"18%",top:"50%",height:10,background:C.acc,borderRadius:5,transformOrigin:"left",transform:`scaleX(${interpolate(f-S.not,[22,36],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}) rotate(-4deg)`}}/></div></In>
    </Low></Sequence>
    <Sequence from={Math.round(S.place)} durationInFrames={Math.round(S.cta-S.place)}><Low>
      <In><div style={{...H,fontSize:66,lineHeight:1.15}}>Это ваше место<br/>в сильном</div></In>
      <In d={8}><div style={{...H,fontSize:80,lineHeight:1.06,marginTop:12}}><Acc>предпринимательском окружении</Acc></div></In>
      <In d={18}><div style={{...H,fontSize:52,color:C.mut,marginTop:20}}>для роста бизнеса</div></In>
    </Low></Sequence>
    <Sequence from={Math.round(S.cta)}><Low bottom={300}>
      <In><div style={{...H,fontSize:60,lineHeight:1.15}}>Расскажите о вашей цели —</div></In>
      <In d={8}><div style={{...H,fontSize:76,lineHeight:1.08,marginTop:16}}><Acc>соберём формат<br/>партнёрства под вас</Acc></div></In>
      <In d={20}><div style={{margin:"56px auto 0",background:C.acc,color:"#071226",fontWeight:800,fontSize:48,padding:"28px 60px",borderRadius:100,width:"fit-content",boxShadow:"0 10px 40px rgba(91,242,196,.45)"}}>Написать в директ →</div></In>
    </Low></Sequence>
  </AbsoluteFill>;
};
