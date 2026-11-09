const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function seedValue(seed) {
  if (seed === undefined && globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  let result = 2166136261;
  for (const character of String(seed ?? Math.random())) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}
function randomFrom(seed) {
  let state = seed;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
// Exact critically damped response to one held camera target.
function follow(spring, target, seconds, frequency, maxLag) {
  const offset = spring.position - target;
  if (Math.abs(offset) > maxLag) {
    spring.position = target + Math.sign(offset) * maxLag;
    spring.velocity = 0;
  }
  const distance = spring.position - target;
  const coefficient = spring.velocity + frequency * distance;
  const decay = Math.exp(-frequency * seconds);
  spring.position = target + (distance + coefficient * seconds) * decay;
  spring.velocity = (spring.velocity - frequency * coefficient * seconds) * decay;
  if (Math.abs(spring.position - target) < 0.0001 && Math.abs(spring.velocity) < 0.0001) {
    spring.position = target;
    spring.velocity = 0;
  }
}
/**
 * Use a session-varying seed to change which words linger between visits.
 * x/y are unwrapped camera angles in radians. snap is for reduced motion.
 */
export function createOrbitFollower(seed, initialX = 0, initialY = 0) {
  const random = randomFrom(seedValue(seed));
  const lingers = random() < 0.25;
  const frequency = lingers ? 8 + random() * 5 : 22 + random() * 13;
  const maxLag = 0.10 + random() * 0.06;
  const x = { position: initialX, velocity: 0 };
  const y = { position: initialY, velocity: 0 };
  function update(targetX, targetY, dt, snap = false) {
    const tx = Number.isFinite(targetX) ? targetX : x.position;
    const ty = Number.isFinite(targetY) ? targetY : y.position;
    const seconds = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    if (snap) {
      x.position = tx;y.position = ty;x.velocity = y.velocity = 0;
    } else if (seconds) {
      follow(x, tx, seconds, frequency, maxLag);
      follow(y, ty, seconds, frequency, maxLag);
    }
    return { x: x.position, y: y.position,
      moving: x.position !== tx || y.position !== ty || x.velocity !== 0 || y.velocity !== 0 };
  }
  return { update };
}
