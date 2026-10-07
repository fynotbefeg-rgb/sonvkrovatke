import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from "remotion";
const font = `@font-face{font-family:G;src:url(${staticFile("fonts/golos-cyr.woff2")})}@font-face{font-family:G;src:url(${staticFile("fonts/golos-lat.woff2")});unicode-range:U+0000-00FF}`;
const C = { gold: "#E3C186", gold2: "#F8E7C2", goldd: "#C9A266", green: "#024D2F" };
const CAP: [number, number, string][] = [
  [0.3,3.4,"На самом деле я в восторге от спикеров, от участников"],
  [3.4,6.1,"и вообще от той атмосферы, в которой мы сегодня оказались"],
  [6.2,11.2,"Как будто бы мы все друг другу друзья, все знакомы"],
  [11.5,12.7,"Мне тоже очень понравилось"],
  [12.7,15.1,"Хочу поблагодарить организаторов"],
  [16.5,20.0,"Очень душевная атмосфера, Джамиля подметила — дружеская"],
  [20.0,23.0,"Я выступал вот так впервые —"],
  [23.0,28.9,"рассказывал о том, чем занимаешься, что ты умеешь"],
  [29.0,30.9,"И было достаточно легко,"],
  [30.9,33.3,"как будто рассказывал у себя дома, своим,"],
  [33.3,36.1,"как будто со своими сотрудниками общался"],
  [37.3,41.3,"Атмосфера очень хорошая, приятная, мне очень понравилось"],
  [41.5,43.3,"Спасибо вам большое!"],
];
export const LUDI_FRAMES = Math.round(43.3*30);
const Plate: React.FC = () => { const f=useCurrentFrame(); const {fps}=useVideoConfig(); const s=spring({frame:f-6,fps,config:{damping:16}});
  const o=interpolate(f,[0,8,130,145],[0,1,1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  return <div style={{position:"absolute",left:60,top:150,opacity:o,transform:`translateX(${(1-s)*-60}px)`}}>
    <div style={{display:"flex",alignItems:"center",gap:16,fontSize:22,letterSpacing:7,color:C.gold,marginBottom:12}}><div style={{width:50,height:2,background:C.goldd}}/>ОТЗЫВ УЧАСТНИКОВ</div>
    <div style={{fontSize:50,fontWeight:800,textTransform:"uppercase",lineHeight:1.04,color:"#fff",textShadow:"0 3px 18px rgba(0,0,0,.7)"}}>Джамал и Джамиля<br/>Бородины</div>
    <div style={{fontSize:28,color:"#EAF2EC",marginTop:10,textShadow:"0 2px 12px rgba(0,0,0,.8)"}}>владельцы ресторана «Hinkal & Chudu»</div></div>; };
export const LudiVideo: React.FC = () => { const f=useCurrentFrame(); const t=f/30;
  const c=CAP.find(([a,b])=>t>=a&&t<b);
  return <AbsoluteFill style={{background:"#000",fontFamily:"G"}}><style>{font}</style>
    <OffthreadVideo src={staticFile("ludi/jamal.mp4")} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"50% 6%"}}/>
    <AbsoluteFill style={{background:"linear-gradient(180deg, rgba(2,16,9,.75) 0%, rgba(2,16,9,0) 30%, rgba(2,16,9,0) 62%, rgba(2,16,9,.85) 100%)"}}/>
    <div style={{position:"absolute",top:58,left:0,right:0,display:"flex",justifyContent:"center",alignItems:"center",gap:30}}><div style={{width:150,height:2,background:C.goldd}}/><span style={{fontSize:27,letterSpacing:11,color:C.gold,fontWeight:500}}>ФОРМУЛА РОСТА</span><div style={{width:150,height:2,background:C.goldd}}/></div>
    <Plate/>
    {c && <div key={c[2]} style={{position:"absolute",left:70,right:70,bottom:110,textAlign:"center",opacity:interpolate(t-c[0],[0,.15],[0,1],{extrapolateRight:"clamp"})}}>
      <span style={{fontSize:46,fontWeight:800,lineHeight:1.3,color:"#fff",background:"rgba(2,30,17,.78)",padding:"6px 18px",borderRadius:14,boxDecorationBreak:"clone",WebkitBoxDecorationBreak:"clone",boxShadow:`inset 0 -3px 0 ${C.goldd}`}}>{c[2]}</span></div>}
  </AbsoluteFill>; };
