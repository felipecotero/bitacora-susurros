const mixProfiles = {
  'edwing_textura.mp3': {offset: 21.20, level: .668},
  'jhon_utileria.mp3': {offset: 9.15, level: .813},
  'jhon_pasion.mp3': {offset: 25.46, level: .944},
  'jhon_legado.mp3': {offset: 37.39, level: .933},
  'pablo_adaptacion.mp3': {offset: 11.42, level: .692},
  'edwing_libertad_v03.mp3': {offset: 3.77, level: .804},
  'edwing_madera_v03.mp3': {offset: 12.13, level: .724},
  'jhon_ingenio_v03.mp3': {offset: 6.07, level: .708},
  'jhon_versatilidad_v03.mp3': {offset: 11.26, level: .716},
  'pablo_reciclaje_v03.mp3': {offset: 4.39, level: .804},
  'pablo_resolucion_v03.mp3': {offset: 12.10, level: .841},
};

const masterLevel = .20;
const clamp = value => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
const gainFromDb = db => 10 ** (db / 20);

function chooseLeaders(samples, previous) {
  // A small advantage for the previous leads prevents their roles changing on every breath.
  const rank = sample => sample.spatialDb + (previous.has(sample.voice) ? 1.6 : 0);
  const interviews = samples.filter(sample => !sample.voice.ambience);
  interviews.sort((a, b) => rank(b) - rank(a));
  const strongest = interviews[0];
  if (!strongest) return new Set();

  const center = interviews.find(sample => {
    const current = previous.has(sample.voice);
    return Math.abs(sample.x) <= (current ? .44 : .36)
      && Math.abs(sample.y) <= (current ? .50 : .40)
      && sample.z >= (current ? -.28 : -.18)
      && sample.spatialDb >= strongest.spatialDb - (current ? 7 : 5);
  });
  if (center) return new Set([center.voice]);

  const paired = previous.size === 2;
  const left = interviews.find(sample => sample.x <= (paired && previous.has(sample.voice) ? -.27 : -.33));
  const right = interviews.find(sample => sample.x >= (paired && previous.has(sample.voice) ? .27 : .33));
  if (left && right) {
    const keepPair = paired && previous.has(left.voice) && previous.has(right.voice);
    const equallyPresent = Math.abs(left.spatialDb - right.spatialDb) <= (keepPair ? 6.5 : 5);
    const closeToStrongest = Math.min(left.spatialDb, right.spatialDb) >= strongest.spatialDb - 8;
    if (equallyPresent && closeToStrongest) return new Set([left.voice, right.voice]);
  }
  return new Set([strongest.voice]);
}

const trackTerm = track => track.wordId ?? track.node?.word?.id ?? track.piece?.src;

function matchSoundscapeTracks(candidates, previousWords, previousSources) {
  const start = Symbol(), end = Symbol(), interview = Symbol(), ambience = Symbol();
  const routes = new Map();
  const trackLimit = 5;
  const repeatedTerm = trackLimit + 1;
  const repeatedRecording = trackLimit * (repeatedTerm + 1) + 1;
  function connect(from, to, remaining = 1, cost = 0) {
    const forward = {to, remaining, cost};
    const reverse = {to: from, remaining: 0, cost: -cost, reverse: forward};
    forward.reverse = reverse;
    if (!routes.has(from)) routes.set(from, []);
    if (!routes.has(to)) routes.set(to, []);
    routes.get(from).push(forward);
    routes.get(to).push(reverse);
    return forward;
  }
  connect(start, interview, 3);
  connect(start, ambience, 2);
  // Fill five seats, then avoid repeated recordings and terms before
  // preferring 3 + 2. A small ambient catalog must not force a repeat.
  connect(start, interview, trackLimit, 1);
  connect(start, ambience, trackLimit, 1);
  const recordings = new Map();
  const terms = new Set();
  const choices = [];
  for (const track of candidates) {
    const src = track.piece?.src;
    if (!src) continue;
    const term = trackTerm(track);
    if (!recordings.has(src)) {
      const recording = {terms: new Set()};
      recordings.set(src, recording);
      const role = track.piece.audioRole === 'ambience' ? ambience : interview;
      connect(role, recording, 1, previousSources.has(src) ? repeatedRecording : 0);
    }
    if (!terms.has(term)) {
      terms.add(term);
      connect(term, end, 1, previousWords.has(term) ? repeatedTerm : 0);
    }
    const recording = recordings.get(src);
    if (recording.terms.has(term)) continue;
    recording.terms.add(term);
    choices.push({track, edge: connect(recording, term)});
  }

  // Reverse routes let a cheaper match replace an earlier choice without
  // using the same recording or term twice.
  function addTrack() {
    const path = new Map();
    const costs = new Map([[start, 0]]);
    const queue = [start];
    const queued = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      queued.delete(node);
      for (const edge of routes.get(node)) {
        if (!edge.remaining) continue;
        const cost = costs.get(node) + edge.cost;
        if (cost >= (costs.get(edge.to) ?? Infinity)) continue;
        costs.set(edge.to, cost);
        path.set(edge.to, edge);
        if (edge.to !== end && !queued.has(edge.to)) {
          queue.push(edge.to);
          queued.add(edge.to);
        }
      }
    }
    if (!path.has(end)) return false;
    for (let node = end; node !== start;) {
      const edge = path.get(node);
      edge.remaining--;
      edge.reverse.remaining++;
      node = edge.reverse.to;
    }
    return true;
  }

  let count = 0;
  while (count < trackLimit && addTrack()) count++;
  return choices.filter(({edge}) => edge.reverse.remaining).map(({track}) => track);
}

