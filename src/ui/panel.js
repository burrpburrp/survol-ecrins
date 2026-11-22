// Panneau : destination, date et heure.
const $ = (id) => document.getElementById(id);
const GROUPS = [
  ['sommet', 'Sommets'], ['village', 'Villages'], ['col', 'Cols'], ['glacier', 'Glaciers'], ['lac', 'Lacs'], ['lieu', 'Lieux'],
];

export function createPanel({ places, onGo, onTime }) {
  const dest = $('dest');
  for (const [kind, title] of GROUPS) {
    const og = document.createElement('optgroup');
    og.label = title;
    places.forEach((p, i) => {
      if (p.kind !== kind) return;
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = p.alt ? `${p.name} (${p.alt.toLocaleString('fr-FR')} m)` : p.name;
      og.appendChild(o);
    });
    if (og.children.length) dest.appendChild(og);
  }
  const selected = () => places[Number(dest.value)];
  $('go').addEventListener('click', () => onGo(selected()));

  const date = $('date');
  const hour = $('hour');
  const out = $('hour-out');
  const today = new Date();
  date.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const emit = () => {
    const h = Number(hour.value);
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    out.textContent = `${hh} h ${String(mm).padStart(2, '0')}`;
    const [year, month, day] = date.value.split('-').map(Number);
    if (year) onTime({ year, month, day, hour: hh, minute: mm });
  };
  date.addEventListener('change', emit);
  hour.addEventListener('input', emit);
  emit();
  return { selected };
}
