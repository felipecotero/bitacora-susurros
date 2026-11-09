const STORAGE_KEY = 'susurros.ensayo.v1';
const MAX_MEDIA_BYTES = 1.5 * 1024 * 1024;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'audio/ogg']);
const normalizeWord = value => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es');
let savedDataIssue = '';

function fail(message) { throw new Error(message); }
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: formato no válido.`);
  return value;
}
function text(value, max, label, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(`${label}: revisa el texto y su extensión.`);
  return value.normalize('NFC').trim();
}
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail(`${label}: identificador no válido.`);
  return value;
}
function list(value, min, max, label) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label}: cantidad no válida.`);
  return value;
}
function uniqueRecords(items, label) {
  if (new Set(items.map(item => item.id)).size !== items.length) fail(`${label}: hay identificadores repetidos.`);
  return items;
}
function references(value, allowed, label, min = 0) {
  const result = list(value, min, allowed.size, label).map(item => identifier(item, label));
  if (new Set(result).size !== result.length || result.some(id => !allowed.has(id))) fail(`${label}: relación desconocida o repetida.`);
  return result;
}

/** Return a fresh, allowlisted dataset, or throw a readable validation error. */
export function validateData(input) {
  const source = record(input, 'Ensayo');
  if (source.version !== 1 || typeof source.demo !== 'boolean') fail('Este archivo no corresponde a la versión 1 del ensayo.');
  const selectors = uniqueRecords(list(source.selectors, 1, 8, 'Lectores').map(item => {
    record(item, 'Lector');
    return { id: identifier(item.id, 'Lector'), name: text(item.name, 100, 'Nombre del lector') };
  }), 'Lectores');
  const creators = uniqueRecords(list(source.creators, 0, 100, 'Personas').map(item => {
    record(item, 'Persona');
    return { id: identifier(item.id, 'Persona'), name: text(item.name, 100, 'Nombre'), role: text(item.role, 160, 'Oficio', true), bio: text(item.bio, 4000, 'Biografía', true) };
  }), 'Personas');
  const knots = uniqueRecords(list(source.knots, 0, 20, 'Nudos').map(item => {
    record(item, 'Nudo');
    return { id: identifier(item.id, 'Nudo'), name: text(item.name, 100, 'Nombre del nudo'), description: text(item.description, 4000, 'Descripción del nudo', true) };
  }), 'Nudos');
  const selectorIds = new Set(selectors.map(item => item.id));
  const creatorIds = new Set(creators.map(item => item.id));
  const knotIds = new Set(knots.map(item => item.id));
  const words = uniqueRecords(list(source.words, 0, 500, 'Palabras').map(item => {
    record(item, 'Palabra');
    const selectedCreators = references(item.creatorIds, creatorIds, 'Personas de la palabra');
    const relations = Object.fromEntries(Object.entries(record(item.relations, 'Relaciones')).map(([key, value]) => {
      if (!selectedCreators.includes(key)) fail('Una relación menciona a una persona que no está vinculada a la palabra.');
      return [key, text(value, 6000, 'Relación con la persona')];
    }));
    if (!['text', 'image', 'audio'].includes(item.kind)) fail('Tipo de contenido no válido.');
    const knotId = item.knotId === null || item.knotId === undefined || item.knotId === '' ? '' : identifier(item.knotId, 'Nudo de la palabra');
    if (knotId && !knotIds.has(knotId)) fail('Una palabra menciona un nudo desconocido.');
    const word = {
      id: identifier(item.id, 'Palabra'),
      label: text(item.label, 60, 'Palabra').replace(/\s+/gu, ' '),
      selections: references(item.selections, selectorIds, 'Selecciones de la palabra', 1),
      creatorIds: selectedCreators,
      knotId,
      kind: item.kind,
      body: text(item.body, 6000, 'Sentido de la palabra'),
      relations,
    };
    if (typeof item.demo === 'boolean') word.demo = item.demo;
    if (item.mediaCaption) word.mediaCaption = text(item.mediaCaption, 500, 'Pie del archivo', true);
    if (item.mediaData !== undefined) {
      if (typeof item.mediaData !== 'string' || item.mediaData.length > Math.ceil(MAX_MEDIA_BYTES * 4 / 3) + 100) fail('El archivo adjunto supera 1,5 MB.');
      const match = /^data:([a-z]+\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.mediaData);
      if (!match || !MIME_TYPES.has(match[1]) || match[2].length % 4 !== 0) fail('Adjunto no válido. Usa PNG, JPEG, WebP, MP3, WAV u OGG.');
      if ((word.kind === 'image' && !match[1].startsWith('image/')) || (word.kind === 'audio' && !match[1].startsWith('audio/')) || word.kind === 'text') fail('El tipo del adjunto no coincide con el contenido.');
      word.mediaData = item.mediaData;
    }
    return word;
  }), 'Palabras');
  if (new Set(words.map(word => normalizeWord(word.label))).size !== words.length) fail('Hay palabras repetidas: unifica sus selecciones antes de importar.');
  return { version: 1, demo: source.demo, selectors, creators, knots, words };
}