export function selectSoundscapeTracks(candidates, random = Math.random, previous = {}) {
  function shuffle(tracks) {
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    return tracks;
  }
  const legacy = Array.isArray(previous);
  const words = legacy ? previous : previous?.words;
  const previousWords = new Set(Array.isArray(words) ? words : []);
  const sources = legacy
    ? candidates.filter(track => previousWords.has(trackTerm(track))).map(track => track.piece?.src)
    : previous?.sources;
  const previousSources = new Set(Array.isArray(sources) ? sources : []);
  return shuffle(matchSoundscapeTracks(shuffle([...candidates]), previousWords, previousSources));
}

async function decodeTracks(context, tracks, resolveSource) {
  // Decode one file at a time and keep a lighter mono copy for each moving voice.
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let decoder = context;
  try { if (Offline) decoder = new Offline(1, 1, 24000); } catch {}
  const buffers = [];
  for (const {piece} of tracks) {
    const response = await window.fetch(resolveSource(piece));
    if (!response.ok) throw new Error('No se pudo cargar el ambiente.');
    const original = await decoder.decodeAudioData(await response.arrayBuffer());
    const mono = context.createBuffer(1, original.length, original.sampleRate);
    const samples = mono.getChannelData(0);
    const left = original.getChannelData(0);
    const right = original.numberOfChannels > 1 ? original.getChannelData(1) : left;
    for (let i = 0; i < samples.length; i++) samples[i] = .5 * (left[i] + right[i]);
    const fade = Math.min(Math.floor(samples.length / 2), Math.round(mono.sampleRate * .04));
    for (let i = 0; i < fade; i++) {
      const scale = i / fade;
      samples[i] *= scale;
      samples[samples.length - 1 - i] *= scale;
    }
    buffers.push(mono);
  }
  return buffers;
}

