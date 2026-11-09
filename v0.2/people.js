// These lines are invented for the prototype. They do not assign a sign to anyone.
const outlines = [
  [[-.64, -.42], [-.38, .12], [-.06, .56], [.20, .23], [.41, -.12], [.64, -.55]],
  [[-.65, -.32], [-.47, .18], [-.20, .52], [.13, .51], [.43, .12], [.58, -.39], [.30, -.60]],
  [[-.65, .52], [-.43, .02], [-.21, -.43], [.16, -.62], [.55, -.34], [.57, .12], [.27, .48]],
  [[-.61, -.53], [-.32, -.22], [-.52, .28], [-.13, .58], [.19, .40], [.49, .55], [.64, -.12]],
  [[-.62, .35], [-.35, -.14], [-.12, -.56], [.20, -.37], [.45, .06], [.64, .52]],
  [[-.65, -.14], [-.43, -.53], [-.10, -.28], [.05, .20], [.33, .54], [.62, .34], [.54, -.16]]
];

export function getPersonConstellation(personId, count) {
  const size = Math.max(0, Math.trunc(count));
  if (!size) return [];

  let seed = 0;
  for (const letter of String(personId)) {
    seed = (seed * 31 + letter.codePointAt(0)) >>> 0;
  }
  const outline = outlines[seed % outlines.length];
  let total = 0;
  const segments = outline.slice(1).map(([u, v], index) => {
    const [startU, startV] = outline[index];
    const length = Math.hypot(u - startU, v - startV);
    const segment = {startU, startV, u, v, start: total, length};
    total += length;
    return segment;
  });

  return Array.from({length: size}, (_, index) => {
    const progress = size === 1 ? .5 : index / (size - 1);
    const distance = progress * total;
    const segment = segments.find(part => part.start + part.length >= distance)
      ?? segments.at(-1);
    const offset = (distance - segment.start) / segment.length;
    return {
      u: segment.startU + (segment.u - segment.startU) * offset,
      v: segment.startV + (segment.v - segment.startV) * offset,
      w: .21 * Math.sin(progress * Math.PI * 2 + seed % 11),
      angle: 0
    };
  });
}

function field(tag, className, text = '') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export function createPersonProfile() {
  const panel = field('aside', 'person-profile');
  const kicker = field('p', 'person-profile-kicker', 'perfil de ensayo');
  const name = field('h2', 'person-profile-name');
  const detail = field('p', 'person-profile-detail');
  const bio = field('p', 'person-profile-bio');
  const geometry = field('p', 'person-profile-geometry', 'constelación de ensayo');
  name.id = 'person-profile-title';
  panel.setAttribute('aria-labelledby', name.id);
  panel.tabIndex = 0;
  panel.hidden = true;
  panel.append(kicker, name, detail, bio, geometry);
  document.body.append(panel);

  function open(person, placeLabel = '') {
    name.textContent = person.name;
    detail.textContent = [person.role, placeLabel].filter(Boolean).join(' · ');
    bio.textContent = Array.from(String(person.bio || '')).slice(0, 500).join('');
    detail.hidden = !detail.textContent;
    bio.hidden = !bio.textContent;
    panel.hidden = false;
    panel.scrollTop = 0;
    document.body.classList.add('has-person-profile');
  }

  function close() {
    panel.hidden = true;
    document.body.classList.remove('has-person-profile');
  }

  return {open, close};
}
