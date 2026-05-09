# Bot Discord Giveaway YouTube

Bot Discord simple pour valider automatiquement le premier membre qui envoie le code secret d'une video.

## Installation

1. Installer les dependances:

```bash
npm install
```

2. Copier `.env.example` vers `.env` puis remplir les valeurs.

3. Activer ces intents dans le portail Discord:
   - `MESSAGE CONTENT INTENT`
   - `SERVER MEMBERS INTENT` (optionnel)

4. Deployer les commandes slash:

```bash
npm run deploy
```

5. Lancer le bot:

```bash
npm start
```

## Commandes

- `/giveaway-create code:<code> video:<id> reward:<recompense> expires_hours:<heures optionnel>`
- `/giveaway-status`
- `/giveaway-close`

## Fonctionnement

- Le bot surveille le salon `CLAIM_CHANNEL_ID`.
- Si un membre poste le code exact en premier:
  - il est marque gagnant,
  - le giveaway est ferme,
  - une annonce est postee dans `WINNERS_CHANNEL_ID`.

## Notes

- Un seul giveaway actif a la fois.
- Les donnees sont stockees localement dans `data/store.json`.

## Hebergement (24/7 sans ton PC)

Un bot Discord doit tourner **en continu**. Options simples :

1. **Railway** (Docker natif : repose ton repo, il detecte `Dockerfile`)
   - Mets les memes variables que dans `.env` dans l’onglet **Variables**.
   - **Persistance :** ajoute un **Volume** monte sur `/app/data` pour garder `store.json` apres redeploiement (sinon l’historique peut repartir a zero).

2. **Fly.io**, **DigitalOcean Droplet**, **VPS** : meme principe : `docker build` + `docker run` avec les variables d’environnement.

3. **Render** : service **Web** ou **Background Worker** (pas le free tier web qui “s’endort”, incompatible avec un bot).

**Apres le premier deploiement**, lance une fois les commandes slash depuis ta machine (avec les memes IDs) :

```bash
npm run deploy
```

Ensuite seul `npm start` (ou le conteneur) doit tourner sur l’hebergeur.
