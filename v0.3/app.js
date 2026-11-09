import { createAppearance, installSurfaceTexture } from './appearance.js?v=02';
import { createCloudArrangement, createWordPlacement, sampleBreath } from './motion.js';
import { createLung } from './lung.js?v=4';
import { createOrbitFollower } from './dynamics.js?v=4';
import { createTerritory } from './territory.js?v=02';
import { createIndices } from './indices.js?v=02';
import { createPersonProfile } from './people.js?v=privado-1';
import { installLiquidGlass } from './liquid-glass.js?v=7';
import { getCloudLayout, getCloudDepthExtent, getDepthStyle, getWordVisibility } from './cloud-view.js?v=02-2';
import { createSoundscape, selectSoundscapeTracks } from './soundscape.js';

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
let data,nodes=[],mode=null,edges=[],hovered=null,paused=reduced.matches;
const lung=createLung();
let lungPose=lung.update(0,false);
let placements=new Map(),breathTime=0;
let ax=0,ay=0,targetZoom=innerWidth<650?.82:1,zoom=targetZoom,velocityX=0,velocityY=0,lastTime=0,modeTime=0,rotationDirty=true;
let viewport=getCloudLayout(innerWidth,innerHeight);
let pointers=new Map(),drag=null,pinchDistance=0,pinchTime=0,didDrag=false,releasePiece=null,closeFocus=null;
let spatialInterview=null;
let audioContext, soundscape, soundRoom, pageMuted = false, soloRecording = false;
const landingTracks = new Map();
const wordReadingLevel = 10 ** (-9 / 20);
const originalMute = new WeakMap();

function hash(s){let n=2166136261;for(const c of s){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;}
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function announce(text){$('#announcement').textContent=text;}

function makeGrain(){const c=document.createElement('canvas');c.width=c.height=180;const g=c.getContext('2d'),im=g.createImageData(180,180),r=random(19);for(let i=0;i<im.data.length;i+=4){const v=Math.floor(r()*255);im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}g.putImageData(im,0,0);document.documentElement.style.setProperty('--grain-image',`url(${c.toDataURL()})`);}

function resize() {
  viewport = getCloudLayout(innerWidth, innerHeight);
  if (!viewport.compact) {
    viewport.uiTop = Math.max(...['.masthead', '#listen-button', '#palette-controls']
      .map(selector => $(selector).getBoundingClientRect().bottom)) + 8;
    viewport.uiBottom = $('.footer').getBoundingClientRect().top - 8;
  }
  if (!mode && !viewport.portrait) {
    const title = $('.v02-title').getBoundingClientRect();
    viewport.titleRect = {
      left: title.left - 20,
      right: title.right + 20,
      top: title.top - 20,
      bottom: title.bottom + 20
    };
  }
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

const singleWordPosition = {u:0,v:0,w:.12,angle:0};

function arrangeLandingTracks() {
  const candidates = data.words.flatMap(word =>
    word.piecesGeneral.filter(piece => piece.kind === 'audio' && piece.src)
      .map(piece => ({wordId: word.id, piece}))
  );
  const sessionKey = 'susurros.v03.previous-audio';
  let previous = [];
  try {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '[]');
    if (Array.isArray(stored)) previous = stored;
  } catch {}
  const tracks = selectSoundscapeTracks(candidates, Math.random, previous);
  try { localStorage.setItem(sessionKey, JSON.stringify(tracks.map(track => track.wordId))); } catch {}
  const firstVoice = tracks.findIndex(track => track.piece.audioRole !== 'ambience');
  if (firstVoice > 0) [tracks[0], tracks[firstVoice]] = [tracks[firstVoice], tracks[0]];
  const verticalSide = Math.random() < .5 ? -1 : 1;
  const positions = [
    {slot:'front', u:-.07, v:.02, w:.88},
    {slot:'left', u:-.78, v:.15, w:.48},
    {slot:'right', u:.78, v:-.15, w:.48},
    {slot:'back', u:.17, v:-.43*verticalSide, w:-.92},
    {slot:'vertical', u:-.20, v:.76*verticalSide, w:.10},
  ];
  tracks.forEach((track, index) => {
    const {slot, ...position} = positions[index];
    const {wordId, piece} = track;
    placements.set(wordId, {...placements.get(wordId), ...position, angle: 0});
    landingTracks.set(wordId, {slot, piece});
  });
}

function audibleLanding() {
  return soundRoom?.level === 1
    && document.body.dataset.soundscapeState === 'playing'
    && !pageMuted;
}

function rebuild(){
  hovered=null;
  if (!placements.size) {
    placements = createCloudArrangement(data.words.map(word => word.id));
    arrangeLandingTracks();
  }
  cloud.replaceChildren();
  nodes=data.words.map((word,i)=>{
    if(!placements.has(word.id))placements.set(word.id,createWordPlacement(word.id));
    const initial=placements.get(word.id);
    const track = landingTracks.get(word.id);
    const placement=data.words.length===1 && !track ? {...initial,...singleWordPosition} : initial;
    const anchor=el('div','word-anchor'),button=el('button','word');
    button.dataset.wordId=word.id;
    button.dataset.colorTone = String(hash(word.id) % 5);
    button.dataset.knot=word.knotId || "";
    button.dataset.orientation=String(placement.angle);
    button.setAttribute('aria-label',word.label);
    if (track) {
      button.dataset.soundTrack = track.piece.audioRole || 'interview';
      button.dataset.soundSlot = track.slot;
      button.setAttribute('aria-description', 'Tiene un audio en la mezcla de la portada.');
    }
    const zone=(placement.u>=0?1:0)+(placement.v>=0?2:0)+(placement.w>=0?4:0);
    const r=random(hash(`${word.id}:${placement.u}`));
    const breathDelay=Math.max(0,Math.min(1.15,zoneDelays[zone]+(r()-.5)*.22));
    button.dataset.breathZone=String(zone);button.dataset.breathDelay=breathDelay.toFixed(3);
    const span=el('span','',word.label.toLocaleLowerCase('es'));button.append(span);anchor.append(button);
    button.addEventListener('pointerenter',()=>{hovered=word.id;});
    button.addEventListener('pointerleave',()=>{if(hovered===word.id)hovered=null;});
    button.addEventListener('focus',()=>{hovered=word.id;rotationDirty=true;});
    button.addEventListener('blur',()=>{if(hovered===word.id)hovered=null;});
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (didDrag) return;
      if (track && audibleLanding()) openWord(word, button, track.piece, true);
      else openWord(word, button);
    });
    cloud.append(anchor);
    return{word,button,span,anchor,placement,index:i,baseX:0,baseY:0,baseZ:0,x:0,y:0,z:0,depth:0,drift:sampleBreath(placement.breath,breathTime)*.08,breathDelay,orbitX:ax,orbitY:ay,follower:createOrbitFollower(`${word.id}:${placement.u}`,ax,ay)};
  });
  positionWords();measureWords();
  if(mode){const source=(mode.type==='person'?data.creators:data.knots).find(x=>x.id===mode.id);if(source)activate(mode.type,source);else resetMode();}
  const count=data.words.length;
  $('#empty-cloud').hidden=!!count;
  $('#gesture-hint').hidden=!count;
  $('#pause-button').hidden=!count;
  announce(count ? `${count} ${count===1?'palabra':'palabras'} en la nube.` : 'Las palabras aparecerán a medida que se revisen los materiales.');
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
    n.button.style.fontSize = 14 * Math.pow(step, Math.max(0, new Set(n.word.selections).size - 1)) + 'pt';
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

