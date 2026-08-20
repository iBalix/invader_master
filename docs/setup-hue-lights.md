# Lumières Philips Hue — installation et exploitation

Les ambiances lumineuses des quiz et battles sont pilotées **par l'agent du PC
serveur du bar (SRV1)**, pas par le cloud directement : le bridge Hue est sur le
réseau local, et une page servie en HTTPS ne peut plus l'appeler depuis internet.

## Comment ça marche

1. Le backend (Railway) suit l'état de la partie. À chaque changement de phase,
   il envoie **un cue de haut niveau** par le WebSocket agent déjà existant :
   « joue la scène `question_start`, difficulté Difficile, durée 15 s ».
2. L'agent empile le cue et le passe à un **worker dans un runspace séparé**
   (la boucle WebSocket est mono-thread : une animation de 12 s la gèlerait).
3. Le worker joue l'animation **localement**, à l'horloge du bar, en respectant
   le débit supporté par le bridge.

Conséquence : une question entière coûte ~3 messages réseau au lieu des
centaines de requêtes du système historique (qui saturait le bridge, d'où les
commandes perdues). Le rouge des 3 dernières secondes est armé par l'agent
lui-même, il ne dépend donc ni du réseau ni d'internet.

## Installation sur SRV1

1. `git pull` dans le dossier de l'agent (le code Hue est livré avec).
2. Compléter `agent/.env` :

```
HUE_ENABLED=true
HUE_BRIDGE_IP=192.168.x.x        # IP du bridge sur le LAN
HUE_API_KEY=xxxxxxxx             # username applicatif du bridge
HUE_DRY_RUN=false                # true = journalise sans rien piloter
HUE_RATE_GLOBAL=6                # recharge; avec le burst de 2 le plafond reel est 8/s (bridge ~10)
HUE_MIN_INTERVAL_MS=250          # délai mini entre 2 ordres sur une même cible
```

3. Redémarrer l'agent. Au démarrage il affiche `[hue] Worker demarre`.

**Récupérer l'IP et la clé** : elles vivaient dans `config.php` et `hue.txt` de
l'ancien `invader_table` (non versionnés). Si la clé est perdue, en régénérer
une : appuyer sur le bouton du bridge puis
`POST http://IP/api` avec `{"devicetype":"invader_agent"}`.

La clé **ne remonte jamais** au cloud : elle reste dans `agent/.env`, qui est
ignoré par git. Le backend ne la connaît pas, il ne peut donc pas la divulguer
(c'était une faille de l'ancien système, qui l'exposait publiquement).

## Réglage des ambiances

- `agent/hue/targets.json` : correspondance cibles logiques → groupes et lampes
  du bridge. À modifier seulement si le bar est recâblé.
- `agent/hue/scenes.json` : couleurs, intensités et durées de chaque scène.
  **Rechargé à chaud** : éditer le fichier sur SRV1 suffit, le cue suivant
  applique les nouvelles valeurs. Ni redéploiement ni redémarrage.

Vérifier les ids de `SALON` sur site : ils n'étaient pas versionnés dans
l'ancien code.

## Exploitation

Un badge est présent dans les consoles Quiz live et Battle live :

- **état** : OK / dégradé / bridge injoignable / pas d'agent / coupé ;
- **dernière scène jouée** et son ancienneté, pour voir d'un coup d'œil que ça vit ;
- **Tester** : deux flashs visibles depuis la salle (checklist d'avant-soirée) ;
- **Couper** : arrête les lumières sans toucher au jeu, si elles déraillent en
  pleine soirée.

Si l'agent est hors ligne ou le bridge injoignable, **la partie continue
normalement**, simplement sans lumières. Aucun cue n'est rejoué en différé : une
ambiance « début de question » rejouée 40 s plus tard serait pire que rien.

Journaux : `agent/logs/hue-AAAAMMJJ.log` sur SRV1.

## Tester sans bridge

Un simulateur permet de tout valider sans matériel :

```bash
node agent/hue/tools/fake-bridge.mjs --port 8099
# puis, dans agent/.env : HUE_BRIDGE_IP=127.0.0.1:8099
```

Il journalise chaque appel et, à l'arrêt (Ctrl+C), vérifie mécaniquement les
garde-fous : débit global, délai minimum par cible, rafale et débit soutenu par
groupe.

Rejouer un scénario complet sans backend ni WebSocket :

```bash
pwsh -File agent/hue/tools/run-worker-test.ps1 -Scenario battle   # ou quiz, stress
```

## À valider sur site avant de figer

Les valeurs `HUE_RATE_GLOBAL=8` et `HUE_MIN_INTERVAL_MS=250` viennent de la
documentation Philips et du retour terrain, mais n'ont pas été mesurées sur le
bridge du bar. Prévoir une battle 100 % bots, bar fermé, pour les caler.
