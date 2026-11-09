const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=(start,end,value)=>{const t=clamp((value-start)/(end-start));return t*t*(3-2*t);};

/** Reserve quiet reading space above a compact portrait cloud. */
export function getCloudLayout(width,height){
  const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);
  const landscape=h<=520&&w/h>=1.25,portrait=w<=650&&!landscape;
  if(portrait){
    const safeTop=h<700?214:240,safeBottom=Math.max(safeTop+100,h-130);
    const usable=safeBottom-safeTop;
    return{w,h,compact:true,portrait:true,landscape:false,
      cx:w*.5,cy:(safeTop+safeBottom)/2,
      rx:Math.max(120,w*.46),ry:Math.max(78,Math.min(235,usable*.40)),
      rz:Math.max(125,Math.min(212,w*.49)),safeTop,safeBottom};
  }
  if(landscape){
    return{w,h,compact:true,portrait:false,landscape:true,
      cx:w*.61,cy:h*.53,rx:Math.min(420,w*.30),
      ry:Math.max(75,Math.min(130,(h-130)*.42)),rz:Math.min(212,h*.46),
      safeTop:88,safeBottom:h-78,
      titleRect:{left:28,top:91,right:272,bottom:220}};
  }
  return{w,h,compact:false,portrait:false,landscape:false,
    cx:w*.53,cy:h*.52,rx:Math.min(600,w*.34),
    ry:Math.min(315,h*.32),rz:270,safeTop:0,safeBottom:h};
}

/** Camera-space radius of the rotated ellipsoid, including its small breath. */
export function getCloudDepthExtent(layout,pitch=0,yaw=0){
  const cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);
  return Math.max(1,Math.hypot(layout.rx*sy*cp,layout.ry*sp,layout.rz*cy*cp)*1.05);
}

/** Camera-space distance stays visible even when zooming out. */
export function getDepthStyle(z,zoom=1,extent=283.5){
  const distance=Number.isFinite(z)?z:0;
  const scale=Number.isFinite(zoom)&&zoom>0?zoom:1;
  const radius=Number.isFinite(extent)&&extent>0?extent:283.5;
  const depth=clamp((distance/(radius*scale)+1)/2);
  const ink=smooth(.12,.88,depth);
  const softness=3.35*Math.pow(1-depth,2.45)/Math.sqrt(Math.max(.6,scale));
  return {
    depth,
    opacity:.56+.44*smooth(.03,.91,depth),
    tone:`${(ink*100).toFixed(2)}%`,
    blur:(.035+softness).toFixed(2)
  };
}

/**
 * Receive a projected, rotated label box, centred at x/y. No DOM reads belong
 * in this per-frame helper; cache unprojected label dimensions after font/layout.
 */
export function getWordVisibility({x,y,width=0,height=0},layout,{hasContext=false}={}){
  if(!layout.compact&&!layout.titleRect&&!layout.uiTop)return 1;
  if(![x,y,width,height].every(Number.isFinite))return 0;
  const left=x-width/2,right=x+width/2,top=y-height/2,bottom=y+height/2;
  const safeBottom=layout.safeBottom-(hasContext&&layout.portrait?55:0);
  let visibility=layout.compact
    ? smooth(layout.safeTop,layout.safeTop+24,top)*smooth(safeBottom,safeBottom-24,bottom)
    : layout.uiTop
      ? smooth(layout.uiTop,layout.uiTop+28,top)*smooth(layout.uiBottom,layout.uiBottom-28,bottom)
      : 1;
  // Words recede as they enter the reading area around the title.
  if(layout.titleRect){
    const reserved=layout.titleRect;
    const horizontalOverlap=right>reserved.left&&left<reserved.right;
    const verticalOverlap=bottom>reserved.top&&top<reserved.bottom;
    if(horizontalOverlap&&verticalOverlap){
      const horizontalExit=Math.max(reserved.left-right,left-reserved.right);
      const verticalExit=Math.max(reserved.top-bottom,top-reserved.bottom);
      const exit=Math.max(horizontalExit,verticalExit);
      visibility*=smooth(-20,0,exit);
    }
  }
  return clamp(visibility);
}
