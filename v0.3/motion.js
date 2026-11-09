// Geometry is regenerated only when a page opens. Keep its placements in a Map
// during the session so resizing or adding a word does not rearrange the cloud.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function newSeed(seed) {
  if (seed !== undefined) return typeof seed === 'number' ? seed >>> 0 : hash(seed);
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967296);
}

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

function breathingProfile(random) {
  const cycles = Array.from({ length: 16 }, () => {
    const inhale = 1.8 + random() * 1.5;
    const hold = 0.4 + random() * 0.8;
    const exhale = 2.5 + random() * 1.5;
    const rest = 0.6 + random() * 1.4;
    return { inhale, hold, exhale, rest, peak: 0.62 + random() * 0.38,
      duration: inhale + hold + exhale + rest };
  });
  const duration = cycles.reduce((sum, cycle) => sum + cycle.duration, 0);
  return { cycles, duration, phase: random() * duration, amplitude: 7.5 + random() * 4.5 };
}

function orientation(random) {
  const value = random();
  if (value < 0.58) return 0;
  if (value < 0.76) return 180;
  return value < 0.88 ? 90 : 270;
}

/** A fresh volume, with horizontal/vertical planes and some inverted words. */
export function createCloudArrangement(ids, seed) {
  const names = [...new Set(ids)];
  const random = generator(newSeed(seed));
  const count = names.length;
  if (!count) return new Map();

  // Pair opposite directions: there is always as much cloud behind as in front.
  // The Fibonacci sequence spreads those directions over both hemispheres.
  const positions = [];
  const pairs = Math.ceil(count / 2);
  const yaw = random() * Math.PI * 2;
  for (let index = 0; index < pairs; index++) {
    const height = (index + 0.5) / pairs;
    const circle = Math.sqrt(1 - height * height);
    const angle = index * GOLDEN_ANGLE + yaw + (random() - 0.5) * 0.24;
    const direction = { u: Math.cos(angle) * circle, v: height, w: Math.sin(angle) * circle };
    for (const sign of [1, -1]) {
      if (positions.length === count) break;
      const radius = Math.cbrt(0.18 + random() * 0.82);
      positions.push({ u: direction.u * sign * radius,
        v: direction.v * sign * radius, w: direction.w * sign * radius });
    }
  }
  shuffle(positions, random);

  // A balanced set guarantees inverted and vertical words in the first view.
  const invertedCount = Math.floor(count * 0.18);
  const verticalCount = Math.ceil(count * 0.25);
  const angles = Array.from({ length: count }, (_, index) =>
    index < invertedCount ? 180 : index < invertedCount + verticalCount ? (index % 2 ? 90 : 270) : 0);
  shuffle(angles, random);
  const placements = new Map();
  names.forEach((id, index) => {
    const profileRandom = generator(hash(id) ^ newSeed(random() * 4294967296));
    placements.set(id, { ...positions[index], angle: angles[index], breath: breathingProfile(profileRandom) });
  });
  return placements;
}

/** Place a later addition without changing any of the existing placements. */
export function createWordPlacement(id, seed) {
  const random = generator(newSeed(seed) ^ hash(id));
  const height = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const radius = Math.cbrt(0.18 + random() * 0.82);
  const circle = Math.sqrt(1 - height * height);
  return { u: Math.cos(angle) * circle * radius, v: height * radius,
    w: Math.sin(angle) * circle * radius, angle: orientation(random), breath: breathingProfile(random) };
}

// Zero velocity and acceleration at every transition, including the holds.
function ease(value) {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * bounded * (bounded * (bounded * 6 - 15) + 10);
}

/** World-space depth offset. The caller owns the clock and can pause it. */
export function sampleBreath(profile, elapsedSeconds) {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  let time = (elapsed + profile.phase) % profile.duration;
  for (const cycle of profile.cycles) {
    if (time > cycle.duration) { time -= cycle.duration; continue; }
    let value;
    if (time < cycle.inhale) {
      value = -1 + (cycle.peak + 1) * ease(time / cycle.inhale);
    } else if (time < cycle.inhale + cycle.hold) {
      value = cycle.peak;
    } else if (time < cycle.inhale + cycle.hold + cycle.exhale) {
      value = cycle.peak - (cycle.peak + 1) * ease((time - cycle.inhale - cycle.hold) / cycle.exhale);
    } else {
      value = -1;
    }
    return value * profile.amplitude;
  }
  return -profile.amplitude;
}
