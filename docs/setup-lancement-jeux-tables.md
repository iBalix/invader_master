# Lancement des jeux sur les tables tactiles

## Ce qui était cassé

| Bug | Effet |
|---|---|
| `getSlaveHostname()` produisait `01-2` au lieu de `TABLE01-2` | Channel rejeté par le serveur, erreur avalée dans un `catch` : l'écran secondaire n'était **jamais** notifié |
| `handleLaunch` refusait tout rôle non-master | Un client sur l'écran secondaire **ne pouvait pas lancer de jeu** |
| `useSlaveGameSync` sortait si le rôle n'était pas slave | Le master **n'écoutait aucun canal** |
| `parseHostname` repliait tout hostname invalide sur « master » | Une borne mal configurée se croyait capable de lancer, et polluait `table_devices` |
| Le retour de partie ne notifiait que le master | L'écran secondaire restait bloqué sur « partie en cours » |

## Comment ça marche

Un **ordre de lancement** persisté (`table_launch_orders`) remplace l'événement
temps réel. Les deux dalles lisent le même ordre, le PC master l'exécute.

```
   Un client clique "Lancer" (n'importe laquelle des deux dalles)
                        |
              POST /public/tables/launch
                        |
                   [ pending ]     <-- coup de coude temps reel (optionnel)
                        |
        le master réclame l'ordre, puis tire le deeplink
                        |
                 [ dispatched ]  = partie en cours sur les deux écrans
                        |
   fin : retour de focus du master, bouton "Terminer", ou filet des 4 h
```

Si personne ne réclame l'ordre en 10 secondes (Chrome fermé ou figé sur le
master), il passe en échec et le client voit un message clair au lieu d'un
spinner infini.

**Le temps réel n'est qu'un accélérateur.** L'écran relit son ordre toutes les
5 s au repos, 1,5 s pendant un lancement. Mesuré : ~0,3 s du clic à l'exécution
avec le temps réel, jusqu'à 5 s sans. Testé temps réel entièrement coupé, tout
fonctionne.

Pusher a été **supprimé du projet** : un prestataire en moins, et surtout des
identifiants qu'on maîtrise, alors que ceux de Pusher étaient partagés avec
l'ancien site PHP `invader_table`. Le transport est désormais Supabase
Realtime, déjà utilisé par le moteur quiz/battle.

| Topic | Qui écoute | Ce qui y passe |
|---|---|---|
| `table:TABLExx` | les deux dalles d'une table | `launch-update`, `reload` |
| `tables` | toutes les bornes | `event-start`, `event-end` |
| `game:<session>` | joueurs et écrans du quiz/battle | moteur de jeu (inchangé) |

Un événement ne transporte **aucune donnée métier** : il dit seulement « va
relire ». C'est ce qui a permis de changer de fournisseur sans toucher à un
seul composant, et ce qui rend une perte d'événement sans conséquence.

**Il n'y a pas de vérification que l'émulateur a démarré**, volontairement : le
client le voit de ses yeux, et le lancement par deeplink n'a jamais posé
problème au bar. Rien à installer sur les PC de table, l'agent du bar n'est pas
impliqué.

### Les garde-fous

| Risque | Ce qui l'empêche |
|---|---|
| Double lancement (deux clics, ou les deux dalles ensemble) | Index unique partiel en base : au plus un ordre vivant par table, arbitré par Postgres et non par du code applicatif |
| Double lancement (deux onglets sur le master) | L'ACK est un compare-and-set : le perdant ne reçoit pas le deeplink |
| Écran secondaire bloqué | Sa vérité est une ligne repollée, plus un événement reçu une fois : le prochain GET le libère |
| Redéploiement Railway en plein lancement | L'échéance est stockée en base, pas dans un `setTimeout` |
| Deux personnes, deux jeux différents | Le second voit « une partie est déjà en cours », avec un bouton explicite pour changer. Jamais de bascule silencieuse |
| Commande arbitraire sur un PC du bar | Le deeplink est construit par le backend depuis `gameId`, plus envoyé par le client |

Deux corrections annexes au passage :

- L'ancien proxy public `POST /public/tables/pusher` est supprimé : il
  permettait à n'importe qui de déclencher un événement sur une table, et son
  seul usage est remplacé par l'ordre de lancement.
- Le bouton back-office « recharger cette table » refonctionne. Il émettait sur
  un canal par écran que plus personne n'écoutait depuis la refonte des tables :
  il était sans effet.
- `useLiveEvent` a désormais un sondage de secours (30 s). Avant, il faisait un
  seul `fetch` au montage puis dépendait entièrement de l'événement : une borne
  déjà allumée qui ratait `event-start` ne voyait jamais l'event.

## Diagnostiquer

```sql
select created_at, requested_by, game_name, status, ended_by
from table_launch_orders
order by created_at desc limit 20;
```

| Ce que tu vois | Lecture |
|---|---|
| `status = failed`, `ended_by = no-master` | L'écran principal n'a pas réclamé l'ordre en 10 s : Chrome fermé ou figé sur le PC master, ou hostname mal saisi sur la borne |
| `ended_by = master-focus` | Fin de partie normale, détectée au retour de focus |
| `ended_by = user` | Quelqu'un a appuyé sur « Terminer » |
| `ended_by = sweeper` | Personne n'a jamais libéré la table, le filet des 4 h a agi |

## Fichiers

| Rôle | Fichier |
|---|---|
| Cycle de vie des ordres | `backend/src/services/tableLaunch.ts` |
| Routes publiques | `backend/src/routes/tables.ts` |
| Table et index | `docs/migration-042/043/044-*.sql` |
| État partagé des deux dalles | `frontend/src/tables/hooks/useLaunchOrder.ts` |
| Temps réel des tables | `frontend/src/tables/lib/realtime.ts`, `backend/src/games/realtime.ts` |
| Appels API et deeplink local | `frontend/src/tables/lib/gameLaunch.ts` |
| Écran plein cadre | `frontend/src/tables/pages/InGamePage.tsx` |
