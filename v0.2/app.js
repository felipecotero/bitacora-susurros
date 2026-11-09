import { loadLocalData, createEditor } from './editor.js?v=5';
import { createAppearance, installSurfaceTexture } from './appearance.js?v=02';
import { createCloudArrangement, createWordPlacement, sampleBreath } from './motion.js';
import { createLung } from './lung.js?v=4';
import { createOrbitFollower } from './dynamics.js?v=4';
import { createTerritory } from './territory.js?v=02';
import { createIndices } from './indices.js?v=02';
import { createPersonProfile, getPersonConstellation } from './people.js?v=02';
import { installLiquidGlass } from './liquid-glass.js?v=7';
import { getCloudLayout, getCloudDepthExtent, getDepthStyle, getWordVisibility } from './cloud-view.js?v=7';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if(cls) n.className=cls; if(text!==undefined) n.textContent=text; return n; };
const stage=$('#stage'),cloud=$('#cloud'),canvas=$('#connections'),ctx=canvas.getContext('2d');
const drawer=$('#drawer'),content=$('#drawer-content'),context=$('#context');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let territory=null,indices=null;
const personProfile = createPersonProfile();
let cloudCamera = null;
let connectionRGB='171,151,122';
const zoneDelays=Array.from({length:8},()=>Math.random()*.9);
let data,editor,nodes=[],mode=null,edges=[],hovered=null,paused=reduced.matches;
const lung=createLung();
let lungPose=lung.update(0,false);
let placements=new Map(),breathTime=0;
let ax=0,ay=0,targetZoom=innerWidth<650?.82:1,zoom=targetZoom,velocityX=0,velocityY=0,lastTime=0,modeTime=0,rotationDirty=true;
let viewport=getCloudLayout(innerWidth,innerHeight);
let pointers=new Map(),drag=null,pinchDistance=0,pinchTime=0,didDrag=false,stopSound=null,closeFocus=null;

