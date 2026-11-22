# Survol des Écrins

**Un simulateur de vol tranquille, en planeur, au-dessus des Alpes du Dauphiné, dans le navigateur.**

Le relief est celui du LiDAR HD de l'IGN, précis au mètre, et le sol est habillé des orthophotos aériennes à 20 cm. Tout est chargé en direct depuis [cartes.gouv.fr](https://cartes.gouv.fr) pendant le vol : il n'y a rien à installer, et aucun serveur applicatif. On reconnaît les sommets, les glaciers, les villages et les refuges comme depuis un vrai vol.

La zone couvre les Écrins, Belledonne, les Grandes Rousses, les Arves, le Briançonnais et le haut Queyras, soit environ 85 × 90 km (de 44,6° à 45,4° N et de 5,8° à 6,85° E).

## Ce qu'on peut faire

- **Voler sans risque de s'écraser.** Le planeur ne perd pas d'altitude tout seul, revient à plat quand on lâche les commandes et remonte de lui-même devant le relief. On peut descendre au fond des vallées, jusqu'à 50 m du sol.
- **Se laisser porter.** On choisit une destination (la Meije, la Barre des Écrins, le Glacier Blanc…) et le pilote automatique y va, puis tourne autour du lieu.
- **Trois allures** : Flânerie (80 km/h), Promenade (150 km/h) et Voyage (600 km/h), pour traverser le massif en quelques minutes.
- **Regarder autour de soi** : devant, à gauche, à droite, derrière ou sous le planeur.
- **Les noms des lieux dans le paysage** : environ 5 000 sommets (avec leur altitude), cols, lacs, villages, glaciers et refuges. Un nom caché par une montagne n'est pas affiché.
- **Une carte IGN** dans un coin, avec le planeur, son cap, la destination et la distance restante.
- **Le soleil du jour et de l'heure choisis** : éclairage des versants, couleur du ciel et brume selon l'altitude.
- **Un affichage immersif**, sans rien d'autre que le paysage.

## Commandes

| Touche | Effet |
|---|---|
| ← → | Tourner |
| ↑ ↓ | Piquer, cabrer (comme un manche d'avion) |
| + − | Changer d'allure |
| Pavé numérique 8 4 6 2 0 | Regarder devant, à gauche, à droite, derrière, dessous |
| i | Noms des lieux |
| m | Carte |
| h | Affichage immersif |
| Espace | Pause |

Le bouton **?** à l'écran met en pause et rappelle ces commandes.

## Comment ça marche

Le site est **entièrement statique** : un fichier HTML, du JavaScript et deux petits fichiers de données. C'est le navigateur du visiteur qui interroge directement les services de l'IGN, qui autorisent ces appels depuis n'importe quel site (CORS).

- **Relief** : le terrain est découpé en carrés emboîtés, de 131 km de côté pour le plus grand à 256 m pour le plus fin. Plus un carré est proche, plus il est détaillé. Chaque carré est une grille de 257 × 257 altitudes demandée au service WMS-R de l'IGN (modèle LiDAR HD, avec repli sur le RGE ALTI).
- **Image du sol** : une orthophoto de 512 × 512 pixels par carré, dans la même projection (Lambert-93), donc parfaitement calée sur le relief.
- **Moteur** : [Three.js](https://threejs.org). Les requêtes passent par un Web Worker et le cache du navigateur, donc un lieu déjà survolé se recharge instantanément.
- **Noms des lieux** : `public/data/labels.json`, préparé une fois pour toutes à partir d'OpenStreetMap (voir plus bas).

Le détail technique est dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## L'installer chez soi

Il suffit d'un hébergement capable de servir des fichiers statiques en HTTPS. Pas de base de données, pas de PHP, pas de Node sur le serveur.

La marche à suivre est dans [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) : prérequis, construction du site, et trois façons de le publier (GitHub Pages, n'importe quel hébergement par copie de fichiers, ou un serveur qui se met à jour seul depuis GitHub).

## Développer

Il faut Node 20 ou plus récent.

```bash
npm ci
npm run dev        # site local sur http://localhost:5173
npm test           # tests unitaires (Vitest)
npm run test:e2e   # scénarios dans un vrai navigateur (Playwright)
npm run build      # site final dans dist/
```

Quelques réglages par l'adresse, utiles pour tester :

| Paramètre | Effet |
|---|---|
| `?debug` | Panneau de mesure : images par seconde, temps des requêtes, carrés affichés |
| `?stride=1` | Maillage en pleine finesse, pour une bonne carte graphique. La valeur par défaut est 2 ; 4, 8 ou 16 conviennent à une machine modeste |
| `?ortho=wmts` | Orthophoto en tuiles WMTS au lieu du WMS-R, pour comparer (plus lent en pratique) |

## Données et licences

- Code : [licence MIT](LICENSE). Libre de le reprendre, le modifier et le publier, en gardant la mention de copyright.
- Relief, orthophotos et carte : © IGN, cartes.gouv.fr, [licence ouverte Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
- Noms des lieux : © contributeurs OpenStreetMap, sous [licence ODbL](https://opendatacommons.org/licenses/odbl/), extraits via [Overture Maps](https://overturemaps.org).

Les mentions IGN et OpenStreetMap sont affichées en permanence en bas de l'écran ; elles doivent le rester.

### Refaire le fichier des noms

```bash
python3 -m pip install pyarrow
python3 scripts/lieux/extraire.py 2026-11-18.0   # numéro de version d'Overture Maps
```

Le script lit Overture Maps directement sur son stockage public, sans compte, et ne garde que la zone survolée. Les refuges viennent d'une liste OpenStreetMap (`scripts/lieux/refuges-osm.json`), plus fiable pour leur position.
