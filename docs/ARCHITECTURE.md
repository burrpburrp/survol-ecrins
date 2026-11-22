# Architecture

Ce document décrit comment le simulateur est construit, pour qui voudrait le modifier ou l'adapter à une autre région.

## Principes

- **Site statique.** Aucun code ne tourne sur le serveur. Le navigateur charge le programme, puis interroge directement les services publics de l'IGN.
- **Données à jour sans préparation.** Relief et orthophotos sont demandés à la volée, au fil du vol. Seuls les noms des lieux sont préparés à l'avance (un fichier de 260 ko).
- **Fluide sur une machine ordinaire.** Le premier objectif est une carte graphique intégrée de PC portable ; on vise 50 images par seconde.
- **Impossible de s'écraser.** Le modèle de vol est volontairement indulgent : c'est une promenade, pas un entraînement au pilotage.

## Repères et projection

Tout est calculé en **Lambert-93** (EPSG:2154), la projection officielle française, celle des données IGN. Dans la scène 3D, on utilise un repère local en mètres :

- `x = E − 962 000` (vers l'est) ;
- `z = −(N − 6 439 000)` (vers le sud) ;
- `y` = altitude.

L'origine est au centre de la zone, près de la Meije. Les conversions WGS84 ↔ Lambert-93 ↔ repère local sont dans `src/geo/`.

## Les modules

| Dossier | Rôle |
|---|---|
| `src/geo/` | Projection Lambert-93, repère local, limites de la zone |
| `src/tiles/` | Découpage en carrés, file de requêtes, cache, sources de données IGN |
| `src/render/` | Maillage du terrain, matériau (orthophoto, soleil, brume), ciel |
| `src/flight/` | Modèle de vol du planeur et pilote automatique |
| `src/sun/` | Position du soleil selon la date et l'heure |
| `src/ui/` | Affichage tête haute, panneau, commandes, noms des lieux, carte |
| `src/main.js` | Assemblage et boucle d'animation |

### Carrés de terrain (`src/tiles/`)

Le terrain est un **arbre de carrés emboîtés** (quadtree). La racine fait 131 072 m de côté ; chaque niveau divise le côté par deux, jusqu'au niveau 9 (256 m).

- **Choix du détail** (`quadtree.js`) : un carré est découpé tant que sa distance au point de vue est inférieure à son côté. La distance combine l'écart horizontal et l'écart vertical entre le planeur et le relief *de ce carré*. Une paroi à hauteur du planeur est donc détaillée, même si le fond de la vallée est loin en dessous.
- **Contenu d'un carré** : 257 × 257 altitudes et une orthophoto de 512 × 512 pixels. Les bords sont partagés entre voisins, donc pas de fissure. Une « jupe » verticale masque les petits écarts entre niveaux différents.
- **Sources** (`sources/ign.js`) :
  - relief par WMS-R au format BIL 32 bits, en essayant dans l'ordre le modèle numérique de surface LiDAR HD, le modèle de terrain LiDAR HD, puis le RGE ALTI ;
  - orthophoto par WMS-R en JPEG, dans la même bbox Lambert-93 (`sources/wmts.js` propose aussi des tuiles WMTS recalées).
- **File de requêtes** (`queue.js`) : priorité aux carrés grossiers, puis aux plus proches. Les requêtes devenues inutiles sont annulées, et un échec est retenté après 1, 2 puis 4 s. Six requêtes au plus en même temps vers l'IGN.
- **Cache** (`cache.js`) : le relief est gardé dans le cache du navigateur (Cache API), et 300 carrés au plus en mémoire.
- **Web Worker** (`worker.js`) : le téléchargement et le décodage se font hors du fil principal, pour ne pas saccader l'image.

### Rendu (`src/render/`)

- Three.js 0.170, avec un tampon de profondeur logarithmique : on voit à la fois le sol à 50 m et les sommets à 100 km.
- Matériau maison : orthophoto, éclairage de Lambert par le soleil, lumière du ciel, et brume calculée selon l'altitude (l'air est plus fin en haut).
- Maillage allégé d'un point sur deux par défaut (`?stride=2`). Cela double la fluidité sur une carte intégrée, sans différence visible.
- Deux carrés au plus construits par image, pour éviter les à-coups.

### Vol (`src/flight/`)

- **Planeur** (`glider.js`) : la vitesse est constante pour chaque allure (80, 150, 600 km/h), avec un passage progressif de l'une à l'autre. Les commandes sont adoucies : il faut environ une seconde pour atteindre la position demandée. On peut incliner jusqu'à 60°, piquer ou cabrer jusqu'à 35°. Le taux de virage suit l'inclinaison, comme un vrai virage coordonné.
- **Protection du relief** : le modèle regarde le terrain sur les 8 prochaines secondes de vol. En piqué, la descente s'adoucit à l'approche du sol et s'arrête à 50 m. Devant une pente, le planeur se cabre tout seul. Un plancher absolu le maintient à au moins 40 m du sol.
- **Pilote automatique** (`autopilot.js`) : il met le cap sur le lieu choisi, puis tourne autour en le gardant à droite. Il vole calmement (27° d'inclinaison au plus) et repasse en Promenade près du but. Toute action sur les flèches gauche ou droite reprend la main.

### Interface (`src/ui/`)

- **Noms des lieux** (`labels.js`) : on garde les lieux à portée (la portée dépend du type et de l'altitude), devant la caméra et sans chevauchement à l'écran. Pour chacun, on suit le trait de visée sur le relief : si une montagne le coupe, le nom n'est pas affiché. Ce tri est refait cinq fois par seconde, et la position à l'écran à chaque image.
- **Carte** (`minimap.js`) : tuiles Plan IGN en WMTS (Web Mercator), centrées sur le planeur, nord en haut.

## Adapter à une autre région

Les services de l'IGN couvrent toute la France. Pour une autre zone :

1. Changer le centre du repère et la racine du quadtree (`src/geo/frame.js` : `ROOT`, `ZONE`).
2. Refaire `public/data/places.json` (les destinations du panneau) et `public/data/labels.json` (bbox en tête de `scripts/lieux/extraire.py`).
3. Choisir le point de départ dans `src/main.js`.

## Tests

- `tests/` : tests unitaires Vitest (projection, découpage, file de requêtes, modèle de vol, noms des lieux, carte…).
- `e2e/` : scénarios Playwright dans un vrai navigateur, avec un faux service IGN. Ils lancent le vol, utilisent les touches et vérifient l'affichage.
