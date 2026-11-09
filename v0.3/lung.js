// A quiet shared breath. Regions sample its recent past at different delays.
const RESTING = { x: 0.975, y: 0.982, z: 0.970 };
const AXES = ['x', 'y', 'z'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function seedValue(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  if (seed !== undefined) {
    let hash = 2166136261;
    for (const character of String(seed)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return hash >>> 0;
  }
  return globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 4294967296);
}
function generator(seed) {
  let state = seed;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
// Zero velocity and acceleration at the start and end of each transition.
function soften(value) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function bump(progress) {
  return progress < 0.5 ? soften(progress * 2) : soften((1 - progress) * 2);
}
function nextCycle(random) {
  const inhale = 5 + random() * 4;
  const hold = 0.7 + random() * 1.4;
  const exhale = 6.5 + random() * 5;
  const rest = 1 + random() * 2;
  const tension = random() < 0.35;
  return {
    inhale, hold, exhale, rest,
    duration: inhale + hold + exhale + rest,
    full: { x: 1.022 + random() * 0.018, y: 1.014 + random() * 0.016, z: 1.030 + random() * 0.020 },
    // Some breaths briefly gather themselves mid-way; most are uninterrupted.
    retention: tension ? {
      phase: random() < 0.5 ? 'inhale' : 'exhale',
      middle: 0.35 + random() * 0.25,
      width: 0.045 + random() * 0.065,
      level: 0.38 + random() * 0.24,
    } : null,
    peakTension: tension ? 0.009 + random() * 0.013 : 0,
    lowTension: tension ? 0.007 + random() * 0.009 : 0,
  };
}
function progressAt(progress, retention) {
  if (!retention) return soften(progress);
  const before = retention.middle - retention.width / 2;
  const after = retention.middle + retention.width / 2;
  if (progress < before) return retention.level * soften(progress / before);
  if (progress < after) return retention.level;
  return retention.level + (1 - retention.level) * soften((progress - after) / (1 - after));
}
function breathing(cycle, elapsed) {
  if (elapsed < cycle.inhale) {
    const retention = cycle.retention?.phase === 'inhale' ? cycle.retention : null;
    return { amount: progressAt(elapsed / cycle.inhale, retention), phase: 'inhale' };
  }
  elapsed -= cycle.inhale;
  if (elapsed < cycle.hold) return { amount: 1 + cycle.peakTension * bump(elapsed / cycle.hold), phase: 'hold' };
  elapsed -= cycle.hold;
  if (elapsed < cycle.exhale) {
    const retention = cycle.retention?.phase === 'exhale' ? cycle.retention : null;
    return { amount: 1 - progressAt(elapsed / cycle.exhale, retention), phase: 'exhale' };
  }
  elapsed -= cycle.exhale;
  return { amount: -cycle.lowTension * bump(elapsed / cycle.rest), phase: 'rest' };
}
function stepSpring(spring, target, dt) {
  const frequency = 5.5, damping = 0.72;
  const attenuation = damping * frequency;
  const angular = frequency * Math.sqrt(1 - damping * damping);
  const decay = Math.exp(-attenuation * dt);
  const cosine = Math.cos(angular * dt), sine = Math.sin(angular * dt);
  const offset = spring.position - target, velocity = spring.velocity;
  spring.position = target + decay * (offset * cosine + (velocity + attenuation * offset) / angular * sine);
  spring.velocity = decay * (velocity * cosine - (attenuation * velocity + frequency * frequency * offset) / angular * sine);
  if (Math.abs(spring.position) > 0.017) {
    spring.position = clamp(spring.position, -0.017, 0.017);
    if (spring.position * spring.velocity > 0) spring.velocity = 0;
  }
}

/**
 * update(dtSeconds, enabled) returns {x,y,z,phase}; axes scale positions, not text.
 * sample(delaySeconds) returns this body up to 1.25 seconds earlier.
 * touch uses normalized screen coordinates; drag uses viewport fractions + px/s.
 */
export function createLung(seed) {
  const random = generator(seedValue(seed));
  let cycle = nextCycle(random), elapsed = 0, clock = 0, contact = null;
  const stretch = { x: 0, y: 0, z: 0 };
  const springs = Object.fromEntries(AXES.map(axis => [axis, { position: 0, velocity: 0 }]));
  let pose = { ...RESTING, phase: 'inhale' };
  const history = [{ time: 0, ...pose }];

  function update(dt, enabled = true) {
    const seconds = clamp(number(dt), 0, 0.05);
    if (!enabled || !seconds) return { ...pose };
    elapsed += seconds;clock += seconds;
    while (elapsed >= cycle.duration) {
      elapsed -= cycle.duration;
      cycle = nextCycle(random);
    }
    const breath = breathing(cycle, elapsed);
    const contactCompression = contact ? 0.003 + contact.pressure * 0.007 : 0;
    const targets = {
      x: -contactCompression * (0.6 + 0.6 * Math.abs(contact?.x || 0)) + stretch.x,
      y: -contactCompression * (0.6 + 0.6 * Math.abs(contact?.y || 0)) + stretch.y,
      z: -contactCompression * (1.15 - 0.18 * Math.hypot(contact?.x || 0, contact?.y || 0)) + stretch.z,
    };
    const next = { phase: breath.phase };
    for (const axis of AXES) {
      stepSpring(springs[axis], targets[axis], seconds);
      next[axis] = clamp(RESTING[axis] + (cycle.full[axis] - RESTING[axis]) * breath.amount + springs[axis].position, 0.94, 1.067);
      stretch[axis] *= Math.exp(-2.4 * seconds);
    }
    pose = next;
    history.push({ time: clock, ...pose });
    while (history.length > 400 || (history.length > 2 && history[1].time < clock - 2.5)) history.shift();
    return { ...pose };
  }
  function sample(delaySeconds = 0) {
    const delay = clamp(number(delaySeconds), 0, 1.25);
    if (!delay) return { ...pose };
    const time = clock - delay;
    if (time <= history[0].time) {
      const { x, y, z, phase } = history[0];
      return { x, y, z, phase };
    }
    let left = 0, right = history.length - 1;
    while (right - left > 1) {
      const middle = (left + right) >> 1;
      if (history[middle].time <= time) left = middle;
      else right = middle;
    }
    const a = history[left], b = history[right];
    const amount = clamp((time - a.time) / (b.time - a.time || 1), 0, 1);
    return { x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount,
      z: a.z + (b.z - a.z) * amount, phase: a.phase };
  }
  function touch(x, y, pressure = 0.5) {
    contact = { x: clamp(number(x), -1, 1), y: clamp(number(y), -1, 1), pressure: clamp(number(pressure, 0.5), 0, 1) };
  }
  function drag(dx, dy, speed) {
    if (!contact) return;
    const horizontal = Math.abs(clamp(number(dx), -0.25, 0.25));
    const vertical = Math.abs(clamp(number(dy), -0.25, 0.25));
    const force = 0.35 + clamp(number(speed) / 2000, 0, 1);
    stretch.x = clamp(stretch.x + (horizontal * 0.15 - vertical * 0.045) * force, -0.010, 0.012);
    stretch.y = clamp(stretch.y + (vertical * 0.15 - horizontal * 0.045) * force, -0.010, 0.012);
    stretch.z = clamp(stretch.z - (horizontal + vertical) * 0.04 * force, -0.010, 0.008);
  }
  function release() {
    contact = null;
    stretch.x = stretch.y = stretch.z = 0;
  }
  return { update, sample, touch, drag, release };
}