export function createSoundscape({tracks, getContext, resolveSource, samplePosition, onState}) {
  let state = tracks.length ? 'idle' : 'unavailable';
  let graph, loading, buffers;
  let muted = false, room = 1, hidden = document.hidden, zoomGain = 1;
  let lastUpdate = -Infinity;
  const report = () => onState({state, muted, tracks: graph?.voices.length || 0});

  function updateMaster(zooming = false) {
    if (!graph) return;
    const level = muted || hidden ? 0 : masterLevel * room * zoomGain;
    if (level === graph.level || (zooming && Math.abs(level - graph.level) < .0005)) return;
    const fade = muted || hidden ? .025 : zooming ? .18 : level < graph.level ? .06 : .14;
    graph.level = level;
    const gain = graph.master.gain;
    const now = graph.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(level, now, fade);
    if (level === 0) gain.setValueAtTime(0, now + 5 * fade);
  }

  function positionVoice(sample, leaders, time, immediate) {
    const {voice, x, y, spatialDb} = sample;
    const leading = leaders.has(voice);
    // Side whispers stay distinct in their own channel even while the central voice leads.
    let levelDb = Math.max(-40, spatialDb - 16 + 8 * Math.abs(x));
    if (voice.ambience) levelDb = -13 + .70 * spatialDb;
    else if (leading) levelDb = spatialDb - (leaders.size === 2 ? 2.5 : 0);
    const level = voice.level * gainFromDb(levelDb);
    const side = Math.max(0, Math.abs(x) - .025) / .975;
    const pan = .98 * Math.sign(x) * side ** .65;
    const frequency = (3100 + 3400 * (1 - y) / 2) * (leading ? 1 : .80);
    if (immediate) {
      voice.panner?.pan.setValueAtTime(pan, time);
      voice.gain.gain.setValueAtTime(level, time);
      voice.filter.frequency.setValueAtTime(frequency, time);
    } else {
      voice.panner?.pan.setTargetAtTime(pan, time, .18);
      voice.gain.gain.setTargetAtTime(level, time, .29);
      voice.filter.frequency.setTargetAtTime(frequency, time, .25);
    }
  }

  function positionMix(mix, time, immediate = false) {
    const samples = mix.voices.map(voice => {
      const position = samplePosition(voice.node);
      const x = clamp(position.x), y = clamp(position.y), z = clamp(position.z);
      const depthDb = -32 * (1 - z) / 2;
      const lateralDb = -9 * Math.abs(x) ** 1.35;
      const verticalDb = -5 * Math.abs(y) ** 1.35;
      return {voice, x, y, z, spatialDb: depthDb + lateralDb + verticalDb};
    });
    mix.leaders = chooseLeaders(samples, mix.leaders);
    for (const sample of samples) positionVoice(sample, mix.leaders, time, immediate);
  }

  function begin(context, decoded) {
    const master = context.createGain();
    master.gain.value = 0;
    const voices = [];
    const mix = {context, master, voices, leaders: new Set(), level: 0};
    try {
      for (const [index, track] of tracks.entries()) {
        const buffer = decoded[index];
        const profile = mixProfiles[track.piece.id] || {offset: buffer.duration * (.10 + index * .09), level: .72};
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = .5;
        const panner = context.createStereoPanner?.();
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(filter);
        if (panner) {
          filter.connect(panner);
          panner.connect(gain);
        } else {
          filter.connect(gain);
        }
        gain.connect(master);
        voices.push({source, filter, panner, gain, node: track.node,
          ambience: track.piece.audioRole === 'ambience',
          level: profile.level, offset: profile.offset % buffer.duration});
      }
      master.connect(context.destination);
      const when = context.currentTime + .035;
      if (room > 0 && !muted && !hidden) positionMix(mix, when, true);
      for (const voice of voices) voice.source.start(when, voice.offset);
    } catch (error) {
      master.disconnect();
      for (const voice of voices) {
        try { voice.source.stop(); } catch {}
        voice.source.disconnect();
      }
      throw error;
    }
    graph = mix;
    context.addEventListener('statechange', () => {
      if (!graph) return;
      state = context.state === 'running' ? 'playing' : 'paused';
      report();
    });
    updateMaster();
  }

  async function start() {
    if (!tracks.length) return;
    try {
      const context = getContext();
      if (!context) {
        state = 'unavailable';
        report();
        return;
      }
      // Resume in the click handler, before waiting for file decoding.
      const resumed = context.state === 'running' ? Promise.resolve() : context.resume();
      if (graph) {
        await resumed;
        state = 'playing';
        report();
        return;
      }
      if (!loading) {
        state = 'loading';
        report();
        loading = buffers ? Promise.resolve(buffers) : decodeTracks(context, tracks, resolveSource);
      }
      const [, decoded] = await Promise.all([resumed, loading]);
      buffers = decoded;
      loading = null;
      if (!graph) begin(context, decoded);
      state = 'playing';
      report();
    } catch (error) {
      loading = null;
      state = 'error';
      report();
      console.warn('No pudimos abrir el ambiente sonoro.', error);
    }
  }

  function setMuted(value) {
    muted = Boolean(value);
    updateMaster();
    report();
  }

  function setRoom(level, isHidden, cameraZoom = 1) {
    const zooming = level === room && isHidden === hidden;
    room = level;
    hidden = isHidden;
    const zoom = Math.max(.6, Math.min(1.75, Number.isFinite(cameraZoom) ? cameraZoom : 1));
    const zoomDb = zoom <= 1 ? 9 * (zoom - 1) / .4 : 3.5 * (zoom - 1) / .75;
    zoomGain = gainFromDb(zoomDb);
    updateMaster(zooming);
  }

  function update(time) {
    if (!graph || muted || hidden || !room || graph.context.state !== 'running' || time - lastUpdate < 75) return;
    lastUpdate = time;
    const now = graph.context.currentTime;
    positionMix(graph, now);
  }

  report();
  return {start, setMuted, setRoom, update};
}
