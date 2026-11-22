"""Fabrique public/data/labels.json : noms affichés à l'écran (touche i).

Source : Overture Maps (thèmes base et divisions) et refuges OpenStreetMap (refuges-osm.json), lus directement sur S3 sans compte.
Les thèmes base et divisions viennent d'OpenStreetMap (licence ODbL) : « © contributeurs OpenStreetMap ».

    python3 -m pip install pyarrow
    python3 scripts/lieux/extraire.py 2026-11-18.0
"""
import json, math, re, sys
import pyarrow.dataset as ds
import pyarrow.fs as pfs

RELEASE = sys.argv[1] if len(sys.argv) > 1 else '2026-11-18.0'
BBOX = (5.80, 44.60, 6.85, 45.40)  # même zone que src/geo/frame.js
fs = pfs.S3FileSystem(anonymous=True, region='us-west-2')


def read(theme, cols):
    d = ds.dataset(f'overturemaps-us-west-2/release/{RELEASE}/{theme}', filesystem=fs, format='parquet')
    f = lambda k: ds.field('bbox', k)
    flt = (f('xmin') > BBOX[0]) & (f('xmax') < BBOX[2]) & (f('ymin') > BBOX[1]) & (f('ymax') < BBOX[3])
    cols = [c for c in cols + ['names', 'bbox'] if c in d.schema.names]
    return [r for r in d.to_table(columns=cols, filter=flt).to_pylist() if (r.get('names') or {}).get('primary')]


def centre(r):
    b = r['bbox']
    return (b['ymin'] + b['ymax']) / 2, (b['xmin'] + b['xmax']) / 2


out = []  # [nom, genre, altitude ou None, lat, lon, portée en km]


def add(name, kind, alt, lat, lon, reach):
    out.append([name.strip(), kind, None if alt is None else round(alt), round(lat, 5), round(lon, 5), reach])


for r in read('theme=base/type=land', ['subtype', 'class', 'elevation']):
    lat, lon = centre(r)
    name, cls, alt = r['names']['primary'], r['class'], r.get('elevation')
    if cls == 'peak':
        reach = 40 if (alt or 0) >= 3500 else 25 if (alt or 0) >= 3000 else 15 if (alt or 0) >= 2500 else 8
        add(name, 'sommet', alt, lat, lon, reach)
    elif cls == 'saddle':
        add(name, 'col', alt, lat, lon, 10)
    elif cls == 'glacier':
        add(name, 'glacier', None, lat, lon, 15)

for r in read('theme=base/type=water', ['subtype', 'class']):
    lat, lon = centre(r)
    if r['class'] in ('lake', 'reservoir'):
        add(r['names']['primary'], 'lac', None, lat, lon, 12)
    elif r['class'] == 'pond':
        add(r['names']['primary'], 'lac', None, lat, lon, 4)

for r in read('theme=divisions/type=division', ['subtype', 'class', 'population']):
    if r['subtype'] != 'locality':
        continue
    lat, lon = centre(r)
    big = r['class'] in ('town', 'city') or (r.get('population') or 0) > 3000
    add(r['names']['primary'], 'village', None, lat, lon, 25 if big else 15 if r['class'] == 'village' else 5)

# Refuges : les adresses d'Overture « places » sont souvent celles du bureau en vallée, donc fausses.
# On prend les refuges d'OpenStreetMap (tourism=alpine_hut), relevés une fois par Overpass et gardés
# dans refuges-osm.json : [nom, altitude, lat, lon].
import os
PAS_UN_REFUGE = re.compile(r"(?i)^(g[iî]te|auberge|bergerie|le rocher|le pas|au dessus|local hors)|ancien")
for name, alt, lat, lon in json.load(open(os.path.join(os.path.dirname(__file__), 'refuges-osm.json'))):
    if not PAS_UN_REFUGE.search(name):
        add(name, 'refuge', alt, lat, lon, 8)

import unicodedata


def norm(name):
    s = unicodedata.normalize('NFD', name.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return ' '.join(w for w in re.split(r"[\s'-]+", s) if w not in ('de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'chalet', 'refuge'))


# Doublons (même nom, même genre, proches ; les refuges sont souvent saisis plusieurs fois) : on garde le premier.
seen, labels = {}, []
for p in out:
    key = (norm(p[0]), p[1])
    near = 1500 if p[1] == 'refuge' else 500
    if any(math.hypot((p[3] - q[3]) * 111000, (p[4] - q[4]) * 78000) < near for q in seen.get(key, [])):
        continue
    seen.setdefault(key, []).append(p)
    labels.append(p)

json.dump({
    'source': f'Overture Maps {RELEASE} ; © contributeurs OpenStreetMap (ODbL)',
    'fields': ['nom', 'genre', 'altitude', 'lat', 'lon', 'portee_km'],
    'labels': labels,
}, open('public/data/labels.json', 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(labels), Counter(p[1] for p in labels))
