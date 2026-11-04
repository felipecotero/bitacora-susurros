import {createMapEcho} from './map-echo.js';

const SVG_NS='http://www.w3.org/2000/svg';
const WIDTH=720,HEIGHT=760;
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const svgElement=(tag,attributes={})=>{const node=document.createElementNS(SVG_NS,tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,String(value));return node;};
const mercator=([longitude,latitude])=>[longitude*Math.PI/180,-Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360))];

function makeProjection(geometry){
  if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))throw Error('El contorno de Colombia no es válido.');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  const rings=polygons.flat();
  const points=rings.flat().map(point=>{
    if(!Array.isArray(point)||!point.slice(0,2).every(Number.isFinite))throw Error('El contorno contiene una coordenada no válida.');
    return mercator(point);
  });
  if(points.length<3)throw Error('Faltan puntos en el contorno de Colombia.');
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min((WIDTH-200)/(maxX-minX),(HEIGHT-150)/(maxY-minY));
  const left=(WIDTH-(maxX-minX)*scale)/2,top=(HEIGHT-(maxY-minY)*scale)/2+16;
  const project=point=>{const [x,y]=mercator(point);return[left+(x-minX)*scale,top+(y-minY)*scale];};
  return{project,path:rings.map(ring=>ring.map((point,index)=>{const[x,y]=project(point);return`${index?'L':'M'}${x.toFixed(3)},${y.toFixed(3)}`;}).join(' ')+' Z').join(' ')};
}

function validatePlaces(source){
  if(source?.version!==1||!Array.isArray(source.locations)||source.locations.length>100)throw Error('Los lugares del ensayo no tienen el formato esperado.');
  const ids=new Set();
  return source.locations.map(location=>{
    if(!/^[a-z][a-z0-9-]*$/.test(location.id)||ids.has(location.id)||typeof location.name!=='string'||location.name.length>100||!Number.isFinite(location.longitude)||!Number.isFinite(location.latitude)||Math.abs(location.longitude)>180||Math.abs(location.latitude)>80||!Array.isArray(location.creatorIds)||location.creatorIds.some(id=>typeof id!=='string'))throw Error('Hay un lugar que necesita revisión.');
    ids.add(location.id);
    const offsets=location.labelOffset;
    return{...location,labelOffset:Array.isArray(offsets)&&offsets.length===2&&offsets.every(Number.isFinite)?offsets:[50,0]};
  });
}

