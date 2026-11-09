/** A small, upright translation that answers a passing gesture, then settles. */
export function createMapEcho({limit=9}={}){
  const frequency=7,damping=2.4;
  const oscillation=Math.sqrt(frequency*frequency-damping*damping);
  const validLimit=value=>Number.isFinite(value)&&value>=0;
  let radius=validLimit(limit)?Math.min(limit,64):9;
  let x=0,y=0,vx=0,vy=0,active=false;
  const state=()=>({x,y,active});

  function reset(){x=0;y=0;vx=0;vy=0;active=false;return state();}

  // Bound the total spring energy, rather than clipping each animation frame.
  // This keeps diagonal gestures inside the same radius and avoids hard edges.
  function contain(){
    if(!radius){reset();return;}
    const distance=Math.hypot(x,y);
    if(distance>radius){const scale=radius/distance;x*=scale;y*=scale;}
    const allowance=frequency*Math.sqrt(Math.max(0,radius*radius-x*x-y*y));
    const speed=Math.hypot(vx,vy);
    if(speed>allowance){const scale=allowance/speed;vx*=scale;vy*=scale;}
  }

  function impulse(dx,dy,dtSeconds){
    if(!radius||!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(dtSeconds)||dtSeconds<=0)return state();
    const distance=Math.hypot(dx,dy);
    if(!distance||!Number.isFinite(distance))return state();
    // An old or very fast pointer event cannot produce a violent kick.
    const travel=Math.min(distance,1800*Math.min(dtSeconds,.05));
    const kick=travel*1.3;
    vx+=dx/distance*kick;vy+=dy/distance*kick;
    contain();active=true;
    return state();
  }

  function step(dtSeconds){
    if(!active||!Number.isFinite(dtSeconds)||dtSeconds<=0)return state();
    if(dtSeconds>=5)return reset();
    const decay=Math.exp(-damping*dtSeconds);
    const cosine=Math.cos(oscillation*dtSeconds),sine=Math.sin(oscillation*dtSeconds);
    const advance=(position,velocity)=>{
      const coefficient=(velocity+damping*position)/oscillation;
      const next=decay*(position*cosine+coefficient*sine);
      const speed=decay*(velocity*cosine-(damping*coefficient+oscillation*position)*sine);
      return[next,speed];
    };
    [x,vx]=advance(x,vx);[y,vy]=advance(y,vy);
    if(Math.hypot(x,y)<.015&&Math.hypot(vx,vy)<.08)return reset();
    return state();
  }

  function setLimit(value){
    if(!validLimit(value))return state();
    radius=Math.min(value,64);contain();
    if(Math.hypot(x,y)<.015&&Math.hypot(vx,vy)<.08)return reset();
    return state();
  }

  return{impulse,step,reset,setLimit};
}