function soundPosition(node) {
  const {x, y, z} = projected(node);
  const lateral = Math.hypot(viewport.rx * Math.cos(ay), viewport.rz * Math.sin(ay)) * zoom;
  const depth = getCloudDepthExtent(viewport, ax, ay) * zoom;
  return {
    x: (x - viewport.w / 2) / Math.max(1, lateral * .76),
    y: (y - viewport.cy) / Math.max(1, viewport.ry * zoom),
    z: z / Math.max(1, depth * .87),
  };
}

function getAudioContext() {
  const Engine = window.AudioContext || window.webkitAudioContext;
  if (!Engine) return null;
  if (!audioContext || audioContext.state === 'closed') audioContext = new Engine();
  return audioContext;
}

function resolvePieceSource(piece) {
  const src = piece.src;
  return src;
}

function applyPageMute(media) {
  if (pageMuted) {
    if (!originalMute.has(media)) originalMute.set(media, media.muted);
    if (!media.muted) media.muted = true;
  } else if (originalMute.has(media)) {
    const wasMuted = originalMute.get(media);
    originalMute.delete(media);
    media.muted = wasMuted;
  }
}

function setPageMuted(value) {
  pageMuted = value;
  soundscape?.setMuted(value);
  for (const media of content.querySelectorAll('audio,video')) applyPageMute(media);
  if (spatialInterview) {
    const {output, context} = spatialInterview;
    output.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, .025);
  }
}

function updateSoundRoom() {
  if (!soundscape) return;
  const inSection = mode || territory?.isOpen() || indices?.isOpen();
  let level = inSection ? 0 : 1;
  if (!inSection && drawer.open) {
    level = drawer.classList.contains('word-plate') && !soloRecording ? wordReadingLevel : 0;
  }
  const hidden = document.hidden;
  const cameraZoom = Math.round(zoom * 100) / 100;
  const changedRoom = soundRoom?.level !== level || soundRoom.hidden !== hidden;
  if (!changedRoom && soundRoom.cameraZoom === cameraZoom) return;
  soundRoom = {level, hidden, cameraZoom};
  if (changedRoom) rotationDirty = true;
  document.body.dataset.soundscapeRoom = String(level);
  soundscape.setRoom(level, hidden, cameraZoom);
}