export function loadLocalData(base) {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? validateData(JSON.parse(value)) : base;
  } catch {
    savedDataIssue = 'No pudimos recuperar el ensayo guardado. La nube muestra los datos iniciales; puedes volver a cargar una copia exportada.';
    return base;
  }
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

async function readAttachment(file) {
  if (file.size > MAX_MEDIA_BYTES) fail('El adjunto supera 1,5 MB. Prueba con un fragmento de audio o una imagen más ligera.');
  const mime = { 'audio/x-wav': 'audio/wav', 'audio/mp3': 'audio/mpeg' }[file.type] || file.type;
  if (!MIME_TYPES.has(mime)) fail('Usa una imagen PNG, JPEG o WebP, o un sonido MP3, WAV u OGG.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const prefix = String.fromCharCode(...bytes);
  const signatureValid = mime === 'image/png' ? bytes[0] === 137 && prefix.slice(1, 4) === 'PNG'
    : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/webp' ? prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP'
    : mime === 'audio/wav' ? prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WAVE'
    : mime === 'audio/ogg' ? prefix.startsWith('OggS')
    : prefix.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (!signatureValid) fail('El archivo no coincide con su formato. Vuelve a exportarlo como imagen o sonido compatible.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No pudimos leer el adjunto. Intenta elegirlo de nuevo.'));
    reader.readAsDataURL(file);
  });
  return { kind: mime.startsWith('image/') ? 'image' : 'audio', data: data.replace(/^data:[^;]+;/, `data:${mime};`) };
}

