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
      rz:Math.max(100,Math.min(170,w*.39)),safeTop,safeBottom};
  }
  if(landscape){
    return{w,h,compact:true,portrait:false,landscape:true,
      cx:w*.61,cy:h*.53,rx:Math.min(420,w*.30),
      ry:Math.max(75,Math.min(130,(h-130)*.42)),rz:Math.min(170,h*.37),
      safeTop:88,safeBottom:h-78,
      titleRect:{left:28,top:91,right:272,bottom:220}};
  }
  return{w,h,compact:false,portrait:false,landscape:false,
    cx:w*.53,cy:h*.52,rx:Math.min(600,w*.34),
    ry:Math.min(315,h*.32),rz:215,safeTop:0,safeBottom:h};
}

/** Camera-space radius of the rotated ellipsoid, including its small breath. */
export function getCloudDepthExtent(layout,pitch=0,yaw=0){
  const cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);
  return Math.max(1,Math.hypot(layout.rx*sy*cp,layout.ry*sp,layout.rz*cy*cp)*1.05);
}

/** Colour carries distance; optical softness remains a smaller secondary cue. */
export function getDepthStyle(z,zoom=1,extent=230){
  const distance=Number.isFinite(z)?z:0;
  const scale=Number.isFinite(zoom)&&zoom>0?zoom:1;
  const radius=Number.isFinite(extent)&&extent>0?extent:230;
  const depth=clamp((distance/(radius*scale)+1)/2);
  const ink=smooth(.08,.93,depth);
  return{depth,opacity:.87+depth*.13,
    tone:`${(ink*100).toFixed(2)}%`,
    blur:(.035+Math.pow(1-depth,2.1)*2.55).toFixed(2)};
}

/**
 * Receive a projected, rotated label box, centred at x/y. No DOM reads belong
 * in this per-frame helper; cache unprojected label dimensions after font/layout.
 */
export function getWordVisibility({x,y,width=0,height=0},layout,{hasContext=false}={}){
  if(!layout.compact)return 1;
  if(![x,y,width,height].every(Number.isFinite))return 0;
  const left=x-width/2,right=x+width/2,top=y-height/2,bottom=y+height/2;
  const safeBottom=layout.safeBottom-(hasContext&&layout.portrait?55:0);
  let visibility=smooth(layout.safeTop,layout.safeTop+24,top)
    *smooth(safeBottom,safeBottom-24,bottom);
  // Landscape leaves the small title to one side rather than adding a tall band.
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