function setupSoundscape() {
  const listen = $('#listen-button');
  const mute = $('#mute-button');
  const drawerMute = el('button', 'sound-button sound-mute sound-dialog');
  drawerMute.type = 'button';
  drawerMute.id = 'drawer-mute-button';
  drawerMute.append(el('span', 'sound-button-text'));
  $('#close-drawer').before(drawerMute);

  let roomState = 'idle';
  const tracks = nodes.filter(node => landingTracks.has(node.word.id))
    .map(node => ({node, piece: landingTracks.get(node.word.id).piece}));
  soundscape = createSoundscape({
    tracks, getContext: getAudioContext, resolveSource: resolvePieceSource,
    samplePosition: soundPosition,
    onState({state, muted, tracks: voices}) {
      roomState = state;
      rotationDirty = true;
      document.body.dataset.soundscapeState = state;
      document.body.dataset.soundscapeTracks = String(voices);
      document.body.dataset.soundMuted = String(muted);
      if (listen) {
        listen.dataset.state = state;
        listen.disabled = state === 'loading' || state === 'unavailable';
        listen.setAttribute('aria-pressed', String(state === 'playing' && !muted));
        const labels = {
          loading: 'Preparando ambiente…', paused: 'Reanudar ambiente',
          error: 'Reintentar ambiente', unavailable: 'Ambiente no disponible',
        };
        listen.querySelector('.sound-button-text').textContent = labels[state]
          || 'Escuchar atentamente';
      }
      for (const button of [mute, drawerMute]) {
        if (!button) continue;
        button.setAttribute('aria-pressed', String(muted));
        button.querySelector('.sound-button-text').textContent = muted ? 'Activar sonido' : 'Silenciar';
      }
    },
  });
  listen?.addEventListener('click', () => {
    setPageMuted(false);
    soundscape.start();
  });
  function startIfReady() {
    if (!pageMuted && (roomState === 'idle' || roomState === 'paused')) soundscape.start();
  }
  stage.addEventListener('pointerup', startIfReady);
  stage.addEventListener('keydown', event => { if (event.key !== 'Escape') startIfReady(); });
  for (const button of [mute, drawerMute]) {
    button?.addEventListener('click', () => {
      setPageMuted(!pageMuted);
      startIfReady();
    });
  }
  const mediaObserver = new MutationObserver(() => {
    if (pageMuted) for (const media of content.querySelectorAll('audio,video')) applyPageMute(media);
  });
  mediaObserver.observe(content, {childList: true, subtree: true});
  content.addEventListener('volumechange', event => {
    if (event.target.matches('audio,video')) applyPageMute(event.target);
  }, true);
  document.addEventListener('visibilitychange', updateSoundRoom);
  updateSoundRoom();
  try {
    if (!document.hidden && navigator.getAutoplayPolicy?.('audiocontext') === 'allowed') soundscape.start();
  } catch {}
}

function interviewPan(node) {
  const position = soundPosition(node).x;
  if (!Number.isFinite(position)) return 0;
  const distance = Math.max(0, Math.abs(position) - .03);
  return Math.sign(position) * .96 * Math.min(1, distance / .97);
}

function updateInterviewPan() {
  const audio = spatialInterview;
  if (!audio || audio.media.paused || audio.context.state !== 'running') return;
  const target = interviewPan(audio.node);
  if (Math.abs(audio.target - target) < .004) return;
  audio.target = target;
  audio.panner.pan.setTargetAtTime(target, audio.context.currentTime, .18);
  audio.media.dataset.spatialPan = target.toFixed(3);
}

