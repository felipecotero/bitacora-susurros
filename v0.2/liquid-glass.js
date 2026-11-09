const SVG_NS='http://www.w3.org/2000/svg';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const svgNode=(tag,attributes={})=>{const node=document.createElementNS(SVG_NS,tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,String(value));return node;};

/**
 * A displacement texture describes the slope of a convex pane, not random noise.
 * The rounded rim bends the view strongly; the broad centre is almost planar.
 * It is regenerated only when a visible surface changes size.
 */
function makeLensMap(width,height,radius){
  const resolution=Math.min(1,760/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(2,Math.round(width*resolution));
  canvas.height=Math.max(2,Math.round(height*resolution));
  const context=canvas.getContext('2d');
  const pixels=context.createImageData(canvas.width,canvas.height);
  const halfWidth=width/2,halfHeight=height/2;
  const curve=Math.min(radius,halfWidth,halfHeight);
  const band=clamp(Math.min(width,height)*.115,25,57);
  for(let row=0;row<canvas.height;row++)for(let column=0;column<canvas.width;column++){
    const x=(column+.5)/canvas.width*width-halfWidth;
    const y=(row+.5)/canvas.height*height-halfHeight;
    const qx=Math.abs(x)-(halfWidth-curve),qy=Math.abs(y)-(halfHeight-curve);
    const cornerX=Math.max(qx,0),cornerY=Math.max(qy,0),cornerLength=Math.hypot(cornerX,cornerY);
    const distance=-(cornerLength+Math.min(Math.max(qx,qy),0)-curve);
    let normalX=0,normalY=0;
    if(cornerLength){normalX=Math.sign(x)*cornerX/cornerLength;normalY=Math.sign(y)*cornerY/cornerLength;}
    else if(qx>qy)normalX=Math.sign(x);else normalY=Math.sign(y);
    const t=clamp(distance/band,0,1);
    const rim=Math.pow(1-t,2)*(.76+.24*Math.sin(t*Math.PI));
    const interior=1-rim;
    const waveX=(Math.sin(y/height*7.4+x/width*2.1)+Math.sin(x/width*9.2)*.35)*.027*interior;
    const waveY=(Math.sin(x/width*6.8-y/height*1.8)+Math.cos(y/height*8.4)*.3)*.027*interior;
    const offset=(row*canvas.width+column)*4;
    pixels.data[offset]=Math.round(128+127*clamp(-normalX*rim+waveX,-1,1));
    pixels.data[offset+1]=Math.round(128+127*clamp(-normalY*rim+waveY,-1,1));
    const focus=clamp((t-.12)/.78,0,1);
    // Blue stores the focus mask; red/green retain the optical surface normal.
    pixels.data[offset+2]=Math.round(255*focus*focus*(3-2*focus));
    pixels.data[offset+3]=255;
  }
  context.putImageData(pixels,0,0);
  return canvas.toDataURL('image/png');
}

/** A live scene copy is the optical input where SVG backdrop filters are unavailable. */
function createSceneProxy(surface){
  const pane=document.createElement('div');pane.className='liquid-scene-proxy';
  pane.setAttribute('aria-hidden','true');pane.inert=true;
  const viewport=document.createElement('div');viewport.className='liquid-scene-viewport';pane.append(viewport);
  const pairs=[],canvases=[],sourceWidth=innerWidth,sourceHeight=innerHeight;
  const sceneSelectors='#stage, .title-block, .masthead, .footer, .appearance-controls, .vignette, #context, .territory-view';
  const roots=[...document.body.children].filter(node=>node.matches(sceneSelectors));
  const copy=(original,clone)=>{
    clone.removeAttribute('id');clone.removeAttribute('autofocus');clone.removeAttribute('aria-controls');
    clone.removeAttribute('aria-labelledby');clone.removeAttribute('aria-describedby');
    const computed=getComputedStyle(original);
    for(const property of computed){if(!property.startsWith('--'))clone.style.setProperty(property,computed.getPropertyValue(property));}
    if(computed.position==='fixed')clone.style.position='absolute';
    clone.style.pointerEvents='none';clone.style.animation='none';clone.style.transition='none';
    if(clone.matches('button,a,input,textarea,select,[tabindex]'))clone.setAttribute('tabindex','-1');
    pairs.push({original,clone});
    if(original instanceof HTMLCanvasElement)canvases.push({original,clone});
    for(let index=0;index<original.children.length;index++)copy(original.children[index],clone.children[index]);
  };
  for(const original of roots){const clone=original.cloneNode(true);copy(original,clone);viewport.append(clone);}
  surface.prepend(pane);surface.dataset.liquidRenderer='scene-proxy';
  const update=()=>{
    const bounds=surface.getBoundingClientRect();
    viewport.style.width=`${innerWidth}px`;viewport.style.height=`${innerHeight}px`;
    viewport.style.transform=`translate(${-bounds.left}px,${-bounds.top}px)`;
    for(const {original,clone}of pairs){
      for(const property of original.style){
        if(property==='animation'||property==='transition'||property==='pointer-events'||property==='position')continue;
        clone.style.setProperty(property,original.style.getPropertyValue(property));
      }
    }
    for(const {original,clone}of canvases){
      if(clone.width!==original.width)clone.width=original.width;
      if(clone.height!==original.height)clone.height=original.height;
      const context=clone.getContext('2d');context.clearRect(0,0,clone.width,clone.height);context.drawImage(original,0,0);
    }
  };
  update();
  return{update,matchesViewport:()=>sourceWidth===innerWidth&&sourceHeight===innerHeight,destroy(){pane.remove();surface.removeAttribute('data-liquid-renderer');}};
}

export function installLiquidGlass({forceSceneProxy=false}={}){
  if(document.querySelector('[data-liquid-glass-definitions]'))return;
  const svg=svgNode('svg',{'aria-hidden':'true',focusable:'false',width:0,height:0,'data-liquid-glass-definitions':''});
  svg.classList.add('optical-definitions');
  const definitions=svgNode('defs');svg.append(definitions);document.body.append(svg);
  const records=new Map();let nextId=0,scheduled=0,proxyFrame=0,proxyTime=0;
  const userAgent=navigator.userAgent;
  const useSceneProxy=forceSceneProxy||(/AppleWebKit/.test(userAgent)&&!/(?:Chrome|Chromium|Edg|OPR)\//.test(userAgent))||/Firefox\//.test(userAgent);
  function animateProxies(time){
    proxyFrame=0;let visible=false;
    for(const [node,record]of records){
      if(!record.proxy)continue;
      if(!node.isConnected||!node.open){record.proxy.destroy();record.proxy=null;continue;}
      visible=true;if(time-proxyTime>=32)record.proxy.update();
    }
    if(time-proxyTime>=32)proxyTime=time;
    if(visible)proxyFrame=requestAnimationFrame(animateProxies);
  }
  const selectors='#drawer, .territory-city-plate, .resin-image .detail-image';
  const schedule=()=>{if(!scheduled)scheduled=requestAnimationFrame(refresh);};
  const resizeObserver=new ResizeObserver(schedule);

  function register(node){
    if(records.has(node))return;
    const id=`liquid-lens-${++nextId}`;
    const filter=svgNode('filter',{id,x:'0%',y:'0%',width:'100%',height:'100%',filterUnits:'objectBoundingBox',primitiveUnits:'userSpaceOnUse','color-interpolation-filters':'sRGB'});
    const image=svgNode('feImage',{x:0,y:0,width:'100%',height:'100%',preserveAspectRatio:'none',result:'lens-slope'});
    const displacement=svgNode('feDisplacementMap',{in:'SourceGraphic',in2:'lens-slope',scale:58,xChannelSelector:'R',yChannelSelector:'G',result:'refracted-view'});
    const mask=svgNode('feColorMatrix',{in:'lens-slope',type:'matrix',values:'0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0',result:'centre-focus-mask'});
    const rimFocus=svgNode('feGaussianBlur',{in:'refracted-view',stdDeviation:'.45',edgeMode:'duplicate',result:'clear-refracted-view'});
    const focus=svgNode('feGaussianBlur',{in:'refracted-view',stdDeviation:'2.8',edgeMode:'duplicate',result:'soft-refracted-view'});
    const centre=svgNode('feComposite',{in:'soft-refracted-view',in2:'centre-focus-mask',operator:'in',result:'soft-centre'});
    const rim=svgNode('feComposite',{in:'clear-refracted-view',in2:'centre-focus-mask',operator:'out',result:'clear-rim'});
    const combine=svgNode('feComposite',{in:'soft-centre',in2:'clear-rim',operator:'arithmetic',k1:0,k2:1,k3:1,k4:0});
    filter.append(image,displacement,mask,rimFocus,focus,centre,rim,combine);definitions.append(filter);
    node.style.setProperty('--liquid-refraction',`url("#${id}")`);
    node.dataset.liquidGlass='';
    records.set(node,{filter,image,displacement,focus,rimFocus,proxy:null,width:0,height:0});
    resizeObserver.observe(node);
    if(node instanceof HTMLImageElement)node.addEventListener('load',schedule);
  }
  function refresh(){
    scheduled=0;
    document.querySelectorAll(selectors).forEach(register);
    for(const [node,record]of records){
      if(!node.isConnected){record.proxy?.destroy();resizeObserver.unobserve(node);record.filter.remove();records.delete(node);continue;}
      const dialog=node.closest('dialog');
      if(dialog&&!dialog.open||node.id==='drawer'&&!node.classList.contains('word-plate')){record.proxy?.destroy();record.proxy=null;continue;}
      if(record.proxy&&!record.proxy.matchesViewport()){record.proxy.destroy();record.proxy=null;}
      if(useSceneProxy&&node instanceof HTMLDialogElement&&!record.proxy){
        record.proxy=createSceneProxy(node);
        if(!proxyFrame)proxyFrame=requestAnimationFrame(animateProxies);
      }
      const width=node.clientWidth,height=node.clientHeight;
      if(width<2||height<2||Math.abs(width-record.width)<1&&Math.abs(height-record.height)<1)continue;
      const imageSurface=node instanceof HTMLImageElement;
      const radius=imageSurface?14:Math.min(29,Math.min(width,height)*.12);
      record.width=width;record.height=height;
      record.image.setAttribute('width',width);record.image.setAttribute('height',height);
      record.image.setAttribute('href',makeLensMap(width,height,radius));
      const displacement=imageSurface?36:clamp(Math.min(width,height)*.15,40,66);
      record.displacement.setAttribute('scale',displacement);
      record.focus.setAttribute('stdDeviation',imageSurface?'.24':'2.8');
      record.rimFocus.setAttribute('stdDeviation',imageSurface?'.24':'.45');
      node.dataset.glassFocus=imageSurface?'.24':'.45–2.8';
      node.dataset.glassRim=clamp(Math.min(width,height)*.115,25,57).toFixed(1);
      node.dataset.glassDisplacement=(displacement/2).toFixed(1);
      node.dataset.glassMapSize=`${width}x${height}`;
    }
  }
  window.addEventListener('resize',schedule);
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class']});
  schedule();
  return()=>{window.removeEventListener('resize',schedule);observer.disconnect();resizeObserver.disconnect();cancelAnimationFrame(scheduled);cancelAnimationFrame(proxyFrame);for(const [node,record]of records){record.proxy?.destroy();node.removeAttribute('data-liquid-glass');node.style.removeProperty('--liquid-refraction');}svg.remove();};
}
