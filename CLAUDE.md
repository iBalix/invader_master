# CLAUDE.md — Contexte pour agents IA

Ce fichier sert de "brief projet" pour tout agent IA (Claude, Cursor, etc.) qui
intervient sur `invader_master`. Lis-le avant d'écrire du code.

---

## 1. C'est quoi `invader_master` ?

Back-office **unique** du bar connecté **Invader** (Lyon). Il pilote tout ce qui
s'affiche dans le bar :

- **Quiz** lancés sur le vidéoprojecteur (équipes / boutons buzzer)
- **Carte / menu** du bar (boissons, cocktails, food)
- **Jeux** disponibles sur les consoles rétro (NES, SNES, N64, etc.)
- **Écrans TV** (config par device, médias en boucle, événements live)
- **Tables tactiles** (une dizaine de tables, deux dalles par table) :
  - Sous-app frontend `/table/*` (publique, pas d'auth user)
  - Affiche menu / jeux / événements / mises en avant
  - Permet de commander (panier, coupons, paiement)
- **Battle questions** (générées par IA via OpenAI pour soirées battle)
- **Import comptable** (CSV → Supabase + miroir MySQL OVH legacy)
- **Gestion du bar** (incidents, étiquettes machines, agent Windows poste comptoir)
- **Utilisateurs** internes (admin / salarie / externe)

Il y a **2 dépôts/dossiers liés** qu'il ne faut pas confondre :

- `invader_master` (ICI) — le back-office moderne (React + Express + Supabase),
  c'est la cible de toute nouvelle feature.
- `invader_admin` (`c:/MAMP/htdocs/invader_admin`) — l'ancien back-office PHP/MySQL,
  encore en service pour quelques pages (competition, manoir, geoguesser,
  battle_questions legacy…). On migre **progressivement** vers `invader_master`.
- `invader_table` (`c:/MAMP/htdocs/invader_table`) — l'ancienne sous-app tables
  tactiles en PHP, **remplacée** par `frontend/src/tables/` ici.

---

## 2. Stack technique

### Backend (`backend/`)

- **Express** + TypeScript (Node 20)
- **Supabase** pour Auth / Postgres / Storage
  - Le backend tape Supabase **avec la `SUPABASE_SERVICE_ROLE_KEY`**
    (`supabaseAdmin` dans `backend/src/config/`), pas avec l'anon key.
- **WebSocket** (`backend/src/websocket/agent-bridge.ts`) — pont avec l'agent
  Windows installé sur le PC du comptoir (lecture caisse, monitoring).
- **MySQL legacy** (OVH cloud DB) — uniquement pour le dual-write des imports
  finance (rétro-compatibilité avec l'ancien CRM PHP).
- **OpenAI** — génération de questions battle, et génération d'images produit
  (`gpt-image-2`, cf. `backend/src/services/productImageGen.ts`).

### Frontend (`frontend/`)

- **React 18** + **Vite 5** + **TypeScript**
- **Tailwind CSS** + composants maison (pas de design system tiers)
- **React Router** (cf. `frontend/src/App.tsx`)
- **Framer Motion** pour animations (attention : v12+ exige le typage strict
  des easings, cf. `frontend/src/tables/lib/motion.ts`)
- Axios via wrapper `frontend/src/lib/api.ts` (gère le JWT Supabase)

### Sous-app "Tables tactiles" (`frontend/src/tables/`)

- Routée sous `/table/*` **hors `AuthProvider`** (les bornes s'identifient par
  leur hostname, pas par un user)
- Mode kiosk plein écran. **Toutes les dalles sont en 1920x1080**, sans
  exception : ne pas concevoir de mise en page « selon la résolution ». Les
  joueurs, eux, sont sur téléphone (~375 px de large). Ce sont les deux seules
  cibles.
- Deux dalles par table : `TABLExx-1` (master, celle qui lance RetroArch et sur
  laquelle les manettes sont branchées) et `TABLExx-2` (slave). La liste
  faisant foi est la table `table_devices`.
- Pages : `HomePage`, `MenuPage`, `GamesPage`, `ScreensaverPage`, `InGamePage`, `SetupPage`
- État local via Zustand (cf. `tables/store/`)

### Agent Windows (`agent/`)

- Script Node + PowerShell qui tourne sur le PC comptoir
- Remonte des données (caisse, état machines) au backend via WebSocket
- Voir `docs/setup-bar-agent.md` et `docs/agent-windows-tables-setup.md`

### Déploiement

- **Railway**, 2 services : `invadermaster-backend-production` et
  `invadermaster-frontend-production`
- Build & deploy auto sur push `main`
- Healthcheck backend : `GET /health`

---

## 3. Structure du repo

```
invader_master/
├── backend/
│   └── src/
│       ├── index.ts              # Point d'entrée Express (cf. liste des routes)
│       ├── config/               # env, supabase client
│       ├── middleware/           # auth (JWT Supabase), requireRole
│       ├── routes/               # une route REST = un fichier
│       └── websocket/agent-bridge.ts
├── frontend/
│   └── src/
│       ├── App.tsx               # router principal
│       ├── pages/                # pages back-office
│       ├── components/           # composants groupés par domaine
│       │   ├── Layout/Sidebar.tsx
│       │   ├── MediaSupport/     # config écrans / tables tactiles
│       │   └── …
│       ├── hooks/useAuth.tsx + usePermissions.tsx
│       ├── lib/api.ts            # axios + JWT
│       └── tables/               # sous-app /table/* (kiosk)
├── docs/
│   ├── supabase-schema.sql       # schéma initial
│   ├── migration-XXX-*.sql       # migrations versionnées (numerotées)
│   └── *.md                      # docs setup agent, etc.
├── scripts/
│   ├── invader-start.js          # démarrage parallèle back+front
│   ├── seed-admin.ts             # création du premier admin
│   └── *.js / *.ts               # outils ponctuels (perf, capture, debug)
├── agent/                        # agent Windows comptoir
├── .cursor/rules/                # règles Cursor (auto-appliquées)
├── README.md                     # setup utilisateur
└── CLAUDE.md                     # ce fichier
```

---

## 4. Conventions à respecter absolument

### 4.1. Organisation des fichiers

- **Docs** (`.md`, `.sql` de schéma/migration) → `docs/`
- **Scripts exécutables** (`.js`, `.ts`, `.bat`, `.ps1`) → `scripts/`
- Ne **pas** créer de doc `.md` "juste au cas où" — seulement si elle apporte de
  la valeur à un humain ou à un agent IA.

### 4.2. Migrations SQL

- Numérotées : `migration-NNN-description.sql`
- Une migration = un changement (table, colonne, RLS, seed)
- Idempotentes si possible (`CREATE … IF NOT EXISTS`, `DROP POLICY IF EXISTS`…)
- Appliquées **manuellement** dans le SQL Editor Supabase (pas de runner auto)

### 4.3. RLS Supabase (piège majeur)

Le backend utilise `SUPABASE_SERVICE_ROLE_KEY` → on s'attend à bypass RLS.
**Mais** PostgREST se connecte en `authenticator` puis fait `SET LOCAL ROLE
service_role` par requête, ce qui **n'active PAS `BYPASSRLS`**.

Conséquence : si tu crées une table avec `ENABLE ROW LEVEL SECURITY` **sans
policy**, le backend voit **0 ligne** (deny by default).

**Règle** : pour toute nouvelle table accessible côté backend, ajouter au
minimum :

```sql
CREATE POLICY "service_role full access"
  ON public.<table>
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

Cf. `docs/migration-021-rls-tables-featured.sql` pour le template complet
(service_role / anon / authenticated).

### 4.4. Nouvelle page back-office — checklist obligatoire

Quand tu ajoutes une page :

1. Composant page → `frontend/src/pages/`
2. Route → `frontend/src/App.tsx`
3. Lien sidebar → `frontend/src/components/Layout/Sidebar.tsx` (bon accordéon)
4. **Carte Dashboard** → `frontend/src/pages/Dashboard.tsx` (bon tableau
   `CONTENUS` / `EVENEMENTS` / `UTILITAIRES`)

L'étape 4 est la plus souvent oubliée. Cf. `.cursor/rules/new-page-checklist.mdc`.

### 4.5. Format des réponses API

Toutes les routes REST renvoient :

```json
{ "status": "success", "items": [...] }   // listes
{ "status": "success", "data": {...} }    // single
{ "status": "error", "message": "..." }   // erreurs
```

Côté frontend, **toujours destructurer défensivement** :

```ts
const { data } = await api.get('/api/foo');
const list = data?.items ?? data?.foos ?? data;
setFoos(Array.isArray(list) ? list : []);
```

(Bug historique : `EventsPage` plantait parce que la route renvoyait `items` et
le front lisait `events` → `TypeError: object is not iterable`.)

### 4.6. Rôles & permissions

- **`admin`** : accès complet, seul à voir "Gestion des users"
- **`salarie`** : back-office sauf users
- **`externe`** : uniquement page Contenus

Middleware backend : `requireRole(['admin'])` dans `backend/src/middleware/`.
Côté frontend : `usePermissions()` + `<ProtectedRoute>`.

---

## 5. Commandes utiles

```bash
# Setup
npm install
npm install --prefix backend
npm install --prefix frontend

# Dev (back + front en parallèle)
npm run dev                # ports 3001 (back) + 5173 (front)
npm run dev:back
npm run dev:front

# Build + lint
npm run build
npm run lint               # tsc --noEmit sur back ET front

# Seed du premier admin
npm run seed
```

URLs locales :

- Back-office : http://localhost:5173
- Tables tactiles : http://localhost:5173/table/<hostname>
- API : http://localhost:3001
- Healthcheck : http://localhost:3001/health

---

## 6. Environnement Windows / PowerShell

**Le poste de dev tourne sous Windows / PowerShell** (pas bash). Donc :

- **PAS de heredoc** (`<<EOF`) dans les commandes shell
- **PAS de `&&` comme séparateur** — utiliser `;` ou des appels séparés
- Pour les `git commit` multi-lignes : écrire le message dans un fichier
  temporaire et utiliser `git commit -F <fichier>` (les apostrophes cassent
  le parsing PowerShell sinon)

---

## 7. Pièges connus / leçons tirées

- **RLS sans policy** : 0 lignes côté backend, même avec service_role.
  → voir 4.3.
- **`pg_tables.forcerowsecurity` n'existe pas** : c'est dans `pg_class`
  (`relforcerowsecurity`) avec un join sur `pg_namespace`.
- **Framer Motion v12+ easing** : utiliser une constante typée
  `[number, number, number, number]` (`frontend/src/tables/lib/motion.ts`)
  sinon Railway plante au build TS.
- **Vidéos en 16:9 dans modal produit** : utiliser `aspect-video` et pas
  `aspect-[4/3]` sinon barres noires.
- **Response shape API** : checker `data.items` ET `data.<resource>` côté front.

---

## 8. Documentation complémentaire

- `README.md` : setup pour un humain qui découvre
- `.cursor/rules/new-page-checklist.mdc` : checklist auto-appliquée
- `.cursor/rules/invader-start.mdc` : commande `/invader-start` (lance back+front)
- `docs/setup-bar-agent.md` : installation agent Windows comptoir
- `docs/agent-windows-tables-setup.md` : config bornes tactiles
- `docs/supabase-schema.sql` + `docs/migration-NNN-*.sql` : schéma BDD

---

## 9. Quand tu doutes

- Pour comprendre **comment une route est branchée** → `backend/src/index.ts`
  (mapping URL → router en bas du fichier)
- Pour comprendre **comment une page est routée** → `frontend/src/App.tsx`
- Pour comprendre **le schéma BDD** → lire `docs/migration-*.sql` dans l'ordre
- Pour un bug RLS sur Supabase → relire la section 4.3