function connectInterviewAudio(media, word, hint) {
  const Engine = window.AudioContext || window.webkitAudioContext;
  const node = nodes.find(entry => entry.word.id === word.id);
  let context, panner, output, source, blobUrl, disposed = false;
  const stop = () => {
    disposed = true;
    media.pause();
    if (spatialInterview?.media === media) spatialInterview = null;
    source?.disconnect();
    panner?.disconnect();
    output?.disconnect();
    media.removeAttribute('src');
    media.load();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  };
  if (!node || !Engine?.prototype.createStereoPanner) return stop;

  try {
    const url = new URL(media.src, document.baseURI);
    if (url.protocol === 'data:') {
      // The offline edition embeds its recordings. A Blob keeps the source in this document's origin.
      const comma = media.src.indexOf(',');
      const mime = /^data:(audio\/[a-z0-9.+-]+);base64$/i.exec(media.src.slice(0, comma));
      if (!mime) return stop;
      const binary = atob(media.src.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blobUrl = URL.createObjectURL(new Blob([bytes], {type: mime[1]}));
      media.src = blobUrl;
    } else if (url.protocol !== 'blob:' && (url.protocol === 'file:' || url.origin !== location.origin)) {
      return stop;
    }
    context = getAudioContext();
    panner = context.createStereoPanner();
    // Treat the interview as a single voice position and avoid summing stereo peaks at the edges.
    panner.channelCount = 1;
    panner.channelCountMode = 'explicit';
    output = context.createGain();
    output.gain.value = pageMuted ? 0 : 1;
    panner.connect(output);
    output.connect(context.destination);
  } catch {
    return stop;
  }

  function attach() {
    if (disposed || source || context.state !== 'running') return;
    const target = interviewPan(node);
    panner.pan.setValueAtTime(target, context.currentTime);
    output.gain.value = pageMuted ? 0 : 1;
    source = context.createMediaElementSource(media);
    source.connect(panner);
    spatialInterview = {media, node, context, panner, output, target};
    media.dataset.spatialPan = target.toFixed(3);
    hint.hidden = false;
  }
  function resume() {
    if (disposed || context.state === 'closed') return;
    // Leave the native player intact until audio is permitted by a user gesture.
    if (context.state === 'running') {
      try { attach(); } catch { /* Native playback remains available. */ }
    } else {
      context.resume().then(attach).catch(() => {});
    }
  }
  media.addEventListener('pointerdown', resume);
  media.addEventListener('play', () => {
    if (document.hidden) { media.pause(); return; }
    resume();
    updateInterviewPan();
  });
  resume();
  return stop;
}

function projectedLabel(node, position) {
  const perspective = 1000 / (1000 - position.z);
  const sideways = Math.abs(Math.round(node.angle / 90) % 2) === 1;
  return {
    x: viewport.cx + position.x * perspective,
    y: viewport.cy + position.y * perspective,
    width: (sideways ? node.labelHeight : node.labelWidth) * zoom * perspective,
    height: (sideways ? node.labelWidth : node.labelHeight) * zoom * perspective,
  };
}

function soundLabelSpacing(label, soundLabels) {
  let opacity = 1;
  for (const sound of soundLabels) {
    const horizontal = Math.abs(label.x - sound.x) - (label.width + sound.width) / 2;
    const vertical = Math.abs(label.y - sound.y) - (label.height + sound.height) / 2;
    const gap = Math.max(horizontal, vertical);
    opacity = Math.min(opacity, .30 + .70 * Math.max(0, Math.min(1, (gap + 4) / 16)));
  }
  return opacity;
}

function frame(time){
  const dt=Math.min((time-lastTime)/1000||.016,.045);lastTime=time;
  const blocked=drawer.open||!!territory?.isOpen()||!!indices?.isOpen()||document.hidden;
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
    });
    const markAudio = audibleLanding();
    const soundLabels = markAudio ? nodes.filter(n => landingTracks.has(n.word.id))
      .map(n => projectedLabel(n, rotated(n))) : [];
    nodes.forEach(n=>{
      const p=rotated(n);
      n.anchor.style.transform=`translate3d(${p.x/zoom}px,${p.y/zoom}px,${p.z/zoom}px)`;
      n.button.style.transform=`translate(-50%,-50%) rotateZ(${n.angle}deg)`;
      n.button.dataset.orbitLag=Math.hypot(ax-n.orbitX,ay-n.orbitY).toFixed(5);
      const optical = getDepthStyle(p.z, zoom, depthExtent);
      const label = projectedLabel(n, p);
      const visibility = getWordVisibility(label, viewport, {hasContext:!!mode});
      const marked = markAudio && landingTracks.has(n.word.id);
      const opacity = marked ? .72 + .28 * optical.depth : optical.opacity * soundLabelSpacing(label, soundLabels);
      n.depth = p.z;
      n.button.style.opacity = String(opacity * visibility);
      n.button.style.setProperty('--depth-tone',optical.tone);
      n.button.style.visibility=visibility<.015?'hidden':'';
      n.button.dataset.depth=optical.depth.toFixed(3);
      n.button.dataset.readingVisibility=visibility.toFixed(3);
      n.span.style.filter=`blur(${optical.blur}px)`;
    });
    rotationDirty=false;
  }
  updateInterviewPan();
  updateSoundRoom();
  soundscape?.update(time);
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
  const active = nodes.filter(n => inMode(n.word));
  const count = active.length;
  document.body.classList.toggle('has-constellation', count > 0);
  delete document.body.dataset.activePerson;
  delete document.body.dataset.activeKnot;
  if (type === 'person') {
    if (!cloudCamera) cloudCamera = {ax, ay, zoom, targetZoom};
    ax = ay = 0;
    zoom = targetZoom = viewport.portrait ? .82 : 1;
    velocityX = velocityY = 0;
    document.body.dataset.activePerson = source.id;
  } else {
    restoreCloudCamera();
    document.body.dataset.activeKnot = source.id;
  }
  if (count === 1) mode.positions = new Map([[active[0].word.id, singleWordPosition]]);
  for (const n of nodes) {
    const active = inMode(n.word);
    n.button.classList.toggle('inactive', !active);
    n.button.classList.toggle('selected', active);
    n.button.tabIndex = active ? 0 : -1;
    n.button.setAttribute('aria-hidden', String(!active));
  }
  $('#context-type').textContent = count ? (type === 'person' ? 'palabras vinculadas' : 'hilos de un nudo') : 'materiales por incorporar';
  $('#context-title').textContent = source.name;
  syncForeground();
  resize();
  const summary = count ? `${count} ${count===1?'palabra vinculada':'palabras vinculadas'}.` : 'Materiales por incorporar.';
  announce(`${source.name}. ${summary} Pulsa la flecha o el espacio vacío para volver a la nube.`);
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