function hash(s){let n=2166136261;for(const c of s){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;}
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function announce(text){$('#announcement').textContent=text;}

function makeGrain(){const c=document.createElement('canvas');c.width=c.height=180;const g=c.getContext('2d'),im=g.createImageData(180,180),r=random(19);for(let i=0;i<im.data.length;i+=4){const v=Math.floor(r()*255);im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}g.putImageData(im,0,0);document.documentElement.style.setProperty('--grain-image',`url(${c.toDataURL()})`);}

function resize() {
  viewport = getCloudLayout(innerWidth, innerHeight);
  if (mode?.type === 'person' && viewport.portrait) {
    const bottom = viewport.safeBottom - 55;
    viewport.cy = (viewport.safeTop + bottom) / 2;
    viewport.ry = Math.max(56, (bottom - viewport.safeTop) * .72);
  }
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(viewport.w * dpr);
  canvas.height = Math.round(viewport.h * dpr);
  canvas.style.width = viewport.w + 'px';
  canvas.style.height = viewport.h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  $('#space').style.perspectiveOrigin = `${viewport.cx}px ${viewport.cy}px`;
  cloud.style.left = viewport.cx + 'px';
  cloud.style.top = viewport.cy + 'px';
  positionWords();
  measureWords();
}

function rebuild(){
  hovered=null;
  if(!placements.size)placements=createCloudArrangement(data.words.map(word=>word.id));
  cloud.replaceChildren();
  nodes=data.words.map((word,i)=>{
    if(!placements.has(word.id))placements.set(word.id,createWordPlacement(word.id));
    const placement=placements.get(word.id);
    const anchor=el('div','word-anchor'),button=el('button','word');
    button.dataset.wordId=word.id;
    button.dataset.knot=word.knotId || "";
    button.dataset.orientation=String(placement.angle);
    button.setAttribute('aria-label',`${word.label}, ${word.selections.length} ${word.selections.length===1?'selección':'selecciones'}`);
    const zone=(placement.u>=0?1:0)+(placement.v>=0?2:0)+(placement.w>=0?4:0);
    const r=random(hash(`${word.id}:${placement.u}`));
    const breathDelay=Math.max(0,Math.min(1.15,zoneDelays[zone]+(r()-.5)*.22));
    button.dataset.breathZone=String(zone);button.dataset.breathDelay=breathDelay.toFixed(3);
    const span=el('span','',word.label.toLocaleLowerCase('es'));button.append(span);anchor.append(button);
    button.addEventListener('pointerenter',()=>{hovered=word.id;});
    button.addEventListener('pointerleave',()=>{if(hovered===word.id)hovered=null;});
    button.addEventListener('focus',()=>{hovered=word.id;rotationDirty=true;});
    button.addEventListener('blur',()=>{if(hovered===word.id)hovered=null;});
    button.addEventListener('click',e=>{e.stopPropagation();if(!didDrag)openWord(word,button);});
    cloud.append(anchor);
    return{word,button,span,anchor,placement,index:i,baseX:0,baseY:0,baseZ:0,x:0,y:0,z:0,depth:0,drift:sampleBreath(placement.breath,breathTime)*.08,breathDelay,orbitX:ax,orbitY:ay,follower:createOrbitFollower(`${word.id}:${placement.u}`,ax,ay)};
  });
  positionWords();measureWords();
  if(mode){const source=(mode.type==='person'?data.creators:data.knots).find(x=>x.id===mode.id);if(source)activate(mode.type,source);else resetMode();}
  announce(`${data.words.length} palabras en la nube.`);
}

function positionWords(){
  const {rx,ry,rz}=viewport;
  nodes.forEach(n=>{
    const placement = mode?.positions?.get(n.word.id) || n.placement;
    n.baseX = placement.u * rx;
    n.baseY = placement.v * ry;
    n.baseZ = placement.w * rz;
    n.angle = placement.angle;
    n.button.dataset.orientation = String(n.angle);
    n.x=n.baseX*lungPose.x;n.y=n.baseY*lungPose.y;n.z=n.baseZ*lungPose.z+n.drift;
    const step = mode?.type === 'person' && viewport.portrait ? 1.10 : 1.25;
    n.button.style.fontSize = 14 * Math.pow(step, new Set(n.word.selections).size - 1) + 'pt';
  });
  if(mode)buildEdges();rotationDirty=true;
}

function measureWords(){
  for(const n of nodes){n.labelWidth=n.button.offsetWidth;n.labelHeight=n.button.offsetHeight;}
  rotationDirty=true;
}

function rotated(n){
  const pitch=n.orbitX??ax,yaw=n.orbitY??ay;
  const x=n.x*Math.cos(yaw)+n.z*Math.sin(yaw),z=-n.x*Math.sin(yaw)+n.z*Math.cos(yaw);
  return{x:x*zoom,y:(n.y*Math.cos(pitch)-z*Math.sin(pitch))*zoom,z:(n.y*Math.sin(pitch)+z*Math.cos(pitch))*zoom};
}
function projected(n){const p=rotated(n),f=1000/(1000-p.z);return{x:viewport.cx+p.x*f,y:viewport.cy+p.y*f,z:p.z};}
function inMode(word){return!mode||(mode.type==='person'?word.creatorIds.includes(mode.id):word.knotId===mode.id);}

function frame(time){
  const dt=Math.min((time-lastTime)/1000||.016,.045);lastTime=time;
  const blocked=drawer.open||!!document.querySelector('.editor-dialog[open]')||!!territory?.isOpen()||!!indices?.isOpen()||document.hidden;
  // Reading a fragment leaves the living scene in motion behind its glass.
  const breathing=!paused&&!reduced.matches&&!document.hidden;
  lungPose=lung.update(dt,breathing);
  if(breathing){breathTime+=dt*.55;rotationDirty=true;}
  if(!pointers.size&&!blocked){
    if(Math.abs(velocityX)+Math.abs(velocityY)>.0008){
      // Integrate a decaying angular velocity in seconds, independent of frame rate.
      const damping=1.9,decay=Math.exp(-damping*dt),travel=(1-decay)/damping;
      ax+=velocityX*travel;ay+=velocityY*travel;
      velocityX*=decay;velocityY*=decay;rotationDirty=true;
    }else{velocityX=velocityY=0;}
  }
  if(Math.abs(zoom-targetZoom)>.0002){zoom+=(targetZoom-zoom)*.12;rotationDirty=true;}
  nodes.forEach(n=>{
    const follow=n.follower.update(ax,ay,dt,reduced.matches);
    n.orbitX=follow.x;n.orbitY=follow.y;
    if(follow.moving)rotationDirty=true;
  });
  if(rotationDirty){
    cloud.style.transform=`scale3d(${zoom},${zoom},${zoom})`;
    const approach = Math.max(0, Math.min(1, (zoom - (viewport.portrait ? .82 : 1)) / .55));
    cloud.style.setProperty('--approach', approach.toFixed(3));
    cloud.dataset.orbitTargetX=ax.toFixed(5);cloud.dataset.orbitTargetY=ay.toFixed(5);
    cloud.dataset.breathPhase=lungPose.phase;
    cloud.dataset.volumeScale=(lungPose.x*lungPose.y*lungPose.z).toFixed(4);
    cloud.dataset.angularSpeed=Math.hypot(velocityX,velocityY).toFixed(4);
    const depthExtent=getCloudDepthExtent(viewport,ax,ay);
    nodes.forEach(n=>{
      if(breathing&&n.word.id!==hovered)n.drift+=(sampleBreath(n.placement.breath,breathTime)*.08-n.drift)*(1-Math.exp(-dt*4));
      const localBreath=lung.sample(n.breathDelay);
      // Neighbouring regions share a slight delay, with a smaller variation per word.
      n.x=n.baseX*localBreath.x-Math.sin(n.orbitY)*Math.cos(n.orbitX)*n.drift;
      n.y=n.baseY*localBreath.y+Math.sin(n.orbitX)*n.drift;
      n.z=n.baseZ*localBreath.z+Math.cos(n.orbitY)*Math.cos(n.orbitX)*n.drift;
      const p=rotated(n);
      n.anchor.style.transform=`translate3d(${p.x/zoom}px,${p.y/zoom}px,${p.z/zoom}px)`;
      n.button.style.transform=`translate(-50%,-50%) rotateZ(${n.angle}deg)`;
      n.button.dataset.orbitLag=Math.hypot(ax-n.orbitX,ay-n.orbitY).toFixed(5);
      const optical=getDepthStyle(p.z,zoom,depthExtent),perspective=1000/(1000-p.z);
      const sideways=Math.abs(Math.round(n.angle/90)%2)===1;
      const width=(sideways?n.labelHeight:n.labelWidth)*zoom*perspective;
      const height=(sideways?n.labelWidth:n.labelHeight)*zoom*perspective;
      const visibility=getWordVisibility({x:viewport.cx+p.x*perspective,y:viewport.cy+p.y*perspective,width,height},viewport,{hasContext:!!mode});
      n.depth=p.z;n.button.style.opacity=String(optical.opacity*visibility);
      n.button.style.setProperty('--depth-tone',optical.tone);
      n.button.style.visibility=visibility<.015?'hidden':'';
      n.button.dataset.depth=optical.depth.toFixed(3);
      n.button.dataset.readingVisibility=visibility.toFixed(3);
      n.span.style.filter=`blur(${optical.blur}px)`;
    });
    rotationDirty=false;
  }
  ctx.clearRect(0,0,viewport.w,viewport.h);
  if(mode){
    ctx.save();
    if(viewport.compact){
      const bottom=viewport.safeBottom-(viewport.portrait?55:0);
      ctx.beginPath();ctx.rect(0,viewport.safeTop,viewport.w,Math.max(0,bottom-viewport.safeTop));
      if(viewport.titleRect){const r=viewport.titleRect;ctx.rect(r.left,r.top,r.right-r.left,r.bottom-r.top);}
      ctx.clip('evenodd');
    }
    const alpha=Math.min(1,(time-modeTime)/1000);
    ctx.strokeStyle=`rgba(${connectionRGB},${.31*alpha})`;ctx.lineWidth=.65;
    edges.forEach(([a,b])=>{const p=projected(a),q=projected(b);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();});
    ctx.fillStyle=`rgba(${connectionRGB},${.55*alpha})`;
    nodes.filter(n=>inMode(n.word)).forEach(n=>{const p=projected(n);ctx.beginPath();ctx.arc(p.x,p.y,1.5,0,Math.PI*2);ctx.fill();});
    ctx.restore();
  }
  requestAnimationFrame(frame);
}

function buildEdges(){const active=nodes.filter(n=>inMode(n.word));edges=[];if(active.length<2)return;if(mode?.type==="person"){edges=active.slice(1).map((node,index)=>[active[index],node]);return;}const visited=[active[0]],rest=active.slice(1);while(rest.length){let best=null,min=Infinity;for(const a of visited)for(const b of rest){const d=(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;if(d<min){min=d;best=[a,b];}}edges.push(best);visited.push(best[1]);rest.splice(rest.indexOf(best[1]),1);}}

function restoreCloudCamera() {
  if (!cloudCamera) return;
  ({ax, ay, zoom, targetZoom} = cloudCamera);
  cloudCamera = null;
}

function activate(type, source) {
  indices?.close(false);
  territory?.close(false);
  mode = {type, id: source.id};
  modeTime = performance.now();
  document.body.classList.add('has-constellation');
  delete document.body.dataset.activePerson;
  delete document.body.dataset.activeKnot;
  if (type === 'person') {
    if (!cloudCamera) cloudCamera = {ax, ay, zoom, targetZoom};
    ax = ay = 0;
    zoom = targetZoom = viewport.portrait ? .82 : 1;
    velocityX = velocityY = 0;
    const active = nodes.filter(n => inMode(n.word));
    const positions = getPersonConstellation(source.id, active.length);
    mode.positions = new Map(active.map((node, index) => [node.word.id, positions[index]]));
    document.body.dataset.activePerson = source.id;
  } else {
    restoreCloudCamera();
    document.body.dataset.activeKnot = source.id;
  }
  for (const n of nodes) {
    const active = inMode(n.word);
    n.button.classList.toggle('inactive', !active);
    n.button.classList.toggle('selected', active);
    n.button.tabIndex = active ? 0 : -1;
    n.button.setAttribute('aria-hidden', String(!active));
  }
  $('#context-type').textContent = type === 'person' ? 'constelación de ensayo' : 'hilos de un nudo';
  $('#context-title').textContent = source.name;
  syncForeground();
  resize();
  const count = nodes.filter(n => inMode(n.word)).length;
  announce(`${source.name}. ${count} palabras relacionadas. Pulsa la flecha o el espacio vacío para volver a la nube.`);
}

function resetMode() {
  indices?.close();
  territory?.close();
  mode = null;
  edges = [];
  restoreCloudCamera();
  document.body.classList.remove('has-constellation');
  delete document.body.dataset.activePerson;
  delete document.body.dataset.activeKnot;
  for (const n of nodes) {
    n.button.classList.remove('inactive', 'selected');
    n.button.tabIndex = 0;
    n.button.removeAttribute('aria-hidden');
  }
  syncForeground();
  resize();
  announce('Todas las palabras.');
}

function heading(text){const h=el('h2','',text);h.id='drawer-heading';content.append(h);return h;}
function openDrawer(kicker,render,trigger,kind='index'){delete drawer.dataset.knot;indices?.close(false);territory?.close();velocityX=velocityY=0;lung.release();drawer.classList.toggle('word-plate',kind!=='index');drawer.classList.toggle('image-plate',kind==='image');if(stopSound){stopSound();stopSound=null;}closeFocus=trigger||document.activeElement;$('#drawer-kicker').textContent=kicker;content.replaceChildren();render();if(!drawer.open)drawer.showModal();drawer.scrollTop=0;const scroll=drawer.querySelector('.plate-scroll');if(scroll)scroll.scrollTop=0;}
function closeDrawer(){if(stopSound){stopSound();stopSound=null;}drawer.close();if(closeFocus?.isConnected)closeFocus.focus({preventScroll:true});}

function syncProfile() {
  const profileVisible = mode?.type === 'person' && !indices?.isOpen() && !territory?.isOpen();
  const person = profileVisible ? data.creators.find(entry => entry.id === mode.id) : null;
  if (!person) {
    personProfile.close();
    return;
  }
  const places = territory?.getCreatorPlaces(person.id) || [];
  personProfile.open(person, places.join(' · '));
}

function syncForeground(){
  const raised=!!territory?.isOpen()||!!indices?.isOpen();
  stage.inert=raised;
  stage.style.opacity=raised?'.055':'';
  context.hidden=raised||!mode;
  syncProfile();
  document.body.classList.toggle('has-navigation-layer',raised);
  $('.title-block').style.opacity=raised?'0':mode?'.45':'1';
  if(raised){velocityX=velocityY=0;pointers.clear();drag=null;lung.release();}
}
function openIndex(type){
  if(!indices)return;
  if(drawer.open)closeDrawer();
  territory?.close(false);
  indices.open(type);
}
function openPeople(){openIndex('person');}
function openKnots(){openIndex('knot');}

function openWord(word, trigger) {
  const kicker = word.demo === false ? 'apunte en este navegador' : 'pieza de ensayo';
  openDrawer(kicker, () => {
    const knot = data.knots.find(entry => entry.id === word.knotId);
    const person = mode?.type === 'person' ? data.creators.find(entry => entry.id === mode.id) : null;
    const meta = el('div', 'word-meta');
    meta.append(el('span', '', knot?.name || 'Sin nudo'));
    if (person) meta.append(el('span', 'small-dot'), el('span', '', person.name));
    content.append(meta);
    heading(word.label.toLocaleLowerCase('es'));

    if (word.kind === 'image') {
      const image = el('img', 'detail-image');
      image.src = word.mediaData || `media/estudio-${hash(word.id) % 4 + 1}.svg`;
      image.alt = word.mediaCaption || `Estudio visual para ${word.label}`;
      const plate = el('figure', 'resin-image');
      plate.append(image);
      content.append(plate, el('p', 'media-caption plate-caption', word.mediaData
        ? word.mediaCaption || 'Imagen aportada en este navegador.'
        : 'Estudio visual ficticio.'));
    } else if (word.kind === 'audio') {
      renderAudio(word);
    } else {
      const piece = person ? word.relations[person.id] || word.body : word.body;
      content.append(el('p', 'word-description', piece));
    }

    const related = data.creators.filter(entry => entry.id !== person?.id && word.creatorIds.includes(entry.id));
    if (related.length) {
      const links = el('div', 'related-people');
      for (const entry of related) {
        const button = el('button', 'text-chip', entry.name);
        button.addEventListener('click', () => {
          closeDrawer();
          activate('person', entry);
          $('#return-button').focus({preventScroll:true});
        });
        links.append(button);
      }
      content.append(el('p', 'eyebrow detail-label', 'otros hilos'), links);
    }
  }, trigger, word.kind);
  if (word.knotId) drawer.dataset.knot = word.knotId;
}

function renderAudio(word){if(word.mediaData){const audio=el('audio');audio.controls=true;audio.src=word.mediaData;content.append(audio,el('p','media-caption','Audio aportado en este navegador.'));stopSound=()=>{audio.pause();audio.removeAttribute('src');audio.load();};return;}
  const card=el('div','audio-card'),button=el('button','audio-play');const icon=el('span','','▶');const label=el('span','audio-title','Escuchar una textura');label.append(el('span','audio-type','ESTUDIO SONORO · 6 SEGUNDOS'));button.append(icon,label);button.setAttribute('aria-label',`Reproducir estudio sonoro de ${word.label}`);const wave=el('div','waveform');wave.setAttribute('aria-hidden','true');const r=random(hash(word.id));for(let i=0;i<48;i++){const bar=el('i');bar.style.setProperty('--h',`${8+r()*32}px`);bar.style.setProperty('--d',`${r()*-2}s`);wave.append(bar);}card.append(button,wave);content.append(card,el('p','media-caption','Textura sintetizada para probar la escucha. No es una grabación de campo.'));
  let playing=false;const end=()=>{playing=false;card.classList.remove('playing');icon.textContent='▶';button.setAttribute('aria-label',`Reproducir estudio sonoro de ${word.label}`);};button.addEventListener('click',()=>{if(playing){stopSound?.();end();return;}try{stopSound=synthesize(word.id,end);playing=true;card.classList.add('playing');icon.textContent='Ⅱ';button.setAttribute('aria-label','Detener estudio sonoro');}catch{end();content.append(el('p','small-copy','No se pudo iniciar el sonido en este navegador.'));}});
}

function synthesize(seed,onEnd){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Audio no disponible');const ac=new Audio();const duration=6,r=random(hash(seed)),buf=ac.createBuffer(1,ac.sampleRate*duration,ac.sampleRate),samples=buf.getChannelData(0);let brown=0;for(let i=0;i<samples.length;i++){brown=(brown+(r()*2-1)*.025)/1.02;samples[i]=brown*3.5*(.55+.45*Math.sin(i/ac.sampleRate*5.1));}const source=ac.createBufferSource();source.buffer=buf;const filter=ac.createBiquadFilter();filter.type='bandpass';filter.frequency.value=220+r()*1700;filter.Q.value=.7;const gain=ac.createGain();gain.gain.setValueAtTime(0,ac.currentTime);gain.gain.linearRampToValueAtTime(.4,ac.currentTime+.4);gain.gain.linearRampToValueAtTime(.25,ac.currentTime+4.5);gain.gain.linearRampToValueAtTime(0,ac.currentTime+duration);source.connect(filter).connect(gain).connect(ac.destination);source.start();let ended=false;const stop=()=>{if(ended)return;ended=true;source.onended=null;try{source.stop();}catch{}ac.close();onEnd();};source.onended=stop;ac.resume().catch(stop);return stop;}

function openAbout(){openDrawer('SOBRE ESTA BITÁCORA',()=>{heading('Una bitácora\npara recorrer.');content.append(el('p','lede','Esta es la bitácora de una investigación del colectivo Fragua hacia la instalación artística Susurros. Voces ocultas. Reúne y reorganiza palabras, voces, imágenes y encuentros del proceso para que cada visitante componga su propia manera de acercarse a los materiales.'));content.append(el('p','small-copy','La bitácora sale del recorrido y del texto que da lugar a la instalación. Aquí, esos materiales se encuentran de otra forma: puedes llegar por una palabra, seguir una persona, detenerte en un lugar o dejar que aparezca una relación. El punto de partida es la curiosidad de quien se los encuentra.'));
    content.append(el('h3','','Una nube que se deja recorrer'),el('p','small-copy','Arrastra en cualquier dirección para girar. Acércate con la rueda o pellizcando la pantalla. Toca una palabra. Los nombres y los nudos abren constelaciones. «Lugares» permite encontrar a las personas en un mapa de Colombia con ubicaciones ficticias. Para regresar a la nube, pulsa la flecha o el espacio vacío. Escape cierra las fichas y vuelve a la nube. Con el teclado, usa las flechas, + y −; Tab recorre las palabras.'));
    content.append(el('h3','','Dos pruebas de color'),el('p','small-copy','Penumbra da más luz a lo cercano. Revelado deja aparecer colores al acercarte, enfocar una palabra o abrir una constelación. Puedes comparar las dos opciones mientras recorres la bitácora.'));
    content.append(el('h3','','El tamaño es una coincidencia'),el('p','small-copy','Cada persona selecciona palabras de manera independiente. El tamaño parte de 14 puntos y crece un 25 % por cada selección adicional. No hay jerarquías por oficio, persona ni nudo.'));const scale=el('div','size-scale');[1,2,3,4].forEach((n,i)=>{const s=el('span','',String(n));s.style.fontSize=14*Math.pow(1.25,i)+'pt';s.title=`${(14*Math.pow(1.25,i)).toFixed(2)} pt`;scale.append(s);});content.append(scale);
    content.append(el('h3','','Una imagen todavía en formación'),el('p','small-copy','El grano, el desenfoque suave y la profundidad de campo son una interpretación visual de una película sensible a poca luz. La nube respira lentamente por zonas: se expande y se contrae de forma sutil e irregular. Algunas palabras se adelantan y otras llegan un poco después, con pequeñas retenciones ocasionales. Al tocarla se comprime y responde elásticamente; el arrastre deja una inercia que depende de la velocidad y la dirección del gesto. Algunas palabras se rezagan suavemente durante el giro y terminan alcanzando su posición. La respiración continúa al abrir y leer una ficha: la escena sigue detrás del vidrio. La pausa detiene esa respiración. Al recargar, las palabras encuentran otras posiciones. Sus trazos permanecen horizontales o verticales mientras recorres la nube. El sistema respeta la preferencia de movimiento reducido del dispositivo.'));
    content.append(el('hr','about-divider'),el('p','demo-note','La versión 0.2 usa perfiles, lugares y piezas de ensayo. Las figuras de las constelaciones son un recurso gráfico. Los sonidos son estudios sintetizados.'));
    content.append(el('h3','','Sumar apuntes al recorrido'),el('p','small-copy','«Añadir un apunte» permite probar una ficha con texto, imagen o sonido, selecciones y un vínculo opcional con una persona. Los cambios se guardan solo en este navegador. Puedes exportar el ensayo para conservarlo. La recepción compartida y los accesos del equipo se incorporarán en la siguiente fase.'));const b=el('button','text-chip','Añadir un apunte ↗');b.addEventListener('click',()=>{closeDrawer();editor.open();});content.append(b);const network=el('a','network-reference','Conocer ARDE ↗');network.href='https://ardered.com/';network.target='_blank';network.rel='noopener noreferrer';content.append(network);
    const p=el('p','small-copy detail-label','Bitácora de una investigación del colectivo Fragua. ARDE · Artistas de la Escenografía en Red aparece como una red amiga y una referencia.\nBase de trabajo: propuesta narrativa y ');p.append(document.createTextNode('conversación del 6 de noviembre de 2026.'));content.append(p);
  },$('#about-button'));}

function updatePause(){const b=$('#pause-button');b.setAttribute('aria-pressed',String(paused));b.setAttribute('aria-label',paused?'Activar la respiración':'Pausar la respiración');b.firstElementChild.textContent=paused?'▷':'Ⅱ';}
function distance(){const a=[...pointers.values()];return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
stage.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.pointerType==='mouse')return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  lung.touch((e.clientX-viewport.cx)/(viewport.w*.5),(e.clientY-viewport.cy)/(viewport.h*.5),e.pressure||.5);
  velocityX=velocityY=0;
  if(pointers.size===1){
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,t:e.timeStamp};didDrag=false;
  }else{pinchDistance=distance();pinchTime=e.timeStamp;didDrag=true;}
});
stage.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>1){
    const d=distance();
    if(pinchDistance>0){
      targetZoom=Math.max(.6,Math.min(1.75,targetZoom*d/pinchDistance));
      const pinchDt=Math.max(.008,Math.min(.08,(e.timeStamp-pinchTime)/1000||.016));
      lung.drag((d-pinchDistance)/viewport.w,0,Math.abs(d-pinchDistance)/pinchDt);
    }
    pinchDistance=d;pinchTime=e.timeStamp;didDrag=true;return;
  }
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.px,dy=e.clientY-drag.py;
  const sampleDt=Math.max(.008,Math.min(.08,(e.timeStamp-drag.t)/1000||.016));
  if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5){didDrag=true;stage.setPointerCapture(e.pointerId);}
  if(didDrag){
    ay+=dx*.004;ax-=dy*.004;
    const mix=1-Math.exp(-sampleDt*20),limit=2.4;
    velocityY+=(Math.max(-limit,Math.min(limit,dx*.004/sampleDt))-velocityY)*mix;
    velocityX+=(Math.max(-limit,Math.min(limit,-dy*.004/sampleDt))-velocityX)*mix;
    lung.drag(dx/viewport.w,dy/viewport.h,Math.hypot(dx,dy)/sampleDt);
    rotationDirty=true;$('#gesture-hint').style.opacity='.25';
  }
  drag.px=e.clientX;drag.py=e.clientY;drag.t=e.timeStamp;
});
function release(e){
  if(!pointers.has(e.pointerId))return;
  pointers.delete(e.pointerId);
  if(!pointers.size){
    const stale=drag?Math.max(0,(e.timeStamp-drag.t)/1000-.04):0;
    const retain=e.type==='pointercancel'||reduced.matches?0:Math.exp(-stale*12);
    velocityX*=retain;velocityY*=retain;
    lung.release();drag=null;pinchDistance=0;pinchTime=0;
    if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
    setTimeout(()=>{didDrag=false;},0);
  }else{
    const [id,p]=[...pointers.entries()][0];
    drag={id,x:p.x,y:p.y,px:p.x,py:p.y,t:e.timeStamp};
    lung.touch((p.x-viewport.cx)/(viewport.w*.5),(p.y-viewport.cy)/(viewport.h*.5),.5);
  }
}
window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
window.addEventListener('blur',()=>{pointers.clear();drag=null;velocityX=velocityY=0;lung.release();});
stage.addEventListener('click',e=>{if(!didDrag&&!e.target.closest('.word')&&mode)resetMode();});
stage.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewport.h:1);targetZoom=Math.max(.6,Math.min(1.75,targetZoom*Math.exp(-delta*.001)));$('#gesture-hint').style.opacity='.25';},{passive:false});
stage.addEventListener('keydown',e=>{if(e.target!==stage)return;const changes={ArrowLeft:[0,-.07],ArrowRight:[0,.07],ArrowUp:[.07,0],ArrowDown:[-.07,0]};if(changes[e.key]){e.preventDefault();ax+=changes[e.key][0];ay+=changes[e.key][1];rotationDirty=true;}if(['+','=','-','_'].includes(e.key)){e.preventDefault();targetZoom=Math.max(.6,Math.min(1.75,targetZoom+(e.key==='-'||e.key==='_'?-.1:.1)));}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.open&&!document.querySelector('dialog[open]')&&!territory?.isOpen()&&!indices?.isOpen()&&mode)resetMode();});
$('#people-button').addEventListener('click',openPeople);$('#knots-button').addEventListener('click',openKnots);$('#about-button').addEventListener('click',openAbout);$('#close-drawer').addEventListener('click',closeDrawer);$('#return-button').addEventListener('click',resetMode);$('#pause-button').addEventListener('click',()=>{paused=!paused;velocityX=velocityY=0;updatePause();});
drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDrawer();}});drawer.addEventListener('cancel',()=>{if(stopSound){stopSound();stopSound=null;}});drawer.addEventListener('close',()=>{if(stopSound){stopSound();stopSound=null;}});window.addEventListener('resize',resize);reduced.addEventListener('change',e=>{if(e.matches){paused=true;velocityX=velocityY=0;lung.release();}updatePause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&stopSound){stopSound();stopSound=null;}pointers.clear();drag=null;velocityX=velocityY=0;lung.release();});

