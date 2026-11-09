const KEY='susurros.appearance.v1';

function initialState(){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
  return{theme:saved.theme==='day'?'day':'night',writing:saved.writing==='hand'?'hand':'print'};
}

/** Independent paper/light and lettering choices, kept in this browser. */
export function createAppearance({onChange=()=>{}}={}){
  const root=document.documentElement;
  const themeButton=document.querySelector('#theme-toggle');
  const writingButton=document.querySelector('#writing-toggle');
  const state=initialState();
  function apply(){
    root.dataset.theme=state.theme;root.dataset.writing=state.writing;
    const day=state.theme==='day',hand=state.writing==='hand';
    themeButton.querySelector('.appearance-label').textContent=day?'Día':'Noche';
    themeButton.querySelector('.appearance-icon').textContent=day?'☼':'◐';
    themeButton.setAttribute('aria-pressed',String(day));
    themeButton.setAttribute('aria-label',day?'Cambiar a versión nocturna':'Cambiar a versión diurna');
    writingButton.querySelector('.appearance-label').textContent=hand?'Manuscrita':'Imprenta';
    writingButton.setAttribute('aria-pressed',String(hand));
    writingButton.setAttribute('aria-label',hand?'Cambiar a letra de imprenta':'Cambiar a letra manuscrita');
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=day?'#f8f6ef':'#090909';
    try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}
    onChange({...state});
    document.dispatchEvent(new CustomEvent('bitacora:appearance',{detail:{...state}}));
  }
  themeButton.addEventListener('click',()=>{state.theme=state.theme==='night'?'day':'night';apply();});
  writingButton.addEventListener('click',()=>{state.writing=state.writing==='print'?'hand':'print';apply();});
  apply();
  return{getState:()=>({...state})};
}

/** Native dialogs live above page stacking: give each the same grain surface. */
export function installSurfaceTexture(){
  const tracked=new WeakMap();
  function attach(dialog){
    if(tracked.has(dialog))return;
    const grain=document.createElement('div');
    grain.className='surface-grain';grain.setAttribute('aria-hidden','true');grain.inert=true;
    grain.style.animationDelay=`-${(performance.now()/1000)%0.3}s`;
    dialog.classList.add('textured-surface');dialog.append(grain);
    const fit=()=>{
      grain.style.top=`${dialog.scrollTop}px`;
      grain.style.height=`${dialog.clientHeight}px`;
    };
    const observer=new ResizeObserver(fit);observer.observe(dialog);
    dialog.addEventListener('scroll',fit,{passive:true});
    tracked.set(dialog,{fit,observer});fit();
  }
  function refresh(){
    document.querySelectorAll('dialog').forEach(dialog=>{attach(dialog);if(dialog.open)tracked.get(dialog).fit();});
    document.body.classList.toggle('has-floating-content',!!document.querySelector('dialog[open]'));
  }
  const observer=new MutationObserver(refresh);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  refresh();
  return observer;
}