function returnToLanding() {
  if (drawer.open) closeDrawer();
  resetMode();
  ax = ay = velocityX = velocityY = 0;
  zoom = targetZoom = viewport.portrait ? .82 : 1;
  rotationDirty = true;
  stage.focus({ preventScroll: true });
}

function heading(text){const h=el('h2','',text);h.id='drawer-heading';content.append(h);return h;}
function openDrawer(kicker, render, trigger, kind = 'index', word = null) {
  delete drawer.dataset.knot;
  delete drawer.dataset.colorTone;
  delete drawer.dataset.focusWord;
  if (word) {
    drawer.dataset.focusWord = word.id;
    drawer.dataset.colorTone = String(hash(word.id) % 5);
    if (word.knotId) drawer.dataset.knot = word.knotId;
  }
  delete drawer.dataset.visualOrientation;
  drawer.style.removeProperty('--visual-ratio');
  indices?.close(false);
  territory?.close();
  velocityX = velocityY = 0;
  lung.release();
  drawer.classList.toggle('word-plate', kind !== 'index');
  drawer.classList.toggle('image-plate', kind === 'image');
  drawer.classList.toggle('visual-plate', kind === 'image' || kind === 'video');
  if (releasePiece) {
    releasePiece();
    releasePiece = null;
  }
  closeFocus = trigger || document.activeElement;
  $('#drawer-kicker').textContent = kicker;
  content.replaceChildren();
  render();
  if (!drawer.open) drawer.showModal();
  updateSoundRoom();
  drawer.scrollTop = 0;
  const scroll = drawer.querySelector('.plate-scroll');
  if (scroll) scroll.scrollTop = 0;
}

function closeDrawer() {
  if (releasePiece) {
    releasePiece();
    releasePiece = null;
  }
  drawer.close();
  updateSoundRoom();
  if (closeFocus?.isConnected) closeFocus.focus({preventScroll:true});
}

