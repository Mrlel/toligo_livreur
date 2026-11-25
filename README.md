# Tôligo Livreur — application web des livreurs (React)

Application réservée aux livreurs internes de Tôligo. Elle couvre les deux
métiers de l'API `/livreur/*` (CDC V3.3 §13) :

- **Chauffeur de ramassage** : tournées de ramassage (démarrer, signaler une
  anomalie sur un box, « Fin du passage » à chaque entrepôt une fois
  les colis pris, puis « Terminer la tournée » à la station A, qui y dépose tous
  les colis du camion). Le chauffeur ne scanne pas les colis ;
- **Livreur à domicile** : livraisons affectées par la station B (prendre les
  colis, confirmer l'adresse avec le destinataire, partir, remettre avec le
  code de retrait ou une photo, encaisser en espèces, signaler un échec).

Un même compte peut avoir les deux rôles : les onglets « Livraisons » et
« Tournées » suivent `est_livreur_domicile` et `est_chauffeur_ramassage` du
profil. Les comptes sont créés par l'administration : pas d'inscription.

La direction artistique est celle de l'application client (`../toligo_web`) :
mêmes couleurs, polices (Sora, DM Sans), arrondis, composants et animations.
Le socle (`styles/`, `composants/`, `api/client.js`, `utils/`,
`commun/EcransAnimes.jsx`, `commun/carte.jsx`) en est une copie : une
correction faite d'un côté est à reporter de l'autre.

- **Sur téléphone** (moins de 960 px de large) : onglets en bas (Accueil,
  Livraisons, Tournées, Profil), bouton de l'action suivante collé en bas.
- **Sur ordinateur** : navigation dans une barre à gauche, contenu sur deux
  colonnes.

## Lancer l'application

Double-cliquer sur `lancer-app-livreur.bat` : le navigateur s'ouvre sur
<http://localhost:5174> (le port 5173 reste à l'application client).

Ou, dans un terminal :

```
npm install      (la première fois)
npm run dev      (développement, rechargement automatique)
```

En développement, l'app appelle `/api` sur sa propre adresse et le serveur Vite
relaie vers l'API désignée par `API_CIBLE` dans `.env.development` (serveur de
test). Pour l'API lancée sur ce PC (`php artisan serve` dans `../toligo`),
mettre `API_CIBLE=http://127.0.0.1:8000`.

La version de production (`npm run build`) appelle directement l'API de
`VITE_API_URL` (`.env.production`) : l'API doit autoriser l'adresse où le site
est publié (`CORS_ALLOWED_ORIGINS` dans le `.env` de Laravel).

### Sur le téléphone du livreur

L'application est installable (PWA : `public/manifest.webmanifest`,
`public/sw.js`). Elle a besoin de **HTTPS** (sauf `localhost`) pour partager la
**position** avec la station pendant le service.

Depuis un téléphone sur le même Wi-Fi en HTTP, l'application marche, mais la
position n'est pas envoyée.

## Organisation du code

Même découpage que l'application client :

| Fichier | Rôle |
|---|---|
| `api/client.js` | Appels HTTP, jeton, enveloppe `{ success, data, message }`, erreurs |
| `session/Session.jsx` | Jeton de connexion (`toligo_livreur_jeton`) et profil du livreur |
| `commun/Coquille.jsx` | Barre latérale (ordinateur) et onglets du bas (téléphone) |
| `commun/Position.jsx` | Partage de la position (`PUT /livreur/position`) pendant le service |
| `commun/routes.js` | Adresses de tous les écrans |
| `fonctionnalites/<nom>/api.js` | Appels d'API d'une fonctionnalité, et libellés des statuts |
| `fonctionnalites/<nom>/<Ecran>Page.jsx` | Un écran, avec sa logique (chargement, actions) |

Écrans :

| Adresse | Écran | Routes de l'API |
|---|---|---|
| `/connexion` | `authentification/ConnexionPage` | `POST /livreur/login` |
| `/accueil` | `accueil/AccueilPage` : statut, à faire, listes | `GET /livreur/me`, `PATCH /livreur/statut` |
| `/livraisons` | `livraisons/LivraisonsPage` | `GET /livreur/missions` |
| `/livraisons/:id` | `livraisons/LivraisonPage` : étapes et action suivante | `prise-en-charge`, `confirmation-adresse`, `depart`, `echec`, `refus-paiement`, `lien-paiement` |
| `/livraisons/:id/remise` | `livraisons/RemisePage` : code ou photo, espèces | `POST /livreur/missions/{id}/remise` |
| `/tournees` | `tournees/TourneesPage` | `GET /livreur/tournees` |
| `/tournees/:id` | `tournees/TourneePage` : arrêts, box, fin du passage | `demarrer`, `anomalie`, `fin-de-passage`, `terminer` |
| `/profil` | `profil/ProfilPage` | `POST /livreur/logout` |

Différences avec le socle client :

- `useDonnees` garde les données affichées si un **rechargement** échoue (réseau
  faible en tournée) ; seul un premier chargement raté affiche l'erreur.
- `useActualisation` (même fichier) recharge une liste au retour sur
  l'application et chaque minute : une livraison affectée par la station
  apparaît sans action du livreur.

### Tournée sans scan

Le chauffeur ne scanne pas les colis (choix du 24/11/2026). À chaque entrepôt,
il ouvre les box, prend les colis, puis appuie sur « Fin du passage » : tous les
colis des box de l'entrepôt passent dans le camion, sauf ceux d'un box signalé
en anomalie. À la station A, « Terminer la tournée » y dépose d'un coup tous les
colis du camion ; le gestionnaire de la station les contrôle ensuite un par un.
Le lecteur de QR code (`commun/Scanner.jsx`, bibliothèque `jsqr`) a été retiré.
Le chauffeur n'ouvre pas non plus les box depuis l'application (retiré le
24/11/2026) : ils s'ouvrent depuis l'application TTLock de l'entrepôt.

### Partage de la position

Tant que le livreur est « Disponible » ou « En mission », la position du
téléphone est envoyée au plus toutes les 30 secondes (et renvoyée toutes les
minutes s'il ne bouge pas). En pause ou indisponible, rien n'est suivi.