export function createEditor({ getData, onChange }) {
  const dialog = element('dialog', 'editor-dialog');
  dialog.setAttribute('aria-labelledby', 'editor-title');
  dialog.innerHTML = `
    <div class="editor-inner">
      <header class="editor-header">
        <p class="editor-eyebrow">Cuaderno de prueba</p>
        <button type="button" class="editor-close" aria-label="Cerrar el cuaderno">×</button>
        <h2 id="editor-title">Añadir un apunte</h2>
        <p class="editor-intro">Una palabra puede guardar un encuentro, una pregunta o una manera de hacer.</p>
      </header>
      <p class="editor-local-note">Ensayo local · se guarda en este navegador. No se publica ni se envía al equipo.</p>
      <form class="editor-form">
        <label class="editor-label" for="editor-word">La palabra</label>
        <input id="editor-word" name="word" type="text" required maxlength="60" autocomplete="off" placeholder="por ejemplo, resonancia">
        <p class="editor-match" aria-live="polite"></p>
        <label class="editor-label" for="editor-body">¿Qué reúne esta palabra?</label>
        <textarea id="editor-body" name="body" required maxlength="6000" rows="4" placeholder="Un apunte sobre esta palabra en el recorrido…"></textarea>
        <fieldset class="editor-selections">
          <legend>¿Quién la eligió?</legend>
          <p class="editor-help">Cada coincidencia aumenta su tamaño en la nube.</p>
          <div class="editor-selector-list"></div>
        </fieldset>
        <label class="editor-label" for="editor-knot">Un nudo <span>opcional</span></label>
        <select id="editor-knot" name="knot"></select>
        <label class="editor-label" for="editor-creator">Una persona <span>opcional</span></label>
        <select id="editor-creator" name="creator"></select>
        <div class="editor-relation-wrap" hidden>
          <label class="editor-label" for="editor-relation">¿Cómo se relacionan?</label>
          <textarea id="editor-relation" name="relation" maxlength="6000" rows="3" placeholder="Una experiencia, un gesto, una relación con su oficio…"></textarea>
        </div>
        <label class="editor-label" for="editor-media">Una imagen o un sonido <span>opcional</span></label>
        <input id="editor-media" name="media" type="file" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg">
        <p class="editor-help editor-media-note">PNG, JPEG, WebP · MP3, WAV, OGG · hasta 1,5 MB.</p>
        <label class="editor-label" for="editor-caption">Descripción del archivo <span>opcional</span></label>
        <input id="editor-caption" name="caption" type="text" maxlength="500" placeholder="Qué vemos o escuchamos, y quién lo registró">
        <div class="editor-submit-row">
          <button type="submit" class="editor-save">Guardar en este ensayo <span aria-hidden="true">↗</span></button>
          <button type="button" class="editor-view" hidden>Ver en la nube ↗</button>
        </div>
      </form>
      <p class="editor-status" role="status" aria-live="polite"></p>
      <footer class="editor-transfer">
        <p class="editor-eyebrow">Conservar y continuar</p>
        <p>Descarga una copia con todas las palabras y sus adjuntos. Al cargar una copia, reemplazas este ensayo local.</p>
        <div class="editor-transfer-actions">
          <button type="button" class="editor-export">Exportar ensayo ↓</button>
          <button type="button" class="editor-import">Cargar una copia ↑</button>
        </div>
        <input type="file" class="editor-import-input" accept="application/json,.json" hidden aria-label="Elegir copia del ensayo">
      </footer>
    </div>`;
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector);
  const form = find('.editor-form');
  const wordInput = find('#editor-word');
  const bodyInput = find('#editor-body');
  const knotInput = find('#editor-knot');
  const creatorInput = find('#editor-creator');
  const relationInput = find('#editor-relation');
  const captionInput = find('#editor-caption');
  const mediaInput = find('#editor-media');
  const status = find('.editor-status');
  const submit = find('.editor-save');
  let busy = false;

  function report(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('editor-error', isError);
  }
  function refreshOptions() {
    const data = getData();
    const checks = find('.editor-selector-list');
    checks.replaceChildren();
    data.selectors.forEach(selector => {
      const label = element('label', 'editor-selector');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'selection';
      checkbox.value = selector.id;
      label.append(checkbox, element('span', '', selector.name));
      checks.append(label);
    });
    const options = (select, items, empty) => {
      select.replaceChildren();
      const initial = element('option', '', empty);
      initial.value = '';
      select.append(initial);
      items.forEach(item => {
        const option = element('option', '', item.name);
        option.value = item.id;
        select.append(option);
      });
    };
    options(knotInput, data.knots, 'Sin nudo por ahora');
    options(creatorInput, data.creators, 'Sin persona vinculada');
  }
  function updateRelation() {
    const hasCreator = Boolean(creatorInput.value);
    find('.editor-relation-wrap').hidden = !hasCreator;
    relationInput.required = hasCreator;
  }
  function resetForm() {
    form.reset();
    find('.editor-match').textContent = '';
    find('.editor-media-note').textContent = 'PNG, JPEG, WebP · MP3, WAV, OGG · hasta 1,5 MB.';
    updateRelation();
  }
  function persist(candidate) {
    const validated = validateData(candidate);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(validated)); }
    catch { fail('No hay espacio disponible o el navegador no permite guardar. Exporta el ensayo actual y reduce el tamaño del adjunto antes de intentarlo de nuevo.'); }
    onChange(validated);
    return validated;
  }
  async function withBusy(action) {
    if (busy) return;
    busy = true;
    submit.disabled = true;
    find('.editor-import').disabled = true;
    try { await action(); }
    catch (error) { report(error instanceof Error ? error.message : 'No pudimos completar el cambio.', true); }
    finally { busy = false; submit.disabled = false; find('.editor-import').disabled = false; }
  }
  const close = () => { if (!busy) dialog.close(); };
  find('.editor-close').addEventListener('click', close);
  find('.editor-view').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }
  });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  creatorInput.addEventListener('change', updateRelation);
  wordInput.addEventListener('input', () => {
    const word = getData().words.find(item => normalizeWord(item.label) === normalizeWord(wordInput.value));
    find('.editor-match').textContent = word ? `«${word.label}» ya está en la nube. Guardar actualizará su ficha y sumará selecciones y relaciones; conservará el adjunto si no eliges otro.` : '';
  });
  mediaInput.addEventListener('change', () => {
    const file = mediaInput.files[0];
    find('.editor-media-note').textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'PNG, JPEG, WebP · MP3, WAV, OGG · hasta 1,5 MB.';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    withBusy(async () => {
      if (!form.reportValidity()) return;
      const selections = [...find('.editor-selector-list').querySelectorAll('input:checked')].map(input => input.value);
      if (!selections.length) fail('Marca al menos una persona que haya elegido esta palabra.');
      const data = getData();
      const label = wordInput.value.normalize('NFC').trim().replace(/\s+/gu, ' ');
      const existing = data.words.find(item => normalizeWord(item.label) === normalizeWord(label));
      const creatorId = creatorInput.value;
      const attachment = mediaInput.files[0] ? await readAttachment(mediaInput.files[0]) : null;
      const word = {
        ...(existing || {}),
        id: existing?.id || `word-${crypto.randomUUID()}`,
        label,
        body: bodyInput.value.trim(),
        knotId: knotInput.value,
        selections: [...new Set([...(existing?.selections || []), ...selections])],
        creatorIds: [...new Set([...(existing?.creatorIds || []), ...(creatorId ? [creatorId] : [])])],
        relations: { ...(existing?.relations || {}), ...(creatorId ? { [creatorId]: relationInput.value.trim() } : {}) },
        kind: attachment?.kind || existing?.kind || 'text',
        demo: false,
      };
      if (attachment) word.mediaData = attachment.data;
      if (captionInput.value.trim()) word.mediaCaption = captionInput.value.trim();
      const words = existing ? data.words.map(item => item.id === existing.id ? word : item) : [...data.words, word];
      persist({ ...data, words });
      resetForm();
      report(`«${label}» ${existing ? 'se actualizó' : 'encontró un lugar'} en este ensayo. Se conserva únicamente en este navegador.`);
      find('.editor-view').hidden = false;
    });
  });
  find('.editor-export').addEventListener('click', () => {
    try {
      const data = validateData(getData());
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = element('a');
      anchor.href = url;
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date());
      anchor.download = `susurros-ensayo-${date}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      report('La copia del ensayo se ha preparado para descargar. Incluye los adjuntos guardados.');
    } catch (error) { report(error.message, true); }
  });
  const importInput = find('.editor-import-input');
  find('.editor-import').addEventListener('click', () => { if (!busy) importInput.click(); });
  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    withBusy(async () => {
      if (file.size > MAX_IMPORT_BYTES) fail('La copia supera 8 MB. Usa una versión con adjuntos más ligeros.');
      let candidate;
      try { candidate = JSON.parse(await file.text()); }
      catch { fail('No pudimos leer esta copia. Elige el archivo JSON exportado desde el ensayo.'); }
      const validated = persist(candidate);
      refreshOptions();
      resetForm();
      report(`Copia cargada: ${validated.words.length} palabras. Este cambio se guarda únicamente en este navegador.`);
      find('.editor-view').hidden = false;
    });
    importInput.value = '';
  });
  return {
    open() {
      refreshOptions();
      resetForm();
      find('.editor-view').hidden = true;
      report(savedDataIssue);
      savedDataIssue = '';
      dialog.showModal();
      wordInput.focus();
    },
    close,
  };
}