function syncProfile() {
  const profileVisible = mode?.type === 'person' && !indices?.isOpen() && !territory?.isOpen();
  const person = profileVisible ? data.creators.find(entry => entry.id === mode.id) : null;
  if (!person) {
    personProfile.close();
    return;
  }
  const places = territory?.getCreatorPlaces(person.id) || [];
  const linkedWords = data.words.filter(word => word.creatorIds.includes(person.id));
  const visuals = [];
  for (const word of linkedWords) {
    const pieces = word.pieces?.[person.id];
    const candidates = Array.isArray(pieces) ? pieces : [pieces];
    const byId = new Map();
    const totals = {image: 0, video: 0};
    for (const piece of candidates) {
      if (!piece?.src || (piece.kind !== 'image' && piece.kind !== 'video') || byId.has(piece.id)) continue;
      byId.set(piece.id, piece);
      totals[piece.kind]++;
    }
    const ordinals = {image: 0, video: 0};
    for (const piece of byId.values()) {
      const kind = piece.kind === 'image' ? 'Foto' : 'Video';
      const ordinal = ++ordinals[piece.kind];
      const total = totals[piece.kind];
      visuals.push({word, piece, format: total > 1 ? `${kind} ${ordinal} de ${total}` : kind});
    }
  }
  const photos = visuals.filter(({piece}) => piece.kind === 'image').length;
  const videos = visuals.length - photos;
  const label = photos && videos ? 'Fotos y videos'
    : photos ? `${photos} ${photos === 1 ? 'foto' : 'fotos'}`
    : `${videos} ${videos === 1 ? 'video' : 'videos'}`;
  const media = visuals.length ? {
    label,
    open(trigger) {
      if (visuals.length === 1) {
        const [{word, piece}] = visuals;
        openWord(word, trigger, piece);
        return;
      }
      openDrawer('PIEZAS VINCULADAS', () => {
        heading(photos && videos ? 'Fotos y videos' : photos ? 'Fotos' : 'Videos');
        content.append(el('p', 'small-copy', person.name));
        const list = el('div', 'person-media-list');
        for (const {word, piece, format} of visuals) {
          const row = el('button', 'person-media-row');
          row.type = 'button';
          const arrow = el('span', 'person-media-arrow', '↗');
          arrow.setAttribute('aria-hidden', 'true');
          row.append(el('span', 'person-media-name', word.label), el('span', 'person-media-kind', format), arrow);
          row.addEventListener('click', () => {
            openWord(word, trigger, piece);
            $('#close-drawer').focus({preventScroll: true});
          });
          list.append(row);
        }
        content.append(list);
      }, trigger, 'text');
    }
  } : null;
  personProfile.open(person, places.join(' · '), linkedWords.length > 0, media);
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

function watchVisualContrast(media, figure, label, poster) {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 12;
  const sampler = canvas.getContext('2d', { willReadFrequently: true });
  const isVideo = media.tagName === 'VIDEO';
  let frame = 0;
  let lastVideoSample = -Infinity;

  function sample() {
    frame = 0;
    const useVideo = isVideo && media.readyState >= 2 && (!poster?.naturalWidth || media.currentTime > 0);
    const source = isVideo && !useVideo ? poster : media;
    const width = useVideo ? media.videoWidth : source?.naturalWidth;
    const height = useVideo ? media.videoHeight : source?.naturalHeight;
    if (!width || !height) return;

    const orientation = width < height ? 'portrait' : 'landscape';
    if (drawer.dataset.visualOrientation !== orientation) drawer.dataset.visualOrientation = orientation;
    if (!drawer.style.getPropertyValue('--visual-ratio')) drawer.style.setProperty('--visual-ratio', width / height);
    const bounds = media.getBoundingClientRect();
    const title = label.getBoundingClientRect();
    if (!sampler || !bounds.width || !bounds.height || !title.width || !title.height) return;

    const fit = getComputedStyle(media).objectFit;
    const scale = fit === 'contain'
      ? Math.min(bounds.width / width, bounds.height / height)
      : Math.max(bounds.width / width, bounds.height / height);
    const left = bounds.left + (bounds.width - width * scale) / 2;
    const top = bounds.top + (bounds.height - height * scale) / 2;
    const x = Math.max(0, (title.left - left) / scale);
    const y = Math.max(0, (title.top - top) / scale);
    const right = Math.min(width, (title.right - left) / scale);
    const bottom = Math.min(height, (title.bottom - top) / scale);
    if (right <= x || bottom <= y) return;
    try {
      sampler.drawImage(source, x, y, right - x, bottom - y, 0, 0, canvas.width, canvas.height);
      const rgba = sampler.getImageData(0, 0, canvas.width, canvas.height).data;
      let luminance = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        luminance += .2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2];
      }
      const brightness = luminance / (canvas.width * canvas.height * 255);
      const cutoff = label.dataset.tone === 'dark' ? .51 : .56;
      label.dataset.tone = brightness >= cutoff ? 'dark' : 'light';
    } catch {
      // If a frame cannot be read, retain the last legible color.
    }
  }

  function queueSample() {
    if (!frame) frame = requestAnimationFrame(sample);
  }

  function sampleVideo() {
    const now = performance.now();
    if (now - lastVideoSample < 220) return;
    lastVideoSample = now;
    queueSample();
  }

  const observer = new ResizeObserver(queueSample);
  observer.observe(figure);
  poster?.addEventListener('load', queueSample);
  if (isVideo) {
    media.addEventListener('loadeddata', queueSample);
    media.addEventListener('seeked', queueSample);
    media.addEventListener('timeupdate', sampleVideo);
  } else {
    media.addEventListener('load', queueSample);
  }
  queueSample();

  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    poster?.removeEventListener('load', queueSample);
    media.removeEventListener('load', queueSample);
    media.removeEventListener('loadeddata', queueSample);
    media.removeEventListener('seeked', queueSample);
    media.removeEventListener('timeupdate', sampleVideo);
  };
}

function renderVisualPiece(word, piece, source) {
  const isVideo = piece.kind === 'video';
  const figure = el('figure', 'detail-visual');
  const media = el(isVideo ? 'video' : 'img', isVideo ? 'detail-video' : 'detail-image');
  const label = el('figcaption', 'detail-visual-label');
  const title = el('h2', '', word.label.toLocaleLowerCase('es'));
  title.id = 'drawer-heading';
  label.append(title, el('span', 'detail-visual-person', source.name));
  figure.append(media, label);
  content.append(figure);
  let poster = null;
  if (isVideo) {
    media.controls = true;
    media.playsInline = true;
    media.preload = 'metadata';
    media.setAttribute('aria-label', 'Ver el video de ' + word.label);
    if (piece.poster) {
      media.poster = piece.poster;
      poster = new Image();
      poster.src = media.poster;
    }
  } else {
    media.alt = piece.alt;
  }
  media.src = piece.src;
  const stopContrast = watchVisualContrast(media, figure, label, poster);
  releasePiece = () => {
    stopContrast();
    if (isVideo) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
  };
}

const lastOpenedPiece = new Map();

function nextPiece(choices, wordId, creatorId) {
  if (choices.length === 1) return choices[0];
  const key = 'susurros.v03.pieza.' + (creatorId || 'general') + '.' + wordId;
  let previousId = lastOpenedPiece.get(key);
  if (!previousId) {
    try { previousId = localStorage.getItem(key); } catch {}
  }
  const previousIndex = choices.findIndex(piece => piece.id === previousId);
  const choice = choices[(previousIndex + 1) % choices.length];
  lastOpenedPiece.set(key, choice.id);
  try { localStorage.setItem(key, choice.id); } catch {}
  return choice;
}

