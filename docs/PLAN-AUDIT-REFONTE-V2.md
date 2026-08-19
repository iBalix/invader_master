# Plan de reprise : audit du portage quiz/blindtest + implémentation battle royale + campagne de vérification complète

Document autoportant destiné à une session Claude Code fraîche. Il récapitule tout ce qui a été demandé et engagé sur la branche `refonte-v2`, puis détaille le travail attendu : audit de l'existant, implémentation du battle royale, et campagne de tests exhaustive au navigateur intégré (gamemaster, joueur, écrans, tables, 16:9 et mobiles).

---

## 0. RÈGLE ABSOLUE : données de production partagées avec le legacy

La base Supabase (projet `ekplxvihchsxnhtjgfzi`) et le MySQL OVH sont utilisés **EN PRODUCTION, EN CE MOMENT, par les anciens sites** `invader_admin` et `invader_table` (PHP) encore en service au bar : la carte via `/public/carte`, les quiz et questions via `/public/quizzes` et `/public/questions`, les questions battle via `/public/battle-questions`, les scores arcade via MySQL, etc. Un breaking change casse le bar en direct. Donc :

- **Jamais** de renommage, suppression ou changement de type sur des colonnes/tables existantes ; jamais de changement du format de réponse des endpoints publics existants (ex : la bonne réponse re-sérialisée avec le marqueur " (OK)" attendu par le legacy).
- Changements **additifs uniquement** : nouvelles tables, nouvelles colonnes nullables avec défaut, nouveaux endpoints.
- Si une transformation de structure est nécessaire, **dupliquer** plutôt que modifier : créer une section dédiée temporaire, comme le projet le fait déjà avec le pattern `*_v2` (jeux v2, carte v2, tables clonées puis bascule contrôlée puis décommission).
- Après toute migration, re-tester les endpoints publics consommés par le legacy (`curl /public/carte`, `/public/quizzes`, `/public/battle-questions`).
- Toute donnée de test créée en base doit être nettoyée en fin de session. En cas de doute sur un impact prod, demander à Romain AVANT d'appliquer.

