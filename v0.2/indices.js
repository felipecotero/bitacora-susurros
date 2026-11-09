const SVG_NS='http://www.w3.org/2000/svg';
let nextIndex=0;
const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const svg=(tag,attributes={})=>{const node=document.createElementNS(SVG_NS,tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,String(value));return node;};
const positions={
  person:{wide:[[.20,.14],[.75,.22],[.43,.47],[.87,.55],[.21,.81],[.67,.86]],narrow:[[.23,.08],[.76,.24],[.25,.43],[.78,.58],[.24,.79],[.74,.94]],compact:[[.23,.14],[.77,.14],[.23,.50],[.77,.50],[.23,.86],[.77,.86]],flat:[[.14,.18],[.50,.22],[.86,.14],[.14,.79],[.50,.83],[.86,.77]]},
  knot:{wide:[[.20,.19],[.75,.16],[.48,.48],[.17,.81],[.81,.82]],narrow:[[.23,.11],[.77,.28],[.28,.49],[.77,.70],[.27,.89]],compact:[[.23,.14],[.77,.14],[.50,.50],[.23,.86],[.77,.86]],flat:[[.14,.25],[.51,.12],[.86,.31],[.30,.82],[.73,.82]]}
};
const connections={person:[[0,1],[0,2],[1,2],[1,3],[2,3],[2,4],[3,5],[4,5]],knot:[[0,1],[0,2],[1,2],[2,3],[2,4],[3,4]]};
const knotHints={
  talleres:'Materiales y saberes',
  trasescena:'Detrás de cámaras de la investigación',
  'con-texto':'Crónicas y reflexiones',
  maridajes:'Cruces entre oficios',
  'un-hacer-paralelo':'Pasiones fuera del oficio'
};
const nameDepths=[.16,-.28,.36,-.1,-.34,.24];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function projectName(point,depth,yaw,pitch){
  const x=(point[0]-.5)*2;
  const y=(point[1]-.5)*2;
  const horizontal=x*Math.cos(yaw)+depth*Math.sin(yaw);
  const afterYaw=depth*Math.cos(yaw)-x*Math.sin(yaw);
  const vertical=y*Math.cos(pitch)-afterYaw*Math.sin(pitch);
  const towardCamera=afterYaw*Math.cos(pitch)+y*Math.sin(pitch);
  const distance=clamp(.5+towardCamera*.63,0,1);
  return {
    x:clamp(.5+horizontal*.5,.1,.9),
    y:clamp(.5+vertical*.5,.06,.94),
    distance
  };
}