function openWord(word, trigger, selectedPiece, fromMix = false) {
  const personId = mode?.type === 'person' ? mode.id : null;
  const choices = personId ? word.pieces[personId] : word.piecesGeneral;
  const piece = selectedPiece || nextPiece(choices, word.id, personId);
  const source = data.creators.find(entry => entry.id === piece.creatorId);
  const format = { text: 'glosario', audio: 'fragmento sonoro', image: 'fotografía', video: 'video', pending: 'por revisar' };
  const position = choices.length > 1 ? ' · ' + (choices.indexOf(piece) + 1) + ' de ' + choices.length : '';
  openDrawer(format[piece.kind] + position, () => {
    if (piece.kind === 'image' || piece.kind === 'video') {
      renderVisualPiece(word, piece, source);
    } else {
      const meta = el('div', 'word-meta');
      meta.append(el('span', '', source.name));
      content.append(meta);
      heading(word.label.toLocaleLowerCase('es'));
      if (piece.kind === 'audio') {
        const media = el('audio');
        media.controls = true;
        media.preload = 'metadata';
        media.src = piece.src;
        media.setAttribute('aria-label', 'Escuchar el fragmento de ' + word.label);
        content.append(media, el('p', 'media-caption', piece.caption));
        const hint = el('p', 'small-copy', 'Con audífonos, la voz acompaña la posición de la palabra en la nube.');
        hint.hidden = true;
        content.append(hint);
        const releaseAudio = connectInterviewAudio(media, word, hint);
        const updateSolo = () => {
          soloRecording = !media.paused && !media.ended;
          updateSoundRoom();
        };
        const playEvents = ['playing', 'pause', 'ended'];
        playEvents.forEach(event => media.addEventListener(event, updateSolo));
        releasePiece = () => {
          playEvents.forEach(event => media.removeEventListener(event, updateSolo));
          soloRecording = false;
          releaseAudio();
        };
        applyPageMute(media);
        media.play().catch(() => {});
      } else {
        content.append(el('p', 'word-description', piece.text));
      }
    }

    if (fromMix && choices.length > 1) {
      const next = choices[(choices.indexOf(piece) + 1) % choices.length];
      const more = el('button', 'text-chip', 'Otra pieza ↻');
      more.type = 'button';
      more.setAttribute('aria-label', 'Ver otra pieza de ' + word.label);
      more.addEventListener('click', () => {
        openWord(word, trigger, next, true);
        $('#close-drawer').focus({ preventScroll: true });
      });
      content.append(more);
    }

    const related = data.creators.filter(entry => entry.id !== source.id && word.creatorIds.includes(entry.id));
    if (related.length) {
      const links = el('div', 'related-people');
      for (const entry of related) {
        const button = el('button', 'text-chip', entry.name);
        button.addEventListener('click', () => {
          closeDrawer();
          activate('person', entry);
          $('#return-button').focus({ preventScroll: true });
        });
        links.append(button);
      }
      content.append(el('p', 'eyebrow detail-label', 'otros hilos'), links);
    }
  }, trigger, piece.kind, word);
}