/** Create the floating territory view. All geographic assets are bundled locally. */
export async function createTerritory({getData,onCreator,onOpen=()=>{},onClose=()=>{}}){
  const responses=await Promise.all([fetch(new URL('./places.json',import.meta.url)),fetch(new URL('./media/colombia-outline.json',import.meta.url))]);
  if(responses.some(response=>!response.ok))throw Error('No pudimos abrir los lugares del ensayo.');
  const [source,outline]=await Promise.all(responses.map(response=>response.json()));
  const places=validatePlaces(source),{project,path}=makeProjection(outline.geometry);
  let opened=false,previousFocus=null,cityTrigger=null;
  const section=element('section','territory-view');
  section.id='territory-view';section.hidden=true;section.tabIndex=-1;
  section.setAttribute('aria-labelledby','territory-heading');
  const heading=element('header','territory-heading');
  heading.append(element('p','territory-eyebrow','APUNTES EN UN TERRITORIO'),element('h2','','Lugares'),element('p','territory-intro','Los oficios se encuentran\nen un territorio.'));
  heading.querySelector('h2').id='territory-heading';
  const frame=element('div','territory-frame');
  const floating=element('div','territory-float');frame.append(floating);
  const map=svgElement('svg',{viewBox:`0 0 ${WIDTH} ${HEIGHT}`,'aria-hidden':'true',focusable:'false',class:'territory-map'});
  map.append(svgElement('path',{d:path,class:'territory-touch-area','fill-rule':'evenodd'}),svgElement('path',{d:path,class:'territory-outline-depth'}),svgElement('path',{d:path,class:'territory-outline'}));
  const guides=svgElement('g',{class:'territory-guides'});map.append(guides);floating.append(map);
  const cityButtons=[];
  const back=element('button','territory-back');back.type='button';back.setAttribute('aria-label','Volver a la nube desde Lugares');back.append(element('span','','↶'),element('span','','Volver a la nube'));
  const note=element('p','territory-demo','Ubicaciones ficticias · vínculos de ensayo');
  section.append(heading,frame,back,note);document.body.append(section);

  const cityDialog=element('dialog','territory-city-plate');
  cityDialog.setAttribute('aria-labelledby','territory-city-title');
  cityDialog.setAttribute('aria-describedby','territory-city-note');
  const citySurface=element('div','territory-city-inner');
  const cityTop=element('div','territory-city-top');
  cityTop.append(element('p','territory-eyebrow','VOCES EN UN LUGAR'));
  const closeCity=element('button','territory-close','×');closeCity.type='button';closeCity.setAttribute('aria-label','Cerrar la ciudad');cityTop.append(closeCity);
  const cityTitle=element('h2');cityTitle.id='territory-city-title';
  const cityCount=element('p','territory-city-count');
  const peopleList=element('div','territory-people');
  const cityNote=element('p','territory-city-note','Estos vínculos son ficticios y sirven para ensayar el mapa. Una persona puede estar relacionada con más de un lugar.');cityNote.id='territory-city-note';
  citySurface.append(cityTop,cityTitle,cityCount,peopleList,cityNote);cityDialog.append(citySurface);document.body.append(cityDialog);

  const peopleFor=place=>{const allowed=new Set(place.creatorIds);return getData().creators.filter(person=>allowed.has(person.id));};
  function refreshCounts(){for(const {place,button,count}of cityButtons){const n=peopleFor(place).length;count.textContent=`${n} ${n===1?'persona':'personas'}`;button.setAttribute('aria-label',`${place.name}, ${n} ${n===1?'persona':'personas'}`);}}
  function showCity(place,trigger){
    cityTrigger=trigger;cityTitle.textContent=place.name;peopleList.replaceChildren();
    const people=peopleFor(place);cityCount.textContent=`${people.length} ${people.length===1?'persona en este lugar':'personas en este lugar'}`;
    if(!people.length)peopleList.append(element('p','territory-empty','Este lugar está abierto a nuevos vínculos.'));
    people.forEach(person=>{
      const button=element('button','territory-person');button.type='button';
      const text=element('span');text.append(element('span','territory-person-name',person.name),element('span','territory-person-role',person.role));
      button.append(text,element('span','territory-person-arrow','↗'));
      button.addEventListener('click',()=>{cityDialog.close();close(false);onCreator(person.id);});peopleList.append(button);
    });
    cityDialog.showModal();citySurface.scrollTop=0;
  }
  for(const place of places){
    const[x,y]=project([place.longitude,place.latitude]),[dx,dy]=place.labelOffset;
    const line=svgElement('path',{d:`M${x},${y} L${x+dx*.62},${y+dy*.62} L${x+dx},${y+dy}`,class:'territory-guide'});guides.append(line);
    const button=element('button','territory-city');button.type='button';button.dataset.city=place.id;button.setAttribute('aria-haspopup','dialog');button.style.left=`${x/WIDTH*100}%`;button.style.top=`${y/HEIGHT*100}%`;
    const point=element('span','territory-point');point.setAttribute('aria-hidden','true');
    const label=element('span',`territory-city-label ${dx<0?'territory-label-left':''}`),name=element('span','territory-city-name',place.name),count=element('span','territory-city-number');label.append(name,count);button.append(point,label);
    button.addEventListener('pointerenter',()=>line.classList.add('territory-guide-active'));button.addEventListener('pointerleave',()=>line.classList.remove('territory-guide-active'));button.addEventListener('focus',()=>line.classList.add('territory-guide-active'));button.addEventListener('blur',()=>line.classList.remove('territory-guide-active'));
    button.addEventListener('click',()=>showCity(place,button));floating.append(button);cityButtons.push({place,button,count,label});
  }
  const echo=createMapEcho(),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let echoFrame=0,echoTime=0,lastPointer=null;
  function paintEcho({x,y,active}){
    floating.style.transform=`translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0)`;
    floating.dataset.echoActive=String(active);
  }
  function resetEcho(){cancelAnimationFrame(echoFrame);echoFrame=0;echoTime=0;lastPointer=null;echo.reset();paintEcho({x:0,y:0,active:false});}
  function animateEcho(time){
    echoFrame=0;
    if(!opened||reducedMotion.matches||document.hidden){resetEcho();return;}
    const state=echo.step(echoTime?(time-echoTime)/1000:1/60);echoTime=time;paintEcho(state);
    if(state.active)echoFrame=requestAnimationFrame(animateEcho);else echoTime=0;
  }
  // Screen coordinates avoid feeding the map's own motion back into the gesture.
  frame.addEventListener('pointerenter',event=>{lastPointer={x:event.clientX,y:event.clientY,time:event.timeStamp};});
  frame.addEventListener('pointermove',event=>{
    if(!opened||reducedMotion.matches||cityDialog.open||document.hidden){lastPointer=null;return;}
    const previous=lastPointer;lastPointer={x:event.clientX,y:event.clientY,time:event.timeStamp};
    if(!previous)return;
    const dx=event.clientX-previous.x,dy=event.clientY-previous.y,elapsed=(event.timeStamp-previous.time)/1000;
    if(Math.hypot(dx,dy)<.1)return;
    echo.impulse(dx,dy,elapsed);
    if(!echoFrame)echoFrame=requestAnimationFrame(animateEcho);
  },{passive:true});
  frame.addEventListener('pointerleave',()=>{lastPointer=null;});
  frame.addEventListener('pointercancel',()=>{lastPointer=null;});
  reducedMotion.addEventListener('change',resetEcho);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)resetEcho();});
  function resizeLabels(){const width=frame.getBoundingClientRect().width,scale=width/WIDTH;echo.setLimit(Math.min(9,Math.max(3,width*.018)));for(const {place,label}of cityButtons){label.style.setProperty('--label-x',`${place.labelOffset[0]*scale}px`);label.style.setProperty('--label-y',`${place.labelOffset[1]*scale}px`);}}
  const observer=new ResizeObserver(resizeLabels);observer.observe(frame);
  function open(){
    if(opened)return;
    previousFocus=document.activeElement;opened=true;resetEcho();section.hidden=false;document.body.classList.add('territory-open');refreshCounts();resizeLabels();onOpen();back.focus({preventScroll:true});
  }
  function close(restoreFocus=true){
    if(!opened)return;
    if(cityDialog.open)cityDialog.close();opened=false;resetEcho();section.hidden=true;document.body.classList.remove('territory-open');onClose();
    if(restoreFocus&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  }
  closeCity.addEventListener('click',()=>cityDialog.close());
  cityDialog.addEventListener('close',()=>{if(opened&&cityTrigger?.isConnected)cityTrigger.focus({preventScroll:true});});
  cityDialog.addEventListener('click',event=>{if(event.target===cityDialog){const rect=cityDialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)cityDialog.close();}});
  back.addEventListener('click',()=>close());
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!opened)return;
    if(cityDialog.open){event.stopPropagation();return;}
    if(document.querySelector('dialog[open]'))return;
    event.preventDefault();event.stopPropagation();close();
  },true);
  return{open,close,isOpen:()=>opened};
}
