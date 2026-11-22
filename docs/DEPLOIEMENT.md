# Mettre le simulateur en ligne

## Ce qu'il faut

| | |
|---|---|
| **Hébergement** | N'importe quel hébergement qui sert des fichiers statiques. Pas de PHP, pas de base de données, pas de Node sur le serveur. |
| **HTTPS** | Fortement conseillé. Les services de l'IGN sont en HTTPS, et un navigateur refuse souvent de mélanger les deux. |
| **Place** | Environ 1 Mo. Le relief et les photos ne sont pas stockés chez vous : chaque visiteur les reçoit directement de l'IGN. |
| **Adresse** | À la racine d'un domaine (`https://exemple.fr/`) ou dans un sous-dossier (`https://exemple.fr/ecrins/`). Les liens internes sont relatifs. |
| **Pour construire** | Node 20 ou plus récent, sur votre poste ou dans GitHub Actions. Le serveur n'en a pas besoin. |
| **Côté visiteur** | Un navigateur récent avec WebGL 2 (Chrome, Edge, Firefox, Safari). Un clavier, pour piloter. |

Aucune clé d'accès n'est nécessaire : les services de cartes.gouv.fr utilisés sont publics et autorisent les appels depuis n'importe quel site. Pour un usage intensif (beaucoup de visiteurs), lisez les [conditions d'utilisation de cartes.gouv.fr](https://cartes.gouv.fr).

## Construire le site

```bash
npm ci
npm run build
```

Le site prêt à servir est dans `dist/` : `index.html`, un dossier `assets/` et un dossier `data/`. C'est tout ce qu'il faut copier.

## Trois façons de publier

### 1. Copier `dist/` sur n'importe quel hébergement

Envoyez le contenu de `dist/` dans le dossier public de votre site, par FTP, SFTP, `rsync` ou le gestionnaire de fichiers de votre hébergeur. À refaire après chaque `npm run build`.

### 2. GitHub Pages

Pour une copie (fork) de ce dépôt sur GitHub :

1. Dans l'onglet **Actions**, autoriser les workflows (GitHub les désactive sur une copie), puis faire un premier envoi sur `main` : la branche `site` est créée.
2. Dans **Settings → Pages**, choisir comme source la branche `site`, dossier `/ (root)`.
3. Le site est alors à l'adresse `https://VOTRE-COMPTE.github.io/survol-ecrins/`.

La branche `site` est mise à jour automatiquement (voir ci-dessous).

### 3. Un serveur qui se met à jour depuis GitHub

C'est la méthode utilisée pour la version en ligne. Elle convient à tout serveur où l'on a un accès SSH avec `git`, même un petit hébergement mutualisé : le serveur ne construit rien et n'a besoin ni de beaucoup de mémoire, ni de Node.

**Comment ça marche :**

1. À chaque envoi sur la branche `main`, GitHub Actions (`.github/workflows/site.yml`) lance les tests, construit le site et publie le résultat sur la branche `site`. Aucun secret n'est nécessaire : l'action utilise le jeton fourni par GitHub.
2. Sur le serveur, `scripts/deploy.sh` récupère la branche `site` et la copie dans le dossier public du site. Le dépôt est lu en HTTPS public : aucune clé SSH ni aucun mot de passe GitHub sur le serveur.

```
envoi sur main ──▶ GitHub Actions : tests + construction ──▶ branche « site »
                                                                   │
                         serveur : scripts/deploy.sh  ◀── git fetch (HTTPS, lecture seule)
                                   │
                                   └──▶ copie dans le dossier public du site
```

**Installation, une seule fois, en SSH sur le serveur :**

```bash
git clone https://github.com/VOTRE-COMPTE/survol-ecrins ~/survol-ecrins-src
```

**Mise en ligne :**

```bash
SURVOL_DEST=~/chemin/du/site ~/survol-ecrins-src/scripts/deploy.sh
```

Réglages possibles, par variables d'environnement :

| Variable | Rôle | Par défaut |
|---|---|---|
| `SURVOL_DEST` | Dossier public du site, servi par le serveur web | `~/www/survol-ecrins` |
| `SURVOL_SITE` | Copie locale de la branche `site` | `~/survol-ecrins-site` |
| `SURVOL_REPO` | Dépôt d'où vient la branche `site` | le dépôt cloné dans `~/survol-ecrins-src` |

Le script :

- met d'abord à jour sa propre copie de `main`, pour avoir la dernière version du script ;
- copie avec `rsync` s'il est installé, sinon avec `tar` ;
- ne touche à rien en dehors de `SURVOL_DEST`, et n'efface jamais un sous-dossier `data/` déjà présent sur le serveur.

**Mise en ligne automatique :** mettez la même commande dans une tâche planifiée (`cron`, ou l'équivalent de votre hébergeur), par exemple toutes les heures. Sans changement, elle ne fait rien de visible.

## Vérifier

Ouvrez l'adresse du site :

1. l'écran d'accueil s'affiche ; le bouton « Décoller » devient actif dès que le premier relief est chargé ;
2. après le décollage, le paysage apparaît en quelques secondes ;
3. avec `?debug` à la fin de l'adresse, le panneau de mesure indique les images par seconde et les temps de réponse de l'IGN.

Si le paysage reste gris, ouvrez la console du navigateur (F12) : un blocage des requêtes vers `data.geopf.fr` vient presque toujours d'une page servie en HTTP, ou d'une politique de sécurité (`Content-Security-Policy`) trop stricte chez l'hébergeur. Il faut alors autoriser `https://data.geopf.fr` dans `connect-src` et `img-src`.