/** Names and knots occupy a foreground plane, with no surrounding panel. */
export function createIndices({getData,onSelect,onOpen=()=>{},onClose=()=>{}}){
  const uid=`indices-${++nextIndex}`;
  let opened=false,type=null,previousFocus=null,items=[],buttons=[],paths=[],drawFrame=0;
  let yaw=0,pitch=0,drag=null,dragConsumed=false;
  let pointerIndex=null,focusIndex=null;
  const section=make('section','indices-view');section.hidden=true;section.tabIndex=-1;
  section.id='indices-view';section.setAttribute('aria-labelledby',`${uid}-title`);
  const heading=make('header','indices-heading');
  const eyebrow=make('p','indices-eyebrow');
  const title=make('h2');title.id=`${uid}-title`;
  const intro=make('p','indices-intro');heading.append(eyebrow,title,intro);
  const graph=make('div','indices-graph');graph.setAttribute('role','group');
  const lines=svg('svg',{class:'indices-connections','aria-hidden':'true',focusable:'false'});
  const definitions=svg('defs'),mask=svg('mask',{id:`${uid}-clear-ink`,maskUnits:'userSpaceOnUse',x:0,y:0}),white=svg('rect',{fill:'white'}),cutouts=svg('g',{fill:'black'});
  mask.append(white,cutouts);definitions.append(mask);lines.append(definitions);
  const lineGroup=svg('g',{mask:`url(#${uid}-clear-ink)`});lines.append(lineGroup);graph.append(lines);
  const back=make('button','indices-back');back.type='button';back.setAttribute('aria-label','Volver a la nube desde el índice');back.append(make('span','','↶'),make('span','','Volver a la nube'));
  const note=make('p','indices-note');section.append(heading,graph,back,note);document.body.append(section);

  function highlight(){
    const index=pointerIndex??focusIndex;
    graph.classList.toggle('has-active-index',index!==null);
    paths.forEach(({path,a,b})=>path.classList.toggle('is-active',index===a||index===b));
    buttons.forEach(({button},i)=>button.classList.toggle('is-focused',index===i));
    if(type==='person')scheduleLayout();
  }
  function layout(){
    drawFrame=0;if(!opened)return;
    const rect=graph.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const flat=innerHeight<=520&&innerWidth>innerHeight;
    const compact=!flat&&innerWidth<=650&&innerHeight<=640&&innerHeight>=innerWidth;
    const arrangement=positions[type][flat?'flat':compact?'compact':innerWidth<=650?'narrow':'wide'];
    buttons.forEach(({button},index)=>{
      const point=arrangement[index%arrangement.length];
      if(type==='person'){
        const turn=(flat||compact) ? .7 : 1;
        const name=projectName(point,nameDepths[index%nameDepths.length],yaw*turn,pitch*turn);
        button.style.left=`${name.x*100}%`;
        button.style.top=`${name.y*100}%`;
        button.style.setProperty('--name-depth',name.distance.toFixed(3));
        button.style.setProperty('--name-scale',(.94+name.distance*.12).toFixed(3));
        button.style.setProperty('--name-opacity',(.62+name.distance*.36).toFixed(3));
        button.style.setProperty('--name-layer',String(Math.round(name.distance*100)+1));
      }else{
        button.style.left=`${point[0]*100}%`;
        button.style.top=`${point[1]*100}%`;
      }
    });
    lines.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
    white.setAttribute('width',rect.width);white.setAttribute('height',rect.height);mask.setAttribute('width',rect.width);mask.setAttribute('height',rect.height);
    const points=buttons.map(({point})=>{const r=point.getBoundingClientRect();return{x:r.left+r.width/2-rect.left,y:r.top+r.height/2-rect.top};});
    cutouts.replaceChildren();
    buttons.forEach(({text})=>{
      const r=text.getBoundingClientRect();
      cutouts.append(svg('rect',{x:r.left-rect.left-9,y:r.top-rect.top-5,width:r.width+18,height:r.height+10,rx:5}));
    });
    paths.forEach(({path,a,b})=>{
      const from=points[a],to=points[b];
      if(!from||!to)return;
      const bend=(a+b)%2?8:-8;
      path.setAttribute('d',`M${from.x},${from.y} Q${(from.x+to.x)/2+bend},${(from.y+to.y)/2-bend} ${to.x},${to.y}`);
    });
  }
  const scheduleLayout=()=>{if(!drawFrame&&opened)drawFrame=requestAnimationFrame(layout);};
  const observer=new ResizeObserver(scheduleLayout);observer.observe(graph);
  window.addEventListener('resize',scheduleLayout);
  document.fonts?.ready.then(scheduleLayout);

  function rotateNames(horizontal,vertical){
    yaw=clamp(yaw+horizontal,-.64,.64);
    pitch=clamp(pitch+vertical,-.31,.31);
    scheduleLayout();
  }

  section.addEventListener('pointerdown',event=>{
    if(type!=='person'||!event.isPrimary||event.button!==0||event.target.closest('.indices-back'))return;
    dragConsumed=false;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};
  });
  section.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    if(!dragConsumed){
      if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<6)return;
      dragConsumed=true;
      section.setPointerCapture(event.pointerId);
      section.classList.add('is-turning');
      pointerIndex=null;
      highlight();
    }
    rotateNames((event.clientX-drag.x)*.009,(event.clientY-drag.y)*.007);
    drag.x=event.clientX;
    drag.y=event.clientY;
  });
  function finishDrag(event){
    if(drag?.id!==event.pointerId)return;
    drag=null;
    section.classList.remove('is-turning');
  }
  section.addEventListener('pointerup',finishDrag);
  section.addEventListener('pointercancel',finishDrag);
  section.addEventListener('lostpointercapture',finishDrag);
  section.addEventListener('click',event=>{
    if(dragConsumed&&event.detail>0){
      dragConsumed=false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if(type==='person'&&(event.target===section||event.target===graph))close();
  },true);
  graph.addEventListener('keydown',event=>{
    if(type!=='person')return;
    const steps={ArrowLeft:[-.18,0],ArrowRight:[.18,0],ArrowUp:[0,-.14],ArrowDown:[0,.14]};
    const step=steps[event.key];
    if(!step)return;
    event.preventDefault();
    rotateNames(...step);
  });

  function render(){
    const data=getData();items=type==='person'?data.creators:data.knots;
    for(const {button,text}of buttons){observer.unobserve(text);button.remove();}
    buttons=[];paths=[];lineGroup.replaceChildren();
    eyebrow.textContent=type==='person'?'QUIENES SOSTIENEN LA ESCENA':'HILOS DE LA BITÁCORA';
    title.textContent=type==='person'?'Personas':'Nudos';
    intro.textContent=type==='person'?'Gira los nombres y toca uno\npara acercarte.':'Cinco entradas,\nun mismo tejido.';
    graph.setAttribute('aria-label',type==='person'?'Personas de la bitácora':'Constelación de nudos de la bitácora');
    graph.tabIndex=type==='person'?0:-1;
    if(type==='person')graph.setAttribute('aria-description','Arrastra o usa las flechas para girar los nombres.');
    else graph.removeAttribute('aria-description');
    note.textContent=type==='person'?'Personajes y vínculos de ensayo':'Distribución provisional · cinco nudos';
    section.dataset.indexType=type;
    items.forEach((source,index)=>{
      const count=data.words.filter(word=>type==='person'?word.creatorIds.includes(source.id):word.knotId===source.id).length;
      const button=make('button','indices-node');button.type='button';button.dataset.indexId=source.id;
      button.setAttribute('aria-label',`${source.name}, ${count} ${count===1?'palabra':'palabras'}`);
      button.setAttribute('aria-description',type==='person'?source.role:source.description);
      const point=make('span','indices-point');point.setAttribute('aria-hidden','true');
      const text=make('span','indices-node-text');
      text.append(make('span','indices-node-name',source.name),make('span','indices-node-detail',type==='person'?source.role:(knotHints[source.id]||'')),make('span','indices-node-count',`${count} ${count===1?'palabra':'palabras'}`));
      button.append(point,text);
      button.addEventListener('pointerenter',()=>{pointerIndex=index;highlight();});
      button.addEventListener('pointerleave',()=>{pointerIndex=null;highlight();});
      button.addEventListener('focus',()=>{focusIndex=index;highlight();});
      button.addEventListener('blur',()=>{focusIndex=null;highlight();});
      button.addEventListener('click',()=>{const selectedType=type;close(false);onSelect(selectedType,source);});
      graph.append(button);buttons.push({button,point,text});observer.observe(text);
    });
    for(const [a,b]of connections[type]){
      if(a>=buttons.length||b>=buttons.length)continue;
      const path=svg('path',{class:'indices-edge'});lineGroup.append(path);paths.push({path,a,b});
    }
    highlight();
  }
  function open(requestedType){
    const next=['person','people','persons','personas'].includes(requestedType)?'person':'knot';
    if(opened&&type===next)return;
    if(opened)close(false);
    previousFocus=document.activeElement;type=next;opened=true;
    yaw=0;pitch=0;drag=null;dragConsumed=false;pointerIndex=null;focusIndex=null;
    render();
    section.hidden=false;document.body.classList.add('indices-open');
    document.querySelector(type==='person'?'#people-button':'#knots-button')?.setAttribute('aria-expanded','true');
    onOpen(type);layout();back.focus({preventScroll:true});
  }
  function close(restoreFocus=true){
    if(!opened)return;
    const previousType=type;opened=false;section.hidden=true;document.body.classList.remove('indices-open');
    drag=null;dragConsumed=false;section.classList.remove('is-turning');
    cancelAnimationFrame(drawFrame);drawFrame=0;
    document.querySelector(previousType==='person'?'#people-button':'#knots-button')?.setAttribute('aria-expanded','false');
    onClose(previousType);
    if(restoreFocus&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  }
  back.addEventListener('click',()=>close());
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!opened||document.querySelector('dialog[open]'))return;
    event.preventDefault();event.stopPropagation();close();
  },true);
  return{open,close,isOpen:()=>opened};
}