document.fonts?.ready.then(measureWords);document.fonts?.addEventListener('loadingdone',measureWords);
makeGrain();installSurfaceTexture();installLiquidGlass();createAppearance({onChange:()=>{connectionRGB=getComputedStyle(document.documentElement).getPropertyValue('--connection-rgb').trim()||'171,151,122';measureWords();}});updatePause();
try{const response=await fetch('data.json');if(!response.ok)throw Error('No se encontró el archivo de palabras.');const base=await response.json();data=loadLocalData(base);editor=createEditor({getData:()=>data,onChange:next=>{data=next;mode=null;rebuild();resetMode();}});$('#contribute-button').addEventListener('click',()=>{indices?.close(false);territory?.close();editor.open();});resize();rebuild();$('#loading').hidden=true;requestAnimationFrame(frame);
  indices=createIndices({getData:()=>data,onSelect:(type,source)=>{activate(type,source);$('#return-button').focus({preventScroll:true});},onOpen:syncForeground,onClose:syncForeground});
  let territoryLoading=null;
  const loadTerritory=()=>{
    if(territory)return Promise.resolve(territory);
    if(!territoryLoading)territoryLoading=createTerritory({getData:()=>data,onCreator:id=>{const person=data.creators.find(p=>p.id===id);if(person){activate('person',person);$('#return-button').focus({preventScroll:true});}},onOpen:()=>{$('#places-button').setAttribute('aria-expanded','true');syncForeground();},onClose:()=>{$('#places-button').setAttribute('aria-expanded','false');syncForeground();}}).then(value=>{territory=value;syncProfile();return value;}).finally(()=>{territoryLoading=null;});
    return territoryLoading;
  };
  const showTerritory=async()=>{
    try{const map=await loadTerritory();if(drawer.open)closeDrawer();indices?.close(false);map.open();}
    catch(error){console.warn(error);openDrawer('LUGARES',()=>{heading('El mapa tarda en llegar.');content.append(el('p','lede','No pudimos abrir los lugares del ensayo. Puedes volver a intentarlo.'));const retry=el('button','text-chip','Volver a intentar ↗');retry.addEventListener('click',showTerritory);content.append(retry);},$('#places-button'));}
  };
  loadTerritory().catch(error=>console.warn(error));
  $('#places-button').addEventListener('click',showTerritory);}catch(error){$('#loading').textContent='No pudimos abrir la nube. Recarga la página para intentarlo de nuevo.';$('#loading').classList.add('error-title');console.error(error);}
