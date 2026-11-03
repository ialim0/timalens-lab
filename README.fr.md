<p><img src="web/img/timalens-logo.png" alt="TimaLens" height="40"></p>

# TimaLens Lab

**D'une leçon qu'on regarde à une expérience qu'on vit.** · [Read in English](README.md)

Un enseignant téléverse un cours sur les circuits électriques : un PDF, un fichier Word ou PowerPoint, une photo du tableau ou d'une page de cahier, ou l'enregistrement de la classe. Une minute plus tard, il obtient un laboratoire interactif à partager avec ses élèves par un simple lien. Dans le labo, les élèves :

- construisent de vrais circuits en courant continu et les modifient ;
- lisent les appareils de mesure ;
- tracent U(I) ;
- relèvent des défis ;
- posent leurs questions à un tuteur qui connaît le cours et voit leur circuit ;
- passent du **schéma 2D** à une **paillasse 3D** aux composants réalistes ;
- à la fin, **téléchargent la vidéo MP4 de leur propre labo**, ou la sauvegardent sous forme de lien que le professeur peut revoir.

Le labo fonctionne sur un petit téléphone et résiste à une mauvaise connexion.

## Ce qui le rend différent

Les simulateurs comme PhET sont excellents, mais génériques : le même labo pour toutes les classes. TimaLens Lab construit le labo **à partir du cours de l'enseignant**. Il en garde :

- la notation (U ou V) et le niveau ;
- les exemples travaillés ;
- les erreurs contre lesquelles le cours met en garde.

Le tuteur répond à partir de ce cours, avec les valeurs du circuit de l'élève.

## Comment ça marche

1. **Muse Spark lit tout le cours.** Les photos et les PDF scannés passent par la vision de Muse Spark ; les cours enregistrés, par Muse Voice Transcribe.
2. **Muse Spark écrit le labo en JSON structuré :**
   - circuits de départ ;
   - expériences guidées (prédis → teste/mesure → observe) ;
   - défis avec objectifs ;
   - quiz, formules, erreurs fréquentes ;
   - vue 2D ou 3D.
3. **Le moteur de circuits vérifie tout** (`web/js/labcheck.js`). Il résout chaque circuit et explore les réglages que l'élève peut toucher, pour prouver que chaque défi est faisable sans être déjà réussi au départ. Chaque problème repart vers Muse Spark en mots simples, jusqu'à 3 fois.
4. **L'élève expérimente.** Le même moteur tourne dans son navigateur.

**L'IA configure le labo ; elle ne calcule jamais la physique.** Chaque tension, intensité et éclat vient de `web/js/circuit.js`, un solveur déterministe :

- analyse nodale modifiée ;
- piles avec résistance interne ;
- modèle de DEL par morceaux ;
- lampes avec éclat et claquage ;
- détection des courts-circuits.

## Un moteur, trois vues

- **2D** : les symboles de l'école française, avec des charges dont la vitesse suit l'intensité.
- **3D** (three.js, chargé seulement si l'élève le demande) :
  - les résistances portent leur vrai code couleur ;
  - les lampes brillent selon la puissance calculée, faiblement en série et à plein en dérivation ;
  - une DEL qui grille devient noire et fume ;
  - les multimètres affichent la valeur calculée.

  Muse Spark choisit la vue d'ouverture selon le cours ; le professeur peut l'imposer et l'élève peut toujours changer.
- **Vidéo** : chaque séance est enregistrée comme un journal de quelques Ko. La vidéo est recalculée image par image à partir de ce journal, avec le même moteur et le même dessin, puis encodée en MP4 H.264 (WebCodecs), prête pour WhatsApp. Le rejeu est exact, un élève en 2G envoie 5 Ko au lieu de 10 Mo, et le professeur peut regénérer la vidéo de n'importe quel élève (`replay.html?session=…`).

## Modèles Meta utilisés

| Modèle | Rôle |
|---|---|
| `muse-spark-1.3` | Conçoit le labo à partir du cours (sortie structurée) et le corrige d'après le moteur. |
| `muse-spark-1.3` | Tuteur socratique, ancré dans le cours et dans le circuit résolu. Il répond dans la langue de l'élève. |
| `muse-spark-1.3` (vision) | Lit les cours photographiés ou scannés : tableau, cahier, manuel, schémas de circuits. |
| `muse-spark-1.3` | Traduit un labo (français ⇄ anglais, ou son contenu en wolof, haoussa, yorùbá, fɔngbè, kiswahili, bamanankan). La structure doit revenir identique et le moteur la revérifie : une traduction ne peut ni changer la physique, ni déplacer une bonne réponse. |
| `muse-voice-transcribe-1.0` | Transcrit les cours enregistrés et les questions orales. |

**Poids ouverts.** `PLANNER_BASE_URL` fait passer la conception et le tuteur par n'importe quel serveur compatible OpenAI, par exemple vLLM avec un modèle Muse à poids ouverts. Une école ou un ministère peut ainsi tout héberger chez lui.

## Pensé pour les classes africaines

- **Léger.** Environ 45 Ko compressés de JS, CSS et SVG, sans framework. La 3D (environ 195 Ko) ne se charge que sur demande.
- **Fonctionne hors ligne une fois chargé.** Sans connexion, le tuteur répond avec ce que sait le moteur.
- **Français et anglais.**
  - Chaque page a un sélecteur FR | EN, mémorisé ; la langue du navigateur sert par défaut.
  - Les labos d'exemple existent dans les deux langues.
  - Un lien français ouvert par un anglophone s'ouvre en anglais.
  - Un labo généré se traduit une fois par Muse Spark, puis reste disponible.
- **Langues locales** pour le contenu du labo.
- **Partageable** par un lien ou WhatsApp. **Un cours papier compte** : la photo du tableau suffit.

## Lancer le projet

**Avec Docker** (rien d'autre à installer) :

```bash
cp .env.example .env        # y mettre MODEL_API_KEY (clé de la Meta Model API) — ne jamais la commiter
docker compose up --build   # http://localhost:8080
```

**Sans Docker** (Python 3.10+, Node 18+, ffmpeg) :

```bash
make install
cp .env.example .env        # y mettre MODEL_API_KEY
make dev                    # http://localhost:8080
```

Exemples sans clé :

- `/lab.html?lab=sample-ohm-fr` (ou `-en`) : la loi d'Ohm et la DEL, en 2D ;
- `/lab.html?lab=sample-lampes-fr` (ou `-en`) : lampes en série et en dérivation, en 3D.

Ajoute `&lang=fr` ou `&lang=en` à l'adresse pour choisir la langue de l'interface.

## Déployer dans le cloud

Le dépôt contient le Terraform pour **Google Cloud Run** (registre d'images, bucket GCS pour
les labos, Secret Manager pour la clé). Une seule commande construit l'image et la déploie :

```bash
export TF_VAR_model_api_key=...
make deploy PROJECT=mon-projet-gcp
```

Détails, limites et coûts : [infra/README.md](infra/README.md).

## Tests

```bash
make test    # moteur, vérificateur, séances, vidéo (Node) + serveur, tuteur, traduction (pytest, hors ligne)
make lint    # ruff + terraform fmt
```

## Contribuer

Les contributions sont les bienvenues : voir [CONTRIBUTING.md](CONTRIBUTING.md) et le
[code de conduite](CODE_OF_CONDUCT.md).

## Licence

[MIT](LICENSE).
