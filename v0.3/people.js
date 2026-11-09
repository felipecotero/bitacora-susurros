function field(tag, className, text = '') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export function createPersonProfile() {
  const panel = field('aside', 'person-profile');
  const kicker = field('p', 'person-profile-kicker', 'ficha en revisión');
  const name = field('h2', 'person-profile-name');
  const meta = field('div', 'person-profile-meta');
  const detail = field('p', 'person-profile-detail');
  const mediaButton = field('button', 'person-profile-media');
  const mediaLabel = field('span', 'person-profile-media-label');
  const mediaArrow = field('span', 'person-profile-media-arrow', '↗');
  mediaButton.type = 'button';
  mediaButton.setAttribute('aria-haspopup', 'dialog');
  mediaArrow.setAttribute('aria-hidden', 'true');
  mediaButton.append(mediaLabel, mediaArrow);
  meta.append(detail, mediaButton);
  const bio = field('p', 'person-profile-bio');
  const status = field('p', 'person-profile-status');
  name.id = 'person-profile-title';
  panel.setAttribute('aria-labelledby', name.id);
  panel.tabIndex = 0;
  panel.hidden = true;
  panel.append(kicker, name, meta, bio, status);
  document.body.append(panel);

  function open(person, placeLabel = '', hasWords = false, media = null) {
    name.textContent = person.name;
    kicker.textContent = person.inProgress ? 'ficha en construcción' : 'ficha del taller';
    detail.textContent = [person.role, placeLabel].filter(Boolean).join(' · ');
    bio.textContent = Array.from(String(person.bio || '')).slice(0, 500).join('');
    detail.hidden = !detail.textContent;
    mediaButton.hidden = !media;
    meta.hidden = !detail.textContent && !media;
    if (media) {
      mediaLabel.textContent = media.label;
      mediaButton.setAttribute('aria-label', `Ver ${media.label.toLocaleLowerCase('es')} de ${person.name}`);
      mediaButton.onclick = () => media.open(mediaButton);
    } else {
      mediaButton.onclick = null;
    }
    bio.hidden = !bio.textContent;
    status.textContent = hasWords ? '' : 'Materiales por incorporar.';
    status.hidden = hasWords;
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
