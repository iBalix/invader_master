# Invader Master

Back-office du bar connecté Invader : pilotage des dispositifs (tables tactiles, écrans, jeux).

## Stack

- **Frontend** : React 18, Vite 5, Tailwind CSS, TypeScript
- **Backend** : Express, Supabase (Auth + PostgreSQL + Storage)
- **Deploy** : Railway (2 services : frontend + backend)

## Setup local

1. **Cloner et installer les dépendances**

   ```bash
   cd invader_master
   npm install
   npm install --prefix backend
   npm install --prefix frontend
   ```

2. **Variables d'environnement**

   Copier `.env.example` vers `.env` à la racine, et renseigner les clés Supabase.  
   Pour le frontend en dev, créer `frontend/.env.local` avec au minimum :

   ```
   VITE_BACKEND_URL=http://localhost:3001
   VITE_SUPABASE_URL=<votre SUPABASE_URL>
   VITE_SUPABASE_ANON_KEY=<votre SUPABASE_ANON_KEY>
   ```

   Le backend lit `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` depuis la racine (ou depuis `backend/.env` si présent).

3. **Base de données Supabase**

   Exécuter le schéma SQL dans le projet Supabase : voir `docs/supabase-schema.sql`.

4. **Seed admin**

   ```bash
   npm run seed
   ```

   Crée l'utilisateur admin `romain.darbas7@gmail.com` (mot de passe défini dans le script).

5. **Lancer en dev**

   ```bash
   npm run dev
   ```

   Démarre le backend (port 3001) et le frontend (port 5173).  
   Ou manuellement : `npm run dev:back` et `npm run dev:front` dans deux terminaux.

## Scripts

| Commande   | Description                          |
|-----------|--------------------------------------|
| `npm run dev`      | Lance backend + frontend en parallèle |
| `npm run dev:back` | Backend seul (port 3001)             |
| `npm run dev:front`| Frontend seul (port 5173)             |
| `npm run build`    | Build backend + frontend             |
| `npm run seed`     | Seed du premier admin                |
| `npm run lint`     | Vérification TypeScript (backend + frontend) |

## Rôles

- **admin** : accès complet + page Gestion des users
- **salarie** : back-office sauf Gestion des users
- **externe** : uniquement la page Contenus

## Déploiement Railway

- **Backend** : `backend/` avec `npm start`, variable `PORT` fournie par Railway. Healthcheck : `GET /health`.
- **Frontend** : `frontend/` avec `npm run preview`, variable `PORT` pour Vite preview.

Configurer les variables d'environnement (Supabase, `VITE_BACKEND_URL` pour le front, etc.) dans le dashboard Railway.

Écrans du bar : au lancement d'une session quiz/battle, le backend envoie PROJO sur `/screen/PROJO` et BAR01/BAR02 sur `/screen/BAR` via l'agent SRV1, puis les ramène à leur écran par défaut à l'arrêt (`FRONTEND_PUBLIC_URL` optionnel, `SCREENS_AUTOSWITCH=0` pour couper). Le retour au défaut exige la version à jour de `agent/scripts/url_edge_server.ps1` sur SRV1 (`git pull`).
