# Arduino Distance — Dashboard Render

Projet complet : Arduino HC-SR04 → USB → programme Python sur ton ordinateur → API Render → PostgreSQL → tableau de bord web.

## 1. Ce qu'il faut

- Ton Arduino et le capteur HC-SR04.
- Un câble USB et un ordinateur qui reste allumé pendant les mesures.
- Un compte GitHub et un compte Render.
- Python 3 installé sur l'ordinateur.

**Important :** le programme Python doit rester lancé pour transmettre les mesures. Si l'ordinateur est éteint ou déconnecté d'Internet, aucune nouvelle mesure USB ne sera envoyée.

## 2. Mettre le projet sur GitHub

1. Décompresse le ZIP.
2. Crée un dépôt GitHub (par exemple `arduino-distance-dashboard`).
3. Ajoute tous les fichiers de ce dossier à la racine du dépôt.
4. Enregistre les modifications.

## 3. Déployer sur Render

1. Connecte-toi à https://render.com.
2. Choisis **New → Blueprint**.
3. Connecte ton dépôt GitHub.
4. Render détecte `render.yaml` et propose un service web et une base PostgreSQL.
5. Valide le déploiement.
6. Ouvre le service web et copie son URL publique, par exemple `https://arduino-distance-dashboard.onrender.com`.
7. Dans **Environment**, repère la variable `API_TOKEN` et copie sa valeur. Ne la publie jamais et ne la mets pas dans GitHub.

Le plan gratuit et les conditions des bases de données Render peuvent évoluer. Vérifie les ressources et éventuelles limites/prix affichés avant de valider.

## 4. Installer le pont USB sur ton ordinateur

Ouvre un terminal dans le dossier du projet :

```bash
python -m pip install -r bridge/requirements.txt
```

Sur certains ordinateurs, utilise `python3` à la place de `python`.

### Trouver le port USB

- Windows : regarde le port dans Arduino IDE → Outils → Port (ex. `COM3`).
- macOS : souvent `/dev/cu.usbmodem...` ou `/dev/cu.usbserial...`.
- Linux : souvent `/dev/ttyACM0` ou `/dev/ttyUSB0`.

Ferme le Moniteur série de l'Arduino IDE avant de lancer le pont Python : un seul programme peut généralement utiliser le port série à la fois.

## 5. Lancer le pont

Remplace l'URL, le port et le jeton par tes valeurs.

### Windows (exemple)

```bash
python bridge/serial_to_render.py --port COM3 --url https://TON-SITE.onrender.com --token TON_API_TOKEN
```

### macOS / Linux (exemple)

```bash
python3 bridge/serial_to_render.py --port /dev/ttyACM0 --url https://TON-SITE.onrender.com --token TON_API_TOKEN
```

Tu dois voir des messages comme :

```text
Envoyé : 12 cm — HTTP 201
```

Ouvre ensuite l'URL Render dans ton navigateur. Le tableau de bord se met à jour automatiquement.

## 6. Arduino

Ton code actuel est compatible : il envoie déjà une ligne de la forme `Distance : 12 cm` à 9600 bauds.

Garde bien :

```cpp
Serial.begin(9600);
Serial.print("Distance : ");
Serial.print(Distance);
Serial.println(" cm");
```

Le programme Python ignore les mesures `0 cm`, qui correspondent à une absence de mesure valide dans ton code actuel.

## 7. Seuils utilisés

- 1 à 4 cm : danger (LED rouge).
- 5 à 10 cm : attention (LED orange).
- Plus de 10 cm : normal (LED verte).

Le serveur recalcule l'état à partir de la distance reçue ; il ne dépend pas de l'état des LED.

## 8. Ce que montre le site

- Une scène avec le capteur, l'objet à la bonne distance et les zones de danger (0 à 40 cm affichés).
- Une copie de l'écran LCD 20×4, des 3 LED et du buzzer, avec les mêmes textes que ton code (« ATTENTION ! », « DOUCEMENT », « PAS DE DANGER », « AUCUNE MESURE »).
- Les statistiques des dernières 24 heures (plus proche, plus éloigné, moyenne, répartition par état).
- Un graphique avec les zones rouge et orange, et le tableau de la base de données avec filtre par état.
- Si aucune mesure n'arrive depuis 15 secondes, le site affiche « Aucune mesure », comme l'écran LCD.

Pour ne pas remplir la base gratuite (l'Arduino mesure environ 3 fois par seconde) :
- le pont n'envoie qu'une mesure par seconde par défaut (option `--interval 0.5` pour changer) ;
- le serveur supprime les mesures de plus de 7 jours (variable d'environnement `RETENTION_DAYS` pour changer).

## 9. Dépannage

- **Aucune donnée :** vérifie que le programme Python tourne et que le port est correct.
- **Port occupé :** ferme le Moniteur série Arduino IDE.
- **HTTP 401 :** vérifie la valeur de `API_TOKEN`.
- **HTTP 400 :** la distance doit être un entier entre 1 et 400.
- **Site endormi au premier accès :** certains services gratuits peuvent mettre un peu de temps à redémarrer.
- **Pas d'enregistrement :** vérifie l'état de la base PostgreSQL et les journaux du service Render.

## Sécurité

Le jeton API autorise l'envoi de mesures : garde-le privé. La consultation du tableau de bord est publique dans cette version. Pour un projet nécessitant des données privées, ajoute une authentification utilisateur avant de partager l'URL.
