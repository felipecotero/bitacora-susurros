const PALETTE_KEY = 'susurros.v02.palette';

function initialPalette() {
  try {
    return localStorage.getItem(PALETTE_KEY) === 'revelado' ? 'revelado' : 'penumbra';
  } catch {
    return 'penumbra';
  }
}

/** Keep the two colour studies independent from the appearance of 0.1. */
export function createAppearance({ onChange = () => {} } = {}) {
  const root = document.documentElement;
  const buttons = document.querySelectorAll('#palette-controls [data-palette-choice]');
  const state = { theme: 'night', writing: 'print', palette: initialPalette() };

  function apply(palette) {
    state.palette = palette === 'revelado' ? 'revelado' : 'penumbra';
    root.dataset.theme = state.theme;
    root.dataset.writing = state.writing;
    root.dataset.palette = state.palette;
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.paletteChoice === state.palette));
    });
    try {
      localStorage.setItem(PALETTE_KEY, state.palette);
    } catch {
      // The selection still applies when browser storage is disabled.
    }
    onChange({ ...state });
    document.dispatchEvent(new CustomEvent('bitacora:appearance', { detail: { ...state } }));
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => apply(button.dataset.paletteChoice));
  });
  apply(state.palette);
  return { getState: () => ({ ...state }) };
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