function openAbout() {
  openDrawer('BITÁCORA 0.3', () => {
    heading('Una bitácora para recorrer.');
    content.append(
      el('p', 'lede', 'Esta bitácora reúne materiales de la investigación de Fragua para la instalación Susurros. Voces ocultas. Algunas fichas y vínculos están en construcción.'),
      el('p', 'small-copy', 'Entra por una palabra o por una persona. Arrastra la nube para girarla y acércate con la rueda o con un pellizco. Escape cierra las fichas.'),
    );
    content.append(
      el('p', 'small-copy', 'Cada palabra abre una pieza. Si tiene varias, vuelve a abrirla para recorrerlas. En Personas, la secuencia reúne solo los materiales del taller elegido.'),
      el('p', 'small-copy', 'En la portada, Escuchar atentamente activa hasta cinco capas. Cada una sigue la posición de su palabra, con más presencia al frente. La selección de sonidos cambia al recargar. El volumen de la mezcla sube al acercarte. Las palabras señaladas abren sus audios, que se escuchan solos al reproducirse. Mientras lees queda un murmullo. La mezcla se desvanece al entrar en otra sección. Pulsa fuera del contenido para regresar a la nube.'),
    );
    const visualKinds = new Set();
    for (const word of data?.words || []) {
      for (const piece of word.piecesGeneral) {
        if (piece.src && (piece.kind === 'image' || piece.kind === 'video')) visualKinds.add(piece.kind);
      }
    }
    if (visualKinds.size) {
      const formats = visualKinds.size === 2 ? 'las fotos y los videos' : visualKinds.has('image') ? 'las fotos' : 'los videos';
      content.append(el('p', 'small-copy', `En Personas, abre una ficha y usa el acceso junto a la ciudad para encontrar ${formats} disponibles.`));
    }
    content.append(el('p', 'small-copy', 'En Lugares, abre las fichas desde su ciudad de trabajo. Los vínculos de los nudos se incorporarán a medida que se confirmen.'));
    const network = el('a', 'network-reference', 'Conocer ARDE ↗');
    network.href = 'https://ardered.com/';
    network.target = '_blank';
    network.rel = 'noopener noreferrer';
    content.append(network);
  }, $('#about-button'));
}

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
stage.addEventListener('click',e=>{if(!didDrag&&!e.target.closest('.word')&&mode)returnToLanding();});
stage.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewport.h:1);targetZoom=Math.max(.6,Math.min(1.75,targetZoom*Math.exp(-delta*.001)));$('#gesture-hint').style.opacity='.25';},{passive:false});
stage.addEventListener('keydown',e=>{if(e.target!==stage)return;const changes={ArrowLeft:[0,-.07],ArrowRight:[0,.07],ArrowUp:[.07,0],ArrowDown:[-.07,0]};if(changes[e.key]){e.preventDefault();ax+=changes[e.key][0];ay+=changes[e.key][1];rotationDirty=true;}if(['+','=','-','_'].includes(e.key)){e.preventDefault();targetZoom=Math.max(.6,Math.min(1.75,targetZoom+(e.key==='-'||e.key==='_'?-.1:.1)));}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.open&&!document.querySelector('dialog[open]')&&!territory?.isOpen()&&!indices?.isOpen()&&mode)returnToLanding();});
$('#people-button').addEventListener('click',openPeople);$('#knots-button').addEventListener('click',openKnots);$('#about-button').addEventListener('click',openAbout);$('#close-drawer').addEventListener('click',closeDrawer);$('#return-button').addEventListener('click',returnToLanding);$('#pause-button').addEventListener('click',()=>{paused=!paused;velocityX=velocityY=0;updatePause();});
drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)returnToLanding();}});drawer.addEventListener('cancel',()=>{if(releasePiece){releasePiece();releasePiece=null;}});drawer.addEventListener('close',()=>{if(!drawer.open&&releasePiece){releasePiece();releasePiece=null;}});window.addEventListener('resize',resize);reduced.addEventListener('change',e=>{if(e.matches){paused=true;velocityX=velocityY=0;lung.release();}updatePause();});document.addEventListener('visibilitychange',()=>{if(document.hidden)content.querySelector('audio,video')?.pause();pointers.clear();drag=null;velocityX=velocityY=0;lung.release();});

document.fonts?.ready.then(resize);document.fonts?.addEventListener('loadingdone',measureWords);
makeGrain();installSurfaceTexture();installLiquidGlass();createAppearance({onChange:()=>{connectionRGB=getComputedStyle(document.documentElement).getPropertyValue('--connection-rgb').trim()||'171,151,122';measureWords();}});updatePause();
try{
  const response=await fetch('data.json');
  if(!response.ok)throw Error('No se encontró el archivo de palabras.');
  data=await response.json();
  resize();rebuild();setupSoundscape();$('#loading').hidden=true;requestAnimationFrame(frame);
  indices=createIndices({getData:()=>data,onReturn:returnToLanding,onSelect:(type,source)=>{activate(type,source);$('#return-button').focus({preventScroll:true});},onOpen:syncForeground,onClose:syncForeground});
  let territoryLoading=null;
  const loadTerritory=()=>{
    if(territory)return Promise.resolve(territory);
    if(!territoryLoading)territoryLoading=createTerritory({getData:()=>data,onReturn:returnToLanding,onCreator:id=>{const person=data.creators.find(p=>p.id===id);if(person){activate('person',person);$('#return-button').focus({preventScroll:true});}},onOpen:()=>{$('#places-button').setAttribute('aria-expanded','true');syncForeground();},onClose:()=>{$('#places-button').setAttribute('aria-expanded','false');syncForeground();}}).then(value=>{territory=value;syncProfile();return value;}).finally(()=>{territoryLoading=null;});
    return territoryLoading;
  };
  const showTerritory=async()=>{
    try{const map=await loadTerritory();if(drawer.open)closeDrawer();indices?.close(false);map.open();}
    catch(error){console.warn(error);openDrawer('LUGARES',()=>{heading('El mapa tarda en llegar.');content.append(el('p','lede','No pudimos abrir el mapa. Puedes volver a intentarlo.'));const retry=el('button','text-chip','Volver a intentar ↗');retry.addEventListener('click',showTerritory);content.append(retry);},$('#places-button'));}
  };
  loadTerritory().catch(error=>console.warn(error));
  $('#places-button').addEventListener('click',showTerritory);}catch(error){$('#loading').textContent='No pudimos abrir la nube. Recarga la página para intentarlo de nuevo.';$('#loading').classList.add('error-title');console.error(error);}