**MCP Supabase** : un connecteur MCP Supabase est branché sur la conversation (si ce n'est pas le cas, le signaler ; il peut nécessiter une ré-authentification via /mcp). L'utiliser pour tout ce qui touche la base : lister les tables et vérifier l'état réel du schéma, vérifier quelles migrations sont déjà passées, appliquer les nouvelles migrations (si le connecteur est au niveau compte, cibler `project_id: ekplxvihchsxnhtjgfzi`), requêtes de vérification et de nettoyage. Si le MCP est indisponible, fournir le SQL à Romain pour le SQL Editor et attendre sa confirmation.

## 1. Contexte général

- **Projet** : `invader_master` (React 18 + Vite + Tailwind / Express + TypeScript / Supabase, déploiement Railway). Lire `CLAUDE.md` à la racine avant toute modification : conventions migrations, RLS, format API, checklist nouvelle page.
- **Objectif global** : porter les modes de jeu du legacy PHP (`invader_admin` + `invader_table`, repos frères dans `/Users/romain/Dev_Invader/`) vers invader_master, en **full remote** : plus aucun serveur au bar, tout le monde (téléphones joueurs, tables tactiles, projecteur, écrans bar, gamemaster) tape sur invader_master. Les écrans physiques sont de simples navigateurs sur des routes persistantes.
- **Le blindtest n'est pas un mode séparé** : c'est un quiz dont les questions portent un média audio (`music_url`) ou vidéo YouTube (`video_youtube` au format `ID?time=SS&duration=SS`).
- **Branche de travail** : `refonte-v2` (créée depuis `main`, contient la refonte tables tactiles "launcher néon"). Le portage quiz y est présent en **working tree non commité**. Ne pas casser les sous-apps existantes (`/table/*`, back-office).

## 2. État des lieux PRÉSUMÉ (constat à la date de rédaction, à re-vérifier impérativement)

**Attention : plusieurs sessions IA ont pu travailler sur ce repo depuis la rédaction de ce plan. Ne rien tenir pour acquis dans cette section.** La toute première tâche (phase A) est d'établir l'état RÉEL : `git status`/`git log` sur `refonte-v2`, inventaire des fichiers cités ci-dessous, vérification des tables et migrations effectivement présentes dans Supabase (via le MCP), routes réellement montées. Ensuite seulement, adapter le déroulé : ce qui existe est à auditer (phase A), ce qui manque est à implémenter (phase B), sans refaire ce qui est déjà correct.

### Vraisemblablement implémenté (quiz/blindtest) : à confirmer puis auditer

- **Migrations a priori appliquées en prod Supabase** (projet `ekplxvihchsxnhtjgfzi`, à vérifier via le MCP avant toute ré-application ; elles sont idempotentes) : `docs/migration-039-game-engine.sql` (tables `game_sessions`, `game_players`, `game_answers` + RLS service_role) et `docs/migration-040-questions-game-fields.sql` (colonnes `type` qcm/estimation/free_text, `points_override` 1-5, `expected_answer`, `expected_number`, `estimation_scoring` sur `questions`).
- **Moteur backend** `backend/src/games/` : `engine.ts` (mutex par session, transitions auto par advancer, save + `state_version`++ + broadcast), `quizFlow.ts` (machine à états quiz), `scoring.ts` (calcul pur des résultats), `aiJudge.ts` (jugement réponses libres : normalisation + levenshtein local, puis batch OpenAI gpt-4o-mini pour les ambigus), `views.ts` (vues filtrées par rôle : le public ne voit JAMAIS la bonne réponse avant révélation), `realtime.ts` (broadcast Supabase Realtime via REST).
- **Routes** : `backend/src/routes/game.ts` (GM, auth admin/salarie : création session, état GM, réponses live, actions) et `gamePublic.ts` (public : `/public/game/current`, state, join, leave, answer idempotent, bonus). Montées dans `index.ts`.
- **Frontend jeu** `frontend/src/game/` : `lib/gameClient.ts` (API + realtime + horloge serveur + identité localStorage), `hooks/useGameSession.ts` (protocole auto-réparant : resync par `state_version`, refetch au retour de veille, poll 10 s), `player/PlayerApp.tsx` (route `/play/:code?`), `screen/ScreenApp.tsx` (route `/screen/:hostname` : PROJO = écran maître avec son, BARxx = QR rejoindre la partie), `screen/audio.ts` (SFX 100% synthétisés WebAudio + musique + ducking), `ui/bits.tsx` (QR canvas, timer, badges, YouTube), `game.css`.
- **Console GM** : `frontend/src/pages/QuizLivePage.tsx`, route `/evenements/quiz-live` (App.tsx, Sidebar, Dashboard à jour).
- **Éditeur de questions** : `frontend/src/components/Quiz/QuestionModal.tsx` étendu (sélecteur de type, points override, paliers d'estimation avec aperçu, réponse attendue).
- **Fix critique déjà fait** : `backend/src/routes/auth.ts` utilisait `supabaseAdmin.auth.signInWithPassword`, ce qui posait la session utilisateur sur le singleton et faisait partir les requêtes suivantes en rôle `authenticated` (RLS non bypassé, 42501 silencieux). Un client auth dédié a été introduit. Ne pas régresser.

### Vraisemblablement pas (ou pas entièrement) fait : à confirmer avant d'implémenter

- **Battle royale** : à la date de rédaction, rien de constaté (pas de `battleFlow.ts`, pas de migration 041, pas de page GM battle, pas de branches battle côté joueur/écrans). Si l'état des lieux montre qu'une partie existe déjà, l'auditer et compléter au lieu de repartir de zéro. La spécification complète est au chapitre 5.
- Lumières Hue (via l'agent Windows), playlist musicale par défaut embarquée, champ UI WiFi à la création de session : hors périmètre immédiat, ne pas s'y engager sauf demande.
- À la date de rédaction, rien n'était commité sur `refonte-v2` : vérifier, et à la fin du travail proposer un découpage de commits propre.

## 3. Spécifications fonctionnelles de référence : QUIZ / BLINDTEST

Tout ceci est censé être implémenté. L'audit (phase A) et les tests (phase C) doivent vérifier chaque point.

### Cycle de vie
1. **Création** : le GM choisit un quiz publié dans `/evenements/quiz-live` et lance une session (code court 4 caractères, ex 8CDQ). Créer une session clôt automatiquement la précédente. Les questions sont figées en snapshots dans `question_order` (réponses QCM mélangées une fois par session).
2. **Lobby** : projecteur = accueil 2 étapes : "1. Connecte-toi au WiFi" (QR WiFi natif format `WIFI:T:WPA;...` + nom du réseau en toutes lettres) puis "2. Scanne pour jouer" (QR vers `/play/CODE`), compteur de joueurs, derniers pseudos. Écrans BAR01/BAR02 : "Partie en cours" + QR de la partie (rejoindre en cours possible à tout moment, le retardataire entre avec 0 point).
3. **Inscription joueur** : pseudo max 16 caractères (regex lettres/chiffres/accents), unicité insensible à la casse, identité persistée en localStorage (`player_token`) : un refresh ou un rescan du QR reprend la session. Bouton quitter avant le début.
4. **Règles** (togglable par le GM) : barème, bonus vitesse, quitte ou double.
5. **Annonce** (~8 s, configurable) : catégorie, difficulté, **points de la question**, type. C'est la **fenêtre de mise** : chaque joueur a 2 quitte ou double par partie (configurable), activables uniquement pendant l'annonce, x2 si bonne réponse, rien si mauvaise. Les activations remontent en direct sur le projecteur (toasts "X tente le QUITTE OU DOUBLE !") et dans l'état (`qdFeed`).
6. **Question** : fenêtre de 23 s (+10 s si audio, +2 s si image, +durée+2 s si vidéo YouTube). Le joueur répond selon le type ; réponse envoyée avec `elapsedMs` mesuré côté client (anti-latence), POST idempotent avec retry x3 et accusé visuel "Réponse enregistrée". Tolérance serveur de 2,5 s après la deadline. Vibration mobile au début.
7. **Verrouillage** : "Temps écoulé", et pour les réponses libres, jugement IA automatique puis verdicts éditables par le GM (accepter/refuser chaque réponse d'un tap) avant de révéler.
8. **Révélation** (action GM, possible en avance) : pourcentages animés par réponse, bonne réponse en vert, résultat personnel sur chaque téléphone (points gagnés, x2 du quitte ou double, écart pour l'estimation), joueur le plus rapide (+1, QCM uniquement), issues des paris, image réponse éventuelle.
9. **Classement** (GM) : positions et flèches d'évolution, **scores masqués** pendant la partie (réglage `showScores`, les points ne s'affichent qu'au classement final). Le joueur voit sa position sur son téléphone.
10. **Cinématique finale** (GM, un seul clic, tout est automatique) : roulement de tambour, puis 5e, 4e, 3e, 2e, 1er en plein écran (sauter les rangs vides si moins de 5 joueurs), puis classement complet AVEC scores. Cues audio synchronisés.
11. **Récompenses** : 4 mentions révélées toutes les 6 s : la gâchette (meilleur temps moyen), le cerveau (meilleur ratio, participation >= 70%), la série (meilleur strike), le bonnet d'âne.
12. **Fin** : texte gagnant templaté (`#winner#`), podium, confettis. **Stop** : les écrans reviennent à l'idle, les joueurs voient "partie terminée".

### Types de questions
- **QCM** : 4 réponses, la bonne = `correct_answer_index` (plus de suffixe "(OK)" dans le nouveau modèle).
- **Audio (blindtest)** : le projecteur joue le mp3, les téléphones affichent "Écoute l'extrait".
- **Vidéo YouTube (blindtest vidéo)** : extrait borné `start/end` sur le projecteur, téléphones renvoyés à l'écran principal.
- **Image** : image grande et persistante à côté des réponses (plus de rétrécissement après 5 s comme le legacy), `object-fit: contain`.
- **Estimation chiffrée** : input numérique avec boutons +/- à pas adaptatif, barème par paliers d'écart configurables (`estimation_scoring` : liste `{maxGap, points}`), révélation avec top des estimations et écarts.
- **Réponse libre** : champ texte, jugement IA tolérant (fautes, abréviations), verdicts corrigeables par le GM avant révélation.

### Barème
Facile 1 / Moyen 2 / Difficile 3, **ou** `points_override` 1 à 5 fixé par question. Bonus vitesse +1 au plus rapide des bons répondeurs QCM (temps client plausibilisé côté serveur). Questions spéciales GM sur l'annonce suivante : points x2, quitte ou double collectif (-2 si faux), shot ou goodies au plus rapide. Strike suivi par joueur. Points manuels attribuables par le GM.

### Pilotage GM
Boutons par état avec transitions validées côté serveur (un double-clic ne casse jamais l'état) : démarrer, règles, révéler (verrouillé pendant le jugement IA), question suivante (+ sélecteur de question spéciale), classement, cinématique, **annuler la question** (rollback complet points/état, écran "question annulée") et **rejouer la question** (efface les réponses, rembourse les quitte ou double, relance la même), pause et **reprendre + question suivante en un clic**, récompenses, fin, arrêt. Feed des réponses en direct (badge par joueur avec justesse), anecdote animateur, aperçu de la question suivante, gestion joueurs (points manuels, retirer), mixer audio (musique/effets avec niveaux visibles, paliers fins, ducking automatique qui remonte au niveau exact).

## 4. Retours terrain à respecter (source : associé, sessions legacy)

Quiz et transverse : accueil WiFi explicite en 2 étapes, écrans bar avec QR pendant la partie, scores démoralisants masqués jusqu'au final, cinématique automatique sans double-clic, plus de jingles manuels inutiles, gestion du son visible et fine sans boost brutal, annuler/rejouer côté quiz, clients "bloqués sur la question précédente" auto-réparés (resync) + bouton refresh manuel joueur, bande-son de fond longue durée sans recoupe, reprise de pause en un clic, images bien visibles, bonus vitesse fiable (mesure client).

Battle (à intégrer dans l'implémentation, chapitre 5) : fond musical pendant les questions ; grâce de 4 s pour les réponses tardives ; ressusciter doit rendre le point de bonne réponse ; **étape de verdict GM avant l'affichage public des survivants** (corriger/ressusciter AVANT que la salle voie un compte faux) ; repêchage collectif avec animation visible ("ÉGALITÉ, REPÊCHAGE !") ; zéro survivant = choix GM entre repêchage et fin de manche avec co-vainqueurs (plus de résurrection automatique) ; rotation du classement hors top 3 plus lente (~10 s) ; pas de bande blanche/scrollbar sur les écrans ; transition de fin en fondu son + image ; le joueur voit sa place au classement général sur son téléphone ; top 10 visuellement distingué ("EN ROUTE POUR LA FINALE") ; libellé "Jeux-vidéo" (pas "Jeux-vidéos") ; back-office fluide à 46+ joueurs.

## 5. Spécification battle royale (implémenter ce qui manque après l'état des lieux)

### Banque de questions (préalable indépendant)
- La banque battle actuelle est dans **MySQL OVH** (`backend/src/routes/battleQuestions.ts`, mysql2). La migrer vers Postgres : **migration 041** `battle_questions` (id UUID, `legacy_id` INTEGER UNIQUE pour import idempotent, question, `answers TEXT[]` propres, `correct_answer_index`, difficulty check Facile/Moyen/Difficile, theme, help_story, **`used_at TIMESTAMPTZ`** : consommation non destructive, timestamps, index partiel `WHERE used_at IS NULL`, RLS pattern service_role du projet).
- **Politique validée par Romain** : une question posée ne ressort jamais automatiquement (`used_at` permanent, pas de reset par soirée) ; bouton GM "Réinitialiser les questions utilisées" (`POST /api/battle-questions/reset-usage`) ; l'IA maintient le stock.
- Script d'import one-shot MySQL vers Postgres (parse du marqueur " (OK)" vers `correct_answer_index`, upsert sur `legacy_id`, re-run safe, corriger "Jeux-vidéos" en "Jeux-vidéo" au passage, y compris `DEFAULT_CATEGORIES` ligne 16 de battleQuestions.ts).
- Réécrire `battleQuestions.ts` sur `supabaseAdmin` en conservant les shapes d'API existantes (le front `BattleQuestionsPage` et l'endpoint public `/public/battle-questions` consommé par le legacy re-sérialisent " (OK)"). Extraire la génération OpenAI dans `backend/src/services/battleQuestionGen.ts`, réutilisée par la route et par le mainteneur de stock.

### Machine à états (`backend/src/games/battleFlow.ts`)
Statuts réutilisés : lobby, rules, announce, question, locked, leaderboard, pause, end. Nouveaux : `round_intro`, `verdict`, `round_end`, `closing`.

```
lobby ⇄ rules
  │ start-round (ou start-final depuis round_end)
  ▼
round_intro ─auto 5s─► announce ─auto 6s─► question ─auto 15s─► locked ─auto grâce 4s─► verdict
  ▲                                                                                       │ GM édite
round_end ◄─ end-round ─ reveal ◄──────────────── show-results (seule écriture DB) ◄──────┘
tout état ─ stop ─► closing ─auto 5s (fondu son+image)─► end (ended_at posé ici)
```

Points structurants :
- `question_order` NON pré-rempli : journal append-only, un snapshot ajouté à chaque tirage. File de tirage `runtime.battle.queue` par difficulté (refill aléatoire hors `used_at`), difficulté progressive (Q1-3 Facile, 4-8 Moyen, 9+ Difficile ; finale : 1-3 Moyen puis Difficile), `used_at = now()` au tirage, réponses mélangées au snapshot. GM : aperçu/réordonner/retirer les prochaines questions (`GET /api/game/:id/battle/queue`, actions `queue-reorder`/`queue-remove`).
- **Verdict** : à l'entrée, calcul provisoire async (pattern `queueJudging`) : éliminations provisoires (`pending` avec raison wrong/timeout, choix, temps), bons répondeurs (+1 y compris éliminés-répondants hors finale), `survivorsBefore/After`. Actions GM : `verdict-mark-correct` (sort des éliminés ET rend le point), `verdict-revive` (survit sans point), `verdict-reset`, `verdict-revive-group` (repêchage collectif, reveal portera `repechage: true`), `verdict-end-round-tie` (cas 0 survivant : co-éliminés rang 1 partagé, enchaîne round_end). **Rien n'est persisté avant `show-results`** ; le compteur public de survivants est dérivé de `game_players.status` en DB, donc jamais un état non validé. Pendant le verdict le public voit un habillage "Vérification..." sans données.
- `show-results` : persiste answers jugées, scores, éliminations (groupes au rang partagé = totalJoueursDébutManche moins déjà éliminés), `finalEliminationOrder` en finale, puis reveal public (décompte animé des éliminés, noms un par un, animation repêchage, bandeaux milestone "PLUS QUE 10 !" aux seuils 20/10/5/3).
- Manches : `end-round` = bonus 25/20/18 puis dégressif jusqu'au 20e (rang partagé par groupe), classement de manche + classement général (score desc, tiebreak temps cumulé) avec `qualifiedForFinal` (top 10). `start-round` = tous les eliminated et waiting redeviennent actifs, reset compteurs. `start-final` = top 10 actifs, les autres passent `spectator` (nouveau statut : définitif, ne peut plus répondre) ; classement final = ordre d'élimination inversé, ex aequo départagés par `elapsed_ms` de la question fatale ; moins de 10 joueurs = tous qualifiés (409 si moins de 2) ; fin auto à 1 survivant.
- Inscription en cours de battle : statut `waiting`, intégré à la manche suivante ; 409 "inscriptions closes" pendant la finale. Réponses : fenêtre = `question` OU `locked` dans la grâce (`graceMs` 4000 configurable) ; les eliminated répondent hors finale (+1), les spectator et waiting non.
- Annulation : avant `show-results` = trivial (rien persisté, la question reste consommée, `roundQuestionCount--`) ; après = rollback complet (réactivation du groupe, retrait des groupes/ordre de finale, rebuild des scores depuis `game_answers` + bonus + points manuels).
- Bots : actions GM `add-bots {count}` / `remove-bots` (pseudos BOT_x), job async à l'entrée en question (délai ~2 s + jitter, 30% de bonnes réponses, circuit normal idempotent).
- Stock IA : `ensureQuestionStock()` si moins de 5 disponibles par difficulté (à la création de session, après chaque tirage, interval 60 s pendant une session active).
- Config battle (défauts) : questionMs 15000, graceMs 4000, announceMs 6000, roundIntroMs 5000, standingsPageMs 10000, fadeOutMs 5000, finalSize 10, botAccuracy 0.3.
- Modifs des fichiers existants : `types.ts` (union statuts, `SessionRuntime.battle`, statut `spectator`, config), `engine.ts` (extraire les helpers partagés de quizFlow + registre `registerGmAction(mode, handler)` pour dispatcher les actions par mode), `views.ts` (branches battle public/GM/you : `generalRank`, `eliminatedThisRound`, `isFinalist`, `isSpectator`), `routes/game.ts` (`POST /` accepte `{mode:'battle', config}`), `gamePublic.ts` (join battle en cours = waiting).

### Frontend battle
- **`frontend/src/pages/BattleLivePage.tsx`** (+ route `/evenements/battle-live`, Sidebar, Dashboard : checklist CLAUDE.md) : launcher (thème, textes, stock par difficulté avec disponibles/consommées, reset-usage), pilotage par statut dont le **panneau verdict** (liste des éliminés provisoires avec réponse/temps, boutons Bonne réponse / Ressusciter / annuler par joueur, Repêchage général, bandeau rouge 0 survivant avec les 2 choix, compteur survivants avant/après, puis "Afficher les résultats"), file de questions (aperçu + réordonner/retirer + prochaine difficulté + génération en cours), bots, mixer, classement, kick/points.
- **PlayerApp** branches battle : barre EN VIE / ÉLIMINÉ (fond rouge animé + "continue de répondre pour des points bonus"), écran d'élimination avec sa place de manche, animation repêchage, carte fin de manche "Tu es Xe au général (+N)", bannière finale, écran spectateur.
- **ScreenApp** branches battle : round_intro ("MANCHE N", nuage de joueurs, "X COMBATTANTS, 1 SEUL SURVIVANT"), announce (catégorie + difficulté), question (compteur SURVIVANTS + réponses reçues + timer), verdict (habillage suspense, compteur inchangé), reveal (décompte des éliminés + repêchage + milestones), round_end (podium + grille paginée 10 s/page + zone top 10 "EN ROUTE POUR LA FINALE"), intro dorée de finale, victoire (couronne, `#winner#`, confettis), closing (fondu visuel + `gameAudio.fadeOutAll(ms)` à ajouter).
- Cues audio nouveaux (synthèse WebAudio existante dans `screen/audio.ts`) : sting d'élimination, nappe de verdict, hit de repêchage, milestone, victoire battle. Musique de fond uploadée en boucle + ducking (retour associé : "même un petit fond de Qui veut gagner des millions").

## 6. PHASE A : État des lieux réel puis audit algorithmique (avant tout nouveau code)

0. **État des lieux** : `git status` + `git log` sur `refonte-v2`, inventaire des fichiers du chapitre 2, liste des tables Supabase via le MCP (les tables `game_*` et `battle_questions` existent-elles ? les colonnes de la 040 sont-elles là ?), routes montées dans `index.ts` et `App.tsx`. En déduire ce qui relève de l'audit et ce qui relève de l'implémentation, et l'annoncer avant de continuer.
1. Relecture complète du diff non commité, `npx tsc --noEmit` backend et frontend, `vite build`.
2. Relire chaque fichier de `backend/src/games/` et `frontend/src/game/` en chassant : races (le hook a déjà été durci sur le join, vérifier qu'il n'en reste pas), fuites de bonne réponse côté public (views.ts), transitions d'état incohérentes ou non gardées, timers qui survivent à un changement d'état, rollbacks incomplets (annuler/rejouer : scores, stats, strike, quitte ou double remboursés), idempotence des réponses, plausibilité du temps client, comportement au restart du backend (rattrapage paresseux), RLS (toute nouvelle table doit avoir la policy service_role, piège 4.3 du CLAUDE.md).
3. Vérifier la cohérence des barèmes implémentés vs chapitre 3 (spéciales, vitesse, QD, estimation, récompenses, tiebreaks).
4. Corriger tout ce qui est trouvé, au fil de l'eau, avec re-test.

## 7. PHASE B : Implémentation battle royale (ce que l'état des lieux a révélé manquant)

Suivre le chapitre 5 dans cet ordre : migration 041 + import MySQL + réécriture battleQuestions.ts, puis types/helpers partagés, puis battleFlow.ts (session, advancer, tirage, join/answer), puis verdict + manches + finale + rollbacks + bots + stock IA, puis vues + routes, puis frontend (BattleLivePage, branches joueur, branches écrans, audio, overflow-hidden sur /screen). Type-check et build à chaque jalon.

## 8. PHASE C : Campagne de tests navigateur (exhaustive, page par page)

Utiliser le navigateur intégré. Se créer les accès temporaires nécessaires : compte admin de test jetable autorisé (pattern : script éphémère avec la service key du `.env` qui crée `claude-test@invader.bar` + profil admin + mot de passe aléatoire ; LE SUPPRIMER à la fin ; ne jamais utiliser le compte personnel de Romain). Créer un quiz de test complet avec TOUS les types : 2 QCM (dont un avec `points_override`), 1 question image (uploader une vraie image), 1 audio (mp3 réel via Storage), 1 vidéo YouTube (`ID?time=X&duration=Y`), 1 estimation, 1 réponse libre. Pour le battle : bots + 2-3 joueurs navigateur. Astuce multi-joueurs : les onglets partagent le localStorage, effacer `invader_game_identity` dans l'onglet du 2e joueur avant son join. NETTOYER toutes les données de test à la fin (c'est la base de PROD : sessions, quiz de test, questions de test, compte).

### C1. Matrice de layouts (tester chaque surface dans chaque layout pertinent)
- **16:9 grands écrans** (tables tactiles, projecteur, TV) : 1920x1080 et 1280x720.
- **Téléphone petit** : 320x568. **Téléphone grand** : 430x932. Preset mobile pour l'émulation tactile.
- Critères : aucun scroll horizontal, aucune scrollbar visible sur `/screen/*` (bande blanche du retour associé), tap targets suffisants, textes non tronqués, timer et badges lisibles.

### C2. Parcours gamemaster (desktop) : `/evenements/quiz-live` puis `/evenements/battle-live`
Tester CHAQUE bouton dans CHAQUE état : lancement, règles, démarrer, spéciale sélectionnée puis question suivante, révéler pendant/après la fenêtre, verdicts réponse libre (basculer un verdict dans les deux sens), annuler et rejouer (vérifier les scores recalculés et les QD remboursés), pause et reprendre+question, classement, cinématique, récompenses, fin, arrêt. Battle : panneau verdict complet (mark-correct rend le point et met à jour le compteur, revive, repêchage collectif, les deux chemins du 0 survivant), file de questions (réordonner, retirer), bots, manches multiples, finale, stop en fondu. Vérifier le feed des réponses en direct, l'anecdote, l'aperçu suivant, les points manuels, le kick, le mixer.

### C3. Parcours joueur (mobile 320 ET 430) : `/play`
Inscription (pseudos invalides refusés avec messages, doublon refusé), lobby, règles, annonce avec activation du quitte ou double (stock décrémenté, badge x2), chaque type de question (QCM, estimation avec +/-, réponse libre, écrans d'attente audio/vidéo), réponse enregistrée avec accusé, révélation personnelle (gagné/raté/pas répondu, x2, écart, plus rapide), position au classement, pause, récompenses, fin, partie terminée. Résilience : refresh en pleine question (reprise d'identité + retour au bon écran), bouton resync manuel, rejoindre en cours de partie depuis le QR bar, retour de veille (simuler avec visibilitychange si possible). Battle : élimination avec place, continuer à répondre en éliminé (+1 visible), repêchage, waiting qui entre à la manche suivante, spectateur en finale, place au général en fin de manche.

### C4. Écrans (16:9) : `/screen/PROJO`, `/screen/BAR01`
Idle, bascule automatique idle → partie → idle (y compris le fondu `closing` battle), accueil WiFi 2 étapes avec les 2 QR scannables, toasts d'arrivée et de bonus, annonce, question par type (l'audio joue sur le projecteur, la vidéo YouTube bornée, l'image grande), compteur de réponses, révélation (pourcentages, top estimations, réponses acceptées), classement (flèches, scores masqués, top 10 battle mis en avant, rotation 10 s), cinématique complète avec sons, récompenses progressives, fin. Overlay "activer le son" au premier chargement.

### C5. Interfaces de table : `/table/*` (non-régression de la refonte launcher)
Home, Menu (carte v2), Jeux (v2), Screensaver : vérifier qu'elles fonctionnent toujours (le portage ne doit rien casser), en 16:9 1920x1080 et en 4:3 1024x768 (bornes). Vérifier que le back-office (Dashboard, Quiz, Battle questions, Config écrans) n'a pas régressé.

### C6. Backend en boîte noire
Idempotence des réponses (double POST = `already: true`), réponse hors fenêtre rejetée, réponse dans la grâce battle acceptée, vues publiques sans fuite de la bonne réponse (curl le state pendant une question), 409 sur les transitions interdites (double-clics), reprise après restart du backend en pleine partie (tuer/relancer le dev server : la partie doit reprendre où elle en était).

## 9. PHASE D : Cohérence graphique et finitions

- Passer chaque écran des surfaces de jeu et vérifier l'unité visuelle : thème dark néon commun (`game-bg`, cyan/violet, badges de difficulté cohérents), typos et tailles homogènes, animations sobres et non superposées, aucun texte anglais résiduel, orthographe ("Jeux-vidéo", accents), états de focus visibles, `prefers-reduced-motion` respecté.
- Console GM : cohérente avec le style back-office existant (cartes blanches, indigo).
- Captures d'écran des états clés en fin de campagne pour le rapport.

## 10. Environnement local (pièges connus)

- Node 20 est installé dans `~/.local/node20` (PAS dans le PATH système) : `export PATH="$HOME/.local/node20/bin:$PATH"` dans chaque shell, wrapper `~/.local/bin/npmw` disponible. `.claude/launch.json` (dans `/Users/romain/Dev_Invader/`) définit les serveurs `backend` (3001) et `frontend` (5173) pour le navigateur intégré.
- `.env` racine = backend (la `SUPABASE_SERVICE_ROLE_KEY` est validée au boot, log `service_role key OK`) ; `frontend/.env.local` = variables `VITE_*`. `CORS_ORIGINS` du `.env` doit contenir `http://localhost:5173`.
- La base Supabase est LA PROD du bar (projet `ekplxvihchsxnhtjgfzi`). Migrations : fichiers numérotés dans `docs/`, à appliquer via le connecteur MCP Supabase niveau compte si présent (paramètre `project_id`), sinon fournir le SQL à Romain pour le SQL Editor. Toujours nettoyer les données de test.
- MySQL OVH legacy accessible via `getMysqlPool()` (`backend/src/config/mysql.ts`) pour l'import battle.
- Ne jamais mettre de secrets dans le code : env vars uniquement.

## 11. Livrable final

1. Tout le code corrigé/complété, type-check et build verts (backend + frontend).
2. Un rapport de campagne : tableau des vérifications passées (par surface x layout x mode), liste des bugs trouvés ET corrigés, liste des points restants ou hors périmètre (Hue, playlist par défaut, champ WiFi).
3. Données de test purgées, compte de test supprimé.
4. Proposition de commits découpés proprement sur `refonte-v2` (ex : fix auth singleton / moteur quiz / battle banque Postgres / battle runtime / surfaces front / audit-fixes), SANS commiter ni pousser avant validation de Romain.
