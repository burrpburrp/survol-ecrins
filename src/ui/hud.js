// Affichage tête haute : altitude, vitesse, cap, lieu proche, pilote automatique, chargement.
const $ = (id) => document.getElementById(id);
const fmt = (v) => Math.round(v).toLocaleString('fr-FR');
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function headingName(rad) {
  const deg = ((rad * 180) / Math.PI + 360) % 360;
  return `${POINTS[Math.round(deg / 45) % 8]} (${fmt(deg) === '360' ? '0' : fmt(deg)}°)`;
}

export function createHud() {
  const el = {
    alt: $('hud-alt'), speed: $('hud-speed'), heading: $('hud-heading'), place: $('hud-place'),
    ap: $('hud-autopilot'), loading: $('hud-loading'), message: $('message'),
    allure: $('hud-allure'), view: $('hud-view'), target: $('hud-target'), note: $('panel-note'),
  };
  let messageUntil = 0;
  return {
    update({ glider, near, autopilot, loading, reliefDown, now, allureName, viewName, target }) {
      el.target.textContent = target ? `${target.place.name} : ${target.distanceText}` : '—';
      el.allure.textContent = allureName;
      el.view.textContent = `Vue : ${viewName}`;
      el.alt.textContent = `${fmt(glider.y)} m`;
      el.speed.textContent = `${fmt(glider.speed * 3.6)} km/h`;
      el.heading.textContent = headingName(glider.heading);
      el.place.textContent = near?.place
        ? `${near.place.name}${near.distance > 1500 ? ` (${(near.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km)` : ''}`
        : '—';
      el.ap.hidden = !autopilot.active;
      if (autopilot.active) el.ap.textContent = `Pilote auto : ${autopilot.target.name}`;
      el.loading.hidden = loading === 0;
      el.loading.textContent = `Chargement du relief : ${loading} carré${loading > 1 ? 's' : ''}`;
      // Incident réseau passager : une ligne discrète dans le panneau, pas un bandeau.
      el.note.hidden = !reliefDown;
      if (reliefDown) el.note.textContent = 'Relief en partie indisponible, nouvel essai…';
      if (now > messageUntil) el.message.hidden = true;
    },
    flash(text, now, seconds = 4) {
      el.message.hidden = false;
      el.message.textContent = text;
      messageUntil = now + seconds;
    },
  };
}
